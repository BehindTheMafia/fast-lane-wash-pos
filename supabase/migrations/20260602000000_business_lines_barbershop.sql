-- Multi business line: car_wash + barbershop
-- Products, inventory, extended ticket_items

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.business_line AS ENUM ('car_wash', 'barbershop');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_item_type AS ENUM ('service', 'product');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.stock_movement_reason AS ENUM ('sale', 'adjustment', 'restock');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── business_settings ───────────────────────────────────────────────────────
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS business_line public.business_line;

UPDATE public.business_settings
SET business_line = 'car_wash'
WHERE business_line IS NULL;

ALTER TABLE public.business_settings
  ALTER COLUMN business_line SET DEFAULT 'car_wash';

ALTER TABLE public.business_settings
  ALTER COLUMN business_line SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS business_settings_business_line_key
  ON public.business_settings (business_line);

INSERT INTO public.business_settings (
  business_name,
  address,
  phone,
  exchange_rate,
  business_line,
  double_print_ticket,
  printer_width_mm
)
SELECT
  'EL RAPIDO BARBERÍA',
  COALESCE(bs.address, ''),
  COALESCE(bs.phone, ''),
  COALESCE(bs.exchange_rate, 36.50),
  'barbershop'::public.business_line,
  COALESCE(bs.double_print_ticket, true),
  COALESCE(bs.printer_width_mm, 80)
FROM public.business_settings bs
WHERE bs.business_line = 'car_wash'
  AND NOT EXISTS (
    SELECT 1 FROM public.business_settings b2 WHERE b2.business_line = 'barbershop'
  )
LIMIT 1;

-- ── services ─────────────────────────────────────────────────────────────────
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS business_line public.business_line DEFAULT 'car_wash',
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(10,2);

UPDATE public.services SET business_line = 'car_wash' WHERE business_line IS NULL;

ALTER TABLE public.services
  ALTER COLUMN business_line SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_services_business_line ON public.services (business_line);

-- ── tickets ──────────────────────────────────────────────────────────────────
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS business_line public.business_line DEFAULT 'car_wash';

UPDATE public.tickets SET business_line = 'car_wash' WHERE business_line IS NULL;

ALTER TABLE public.tickets
  ALTER COLUMN business_line SET NOT NULL;

-- vehicle_type_id already nullable in app types; ensure nullable in DB
ALTER TABLE public.tickets
  ALTER COLUMN vehicle_type_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_business_line ON public.tickets (business_line);

-- ── cash_closures ────────────────────────────────────────────────────────────
ALTER TABLE public.cash_closures
  ADD COLUMN IF NOT EXISTS business_line public.business_line DEFAULT 'car_wash';

UPDATE public.cash_closures SET business_line = 'car_wash' WHERE business_line IS NULL;

ALTER TABLE public.cash_closures
  ALTER COLUMN business_line SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_closures_business_line ON public.cash_closures (business_line);

-- ── products ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock_level INT NOT NULL DEFAULT 5 CHECK (min_stock_level >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 99,
  icon TEXT DEFAULT 'fa-bottle-droplet',
  business_line public.business_line NOT NULL DEFAULT 'barbershop',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read products" ON public.products;
CREATE POLICY "Authenticated read products" ON public.products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin write products" ON public.products;
CREATE POLICY "Admin write products" ON public.products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── stock_movements ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_delta INT NOT NULL,
  reason public.stock_movement_reason NOT NULL,
  ticket_id BIGINT REFERENCES public.tickets(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read stock_movements" ON public.stock_movements;
CREATE POLICY "Authenticated read stock_movements" ON public.stock_movements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert stock_movements" ON public.stock_movements;
CREATE POLICY "Authenticated insert stock_movements" ON public.stock_movements
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── ticket_items extensions ───────────────────────────────────────────────────
ALTER TABLE public.ticket_items
  ADD COLUMN IF NOT EXISTS item_type public.ticket_item_type DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;

UPDATE public.ticket_items SET item_type = 'service' WHERE item_type IS NULL;

ALTER TABLE public.ticket_items
  ALTER COLUMN service_id DROP NOT NULL;

-- ── RPC: decrement stock on sale ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decrement_product_stock(
  p_product_id BIGINT,
  p_qty INT,
  p_ticket_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INT;
  v_new INT;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;

  SELECT stock_quantity INTO v_current
  FROM public.products
  WHERE id = p_product_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  IF v_current < p_qty THEN
    RAISE EXCEPTION 'Stock insuficiente para % (disponible: %)', p_product_id, v_current;
  END IF;

  v_new := v_current - p_qty;

  UPDATE public.products
  SET stock_quantity = v_new, updated_at = now()
  WHERE id = p_product_id;

  INSERT INTO public.stock_movements (product_id, quantity_delta, reason, ticket_id, user_id)
  VALUES (p_product_id, -p_qty, 'sale', p_ticket_id, auth.uid());

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'previous_stock', v_current,
    'new_stock', v_new
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_product_stock(BIGINT, INT, BIGINT) TO authenticated;

-- ── RPC: adjust stock (admin) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id BIGINT,
  p_delta INT,
  p_reason public.stock_movement_reason DEFAULT 'adjustment',
  p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INT;
  v_new INT;
BEGIN
  SELECT stock_quantity INTO v_current
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  v_new := v_current + p_delta;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'El stock no puede quedar negativo';
  END IF;

  UPDATE public.products
  SET stock_quantity = v_new, updated_at = now()
  WHERE id = p_product_id;

  INSERT INTO public.stock_movements (product_id, quantity_delta, reason, user_id, notes)
  VALUES (p_product_id, p_delta, p_reason, auth.uid(), p_notes);

  RETURN jsonb_build_object('product_id', p_product_id, 'new_stock', v_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(BIGINT, INT, public.stock_movement_reason, TEXT) TO authenticated;

-- ── Seed barbershop services ─────────────────────────────────────────────────
INSERT INTO public.services (name, description, is_extra, is_active, sort_order, icon, business_line, base_price)
SELECT v.name, v.description, false, true, v.sort_order, v.icon, 'barbershop'::public.business_line, v.base_price
FROM (VALUES
  ('Corte clásico', 'Corte de cabello estándar', 1, 'fa-scissors', 150.00),
  ('Corte + barba', 'Corte y perfilado de barba', 2, 'fa-user', 250.00),
  ('Barba', 'Perfilado y arreglo de barba', 3, 'fa-face-smile', 120.00),
  ('Ceja', 'Depilación de cejas', 4, 'fa-eye', 50.00)
) AS v(name, description, sort_order, icon, base_price)
WHERE NOT EXISTS (
  SELECT 1 FROM public.services s WHERE s.business_line = 'barbershop' AND s.name = v.name
);

-- ── Seed barbershop products ─────────────────────────────────────────────────
INSERT INTO public.products (name, description, sku, price, stock_quantity, min_stock_level, sort_order, icon)
SELECT v.name, v.description, v.sku, v.price, v.stock, v.min_stock, v.sort_order, v.icon
FROM (VALUES
  ('Pomada mate', 'Fijación media', 'POM-001', 180.00, 20, 5, 1, 'fa-jar'),
  ('Aceite para barba', 'Hidratación', 'ACE-001', 220.00, 15, 5, 2, 'fa-bottle-droplet'),
  ('Shampoo', 'Limpieza capilar', 'SHA-001', 150.00, 25, 5, 3, 'fa-pump-soap')
) AS v(name, description, sku, price, stock, min_stock, sort_order, icon)
WHERE NOT EXISTS (SELECT 1 FROM public.products LIMIT 1);
