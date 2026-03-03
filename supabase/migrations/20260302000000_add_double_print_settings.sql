
-- Add double_print_ticket column to business_settings (default TRUE = always on)
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS double_print_ticket BOOLEAN DEFAULT true;

-- Enable double print for all existing rows
UPDATE public.business_settings SET double_print_ticket = true WHERE double_print_ticket IS NULL OR double_print_ticket = false;

-- Update types if possible (this is usually done by supabase cli, but we'll document it)
COMMENT ON COLUMN public.business_settings.double_print_ticket IS 'Whether to print the ticket twice (business and customer copies)';
