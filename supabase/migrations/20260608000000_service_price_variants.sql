-- Add price variant support for extras (up to 3 variants per service × vehicle type)

ALTER TABLE public.service_prices
  ADD COLUMN IF NOT EXISTS variant_label TEXT NOT NULL DEFAULT 'Estándar',
  ADD COLUMN IF NOT EXISTS variant_sort SMALLINT NOT NULL DEFAULT 0;

UPDATE public.service_prices
SET variant_label = 'Estándar', variant_sort = 0
WHERE variant_label IS NULL OR variant_sort IS NULL;

ALTER TABLE public.service_prices
  DROP CONSTRAINT IF EXISTS service_prices_service_id_vehicle_type_id_key;

ALTER TABLE public.service_prices
  ADD CONSTRAINT service_prices_service_vehicle_variant_unique
  UNIQUE (service_id, vehicle_type_id, variant_sort);

ALTER TABLE public.service_prices
  ADD CONSTRAINT service_prices_variant_sort_check
  CHECK (variant_sort >= 0 AND variant_sort <= 2);
