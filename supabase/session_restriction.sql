-- ============================================================
-- Session restriction: one device per user
-- ============================================================

CREATE TABLE IF NOT EXISTS public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)  -- One session per user
);

-- Enable RLS
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own sessions
CREATE POLICY "Users manage own sessions" ON public.active_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Allow service role full access for cleanup
CREATE POLICY "Service role full access" ON public.active_sessions
  FOR ALL USING (true) WITH CHECK (true);
