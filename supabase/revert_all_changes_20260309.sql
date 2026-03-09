-- ============================================================================
-- SCRIPT DE REVERSIÓN TOTAL: 09/03/2026
-- Objetivo: Volver la base de datos a su estado inicial antes de las modificaciones.
-- ============================================================================

-- 1. REVERTIR TICKET T-MMIE35JZ (08/03/2026)
-- Volver total de C$198 a C$99
UPDATE public.tickets
SET total = 99.00, updated_at = NOW()
WHERE ticket_number = 'T-MMIE35JZ';

UPDATE public.payments
SET amount = 99.00, amount_received = 99.00
WHERE ticket_id = (SELECT id FROM public.tickets WHERE ticket_number = 'T-MMIE35JZ');


-- 2. REVERTIR TICKET T-MMHXCHWM (De 09/03 de vuelta a 08/03)
-- Restaurar fecha original (aproximada basada en reportes previos)
UPDATE public.tickets
SET created_at = '2026-03-08 09:45:00+00', updated_at = NOW()
WHERE ticket_number = 'T-MMHXCHWM';

UPDATE public.payments
SET created_at = '2026-03-08 09:45:00+00'
WHERE ticket_id = (SELECT id FROM public.tickets WHERE ticket_number = 'T-MMHXCHWM');


-- 3. REVERTIR REPARACIÓN DE TICKET T-MMF20ZI2
-- Eliminar pago, ítems y visitas de lealtad agregadas manualmente

-- 3a. Eliminar ítems de visita de lealtad
DELETE FROM public.loyalty_visits
WHERE ticket_id = (SELECT id FROM public.tickets WHERE ticket_number = 'T-MMF20ZI2');

-- 3b. Decrementar visitas en el cliente
UPDATE public.customers
SET loyalty_visits = GREATEST(0, loyalty_visits - 1)
WHERE name ILIKE '%Yorlan%' AND is_general = false;

-- 3c. Eliminar ítems del ticket
DELETE FROM public.ticket_items
WHERE ticket_id = (SELECT id FROM public.tickets WHERE ticket_number = 'T-MMF20ZI2');

-- 3d. Eliminar pago
DELETE FROM public.payments
WHERE ticket_id = (SELECT id FROM public.tickets WHERE ticket_number = 'T-MMF20ZI2');


-- 4. ELIMINAR TABLA DE RESTRICCIÓN DE SESIÓN
DROP TABLE IF EXISTS public.active_sessions;


-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- Ticket T-MMIE35JZ debería volver a C$99
-- Ticket T-MMHXCHWM debería estar en el 08/03
-- Ticket T-MMF20ZI2 debería estar limpio (sin pagos ni servicios)
