-- Manual repair: paid tickets with no payment row
-- Run AFTER 20260601000000_mixed_payments.sql
-- Review each orphan before inserting; adjust amounts/methods as needed.

-- 1) List orphans
SELECT t.id, t.ticket_number, t.total, t.created_at, t.status
FROM public.tickets t
LEFT JOIN public.payments p ON p.ticket_id = t.id
WHERE t.status = 'paid' AND p.id IS NULL
ORDER BY t.created_at DESC;

-- 2) Example: single-method backfill (replace placeholders)
-- INSERT INTO public.payments (ticket_id, amount, currency, payment_method, amount_received, change_amount, exchange_rate)
-- VALUES (
--   :ticket_id,
--   :amount,
--   'NIO',
--   'cash',
--   :amount_received,
--   0,
--   36.5
-- );

-- 3) Example: mixed backfill (replace placeholders)
-- INSERT INTO public.payments (ticket_id, amount, currency, payment_method, amount_received, change_amount, exchange_rate)
-- VALUES (:ticket_id, :total, 'NIO', 'mixed', :received, :change, 36.5);
--
-- INSERT INTO public.ticket_mixed_payments (ticket_id, method, currency, amount, exchange_rate, amount_nio, applied_nio, change_nio)
-- VALUES
--   (:ticket_id, 'cash', 'NIO', :cash_amount, 36.5, :cash_nio, :cash_applied, :cash_change),
--   (:ticket_id, 'card', 'NIO', :card_amount, 36.5, :card_nio, :card_applied, 0);
