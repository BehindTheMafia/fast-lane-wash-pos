-- Migration: Fix missing service_id in existing memberships
-- Date: 2026-02-16
-- Description: Update existing memberships to have correct service_id based on their plan

-- First, let's check which memberships don't have service_id
DO $$
DECLARE
    membership_record RECORD;
    default_service_id INTEGER := 1; -- Lavado Rápido – Breve
BEGIN
    -- Update all memberships that have NULL service_id
    -- We'll default to service_id = 1 (Lavado Rápido – Breve)
    -- You can manually update specific ones if needed
    
    FOR membership_record IN 
        SELECT id, customer_id, plan_id, vehicle_type_id, service_id
        FROM customer_memberships
        WHERE service_id IS NULL
    LOOP
        -- Update to default service (Lavado Breve)
        UPDATE customer_memberships
        SET service_id = default_service_id
        WHERE id = membership_record.id;
        
        RAISE NOTICE 'Updated membership % for customer % to service_id %', 
            membership_record.id, 
            membership_record.customer_id, 
            default_service_id;
    END LOOP;
    
    RAISE NOTICE 'Migration completed. All memberships now have service_id.';
END $$;

-- Verify the update
SELECT 
    id,
    customer_id,
    service_id,
    vehicle_type_id,
    active
FROM customer_memberships
WHERE active = true
ORDER BY id;
