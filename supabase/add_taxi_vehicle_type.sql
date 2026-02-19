-- Add Taxi vehicle type
INSERT INTO public.vehicle_types (id, name)
VALUES (6, 'Taxi')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Initialize service prices for Taxi
-- Service IDs: 1 (Lavado Rápido – Breve), 2 (Lavado Rápido – Nítido)
-- Taxi vehicle_type_id: 6

-- Lavado Rápido – Breve (75)
INSERT INTO public.service_prices (service_id, vehicle_type_id, price)
VALUES (1, 6, 75)
ON CONFLICT (service_id, vehicle_type_id) DO UPDATE SET price = 75;

-- Lavado Rápido – Nítido (155)
INSERT INTO public.service_prices (service_id, vehicle_type_id, price)
VALUES (2, 6, 155)
ON CONFLICT (service_id, vehicle_type_id) DO UPDATE SET price = 155;

-- Add C$0 price for other potential active services if they exist
INSERT INTO public.service_prices (service_id, vehicle_type_id, price)
SELECT id, 6, 0 
FROM public.services 
WHERE id NOT IN (1, 2)
ON CONFLICT (service_id, vehicle_type_id) DO NOTHING;
