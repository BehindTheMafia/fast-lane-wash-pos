-- Fix: Insert missing payment for ticket T-MMF20ZI2
-- Ticket was registered without a payment record (likely a network failure after ticket creation).
-- Adding a "card" payment for C$175.00 (the ticket total).

INSERT INTO public.payments (
  ticket_id,
  amount,
  currency,
  payment_method,
  amount_received,
  change_amount,
  exchange_rate
)
SELECT
  t.id,
  t.total,          -- C$175.00
  'NIO',
  'card',
  t.total,          -- received = total (card payments don't have change)
  0,
  36.5
FROM public.tickets t
WHERE t.ticket_number = 'T-MMF20ZI2'
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p WHERE p.ticket_id = t.id
  );

-- Verify the result:
SELECT
  t.ticket_number,
  t.total,
  p.payment_method,
  p.amount,
  p.currency,
  p.created_at
FROM public.tickets t
LEFT JOIN public.payments p ON p.ticket_id = t.id
WHERE t.ticket_number = 'T-MMF20ZI2';
