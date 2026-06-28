-- Migration: add allowed_modules to profiles
-- NULL = use role defaults. Array of module keys overrides defaults per-user.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allowed_modules text[] DEFAULT NULL;

COMMENT ON COLUMN profiles.allowed_modules IS
  'When set, overrides role-based module access. NULL = use role defaults. Example: {pos,cashclose,customers}';
