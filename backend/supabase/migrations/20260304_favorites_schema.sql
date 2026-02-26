-- Migration: Add user_favorites table
-- Depends on: 20260215_init_schema.sql

CREATE TABLE IF NOT EXISTS public.user_favorites (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  lot_id uuid REFERENCES public.parking_lots(id) ON DELETE CASCADE NOT NULL,
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
