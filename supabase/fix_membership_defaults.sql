-- ============================================================
-- CORRECCIÓN DEFINITIVA
-- 1. Arreglar datos de tercero
-- 2. Crear trigger de seguridad en la BD
-- Kevin y Carlos NO se tocan
-- ============================================================

-- PASO 1: Arreglar Combo 8 de tercero (28 días → 42 días)
UPDATE public.customer_memberships cm
SET expires_at = cm.created_at::timestamptz + INTERVAL '42 days'
FROM public.customers c
JOIN public.membership_plans mp ON mp.id = cm.plan_id
WHERE cm.customer_id = c.id
  AND c.name ILIKE '%tercero%'
  AND mp.wash_count = 8
  AND cm.expires_at < cm.created_at::timestamptz + INTERVAL '40 days';

-- PASO 2: Arreglar Combo 4 de tercero (total_washes_allowed 8 → 4)
UPDATE public.customer_memberships cm
SET total_washes_allowed = 4
FROM public.customers c
JOIN public.membership_plans mp ON mp.id = cm.plan_id
WHERE cm.customer_id = c.id
  AND c.name ILIKE '%tercero%'
  AND mp.wash_count = 4
  AND cm.total_washes_allowed = 8;

-- PASO 3: Trigger de seguridad - inicializa valores desde el plan
-- Solo actúa cuando el código NO pasa total_washes_allowed o expires_at
CREATE OR REPLACE FUNCTION public.set_membership_defaults()
RETURNS TRIGGER AS $$
DECLARE
  v_wash_count INT;
  v_duration_days INT;
BEGIN
  -- Consultar el plan
  SELECT wash_count, COALESCE(duration_days, 28)
  INTO v_wash_count, v_duration_days
  FROM public.membership_plans
  WHERE id = NEW.plan_id;

  -- Si total_washes_allowed tiene el default genérico de 8 pero el plan dice otra cosa
  IF v_wash_count IS NOT NULL AND NEW.total_washes_allowed <> v_wash_count THEN
    -- Solo corregir si parece un default (=8) y el plan tiene otro valor
    IF NEW.total_washes_allowed = 8 AND v_wash_count <> 8 THEN
      NEW.total_washes_allowed := v_wash_count;
    END IF;
  END IF;

  -- Si expires_at no fue proporcionado, calcularlo desde el plan
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + (v_duration_days || ' days')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_membership_defaults ON public.customer_memberships;
CREATE TRIGGER trg_set_membership_defaults
  BEFORE INSERT ON public.customer_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_membership_defaults();

-- PASO 4: Verificar TODO
SELECT
  c.name AS cliente,
  mp.name AS plan,
  vt.name AS vehiculo,
  cm.total_washes_allowed AS permitidos,
  cm.washes_used AS usados,
  cm.created_at::date AS creada,
  cm.expires_at::date AS vence,
  (cm.expires_at::date - CURRENT_DATE) AS dias_restantes
FROM public.customer_memberships cm
JOIN public.customers c ON c.id = cm.customer_id
JOIN public.membership_plans mp ON mp.id = cm.plan_id
LEFT JOIN public.vehicle_types vt ON vt.id = cm.vehicle_type_id
WHERE cm.active = true
ORDER BY c.name, mp.wash_count;
