-- Patch: fix type mismatch in atomic session RPCs
--
-- parking_sessions.user_id is UUID, but the functions were passing p_user_id
-- (TEXT) without casting, causing error 42804. Add ::uuid casts.

-- ── start_parking_session_atomic ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_parking_session_atomic(
  p_user_id    TEXT,
  p_lot_id     TEXT,
  p_spot_number TEXT,
  p_latitude   FLOAT,
  p_longitude  FLOAT
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
    (user_id, lot_id, spot_number, latitude, longitude, active, start_time)
  VALUES
    (p_user_id::uuid, p_lot_id, p_spot_number, p_latitude, p_longitude, true, now())
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

GRANT EXECUTE ON FUNCTION public.start_parking_session_atomic(TEXT, TEXT, TEXT, FLOAT, FLOAT) TO service_role;

-- ── end_parking_session_atomic ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.end_parking_session_atomic(p_user_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot        TEXT;
  v_ended      INTEGER := 0;
BEGIN
  FOR v_lot IN
    UPDATE public.parking_sessions
    SET    active   = false,
           end_time = now()
    WHERE  user_id = p_user_id::uuid
      AND  active  = true
    RETURNING lot_id
  LOOP
    UPDATE public.lot_occupancy
    SET    count      = GREATEST(0, count - 1),
           updated_at = now()
    WHERE  lot_id = v_lot;

    v_ended := v_ended + 1;
  END LOOP;

  RETURN v_ended;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_parking_session_atomic(TEXT) TO service_role;
