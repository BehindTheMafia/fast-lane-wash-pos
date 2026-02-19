-- Add ON DELETE CASCADE to tickets table for customer_id
ALTER TABLE public.tickets
DROP CONSTRAINT IF EXISTS tickets_customer_id_fkey;

ALTER TABLE public.tickets
ADD CONSTRAINT tickets_customer_id_fkey
FOREIGN KEY (customer_id)
REFERENCES public.customers(id)
ON DELETE CASCADE;

-- Also check customer_memberships (already has it but to be sure)
ALTER TABLE public.customer_memberships
DROP CONSTRAINT IF EXISTS customer_memberships_customer_id_fkey;

ALTER TABLE public.customer_memberships
ADD CONSTRAINT customer_memberships_customer_id_fkey
FOREIGN KEY (customer_id)
REFERENCES public.customers(id)
ON DELETE CASCADE;
