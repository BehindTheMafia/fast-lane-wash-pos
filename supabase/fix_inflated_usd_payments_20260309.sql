no-- ============================================================================
-- REMEDIATE INFLATED USD PAYMENTS (2026-03-09)
-- Fixes payments that were saved with the numerical value of Cordobas but labeled as USD.
-- ============================================================================

-- 1. Check affected payments (Preview - run this SELECT before the UPDATE if you want to be sure)
-- SELECT id, ticket_id, amount, currency, exchange_rate 
-- FROM public.payments 
-- WHERE currency = 'USD' 
--   AND amount > 50 
--   AND created_at >= '2026-03-09'::date;

-- 2. Execute the fix
UPDATE public.payments
SET amount = ROUND(amount / COALESCE(exchange_rate, 36.5), 2)
WHERE currency = 'USD'
  AND amount > 50  -- No wash in USD should naturally exceed $50 in this system
  AND created_at >= '2026-03-09'::date;

-- 3. Verify changes
-- SELECT id, ticket_id, amount, currency FROM public.payments WHERE created_at >= '2026-03-09'::date AND currency = 'USD';
