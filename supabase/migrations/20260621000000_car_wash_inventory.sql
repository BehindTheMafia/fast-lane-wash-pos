-- Car wash centralized inventory
-- Adds: service_products join table, usage_count + services_per_unit on products,
--        service_consumption enum value, and RPCs for check / record / reverse.

-- ── Extend stock_movement_reason enum ────────────────────────────────────────
ALTER TYPE public.stock_movement_reason ADD VALUE IF NOT EXISTS 'service_consumption';

-- ── Extend products table ─────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS services_per_unit INT NOT NULL DEFAULT 84
    CHECK (services_per_unit > 0),
  ADD COLUMN IF NOT EXISTS usage_count INT NOT NULL DEFAULT 0
    CHECK (usage_count >= 0);

-- ── service_products (many-to-many: services ↔ products) ─────────────────────
CREATE TABLE IF NOT EXISTS public.service_products (
  id         BIGSERIAL PRIMARY KEY,
  service_id INT    NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  UNIQUE (service_id, product_id)
);

ALTER TABLE public.service_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read service_products" ON public.service_products;
CREATE POLICY "Authenticated read service_products" ON public.service_products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin write service_products" ON public.service_products;
CREATE POLICY "Admin write service_products" ON public.service_products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_service_products_service_id ON public.service_products (service_id);
CREATE INDEX IF NOT EXISTS idx_service_products_product_id ON public.service_products (product_id);

-- ── RPC: check_service_inventory ─────────────────────────────────────────────
-- Returns availability for all products linked to a service.
-- Used by POS before confirming payment.
CREATE OR REPLACE FUNCTION public.check_service_inventory(p_service_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_products    JSONB := '[]'::JSONB;
  v_ok          BOOLEAN := TRUE;
  v_rec         RECORD;
  v_available   INT;
BEGIN
  FOR v_rec IN
    SELECT p.id, p.name, p.stock_quantity, p.services_per_unit, p.usage_count
    FROM public.service_products sp
    JOIN public.products p ON p.id = sp.product_id
    WHERE sp.service_id = p_service_id
      AND p.is_active = TRUE
  LOOP
    v_available := (v_rec.stock_quantity * v_rec.services_per_unit) - v_rec.usage_count;

    IF v_available <= 0 THEN
      v_ok := FALSE;
    END IF;

    v_products := v_products || jsonb_build_object(
      'id',               v_rec.id,
      'name',             v_rec.name,
      'stock_quantity',   v_rec.stock_quantity,
      'services_per_unit',v_rec.services_per_unit,
      'usage_count',      v_rec.usage_count,
      'available',        v_available
    );
  END LOOP;

  RETURN jsonb_build_object('ok', v_ok, 'products', v_products);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_service_inventory(INT) TO authenticated;

-- ── RPC: record_service_inventory ────────────────────────────────────────────
-- Atomically increments usage_count for each product linked to a service.
-- When usage_count reaches services_per_unit, deducts 1 from stock_quantity
-- and resets usage_count to 0.  Raises an exception if stock would go negative.
CREATE OR REPLACE FUNCTION public.record_service_inventory(
  p_service_id INT,
  p_ticket_id  BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results  JSONB := '[]'::JSONB;
  v_pid      BIGINT;
  v_name     TEXT;
  v_stock    INT;
  v_spu      INT;
  v_usage    INT;
  v_new_usage INT;
  v_new_stock INT;
  v_deducted  BOOLEAN;
BEGIN
  -- Only process non-extra car_wash services
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE id = p_service_id
      AND business_line = 'car_wash'
      AND is_extra = FALSE
  ) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'results', v_results);
  END IF;

  FOR v_pid, v_name, v_stock, v_spu, v_usage IN
    SELECT p.id, p.name, p.stock_quantity, p.services_per_unit, p.usage_count
    FROM public.service_products sp
    JOIN public.products p ON p.id = sp.product_id
    WHERE sp.service_id = p_service_id
      AND p.is_active = TRUE
    FOR UPDATE OF p
  LOOP
    v_new_usage := v_usage + 1;
    v_deducted  := FALSE;

    IF v_new_usage >= v_spu THEN
      -- Time to consume one physical unit
      v_new_stock := v_stock - 1;
      IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto "%" (id: %)', v_name, v_pid;
      END IF;
      v_new_usage := 0;
      v_deducted  := TRUE;

      UPDATE public.products
        SET stock_quantity = v_new_stock,
            usage_count    = v_new_usage,
            updated_at     = now()
      WHERE id = v_pid;

      INSERT INTO public.stock_movements
        (product_id, quantity_delta, reason, ticket_id, user_id, notes)
      VALUES
        (v_pid, -1, 'service_consumption', p_ticket_id, auth.uid(),
         'Consumo automático: ' || v_spu || ' servicios completados');
    ELSE
      UPDATE public.products
        SET usage_count = v_new_usage,
            updated_at  = now()
      WHERE id = v_pid;
    END IF;

    v_results := v_results || jsonb_build_object(
      'product_id',   v_pid,
      'name',         v_name,
      'new_usage',    v_new_usage,
      'new_stock',    CASE WHEN v_deducted THEN v_new_stock ELSE v_stock END,
      'unit_deducted',v_deducted
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'results', v_results);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_service_inventory(INT, BIGINT) TO authenticated;

