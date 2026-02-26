-- Migration: Missing columns and tables referenced in application code
-- Depends on: 20260215_init_schema.sql, 20260220_friends_schema.sql, 20260301_parking_sessions_schema.sql
-- Rollback notes at the bottom

-- 1. parking_lots: add coordinates and is_custom columns
ALTER TABLE public.parking_lots ADD COLUMN IF NOT EXISTS coordinates jsonb;
ALTER TABLE public.parking_lots ADD COLUMN IF NOT EXISTS is_custom boolean DEFAULT false;

-- 2. profiles: add full_name generated column for friend display
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text
  GENERATED ALWAYS AS (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) STORED;

-- 3. friendships: add sharing_enabled column
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS sharing_enabled boolean DEFAULT true;

-- 4. event_logs table for audit trail
CREATE TABLE IF NOT EXISTS public.event_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id),
  target_id uuid,
  action text,
  entity_type text,
  created_at timestamptz DEFAULT timezone('utc', now())
);

ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own events."
  ON public.event_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert events."
  ON public.event_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 5. friend_sharing_settings table for per-friend sharing control
CREATE TABLE IF NOT EXISTS public.friend_sharing_settings (
  user_id uuid REFERENCES public.profiles(id),
  friend_id uuid REFERENCES public.profiles(id),
  sharing_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT timezone('utc', now()),
  PRIMARY KEY (user_id, friend_id)
);

ALTER TABLE public.friend_sharing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sharing settings."
  ON public.friend_sharing_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own sharing settings."
  ON public.friend_sharing_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sharing settings."
  ON public.friend_sharing_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Rollback:
-- ALTER TABLE public.parking_lots DROP COLUMN IF EXISTS coordinates;
-- ALTER TABLE public.parking_lots DROP COLUMN IF EXISTS is_custom;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS full_name;
-- ALTER TABLE public.friendships DROP COLUMN IF EXISTS sharing_enabled;
-- DROP TABLE IF EXISTS public.event_logs;
-- DROP TABLE IF EXISTS public.friend_sharing_settings;
