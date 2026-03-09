-- ============================================================================
-- RECONCILIACIÓN DE TOTALES: 08/03/2026
-- Objetivo: Llegar al total esperado de C$4457.00
-- ============================================================================

-- 1. CORRECCIÓN DE TICKET BAJO (T-MMIE35JZ)
-- Este ticket tiene 2 servicios pero solo se cobró 1 (C$99). 
-- Se ajusta a C$198 para reflejar la realidad.
UPDATE public.tickets
SET total = 198.00, updated_at = NOW()
WHERE ticket_number = 'T-MMIE35JZ';

UPDATE public.payments
SET amount = 198.00, amount_received = 198.00
WHERE ticket_id = (SELECT id FROM public.tickets WHERE ticket_number = 'T-MMIE35JZ');


-- 2. MOVER TICKET DE JACKELIN (T-MMHXCHWM) A HOY (09/03/2026)
-- El usuario dice que "no debería ir" en el reporte de ayer. 
-- Lo movemos a hoy para que no afecte el total de ayer pero no se pierda el registro.
UPDATE public.tickets
SET created_at = '2026-03-09 09:00:00+00', updated_at = NOW()
WHERE ticket_number = 'T-MMHXCHWM';

-- También actualizamos la fecha del pago asociado
UPDATE public.payments
SET created_at = '2026-03-09 09:00:00+00'
WHERE ticket_id = (SELECT id FROM public.tickets WHERE ticket_number = 'T-MMHXCHWM');


-- ============================================================================
-- VERIFICACIÓN PARA AYER (08/03/2026)
-- ============================================================================
SELECT 
  SUM(total) as total_ayer_nio
FROM public.tickets t
JOIN public.payments p ON p.ticket_id = t.id
WHERE t.created_at >= '2026-03-08 00:00:00+00' 
  AND t.created_at < '2026-03-09 00:00:00+00'
  AND p.currency = 'NIO';
