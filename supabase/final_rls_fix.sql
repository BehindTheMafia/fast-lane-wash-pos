-- ============================================================================
-- FINAL RLS FIXES: Tickets & Payments
-- Allows both Admins and the original Cashier to edit tickets and payments.
-- ============================================================================

-- 1. TICKETS: Allow update for Admin or Original Cashier
DROP POLICY IF EXISTS "Admin update tickets" ON public.tickets;
CREATE POLICY "Admin and cashier update tickets" ON public.tickets 
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    cashier_id = auth.uid()
  );

-- 2. PAYMENTS: Allow update for Admin or Cashier who owns the ticket
DROP POLICY IF EXISTS "Admin update payments" ON public.payments;
CREATE POLICY "Admin and cashier update payments" ON public.payments 
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    EXISTS (
      SELECT 1 FROM public.tickets t 
      WHERE t.id = payments.ticket_id AND t.cashier_id = auth.uid()
    )
  );

-- 3. TICKETS: Also allow delete for Admin or Original Cashier (Optional but recommended)
DROP POLICY IF EXISTS "Admin delete tickets" ON public.tickets;
CREATE POLICY "Admin and cashier delete tickets" ON public.tickets 
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    cashier_id = auth.uid()
  );

-- 4. PAYMENTS: Ensure SELECT is open to all authenticated (already should be, but just in case)
DROP POLICY IF EXISTS "Authenticated read payments" ON public.payments;
CREATE POLICY "Authenticated read payments" ON public.payments 
  FOR SELECT TO authenticated USING (true);
