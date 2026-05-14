-- ============================================================================
-- MIGRACIÓN: Servicios Extras + Camión 3T + Columnas Dinámicas
-- Fecha: 2026-05-14
-- ============================================================================

-- ── 1. VEHICLE_TYPES: agregar columna key si no existe ─────────────────────
ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS key TEXT;

-- Actualizar keys para los existentes
UPDATE public.vehicle_types SET key = 'moto'     WHERE id = 1 AND (key IS NULL OR key = '');
UPDATE public.vehicle_types SET key = 'sedan'    WHERE id = 2 AND (key IS NULL OR key = '');
UPDATE public.vehicle_types SET key = 'suv'      WHERE id = 3 AND (key IS NULL OR key = '');
UPDATE public.vehicle_types SET key = 'pickup'   WHERE id = 4 AND (key IS NULL OR key = '');
UPDATE public.vehicle_types SET key = 'microbus' WHERE id = 5 AND (key IS NULL OR key = '');
UPDATE public.vehicle_types SET key = 'taxi'     WHERE id = 6 AND (key IS NULL OR key = '');

-- Agregar UNIQUE constraint en key si no existe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vehicle_types' AND constraint_name = 'vehicle_types_key_key'
  ) THEN
    ALTER TABLE public.vehicle_types ADD CONSTRAINT vehicle_types_key_key UNIQUE (key);
  END IF;
END $$;

-- Agregar icono a vehicle_types
ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'fa-car';

-- Actualizar iconos existentes
UPDATE public.vehicle_types SET icon = 'fa-motorcycle' WHERE id = 1;
UPDATE public.vehicle_types SET icon = 'fa-car'         WHERE id = 2;
UPDATE public.vehicle_types SET icon = 'fa-car-side'    WHERE id = 3;
UPDATE public.vehicle_types SET icon = 'fa-truck-pickup' WHERE id = 4;
UPDATE public.vehicle_types SET icon = 'fa-van-shuttle'  WHERE id = 5;
UPDATE public.vehicle_types SET icon = 'fa-taxi'         WHERE id = 6;

-- Agregar sort_order a vehicle_types
ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 99;

UPDATE public.vehicle_types SET sort_order = id WHERE sort_order = 99 OR sort_order IS NULL;

-- Activar/desactivar vehicle_types
ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ── 2. INSERTAR CAMIÓN 3 TONELADAS ────────────────────────────────────────
INSERT INTO public.vehicle_types (id, name, key, icon, sort_order, is_active)
VALUES (7, 'Camión 3T', 'camion3t', 'fa-truck', 7, true)
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  key        = EXCLUDED.key,
  icon       = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- RLS para escribir en vehicle_types (admin)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_types' AND policyname = 'Admin write vehicle_types'
  ) THEN
    CREATE POLICY "Admin write vehicle_types" ON public.vehicle_types
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- ── 3. SERVICIOS: columnas adicionales ────────────────────────────────────
-- is_active (alias funcional de active; el POS ya usa is_active)
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- is_active ya existe o se acaba de crear con DEFAULT true — no hay columna 'active' en este schema

-- is_extra: diferencia servicios base de extras
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_extra BOOLEAN NOT NULL DEFAULT false;

-- sort_order para reordenamiento
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 99;

-- icon FontAwesome
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'fa-soap';

-- color (clase CSS o hex)
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '';

-- Marcar servicios base existentes
UPDATE public.services SET sort_order = 1 WHERE id = 1;
UPDATE public.services SET sort_order = 2 WHERE id = 2;

-- ── 4. INSERTAR EXTRAS NUEVOS ─────────────────────────────────────────────
INSERT INTO public.services (name, description, is_extra, is_active, sort_order, icon, color) VALUES
  ('Pasteado Carrocería Premium', 'Brillo y protección premium para la carrocería', true, true, 10, 'fa-spray-can-sparkles', ''),
  ('Renovador de Interiores',     'Limpieza y renovación profunda de interiores',   true, true, 11, 'fa-couch', ''),
  ('Llanta Endurance',            'Tratamiento protector y brillante para llantas',  true, true, 12, 'fa-circle-dot', ''),
  ('Ceramic Wax',                 'Capa cerámica protectora de larga duración',      true, true, 13, 'fa-gem', ''),
  ('Removedor de Gotas',          'Eliminación de manchas de agua y gotas',          true, true, 14, 'fa-droplet-slash', ''),
  ('Tratamiento de Asientos',     'Limpieza y acondicionamiento de asientos',        true, true, 15, 'fa-chair', ''),
  ('Renovador de Plásticos',      'Restaura y protege los plásticos interiores/exteriores', true, true, 16, 'fa-recycle', ''),
  ('Lavado de Chasis',            'Limpieza profunda del chasis y partes bajas',     true, true, 17, 'fa-car-burst', '')
