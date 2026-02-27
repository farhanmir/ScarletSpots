-- Migration: session_feedback table
-- Stores user corrections to the auto-detection pipeline.
-- Used for periodic ML forecast model retraining.

CREATE TABLE IF NOT EXISTS public.session_feedback (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES public.profiles(id) NOT NULL,
  session_id  UUID        REFERENCES public.parking_sessions(id),
  lot_id      TEXT        NOT NULL,
  quality     TEXT        NOT NULL CHECK (quality IN ('correct', 'wrong_lot', 'false_positive', 'missed')),
  correct_lot_id TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own feedback"
  ON public.session_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own feedback"
  ON public.session_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_session_feedback_lot
  ON public.session_feedback(lot_id);
