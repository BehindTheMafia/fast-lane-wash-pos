-- Loyalty Program v2: Count by SERVICES (not visits), 8 services = free pasteado
-- Run this in Supabase SQL Editor

-- 1. Update the increment function to accept service count and use 8 instead of 9
CREATE OR REPLACE FUNCTION public.increment_loyalty_visit(
  p_customer_id BIGINT,
  p_ticket_id BIGINT,
  p_service_id BIGINT,
  p_services_count INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_visits INT;
  v_new_visits INT;
  v_earned_free_wash BOOLEAN := false;
  v_free_washes_earned INT;
  v_old_cycle INT;
  v_new_cycle INT;
  v_new_free_washes INT := 0;
BEGIN
  -- Get current loyalty stats
  SELECT loyalty_visits, loyalty_free_washes_earned
  INTO v_current_visits, v_free_washes_earned
  FROM public.customers
  WHERE id = p_customer_id;

  -- Add the number of services from this ticket
  v_new_visits := v_current_visits + p_services_count;

  -- Check if crossed a multiple of 8
  -- Example: was at 7, add 1 → 8 → earned 1
  -- Was at 14, add 3 → 17 → earned 1 (crossed 16)
  -- Was at 6, add 10 → 16 → earned 2 (crossed 8 and 16)
  v_old_cycle := v_current_visits / 8;
  v_new_cycle := v_new_visits / 8;

  IF v_new_cycle > v_old_cycle THEN
    v_earned_free_wash := true;
    v_new_free_washes := v_new_cycle - v_old_cycle;
    v_free_washes_earned := v_free_washes_earned + v_new_free_washes;
  END IF;

  -- Update customer loyalty stats
  UPDATE public.customers
  SET 
    loyalty_visits = v_new_visits,
    loyalty_last_visit = now(),
    loyalty_free_washes_earned = v_free_washes_earned
  WHERE id = p_customer_id;

  -- Record the visit
  INSERT INTO public.loyalty_visits (customer_id, ticket_id, service_id, visit_number, earned_free_wash)
  VALUES (p_customer_id, p_ticket_id, p_service_id, v_new_visits, v_earned_free_wash);

  -- Return result
  RETURN jsonb_build_object(
    'visit_number', v_new_visits,
    'earned_free_wash', v_earned_free_wash,
    'free_washes_earned_now', v_new_free_washes,
    'free_washes_available', v_free_washes_earned - (SELECT loyalty_free_washes_used FROM public.customers WHERE id = p_customer_id),
    'visits_until_next_free', 8 - (v_new_visits % 8)
  );
END;
$$;

-- 2. Update view to use 8 instead of 9
CREATE OR REPLACE VIEW public.customer_loyalty_status AS
SELECT 
  c.id,
  c.name,
  c.phone,
  c.plate,
  c.loyalty_visits,
  c.loyalty_last_visit,
  c.loyalty_free_washes_earned,
  c.loyalty_free_washes_used,
  (c.loyalty_free_washes_earned - c.loyalty_free_washes_used) as free_washes_available,
  CASE 
    WHEN c.loyalty_visits % 8 = 0 THEN 8
    ELSE 8 - (c.loyalty_visits % 8)
  END as visits_until_next_free,
  ROUND((c.loyalty_visits % 8)::NUMERIC / 8 * 100, 0) as progress_percent
FROM public.customers c
WHERE c.is_general = false;

-- 3. Update comments
COMMENT ON COLUMN public.customers.loyalty_visits IS 'Total number of services purchased. Every 8 services earns a free Pasteado wash with the Breve service.';
