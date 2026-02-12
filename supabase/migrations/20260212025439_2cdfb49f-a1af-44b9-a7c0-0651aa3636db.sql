
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
