export const FULL_DATABASE_SCHEMA = `
-- CREADO POR EL SISTEMA DE POS EL RAPIDO

-- 0. CREACIÓN DE BASE DE DATOS
-- Nota: Si se restaura en Supabase, la DB ya existe, pero esto es útil para servidores propios.
-- CREATE DATABASE el_rapido_pos;
-- \\c el_rapido_pos;

-- 1. TIPOS Y ENUMS
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'cajero');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.vehicle_type AS ENUM ('moto', 'sedan', 'suv', 'pickup', 'microbus');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABLAS BASE
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  role app_role NOT NULL DEFAULT 'cajero',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL DEFAULT 'EL RAPIDO AUTOLAVADO',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  ruc TEXT DEFAULT '',
  social_media TEXT DEFAULT '',
  logo_url TEXT DEFAULT NULL,
  qr_image_url TEXT DEFAULT NULL,
  qr_text TEXT DEFAULT 'Tu opinión es importante para nosotros',
  receipt_footer TEXT DEFAULT '¡Gracias por su visita!',
  exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 36.50,
  printer_width_mm INT DEFAULT 80,
  double_print_ticket BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  plate TEXT DEFAULT '',
  email TEXT DEFAULT '',
  is_general BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  includes TEXT[] DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  vehicle_type vehicle_type NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  UNIQUE (service_id, vehicle_type)
);

CREATE TABLE IF NOT EXISTS public.membership_plans (
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

CREATE TABLE IF NOT EXISTS public.customer_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.membership_plans(id) NOT NULL,
  washes_used INT NOT NULL DEFAULT 0,
  bonus_washes_earned INT DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL,
  user_id UUID,
  cashier_id UUID,
  customer_id UUID REFERENCES public.customers(id),
  vehicle_type_id INT,
  vehicle_plate TEXT DEFAULT '',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'paid',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES public.services(id) NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NIO',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  amount_received NUMERIC(10,2) NOT NULL DEFAULT 0,
  change_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 36.50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID NOT NULL,
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

CREATE TABLE IF NOT EXISTS public.cash_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id UUID REFERENCES public.cash_closures(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'caja_chica',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. FUNCIONES DE SEGURIDAD Y RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_expenses ENABLE ROW LEVEL SECURITY;

-- Nota: Las políticas RLS varían según el entorno de Supabase, 
-- se recomienda configurar los usuarios administrativamente.
`;
