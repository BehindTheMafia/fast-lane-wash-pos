
-- Add double_print_ticket column to business_settings
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS double_print_ticket BOOLEAN DEFAULT false;

-- Update types if possible (this is usually done by supabase cli, but we'll document it)
COMMENT ON COLUMN public.business_settings.double_print_ticket IS 'Whether to print the ticket twice (business and customer copies)';
