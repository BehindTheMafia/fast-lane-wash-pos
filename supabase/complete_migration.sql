-- ============================================================================
-- FAST LANE WASH POS - COMPLETE DATABASE MIGRATION
-- ============================================================================
-- This file consolidates all migrations for the Fast Lane Wash POS system
-- Execute this in your Supabase SQL Editor to set up the complete database
-- Database ID: dwbfmphghmquxigmczcc
-- ============================================================================

-- ============================================================================
-- MIGRATION 1: Initial Schema Setup
-- File: 20260212025428_30e8f839-3114-4038-82c8-bc9fcdba236b.sql
-- ============================================================================

-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'cajero');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  role app_role NOT NULL DEFAULT 'cajero',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'cajero'));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'cajero'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Business settings
CREATE TABLE public.business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL DEFAULT 'EL RAPIDO AUTOLAVADO',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  ruc TEXT DEFAULT '',
  exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 36.50,
  printer_config JSONB DEFAULT '{}',
  ticket_template JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  plate TEXT DEFAULT '',
  email TEXT DEFAULT '',
  is_general BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Services
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  includes TEXT[] DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Vehicle type enum
CREATE TYPE public.vehicle_type AS ENUM ('moto', 'sedan', 'suv', 'pickup', 'microbus');

-- Service prices per vehicle type
CREATE TABLE public.service_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  vehicle_type vehicle_type NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  UNIQUE (service_id, vehicle_type)
);
ALTER TABLE public.service_prices ENABLE ROW LEVEL SECURITY;

-- Membership plans
CREATE TABLE public.membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  wash_count INT NOT NULL DEFAULT 0,
  applies_to_service UUID REFERENCES public.services(id),
  bonus_rule TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;

-- Customer memberships
CREATE TABLE public.customer_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.membership_plans(id) NOT NULL,
  washes_used INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_memberships ENABLE ROW LEVEL SECURITY;

-- Tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL,
  cashier_id UUID REFERENCES auth.users(id) NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  vehicle_type vehicle_type NOT NULL,
  service_id UUID REFERENCES public.services(id) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  membership_id UUID REFERENCES public.customer_memberships(id),
  plate TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NIO' CHECK (currency IN ('NIO', 'USD')),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer')),
  amount_received NUMERIC(10,2) NOT NULL DEFAULT 0,
  change_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 36.50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Cash closures
CREATE TABLE public.cash_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID REFERENCES auth.users(id) NOT NULL,
  shift TEXT DEFAULT '',
  initial_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cash_nio NUMERIC(10,2) DEFAULT 0,
  total_cash_usd NUMERIC(10,2) DEFAULT 0,
  total_card NUMERIC(10,2) DEFAULT 0,
  total_transfer NUMERIC(10,2) DEFAULT 0,
  total_expenses NUMERIC(10,2) DEFAULT 0,
  expected_total NUMERIC(10,2) DEFAULT 0,
  counted_total NUMERIC(10,2) DEFAULT 0,
  difference NUMERIC(10,2) DEFAULT 0,
  bills_count JSONB DEFAULT '{}',
  coins_count JSONB DEFAULT '{}',
  observations TEXT DEFAULT '',
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;

-- Cash expenses (egresos)
CREATE TABLE public.cash_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id UUID REFERENCES public.cash_closures(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'caja_chica',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  receipt TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- user_roles
CREATE POLICY "Admin full access user_roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read own role" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- profiles
CREATE POLICY "Admin full access profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- business_settings
CREATE POLICY "Admin full access settings" ON public.business_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read settings" ON public.business_settings FOR SELECT TO authenticated
  USING (true);

-- customers
CREATE POLICY "Authenticated CRUD customers" ON public.customers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- services
CREATE POLICY "Authenticated read services" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write services" ON public.services FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update services" ON public.services FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete services" ON public.services FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- service_prices
CREATE POLICY "Authenticated read prices" ON public.service_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write prices" ON public.service_prices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update prices" ON public.service_prices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete prices" ON public.service_prices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- membership_plans
CREATE POLICY "Authenticated read plans" ON public.membership_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write plans" ON public.membership_plans FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update plans" ON public.membership_plans FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete plans" ON public.membership_plans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- customer_memberships
CREATE POLICY "Authenticated read memberships" ON public.customer_memberships FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write memberships" ON public.customer_memberships FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Cajero read memberships" ON public.customer_memberships FOR SELECT TO authenticated USING (true);

-- tickets
CREATE POLICY "Authenticated read tickets" ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create tickets" ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = cashier_id);
CREATE POLICY "Admin update tickets" ON public.tickets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR cashier_id = auth.uid());
CREATE POLICY "Admin delete tickets" ON public.tickets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- payments
CREATE POLICY "Authenticated read payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin update payments" ON public.payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- cash_closures
CREATE POLICY "Admin full cash_closures" ON public.cash_closures FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Cajero read own closures" ON public.cash_closures FOR SELECT TO authenticated
  USING (cashier_id = auth.uid());
CREATE POLICY "Cajero create closures" ON public.cash_closures FOR INSERT TO authenticated
  WITH CHECK (cashier_id = auth.uid());

-- cash_expenses
CREATE POLICY "Admin full expenses" ON public.cash_expenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read expenses" ON public.cash_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create expenses" ON public.cash_expenses FOR INSERT TO authenticated WITH CHECK (true);

