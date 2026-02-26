-- Migration: parking_sessions table
-- Depends on: 20260215_init_schema.sql (profiles, parking_lots)
-- Rollback: DROP TABLE IF EXISTS public.parking_sessions;

CREATE TABLE IF NOT EXISTS public.parking_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  lot_id uuid REFERENCES public.parking_lots(id) NOT NULL,
  spot_number text,
  latitude float,
  longitude float,
  active boolean DEFAULT true,
  start_time timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  end_time timestamptz,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

-- RLS: users can only see/write their own sessions
ALTER TABLE public.parking_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions."
  ON public.parking_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions."
  ON public.parking_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions."
  ON public.parking_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Safely rename is_active to active if the table was created under the old format
DO $$ 
BEGIN 
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parking_sessions' AND column_name = 'is_active') THEN
    ALTER TABLE public.parking_sessions RENAME COLUMN is_active TO active;
  END IF; 
END $$;

-- Performance index for active session lookups
CREATE INDEX IF NOT EXISTS idx_parking_sessions_user_active
  ON public.parking_sessions(user_id, active) WHERE active = true;
