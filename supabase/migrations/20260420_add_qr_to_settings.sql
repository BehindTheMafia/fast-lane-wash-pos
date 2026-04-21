-- Agregar campos de QR para los tickets
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS qr_image_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS qr_text text DEFAULT 'Tu opinión es importante para nosotros';
