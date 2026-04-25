-- ============================================================================
-- FIX: Membership Management RLS + Duplicate Prevention
-- Date: 2026-04-25
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- ─── 1. Helper function: Check admin or owner via profiles table ──────────
-- profiles.user_id references auth.users(id)
CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role::text IN ('admin', 'owner')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  );
$$;

-- ─── 2. Fix customer_memberships RLS ────────────────────────────────────────
DROP POLICY IF EXISTS "Admin write memberships" ON public.customer_memberships;
DROP POLICY IF EXISTS "Admin/Owner update memberships" ON public.customer_memberships;
DROP POLICY IF EXISTS "Admin/Owner delete memberships" ON public.customer_memberships;
DROP POLICY IF EXISTS "Admin/Owner insert memberships" ON public.customer_memberships;

-- Allow admin/owner to update memberships
CREATE POLICY "Admin/Owner update memberships" ON public.customer_memberships
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

-- Allow admin/owner to delete memberships
CREATE POLICY "Admin/Owner delete memberships" ON public.customer_memberships
  FOR DELETE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

-- Allow all authenticated users to insert (POS needs to create memberships)
CREATE POLICY "Authenticated insert memberships" ON public.customer_memberships
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ─── 3. Fix membership_washes RLS ──────────────────────────────────────────
DROP POLICY IF EXISTS "Admin delete washes" ON public.membership_washes;
DROP POLICY IF EXISTS "Admin/Owner delete washes" ON public.membership_washes;
DROP POLICY IF EXISTS "Admin/Owner update washes" ON public.membership_washes;

CREATE POLICY "Admin/Owner delete washes" ON public.membership_washes
  FOR DELETE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admin/Owner update washes" ON public.membership_washes
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

-- ─── 4. Fix tickets RLS for owner ──────────────────────────────────────────
DROP POLICY IF EXISTS "Admin delete tickets" ON public.tickets;
DROP POLICY IF EXISTS "Admin/Owner delete tickets" ON public.tickets;

CREATE POLICY "Admin/Owner delete tickets" ON public.tickets
  FOR DELETE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

-- ─── 5. Fix payments RLS for owner ─────────────────────────────────────────
DROP POLICY IF EXISTS "Admin update payments" ON public.payments;
DROP POLICY IF EXISTS "Admin/Owner update payments" ON public.payments;
DROP POLICY IF EXISTS "Admin/Owner delete payments" ON public.payments;

CREATE POLICY "Admin/Owner update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admin/Owner delete payments" ON public.payments
  FOR DELETE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

-- ============================================================================
-- DONE! All RLS policies now recognize both 'admin' and 'owner' roles.
-- ============================================================================