ON CONFLICT DO NOTHING;

-- ── 5. PRECIOS DE EXTRAS PARA TODOS LOS VEHÍCULOS ────────────────────────
-- Precio uniforme C$100 para los 7 primeros extras (vehicle_type_ids 1-7)
-- Precio C$200 para Lavado de Chasis

DO $$
DECLARE
  v_extra_id INT;
  v_chasis_id INT;
  v_vtype INT;
BEGIN
  -- Obtener IDs de extras (excepto Lavado de Chasis)
  FOR v_extra_id IN
    SELECT id FROM public.services
    WHERE is_extra = true AND name != 'Lavado de Chasis'
  LOOP
    FOR v_vtype IN 1..7 LOOP
      INSERT INTO public.service_prices (service_id, vehicle_type_id, price)
      VALUES (v_extra_id, v_vtype, 100)
      ON CONFLICT (service_id, vehicle_type_id) DO NOTHING;
    END LOOP;
  END LOOP;

  -- Lavado de Chasis: C$200 para todos
  SELECT id INTO v_chasis_id FROM public.services WHERE name = 'Lavado de Chasis' LIMIT 1;
  IF v_chasis_id IS NOT NULL THEN
    FOR v_vtype IN 1..7 LOOP
      INSERT INTO public.service_prices (service_id, vehicle_type_id, price)
      VALUES (v_chasis_id, v_vtype, 200)
      ON CONFLICT (service_id, vehicle_type_id) DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- ── 6. PRECIOS CAMIÓN 3T PARA SERVICIOS BASE ─────────────────────────────
-- Lavado Breve: C$290
INSERT INTO public.service_prices (service_id, vehicle_type_id, price)
VALUES (1, 7, 290)
ON CONFLICT (service_id, vehicle_type_id) DO UPDATE SET price = 290;

-- Lavado Nítido: C$370
INSERT INTO public.service_prices (service_id, vehicle_type_id, price)
VALUES (2, 7, 370)
ON CONFLICT (service_id, vehicle_type_id) DO UPDATE SET price = 370;

-- ── 7. TICKET_ITEMS: columnas de snapshot histórico ───────────────────────
ALTER TABLE public.ticket_items
  ADD COLUMN IF NOT EXISTS service_name_snapshot TEXT DEFAULT NULL;

ALTER TABLE public.ticket_items
  ADD COLUMN IF NOT EXISTS price_snapshot NUMERIC(10,2) DEFAULT NULL;

-- ── 8. ÍNDICES DE RENDIMIENTO ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_services_is_extra    ON public.services(is_extra);
CREATE INDEX IF NOT EXISTS idx_services_is_active   ON public.services(is_active);
CREATE INDEX IF NOT EXISTS idx_services_sort_order  ON public.services(sort_order);
CREATE INDEX IF NOT EXISTS idx_vehicle_types_active ON public.vehicle_types(is_active);

-- ── 9. VERIFICACIÓN ───────────────────────────────────────────────────────
DO $$
DECLARE
  v_vehicle_count INT;
  v_extra_count   INT;
  v_price_count   INT;
BEGIN
  SELECT COUNT(*) INTO v_vehicle_count FROM public.vehicle_types;
  SELECT COUNT(*) INTO v_extra_count   FROM public.services WHERE is_extra = true;
  SELECT COUNT(*) INTO v_price_count   FROM public.service_prices WHERE vehicle_type_id = 7;

  RAISE NOTICE 'Tipos de vehículo: % (esperado: 7+)', v_vehicle_count;
  RAISE NOTICE 'Extras insertados: % (esperado: 8)', v_extra_count;
  RAISE NOTICE 'Precios para Camión 3T: % (esperado: 10+)', v_price_count;
END $$;
