-- Migration: add show_expected_cash_to_cashier to business_settings
-- Controls whether cashier-role users can see expected cash amounts during cash close.
-- Admins and owners always see all amounts regardless of this setting.

ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS show_expected_cash_to_cashier BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN business_settings.show_expected_cash_to_cashier IS
  'When FALSE, cajero-role users cannot see expected cash amounts during cash close. Admins/owners always see everything.';
