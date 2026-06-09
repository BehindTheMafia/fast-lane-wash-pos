-- Mixed payments: allow payment_method 'mixed', breakdown table, RLS

-- A) Allow 'mixed' in payments.payment_method CHECK
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'transfer', 'mixed'));

-- B) ticket_mixed_payments table
CREATE TABLE IF NOT EXISTS public.ticket_mixed_payments (
  id            BIGSERIAL PRIMARY KEY,
  ticket_id     BIGINT       NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  method        TEXT         NOT NULL,
  currency      TEXT         NOT NULL DEFAULT 'NIO',
  amount        NUMERIC(15,2) NOT NULL,
  exchange_rate NUMERIC(8,2)  NOT NULL DEFAULT 1,
  amount_nio    NUMERIC(15,2) NOT NULL,
  applied_nio   NUMERIC(15,2) NOT NULL DEFAULT 0,
  change_nio    NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tpm_ticket_id
  ON public.ticket_mixed_payments(ticket_id);

-- Widen columns if table already existed with smaller precision
ALTER TABLE public.payments ALTER COLUMN amount TYPE NUMERIC(15,2);
ALTER TABLE public.payments ALTER COLUMN amount_received TYPE NUMERIC(15,2);
ALTER TABLE public.payments ALTER COLUMN change_amount TYPE NUMERIC(15,2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_mixed_payments'
  ) THEN
    ALTER TABLE public.ticket_mixed_payments ALTER COLUMN amount TYPE NUMERIC(15,2);
    ALTER TABLE public.ticket_mixed_payments ALTER COLUMN amount_nio TYPE NUMERIC(15,2);
    ALTER TABLE public.ticket_mixed_payments ALTER COLUMN applied_nio TYPE NUMERIC(15,2);
    ALTER TABLE public.ticket_mixed_payments ALTER COLUMN change_nio TYPE NUMERIC(15,2);
  END IF;
END $$;

-- C) RLS for payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated create payments" ON public.payments;
DROP POLICY IF EXISTS "Admin update payments" ON public.payments;
DROP POLICY IF EXISTS "Admin delete payments" ON public.payments;
DROP POLICY IF EXISTS "Allow authenticated read all payments" ON public.payments;
DROP POLICY IF EXISTS "Allow authenticated create payments" ON public.payments;

CREATE POLICY "Authenticated read payments"
  ON public.payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated create payments"
  ON public.payments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin update payments"
  ON public.payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin delete payments"
  ON public.payments FOR DELETE TO authenticated USING (true);

-- C) RLS for ticket_mixed_payments
ALTER TABLE public.ticket_mixed_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_mixed_payments_all" ON public.ticket_mixed_payments;

CREATE POLICY "ticket_mixed_payments_all"
  ON public.ticket_mixed_payments
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
