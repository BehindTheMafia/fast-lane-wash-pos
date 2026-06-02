-- ============================================================
-- SQL Script: Fix RLS Policies for public.payments
-- Purpose:    Ensure all authenticated users can read and create
--             payment records. This fixes the issues where payments
--             returned empty lists on the frontend, showing '—'
--             instead of the correct payment methods.
-- Instructions:
--             1. Go to your Supabase Dashboard.
--             2. Open the 'SQL Editor' from the left sidebar.
--             3. Create a 'New Query'.
--             4. Paste this script and click 'Run'.
-- ============================================================
-- 1. Alter table numeric columns to support larger numbers and resolve precision issues
ALTER TABLE public.payments ALTER COLUMN amount TYPE NUMERIC(15,2);
ALTER TABLE public.payments ALTER COLUMN amount_received TYPE NUMERIC(15,2);
ALTER TABLE public.payments ALTER COLUMN change_amount TYPE NUMERIC(15,2);

ALTER TABLE public.tickets ALTER COLUMN total TYPE NUMERIC(15,2);

-- Alter mixed payments table columns if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_mixed_payments') THEN
    ALTER TABLE public.ticket_mixed_payments ALTER COLUMN amount TYPE NUMERIC(15,2);
    ALTER TABLE public.ticket_mixed_payments ALTER COLUMN amount_nio TYPE NUMERIC(15,2);
    ALTER TABLE public.ticket_mixed_payments ALTER COLUMN applied_nio TYPE NUMERIC(15,2);
    ALTER TABLE public.ticket_mixed_payments ALTER COLUMN change_nio TYPE NUMERIC(15,2);
  END IF;
END $$;

-- 2. Enable RLS on the payments table (in case it isn't enabled)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Authenticated read payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated create payments" ON public.payments;
DROP POLICY IF EXISTS "Admin update payments" ON public.payments;
DROP POLICY IF EXISTS "Admin delete payments" ON public.payments;
DROP POLICY IF EXISTS "Allow authenticated read all payments" ON public.payments;
DROP POLICY IF EXISTS "Allow authenticated create payments" ON public.payments;

-- 3. Create fresh, permissive policies for authenticated users (cajeros, owners, admins)
-- A) SELECT policy: Allow any logged-in user to read payments
CREATE POLICY "Authenticated read payments" 
  ON public.payments
  FOR SELECT 
  TO authenticated 
  USING (true);

-- B) INSERT policy: Allow any logged-in user to insert payments (required to register sales in POS)
CREATE POLICY "Authenticated create payments" 
  ON public.payments
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- C) UPDATE policy: Allow editing payments
CREATE POLICY "Admin update payments" 
  ON public.payments
  FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

-- D) DELETE policy: Allow deleting payments (important when a ticket is deleted)
CREATE POLICY "Admin delete payments" 
  ON public.payments
  FOR DELETE 
  TO authenticated 
  USING (true);

-- 4. Verify/Fix ticket_mixed_payments table just in case
ALTER TABLE public.ticket_mixed_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_mixed_payments_all" ON public.ticket_mixed_payments;
CREATE POLICY "ticket_mixed_payments_all"
  ON public.ticket_mixed_payments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Print success confirmation
SELECT 'RLS Policies for payments and mixed payments have been fixed successfully!' as status;
