-- ============================================================================
-- REPARACIÓN COMPLETA: Ticket T-MMF20ZI2
-- Cliente: Yorlan Gutierrez Noguera
-- Servicio: Lavado Rápido – Breve (Sedán) = C$175.00
-- Pago: Tarjeta
-- Causa: Se fue la luz durante el registro. Solo se guardó el ticket base.
-- ============================================================================

-- 1. Insertar el pago faltante (Tarjeta C$175)
INSERT INTO public.payments (
  ticket_id, amount, currency, payment_method,
  amount_received, change_amount, exchange_rate
)
SELECT
  t.id,
  t.total,
  'NIO',
  'card',
  t.total,
  0,
  36.5
FROM public.tickets t
WHERE t.ticket_number = 'T-MMF20ZI2'
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p WHERE p.ticket_id = t.id
  );

-- 2. Insertar el ítem de servicio (Lavado Rápido – Breve)
INSERT INTO public.ticket_items (
  ticket_id,
  service_id,
  price
)
SELECT
  t.id,
  'a1111111-1111-1111-1111-111111111111',
  t.total
FROM public.tickets t
WHERE t.ticket_number = 'T-MMF20ZI2'
  AND NOT EXISTS (
    SELECT 1 FROM public.ticket_items ti WHERE ti.ticket_id = t.id
  );

-- 3. Incrementar visita de lealtad (+1) para el cliente Yorlan
--    Y registrar la visita en la tabla loyalty_visits
UPDATE public.customers
SET
  loyalty_visits = loyalty_visits + 1,
  loyalty_last_visit = (
    SELECT created_at FROM public.tickets WHERE ticket_number = 'T-MMF20ZI2'
  )
WHERE name ILIKE '%Yorlan%'
  AND is_general = false;

INSERT INTO public.loyalty_visits (
  customer_id, ticket_id, service_id, visit_number, earned_free_wash
)
SELECT
  c.id,
  t.id,
  'a1111111-1111-1111-1111-111111111111',
  c.loyalty_visits,  -- Ya incrementado arriba
  (c.loyalty_visits % 9 = 0)  -- true si con esta visita ganó lavado gratis
FROM public.customers c
CROSS JOIN public.tickets t
WHERE c.name ILIKE '%Yorlan%'
  AND c.is_general = false
  AND t.ticket_number = 'T-MMF20ZI2'
  AND NOT EXISTS (
    SELECT 1 FROM public.loyalty_visits lv
    WHERE lv.ticket_id = t.id AND lv.customer_id = c.id
  );

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================
SELECT
  t.ticket_number,
  t.total,
  t.created_at,
  s.name AS servicio,
  vt.name AS vehiculo,
  p.payment_method AS metodo_pago,
  c.name AS cliente,
  c.loyalty_visits AS visitas_lealtad,
  c.loyalty_free_washes_earned AS lavados_gratis_ganados
FROM public.tickets t
LEFT JOIN public.ticket_items ti ON ti.ticket_id = t.id
LEFT JOIN public.services s ON s.id = ti.service_id
LEFT JOIN public.vehicle_types vt ON vt.id = t.vehicle_type_id
LEFT JOIN public.payments p ON p.ticket_id = t.id
LEFT JOIN public.customers c ON c.id = t.customer_id
WHERE t.ticket_number = 'T-MMF20ZI2';
