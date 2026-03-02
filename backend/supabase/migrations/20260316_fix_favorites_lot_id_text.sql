-- Migration: Fix user_favorites lot_id column type
-- The original schema declared lot_id as UUID with a FK to parking_lots.
-- Lot IDs are now TEXT strings (e.g. "10177") matching the bundled JSON mapId.
-- This migration drops the old table and recreates it with the correct type.

DROP TABLE IF EXISTS public.user_favorites;

CREATE TABLE public.user_favorites (
  user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  lot_id     TEXT NOT NULL,
  created_at timestamptz DEFAULT timezone('utc', now()),
  PRIMARY KEY (user_id, lot_id)
);

-- Enable RLS
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own favorites."
  ON public.user_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorites."
  ON public.user_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites."
  ON public.user_favorites FOR DELETE
  USING (auth.uid() = user_id);
