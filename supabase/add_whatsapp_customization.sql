-- ============================================================================
-- ADD: WhatsApp message customization fields to business_settings
-- Date: 2026-04-28
-- Run this in the Supabase SQL Editor
-- ============================================================================

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS whatsapp_feedback_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_feedback_text TEXT NOT NULL DEFAULT 'Tu opinión es importante para nosotros',
  ADD COLUMN IF NOT EXISTS whatsapp_feedback_link TEXT NOT NULL DEFAULT 'https://forms.gle/ZLqzSWJPxrK1Wsum7',
  ADD COLUMN IF NOT EXISTS whatsapp_greeting TEXT NOT NULL DEFAULT '¡Gracias por su visita!',
  ADD COLUMN IF NOT EXISTS whatsapp_link_label TEXT NOT NULL DEFAULT 'Dejanos tu recomendación aquí:';

-- ============================================================================
-- DONE!
-- ============================================================================
