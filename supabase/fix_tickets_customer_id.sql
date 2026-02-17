-- ============================================================================
-- AGREGAR COLUMNAS FALTANTES A LA TABLA TICKETS
-- ============================================================================
-- Este script agrega las columnas necesarias para que funcione la venta de membresías
-- Ejecuta este SQL en el SQL Editor de Supabase
-- ============================================================================

-- Agregar columna customer_id si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tickets' 
        AND column_name = 'customer_id'
    ) THEN
        ALTER TABLE public.tickets ADD COLUMN customer_id bigint REFERENCES public.customers(id);
        RAISE NOTICE 'Columna customer_id agregada a tickets';
    ELSE
        RAISE NOTICE 'Columna customer_id ya existe en tickets';
    END IF;
END $$;

-- Agregar índice para customer_id
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON public.tickets(customer_id);

-- Verificar las columnas de la tabla tickets
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'tickets'
ORDER BY ordinal_position;
