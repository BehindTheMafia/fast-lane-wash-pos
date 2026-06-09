export const FULL_DATABASE_SCHEMA = `
-- CREADO POR EL SISTEMA DE POS EL RAPIDO
-- Incluye: Autolavado + Barbería + Variantes de precio

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

DO $$ BEGIN
    CREATE TYPE public.business_line AS ENUM ('car_wash', 'barbershop');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.ticket_item_type AS ENUM ('service', 'product');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.stock_movement_reason AS ENUM ('sale', 'adjustment', 'restock', 'return');
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
  business_line business_line NOT NULL DEFAULT 'car_wash',
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
  icon TEXT DEFAULT 'fa-soap',
  is_extra BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 99,
  business_line business_line NOT NULL DEFAULT 'car_wash',
  base_price NUMERIC(10,2) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT 'fa-car',
  sort_order INT NOT NULL DEFAULT 99,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  vehicle_type_id INT REFERENCES public.vehicle_types(id) ON DELETE CASCADE NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  variant_label TEXT NOT NULL DEFAULT 'Estándar',
  variant_sort SMALLINT NOT NULL DEFAULT 0 CHECK (variant_sort >= 0 AND variant_sort <= 2),
  UNIQUE (service_id, vehicle_type_id, variant_sort)
);

-- Barbershop: products & inventory
CREATE TABLE IF NOT EXISTS public.products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock_level INT NOT NULL DEFAULT 5 CHECK (min_stock_level >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 99,
  icon TEXT DEFAULT 'fa-bottle-droplet',
  business_line business_line NOT NULL DEFAULT 'barbershop',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_delta INT NOT NULL,
  reason stock_movement_reason NOT NULL,
  ticket_id BIGINT REFERENCES public.tickets(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  business_line business_line NOT NULL DEFAULT 'car_wash',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES public.services(id),
  product_id UUID REFERENCES public.products(id),
  item_type ticket_item_type NOT NULL DEFAULT 'service',
  service_name_snapshot TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
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
  business_line business_line NOT NULL DEFAULT 'car_wash',
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

CREATE OR REPLACE FUNCTION public.decrement_product_stock(
  p_product_id BIGINT, p_qty INT, p_ticket_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_current INT; v_new INT;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  SELECT stock_quantity INTO v_current FROM public.products WHERE id = p_product_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF v_current < p_qty THEN RAISE EXCEPTION 'Stock insuficiente'; END IF;
  v_new := v_current - p_qty;
  UPDATE public.products SET stock_quantity = v_new, updated_at = now() WHERE id = p_product_id;
  INSERT INTO public.stock_movements (product_id, quantity_delta, reason, ticket_id, user_id)
    VALUES (p_product_id, -p_qty, 'sale', p_ticket_id, auth.uid());
  RETURN jsonb_build_object('product_id', p_product_id, 'previous_stock', v_current, 'new_stock', v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id BIGINT, p_delta INT,
  p_reason public.stock_movement_reason DEFAULT 'adjustment',
  p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_current INT; v_new INT;
BEGIN
  SELECT stock_quantity INTO v_current FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  v_new := v_current + p_delta;
  IF v_new < 0 THEN RAISE EXCEPTION 'El stock no puede quedar negativo'; END IF;
  UPDATE public.products SET stock_quantity = v_new, updated_at = now() WHERE id = p_product_id;
  INSERT INTO public.stock_movements (product_id, quantity_delta, reason, user_id, notes)
    VALUES (p_product_id, p_delta, p_reason, auth.uid(), p_notes);
  RETURN jsonb_build_object('product_id', p_product_id, 'new_stock', v_new);
END;
$$;

-- 4. FUNCIONES DE SEGURIDAD Y RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_expenses ENABLE ROW LEVEL SECURITY;

-- Nota: Las políticas RLS varían según el entorno de Supabase, 
-- se recomienda configurar los usuarios administrativamente.
`;
