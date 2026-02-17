-- Fix CASCADE DELETE for tickets
-- This allows deleting tickets without foreign key constraint errors

-- Drop existing foreign key constraints
ALTER TABLE ticket_items DROP CONSTRAINT IF EXISTS ticket_items_ticket_id_fkey;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_ticket_id_fkey;
ALTER TABLE membership_washes DROP CONSTRAINT IF EXISTS membership_washes_ticket_id_fkey;
ALTER TABLE loyalty_visits DROP CONSTRAINT IF EXISTS loyalty_visits_ticket_id_fkey;

-- Re-add foreign key constraints with CASCADE DELETE
ALTER TABLE ticket_items 
  ADD CONSTRAINT ticket_items_ticket_id_fkey 
  FOREIGN KEY (ticket_id) 
  REFERENCES tickets(id) 
  ON DELETE CASCADE;

ALTER TABLE payments 
  ADD CONSTRAINT payments_ticket_id_fkey 
  FOREIGN KEY (ticket_id) 
  REFERENCES tickets(id) 
  ON DELETE CASCADE;

ALTER TABLE membership_washes 
  ADD CONSTRAINT membership_washes_ticket_id_fkey 
  FOREIGN KEY (ticket_id) 
  REFERENCES tickets(id) 
  ON DELETE CASCADE;

ALTER TABLE loyalty_visits 
  ADD CONSTRAINT loyalty_visits_ticket_id_fkey 
  FOREIGN KEY (ticket_id) 
  REFERENCES tickets(id) 
  ON DELETE SET NULL;

-- Add comment
COMMENT ON TABLE tickets IS 'Tickets table with CASCADE DELETE enabled for related records';