-- Seed data: business settings
INSERT INTO public.business_settings (business_name, address, phone, exchange_rate)
VALUES ('EL RAPIDO AUTOLAVADO', '', '', 36.50);

-- Seed: general customer
INSERT INTO public.customers (name, phone, plate, is_general)
VALUES ('Cliente General', '', '', true);

-- Seed: services
INSERT INTO public.services (id, name, description, includes) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Lavado Rápido – Breve', 'Lavado básico exterior e interior', ARRAY['Lavado exterior', 'Limpieza interior', 'Aspirado', 'Limpieza de llantas', 'Brillo básico']),
  ('a2222222-2222-2222-2222-222222222222', 'Lavado Rápido – Nítido', 'Lavado premium con brillo pasteado', ARRAY['Lavado exterior', 'Limpieza interior', 'Aspirado', 'Limpieza y brillo de llantas', 'Brillo pasteado']);

-- Seed: service prices (Breve)
INSERT INTO public.service_prices (service_id, vehicle_type, price) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'moto', 99),
  ('a1111111-1111-1111-1111-111111111111', 'sedan', 175),
  ('a1111111-1111-1111-1111-111111111111', 'suv', 225),
  ('a1111111-1111-1111-1111-111111111111', 'pickup', 255),
  ('a1111111-1111-1111-1111-111111111111', 'microbus', 355);

-- Seed: service prices (Nítido)
INSERT INTO public.service_prices (service_id, vehicle_type, price) VALUES
  ('a2222222-2222-2222-2222-222222222222', 'moto', 150),
  ('a2222222-2222-2222-2222-222222222222', 'sedan', 250),
  ('a2222222-2222-2222-2222-222222222222', 'suv', 310),
  ('a2222222-2222-2222-2222-222222222222', 'pickup', 350),
  ('a2222222-2222-2222-2222-222222222222', 'microbus', 450);

-- Seed: membership plans
INSERT INTO public.membership_plans (name, description, discount_percent, wash_count, applies_to_service, bonus_rule) VALUES
  ('Combo 8 Lavados', 'Descuento del 36% en Lavado Rápido – Breve. Pasteado gratis al acumular 9 lavados.', 36, 8, 'a1111111-1111-1111-1111-111111111111', 'pasteado_gratis_9'),
  ('Cliente Frecuente', 'Cada 5 lavados: descuento 20%. Aplica a todos los servicios.', 20, 5, NULL, 'descuento_cada_5');

-- ============================================================================
-- MIGRATION 2: Security Policy Fixes
-- File: 20260212025439_2cdfb49f-a1af-44b9-a7c0-0651aa3636db.sql
-- ============================================================================

-- Fix overly permissive customers policy - restrict delete to admin
DROP POLICY "Authenticated CRUD customers" ON public.customers;
CREATE POLICY "Authenticated read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update customers" ON public.customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete customers" ON public.customers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Fix payments create - restrict to authenticated with ticket ownership check
DROP POLICY "Authenticated create payments" ON public.payments;
CREATE POLICY "Cashier create payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND (t.cashier_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Fix expenses create
DROP POLICY "Authenticated create expenses" ON public.cash_expenses;
CREATE POLICY "Cashier create expenses" ON public.cash_expenses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cajero'));

-- ============================================================================
-- MIGRATION 3: Membership Enhancements
-- File: 20260214033723_membership_enhancements.sql
-- ============================================================================

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

-- ============================================================================
-- MIGRATION 4: Loyalty Program
-- File: 20260216212700_loyalty_program.sql
-- ============================================================================

-- 1. Add loyalty tracking columns to customers table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS loyalty_visits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_last_visit TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loyalty_free_washes_earned INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_free_washes_used INT NOT NULL DEFAULT 0;

-- 2. Create loyalty_visits table to track individual visits
CREATE TABLE IF NOT EXISTS public.loyalty_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) NOT NULL,
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
  p_customer_id UUID,
  p_ticket_id UUID,
  p_service_id UUID
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
  p_customer_id UUID
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

-- ============================================================================
-- MIGRATION 5: Fix Missing Service ID
-- File: 20260216220700_fix_missing_service_id.sql
-- Note: This migration is for existing data. For fresh installations, it won't affect anything.
-- ============================================================================

-- Migration: Fix missing service_id in existing memberships
DO $$
DECLARE
    membership_record RECORD;
    default_service_id UUID := 'a1111111-1111-1111-1111-111111111111'; -- Lavado Rápido – Breve
BEGIN
    -- Update all memberships that have NULL service_id
    -- We'll default to service_id = 'a1111111-1111-1111-1111-111111111111' (Lavado Rápido – Breve)
    
    FOR membership_record IN 
        SELECT id, customer_id, plan_id, vehicle_type_id, service_id
        FROM customer_memberships
        WHERE service_id IS NULL
    LOOP
        -- Update to default service (Lavado Breve)
        UPDATE customer_memberships
        SET service_id = default_service_id
        WHERE id = membership_record.id;
        
        RAISE NOTICE 'Updated membership % for customer % to service_id %', 
            membership_record.id, 
            membership_record.customer_id, 
            default_service_id;
    END LOOP;
    
    RAISE NOTICE 'Migration completed. All memberships now have service_id.';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- All tables, functions, policies, and seed data have been created.
-- You can now start using the Fast Lane Wash POS system!
-- ============================================================================
