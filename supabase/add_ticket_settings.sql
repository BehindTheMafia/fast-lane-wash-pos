-- Add new fields to business_settings table for ticket customization
ALTER TABLE business_settings 
ADD COLUMN IF NOT EXISTS social_media VARCHAR(255),
ADD COLUMN IF NOT EXISTS ruc VARCHAR(100),
ADD COLUMN IF NOT EXISTS printer_width_mm INTEGER DEFAULT 80;

-- Update existing record with default values
UPDATE business_settings 
SET 
  social_media = COALESCE(social_media, '@elrapidonica'),
  ruc = COALESCE(ruc, ''),
  printer_width_mm = COALESCE(printer_width_mm, 80)
WHERE id = 1;

-- Add comment to document the fields
COMMENT ON COLUMN business_settings.social_media IS 'Social media handle to display on receipts';
COMMENT ON COLUMN business_settings.ruc IS 'Tax identification number (RUC/NIT)';
COMMENT ON COLUMN business_settings.printer_width_mm IS 'Thermal printer width in millimeters (58mm, 80mm, etc.)';
