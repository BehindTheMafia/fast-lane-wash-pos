-- ============================================================================
-- FIX CASH CLOSURES RLS: Multi-user Visibility
-- Allows all authenticated users to see the complete history of closures.
-- ============================================================================

-- 1. Drop the restrictive policy
DROP POLICY IF EXISTS "Cajero read own closures" ON public.cash_closures;

-- 2. Create a new policy that allows all authenticated users to read all closures
CREATE POLICY "Authenticated read all closures" ON public.cash_closures 
  FOR SELECT TO authenticated 
  USING (true);

-- 3. (Optional) Ensure Admins still have full access 
-- (The existing "Admin full cash_closures" policy should already handle this, but it doesn't hurt)
DROP POLICY IF EXISTS "Admin full cash_closures" ON public.cash_closures;
CREATE POLICY "Admin full cash_closures" ON public.cash_closures 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Keep the insert policy restricted to the owner (already exists, but for clarity)
DROP POLICY IF EXISTS "Cajero create closures" ON public.cash_closures;
CREATE POLICY "Cajero create closures" ON public.cash_closures 
  FOR INSERT TO authenticated 
  WITH CHECK (cashier_id = auth.uid());
