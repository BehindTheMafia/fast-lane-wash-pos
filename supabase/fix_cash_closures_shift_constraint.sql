-- Fix: Remove or relax the check constraint on cash_closures.shift
-- The constraint was added manually in production but not reflected in migrations.
-- The original migration had: shift TEXT DEFAULT ''  (no check constraint)
-- This script removes the constraint so any TEXT value is accepted.

ALTER TABLE public.cash_closures
  DROP CONSTRAINT IF EXISTS cash_closures_shift_check;

-- Optionally: ensure existing rows with restricted values are not an issue
-- (no data change needed since we're only dropping a constraint)
