-- Migration: Atomic parking-session RPCs and one-active-session constraint
--
-- Problems fixed:
--   1. start/end session were not atomic — occupancy and session mutations
--      could partially fail, causing counts to drift.
--   2. No database-level guard prevented a user from having more than one
--      active session simultaneously.
--
-- Solution:
--   • Add a PARTIAL UNIQUE INDEX on parking_sessions(user_id) WHERE active = true
--     so the DB enforces at most one active session per user.
--   • Replace the two-step Python (session write + occupancy RPC) with
--     single-function RPCs that wrap both in one transaction.

-- ── 1. Partial unique index: at most one active session per user ────────────

CREATE UNIQUE INDEX IF NOT EXISTS uix_parking_sessions_one_active_per_user
  ON public.parking_sessions (user_id)
  WHERE active = true;

-- ── 2. Atomic start-session RPC ────────────────────────────────────────────
-- Inserts a new parking session AND upserts lot_occupancy in one transaction.
-- Raises an exception (rolled back) if either step fails.
-- Returns the newly created session row.

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
  -- Insert the session; the partial unique index will reject if user already
  -- has an active session, surfacing a unique-violation to the caller.
  INSERT INTO public.parking_sessions
    (user_id, lot_id, spot_number, latitude, longitude, active, start_time)
  VALUES
    (p_user_id, p_lot_id, p_spot_number, p_latitude, p_longitude, true, now())
  RETURNING * INTO v_session;

  -- Atomically increment lot occupancy in the same transaction.
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

-- ── 3. Atomic end-session RPC ──────────────────────────────────────────────
-- Marks all active sessions for the user as ended AND decrements occupancy for
-- each affected lot — all in one transaction.
-- Handles the inconsistent-data case: if multiple active sessions exist (data
-- predating the unique index), all are closed and their lots are decremented.
-- Returns the number of sessions that were ended.

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
  -- Collect affected lot IDs and close sessions; iterate in case legacy data
  -- left multiple active sessions for the same user.
  FOR v_lot IN
    UPDATE public.parking_sessions
    SET    active   = false,
           end_time = now()
    WHERE  user_id = p_user_id
      AND  active  = true
    RETURNING lot_id
  LOOP
    -- Decrement occupancy, clamped at 0.
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
