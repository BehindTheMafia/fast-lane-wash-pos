-- Migration: module_overrides per user
-- Allows admins to grant/revoke specific module access per user,
-- overriding the default role-based access rules.
-- Format: { "pos": true, "reports": false, ... }
-- Keys that are absent fall back to the default role-based access.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS module_overrides JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN profiles.module_overrides IS
  'Per-user module access overrides. Keys are module keys (pos, dashboard, reports, cashclose, customers, inventory, services, settings). true=force grant, false=force deny, absent=use role default.';
