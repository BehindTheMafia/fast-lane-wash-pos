-- Add 'owner' role to the system
-- Run this in Supabase SQL Editor

-- 1. Check current allowed roles in the profiles table
-- The role column likely uses a CHECK constraint or enum

-- 2. If using a CHECK constraint, update it to include 'owner'
ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'cajero', 'owner', 'operator', 'manager'));

-- 3. If using user_roles table, add owner as valid role
ALTER TABLE public.user_roles 
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles 
  ADD CONSTRAINT user_roles_role_check 
  CHECK (role IN ('admin', 'cajero', 'owner', 'operator', 'manager'));

-- 4. Add RLS policy for owner role to read reports and dashboard data
-- Owner can read all tickets (same as admin)
CREATE POLICY IF NOT EXISTS "Owner read tickets" ON public.tickets 
  FOR SELECT TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- Owner can read all payments
CREATE POLICY IF NOT EXISTS "Owner read payments" ON public.payments 
  FOR SELECT TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- Owner can read all cash closures
CREATE POLICY IF NOT EXISTS "Owner read cash_closures" ON public.cash_closures 
  FOR SELECT TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- Verification: Check that the constraint was updated
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.profiles'::regclass 
  AND conname = 'profiles_role_check';
