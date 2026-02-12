
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