-- ── RPC: reverse_service_inventory ───────────────────────────────────────────
-- Reverses inventory consumption for all car-wash service items on a ticket.
-- Undoes record_service_inventory: decrements usage_count, or if it was reset
-- to 0, restores one physical unit and sets usage_count = services_per_unit - 1.
CREATE OR REPLACE FUNCTION public.reverse_service_inventory(p_ticket_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results  JSONB := '[]'::JSONB;
  v_service_id INT;
  v_pid      BIGINT;
  v_name     TEXT;
  v_stock    INT;
  v_spu      INT;
  v_usage    INT;
  v_new_usage INT;
  v_new_stock INT;
  v_restored  BOOLEAN;
BEGIN
  -- Iterate over each non-extra car_wash service on this ticket
  FOR v_service_id IN
    SELECT DISTINCT ti.service_id
    FROM public.ticket_items ti
    JOIN public.services s ON s.id = ti.service_id
    WHERE ti.ticket_id = p_ticket_id
      AND ti.item_type = 'service'
      AND s.business_line = 'car_wash'
      AND s.is_extra = FALSE
      AND ti.service_id IS NOT NULL
  LOOP
    FOR v_pid, v_name, v_stock, v_spu, v_usage IN
      SELECT p.id, p.name, p.stock_quantity, p.services_per_unit, p.usage_count
      FROM public.service_products sp
      JOIN public.products p ON p.id = sp.product_id
      WHERE sp.service_id = v_service_id
        AND p.is_active = TRUE
      FOR UPDATE OF p
    LOOP
      v_restored := FALSE;

      IF v_usage > 0 THEN
        -- Simply undo the last increment
        v_new_usage := v_usage - 1;
        v_new_stock := v_stock;

        UPDATE public.products
          SET usage_count = v_new_usage,
              updated_at  = now()
        WHERE id = v_pid;
      ELSE
        -- usage_count was reset to 0 at this service, meaning a unit was consumed;
        -- restore it and put usage_count back to services_per_unit - 1
        v_new_usage := v_spu - 1;
        v_new_stock := v_stock + 1;
        v_restored  := TRUE;

        UPDATE public.products
          SET stock_quantity = v_new_stock,
              usage_count    = v_new_usage,
              updated_at     = now()
        WHERE id = v_pid;

        -- Remove the service_consumption movement for this ticket+product
        DELETE FROM public.stock_movements
        WHERE product_id = v_pid
          AND ticket_id  = p_ticket_id
          AND reason     = 'service_consumption';
      END IF;

      v_results := v_results || jsonb_build_object(
        'product_id',    v_pid,
        'name',          v_name,
        'new_usage',     v_new_usage,
        'new_stock',     v_new_stock,
        'unit_restored', v_restored
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'results', v_results);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_service_inventory(BIGINT) TO authenticated;

-- ── Seed car_wash products ────────────────────────────────────────────────────
-- Example products from the requirements. Only inserted if no car_wash products exist.
INSERT INTO public.products
  (name, description, sku, price, stock_quantity, min_stock_level,
   services_per_unit, usage_count, sort_order, icon, business_line)
SELECT v.name, v.description, v.sku, 0, 2, 1, v.spu, 0, v.sort_order, v.icon, 'car_wash'
FROM (VALUES
  ('Shampoo Falcon',         'Shampoo para lavado exterior',       'SF-001',  84, 1, 'fa-bottle-droplet'),
  ('Desengrasante Formula 83','Desengrasante para motor y llantas','DF-083',  84, 2, 'fa-spray-can'),
  ('Nays Coolzone',          'Ambientador interior Coolzone',      'NC-001',  84, 3, 'fa-wind'),
  ('Llantil Granada',        'Brillador de llantas Granada',       'LG-001',  84, 4, 'fa-circle-dot'),
  ('Shampoo Meguiar''s',     'Shampoo premium Meguiar''s',         'SM-001',  50, 5, 'fa-bottle-droplet'),
  ('Hyper Dressing',         'Abrillantador multipropósito',       'HD-001',  50, 6, 'fa-spray-can-sparkles'),
  ('Pasta Meguiar''s',       'Pasta pulidora Meguiar''s',          'PM-001',  30, 7, 'fa-jar'),
  ('Endurance',              'Protector de llantas de larga duración', 'EN-001', 50, 8, 'fa-shield-halved')
) AS v(name, description, sku, spu, sort_order, icon)
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE business_line = 'car_wash');

-- ── Seed service_products ─────────────────────────────────────────────────────
-- Map products to the existing Breve and Nítido services.
-- Breve (id resolved by name), Nítido (id resolved by name).
-- If the services don't exist yet the inserts are safely skipped.
INSERT INTO public.service_products (service_id, product_id)
SELECT s.id, p.id
FROM (VALUES
  ('Lavado Rápido – Breve',   'Shampoo Falcon'),
  ('Lavado Rápido – Breve',   'Desengrasante Formula 83'),
  ('Lavado Rápido – Breve',   'Nays Coolzone'),
  ('Lavado Rápido – Nítido',  'Shampoo Falcon'),
  ('Lavado Rápido – Nítido',  'Desengrasante Formula 83'),
  ('Lavado Rápido – Nítido',  'Nays Coolzone'),
  ('Lavado Rápido – Nítido',  'Llantil Granada')
) AS v(svc_name, prod_name)
JOIN public.services s ON s.name = v.svc_name AND s.business_line = 'car_wash'
JOIN public.products p ON p.name = v.prod_name AND p.business_line = 'car_wash'
ON CONFLICT (service_id, product_id) DO NOTHING;
