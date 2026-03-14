-- Migration: Add auto_started to parking_sessions for detection-started sessions
-- Used by the app to show "We detected you parked here. Wrong? Tap End to remove."

ALTER TABLE public.parking_sessions
  ADD COLUMN IF NOT EXISTS auto_started boolean NOT NULL DEFAULT false;

-- Update atomic start RPC to accept and store auto_started
DROP FUNCTION IF EXISTS public.start_parking_session_atomic(TEXT, TEXT, FLOAT, FLOAT);

CREATE OR REPLACE FUNCTION public.start_parking_session_atomic(
  p_user_id     TEXT,
  p_lot_id      TEXT,
  p_latitude    FLOAT,
  p_longitude   FLOAT,
  p_auto_started boolean DEFAULT false
)
RETURNS SETOF public.parking_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.parking_sessions;
BEGIN
  INSERT INTO public.parking_sessions
    (user_id, lot_id, latitude, longitude, active, start_time, auto_started)
  VALUES
    (p_user_id::uuid, p_lot_id, p_latitude, p_longitude, true, now(), COALESCE(p_auto_started, false))
  RETURNING * INTO v_session;

  INSERT INTO public.lot_occupancy (lot_id, count, updated_at)
    VALUES (p_lot_id, 1, now())
  ON CONFLICT (lot_id)
  DO UPDATE SET
    count      = public.lot_occupancy.count + 1,
    updated_at = now();

  RETURN NEXT v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_parking_session_atomic(TEXT, TEXT, FLOAT, FLOAT, boolean) TO service_role;
