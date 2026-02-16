-- Add service_id to customer_memberships
-- This allows tracking which specific service (Lavado Rápido Breve vs Nítido) was purchased

-- 1. Add service_id column to customer_memberships
ALTER TABLE public.customer_memberships
  ADD COLUMN service_id INT;

-- 2. Add foreign key constraint to services table
ALTER TABLE public.customer_memberships
  ADD CONSTRAINT fk_customer_memberships_service
  FOREIGN KEY (service_id) REFERENCES public.services(id);

-- 3. Create index for better query performance
CREATE INDEX idx_customer_memberships_service_id 
  ON public.customer_memberships(service_id);

-- 4. Update existing memberships to default service (Lavado Rápido Breve = 1)
UPDATE public.customer_memberships
SET service_id = 1
WHERE service_id IS NULL;
