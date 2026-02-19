-- Drop the existing permissive policy
DROP POLICY IF EXISTS "Authenticated CRUD customers" ON public.customers;

-- Anyone can read customers
CREATE POLICY "Anyone can read customers" ON public.customers
  FOR SELECT TO authenticated USING (true);

-- Anyone can create customers
CREATE POLICY "Anyone can create customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (true);

-- Anyone can update customers
CREATE POLICY "Anyone can update customers" ON public.customers
  FOR UPDATE TO authenticated USING (true);

-- Only Admin, Owner, and Operator can delete customers
CREATE POLICY "Only Admin/Owner/Operator can delete customers" ON public.customers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (role = 'admin' OR role = 'owner' OR role = 'operator')
    )
  );
