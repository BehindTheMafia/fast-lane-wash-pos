-- ──────────────────────────────────────────────────────────────────────────
-- MIGRATION: system_config — subscription / access-control
-- Run this script in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.system_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to auto-update `updated_at`
CREATE OR REPLACE FUNCTION public.set_system_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_config_updated_at ON public.system_config;
CREATE TRIGGER trg_system_config_updated_at
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW EXECUTE FUNCTION public.set_system_config_updated_at();

-- 2. Seed default values (no expiry, not locked)
INSERT INTO public.system_config (key, value) VALUES
  ('subscription_expiry_date', 'null'),
  ('subscription_locked',      'false')
ON CONFLICT (key) DO NOTHING;

-- 3. Row-Level Security
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Clean re-run safety
DROP POLICY IF EXISTS "system_config_select" ON public.system_config;
DROP POLICY IF EXISTS "system_config_upsert" ON public.system_config;

-- Any authenticated user can READ (SubscriptionGuard needs this)
CREATE POLICY "system_config_select"
  ON public.system_config
  FOR SELECT
  TO authenticated
  USING (true);

-- Only the 'admin' role can INSERT / UPDATE / DELETE
CREATE POLICY "system_config_upsert"
  ON public.system_config
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
