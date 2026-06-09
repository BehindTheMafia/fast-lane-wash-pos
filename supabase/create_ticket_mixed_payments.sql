-- ============================================================
-- Migration: ticket_mixed_payments
-- Purpose:   Auxiliary table to store the breakdown of mixed
--            payments.  Only used when payment_method = 'mixed'.
-- Date:      2026-05-20
-- ============================================================

CREATE TABLE IF NOT EXISTS ticket_mixed_payments (
  id            BIGSERIAL PRIMARY KEY,
  ticket_id     BIGINT       NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  method        TEXT         NOT NULL,              -- 'cash', 'card', 'transfer'
  currency      TEXT         NOT NULL DEFAULT 'NIO', -- 'NIO' | 'USD'
  amount        NUMERIC(12,2) NOT NULL,              -- monto en moneda original
  exchange_rate NUMERIC(8,2)  NOT NULL DEFAULT 1,    -- tasa vigente al momento
  amount_nio    NUMERIC(12,2) NOT NULL,              -- monto convertido a NIO (informativo)
  applied_nio   NUMERIC(12,2) NOT NULL DEFAULT 0,    -- monto REALMENTE aplicado al ticket (contable)
  change_nio    NUMERIC(12,2) NOT NULL DEFAULT 0,    -- vuelto entregado en NIO
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- RLS -------------------------------------------------------
ALTER TABLE ticket_mixed_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_mixed_payments_all"
  ON ticket_mixed_payments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookup by ticket --------------------------
CREATE INDEX IF NOT EXISTS idx_tpm_ticket_id
  ON ticket_mixed_payments(ticket_id);
