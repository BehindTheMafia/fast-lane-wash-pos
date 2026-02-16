-- Loyalty Program Migration
-- Adds loyalty tracking for customers to earn free services after 9 purchases

-- 1. Add loyalty tracking columns to customers table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS loyalty_visits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_last_visit TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loyalty_free_washes_earned INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_free_washes_used INT NOT NULL DEFAULT 0;

-- 2. Create loyalty_visits table to track individual visits
CREATE TABLE IF NOT EXISTS public.loyalty_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id BIGINT REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  ticket_id BIGINT REFERENCES public.tickets(id) ON DELETE SET NULL,
  service_id BIGINT REFERENCES public.services(id) NOT NULL,
  visit_number INT NOT NULL,
  earned_free_wash BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on loyalty_visits
ALTER TABLE public.loyalty_visits ENABLE ROW LEVEL SECURITY;

-- RLS policies for loyalty_visits
CREATE POLICY "Authenticated read loyalty visits" ON public.loyalty_visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create loyalty visits" ON public.loyalty_visits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated delete loyalty visits" ON public.loyalty_visits FOR DELETE TO authenticated USING (true);

-- 3. Create function to increment loyalty visits and award free washes
CREATE OR REPLACE FUNCTION public.increment_loyalty_visit(
  p_customer_id BIGINT,
  p_ticket_id BIGINT,
  p_service_id BIGINT
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
BEGIN
  -- Get current loyalty stats
  SELECT loyalty_visits, loyalty_free_washes_earned
  INTO v_current_visits, v_free_washes_earned
  FROM public.customers
  WHERE id = p_customer_id;

  -- Increment visit count
  v_new_visits := v_current_visits + 1;

  -- Check if customer earned a free wash (every 9 visits)
  IF v_new_visits % 9 = 0 THEN
    v_earned_free_wash := true;
    v_free_washes_earned := v_free_washes_earned + 1;
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
    'free_washes_available', v_free_washes_earned - (SELECT loyalty_free_washes_used FROM public.customers WHERE id = p_customer_id),
    'visits_until_next_free', 9 - (v_new_visits % 9)
  );
END;
$$;

-- 4. Create function to use a free wash
CREATE OR REPLACE FUNCTION public.use_loyalty_free_wash(
  p_customer_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free_washes_earned INT;
  v_free_washes_used INT;
BEGIN
  -- Get current free wash stats
  SELECT loyalty_free_washes_earned, loyalty_free_washes_used
  INTO v_free_washes_earned, v_free_washes_used
  FROM public.customers
  WHERE id = p_customer_id;

  -- Check if customer has free washes available
  IF v_free_washes_earned <= v_free_washes_used THEN
    RETURN false;
  END IF;

  -- Increment used count
  UPDATE public.customers
  SET loyalty_free_washes_used = loyalty_free_washes_used + 1
  WHERE id = p_customer_id;

  RETURN true;
END;
$$;

-- 5. Create view for customer loyalty status
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
    WHEN c.loyalty_visits % 9 = 0 THEN 9
    ELSE 9 - (c.loyalty_visits % 9)
  END as visits_until_next_free,
  ROUND((c.loyalty_visits % 9)::NUMERIC / 9 * 100, 0) as progress_percent
FROM public.customers c
WHERE c.is_general = false;

-- Grant access to the view
GRANT SELECT ON public.customer_loyalty_status TO authenticated;

-- 6. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_loyalty_visits_customer_id ON public.loyalty_visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_visits_ticket_id ON public.loyalty_visits(ticket_id);
CREATE INDEX IF NOT EXISTS idx_customers_loyalty_visits ON public.customers(loyalty_visits);

-- 7. Add comment to explain the loyalty program
COMMENT ON COLUMN public.customers.loyalty_visits IS 'Total number of service purchases (excluding memberships). Every 9 visits earns a free Pasteado wash.';
COMMENT ON COLUMN public.customers.loyalty_free_washes_earned IS 'Total number of free washes earned through loyalty program';
COMMENT ON COLUMN public.customers.loyalty_free_washes_used IS 'Total number of free washes already redeemed';
