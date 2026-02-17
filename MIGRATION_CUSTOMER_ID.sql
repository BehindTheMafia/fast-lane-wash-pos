-- ============================================================================
-- MIGRACIÓN: Agregar customer_id a la tabla tickets
-- ============================================================================
-- Ejecuta este SQL en el SQL Editor de Supabase
-- URL: https://supabase.com/dashboard/project/dwbfmphghmquxigmczcc/sql/new
-- ============================================================================

-- Paso 1: Agregar columna customer_id
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS customer_id bigint REFERENCES public.customers(id);

-- Paso 2: Crear índice para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON public.tickets(customer_id);

-- Paso 3: Verificar que la columna se agregó correctamente
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'tickets'
ORDER BY ordinal_position;
