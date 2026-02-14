-- Membership Enhancements Migration
-- Adds expiration tracking, vehicle type, and wash history

-- 1. Add new columns to customer_memberships
ALTER TABLE public.customer_memberships
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN total_washes_allowed INT NOT NULL DEFAULT 8,
  ADD COLUMN bonus_washes_earned INT NOT NULL DEFAULT 0,
  ADD COLUMN vehicle_type_id INT;

-- 2. Create membership_washes table to track individual washes
CREATE TABLE public.membership_washes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID REFERENCES public.customer_memberships(id) ON DELETE CASCADE NOT NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) NOT NULL,
  is_bonus BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on membership_washes
ALTER TABLE public.membership_washes ENABLE ROW LEVEL SECURITY;

-- RLS policies for membership_washes
CREATE POLICY "Authenticated read washes" ON public.membership_washes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create washes" ON public.membership_washes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin delete washes" ON public.membership_washes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Create function to set expiration date on membership creation
CREATE OR REPLACE FUNCTION public.set_membership_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set expiration to 28 days from creation if not already set
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.created_at + INTERVAL '28 days';
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Create trigger to auto-set expiration
CREATE TRIGGER set_membership_expiration_trigger
  BEFORE INSERT ON public.customer_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_membership_expiration();

-- 5. Create function to check if membership is expired
CREATE OR REPLACE FUNCTION public.is_membership_expired(membership_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT expires_at < now()
  FROM public.customer_memberships
  WHERE id = membership_id;
$$;

-- 6. Create function to get days remaining
CREATE OR REPLACE FUNCTION public.get_membership_days_remaining(membership_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0, EXTRACT(DAY FROM (expires_at - now()))::INT)
  FROM public.customer_memberships
  WHERE id = membership_id;
$$;

-- 7. Update existing memberships to have expiration dates
UPDATE public.customer_memberships
SET expires_at = created_at + INTERVAL '28 days'
WHERE expires_at IS NULL;

-- 8. Create indexes for better performance
CREATE INDEX idx_membership_washes_membership_id ON public.membership_washes(membership_id);
CREATE INDEX idx_membership_washes_ticket_id ON public.membership_washes(ticket_id);
CREATE INDEX idx_customer_memberships_customer_active ON public.customer_memberships(customer_id, active);
CREATE INDEX idx_customer_memberships_expires_at ON public.customer_memberships(expires_at);

-- 9. Add vehicle_types table for reference (if not exists)
CREATE TABLE IF NOT EXISTS public.vehicle_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  key TEXT NOT NULL UNIQUE
);

-- Seed vehicle types
INSERT INTO public.vehicle_types (id, name, key) VALUES
  (1, 'Moto', 'moto'),
  (2, 'Sedán', 'sedan'),
  (3, 'SUV', 'suv'),
  (4, 'Pick up', 'pickup'),
  (5, 'Microbús', 'microbus')
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on vehicle_types
ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;

-- RLS policy for vehicle_types (read-only for authenticated users)
CREATE POLICY "Authenticated read vehicle_types" ON public.vehicle_types FOR SELECT TO authenticated USING (true);

-- 10. Add foreign key constraint for vehicle_type_id
ALTER TABLE public.customer_memberships
  ADD CONSTRAINT fk_customer_memberships_vehicle_type
  FOREIGN KEY (vehicle_type_id) REFERENCES public.vehicle_types(id);

-- 11. Update membership_plans to include duration_days
ALTER TABLE public.membership_plans
  ADD COLUMN duration_days INT NOT NULL DEFAULT 28;

-- 12. Create view for active memberships with details
CREATE OR REPLACE VIEW public.active_memberships_view AS
SELECT 
  cm.id,
  cm.customer_id,
  cm.plan_id,
  cm.washes_used,
  cm.total_washes_allowed,
  cm.bonus_washes_earned,
  cm.vehicle_type_id,
  cm.expires_at,
  cm.created_at,
  cm.active,
  c.name as customer_name,
  c.phone as customer_phone,
  c.plate as customer_plate,
  mp.name as plan_name,
  mp.discount_percent,
  mp.wash_count,
  vt.name as vehicle_type_name,
  EXTRACT(DAY FROM (cm.expires_at - now()))::INT as days_remaining,
  CASE 
    WHEN cm.expires_at < now() THEN 'expired'
    WHEN EXTRACT(DAY FROM (cm.expires_at - now())) <= 7 THEN 'expiring_soon'
    ELSE 'active'
  END as status
FROM public.customer_memberships cm
JOIN public.customers c ON cm.customer_id = c.id
JOIN public.membership_plans mp ON cm.plan_id = mp.id
LEFT JOIN public.vehicle_types vt ON cm.vehicle_type_id = vt.id
WHERE cm.active = true;

-- Grant access to the view
GRANT SELECT ON public.active_memberships_view TO authenticated;
