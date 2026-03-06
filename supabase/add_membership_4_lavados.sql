-- ============================================================================
-- MIGRACIÓN: Sistema de múltiples membresías
-- ============================================================================
-- 1. Actualizar la membresía existente de 8 lavados: duración de 28 → 42 días (6 semanas)
-- 2. Crear nueva membresía de 4 lavados con 18% de descuento y 28 días (4 semanas)
-- 3. No afecta membresías ya vendidas/activas
-- ============================================================================

-- 1. Actualizar plan existente: Combo 8 Lavados → 42 días (6 semanas)
UPDATE public.membership_plans
SET duration_days = 42
WHERE wash_count = 8
  AND name ILIKE '%8%';

-- 2. Insertar nuevo plan: Combo 4 Lavados (solo si no existe)
INSERT INTO public.membership_plans (name, description, discount_percent, wash_count, duration_days, is_active)
SELECT
  'Combo 4 Lavados',
  'Descuento del 18% en lavados. Válido por 4 semanas.',
  18,
  4,
  28,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.membership_plans WHERE wash_count = 4 AND name ILIKE '%4%'
);

-- 3. Verificar resultado
SELECT id, name, discount_percent, wash_count, duration_days, is_active
FROM public.membership_plans
ORDER BY wash_count;
