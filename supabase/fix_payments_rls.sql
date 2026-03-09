-- ============================================================================
-- FIX: Allow cajero users to update payments for tickets they own
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add policy for cajeros to update payments on their own tickets
CREATE POLICY "Cajero update own payments" ON public.payments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t 
      WHERE t.id = ticket_id 
      AND t.user_id = auth.uid()
    )
  );

-- Also allow cajeros to update ticket_items on their own tickets
CREATE POLICY "Cajero update own ticket_items" ON public.ticket_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t 
      WHERE t.id = ticket_id 
      AND t.user_id = auth.uid()
    )
  );
