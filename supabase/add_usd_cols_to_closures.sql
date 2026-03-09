-- ============================================================================
-- SQL: Adición de columnas USD a la tabla cash_closures
-- ============================================================================

ALTER TABLE public.cash_closures ADD COLUMN IF NOT EXISTS total_card_usd NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.cash_closures ADD COLUMN IF NOT EXISTS total_transfer_usd NUMERIC(10,2) DEFAULT 0;

-- Nota: Estas columnas permiten registrar el desglose completo de USD (no solo efectivo) 
-- para mayor transparencia en el historial de cierres.
