-- Migration: Pivot to static lot data
-- Removes parking_lots and occupancy_logs tables (lot metadata is now bundled
-- in the mobile app via rutgers_parking_data.json). Introduces lot_occupancy
-- for tracking live crowd-sourced session counts, and updates parking_sessions
-- to use TEXT lot_id instead of UUID FK.
--
-- Rollback: See comments at the bottom of this file.

-- ── 1. Drop tables no longer needed ───────────────────────────────────────

-- Drop occupancy_logs (replaced by lot_occupancy count table)
DROP TABLE IF EXISTS public.occupancy_logs CASCADE;

-- Drop event_logs and friend_sharing_settings (simplified away)
DROP TABLE IF EXISTS public.event_logs CASCADE;
DROP TABLE IF EXISTS public.friend_sharing_settings CASCADE;

-- ── 2. Migrate parking_sessions.lot_id from UUID FK → TEXT ───────────────

-- Drop the FK constraint on parking_sessions first
ALTER TABLE public.parking_sessions
  DROP CONSTRAINT IF EXISTS parking_sessions_lot_id_fkey;

-- Change the column type to TEXT (lot_id is now a JSON mapId like "10001")
ALTER TABLE public.parking_sessions
  ALTER COLUMN lot_id TYPE TEXT USING lot_id::text;

-- ── 3. Drop parking_lots (metadata is in the bundled JSON) ────────────────

DROP TABLE IF EXISTS public.parking_lots CASCADE;

-- Drop PostGIS extension if installed (no longer needed for spatial queries)
DROP EXTENSION IF EXISTS postgis CASCADE;

-- ── 4. Create lot_occupancy table ─────────────────────────────────────────
-- Simple count of active sessions per lot. Keyed on lot_id TEXT (JSON mapId).
-- Maintained atomically by increment/decrement RPCs called on session start/end.

CREATE TABLE IF NOT EXISTS public.lot_occupancy (
  lot_id      TEXT        NOT NULL PRIMARY KEY,
  count       INTEGER     NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Realtime on lot_occupancy so mobile clients get live push updates
ALTER TABLE public.lot_occupancy REPLICA IDENTITY FULL;

ALTER TABLE public.lot_occupancy ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated) can read occupancy counts
CREATE POLICY "Public read lot_occupancy"
  ON public.lot_occupancy FOR SELECT
  USING (true);

-- Only backend service role (bypasses RLS) can write occupancy counts

-- ── 5. Update atomic occupancy RPCs ───────────────────────────────────────
-- These now operate on lot_occupancy (TEXT key) instead of parking_lots (UUID).

CREATE OR REPLACE FUNCTION public.increment_lot_occupancy(p_lot_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO public.lot_occupancy (lot_id, count, updated_at)
    VALUES (p_lot_id, 1, now())
  ON CONFLICT (lot_id)
  DO UPDATE SET
    count      = public.lot_occupancy.count + 1,
    updated_at = now()
  RETURNING count INTO new_count;
  RETURN COALESCE(new_count, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_lot_occupancy(p_lot_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE public.lot_occupancy
    SET count      = GREATEST(0, count - 1),
        updated_at = now()
  WHERE lot_id = p_lot_id
  RETURNING count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$;

-- ── 6. Performance indexes ─────────────────────────────────────────────────

-- Active session lookup (used by park.py get_active_session)
CREATE INDEX IF NOT EXISTS idx_parking_sessions_user_active
  ON public.parking_sessions(user_id, active)
  WHERE active = true;

-- Session lookup by lot (used by friends.py to find parked friends)
CREATE INDEX IF NOT EXISTS idx_parking_sessions_lot_active
  ON public.parking_sessions(lot_id, active)
  WHERE active = true;

-- ── Rollback notes ──────────────────────────────────────────────────────────
-- To rollback this migration:
--   1. DROP TABLE IF EXISTS public.lot_occupancy;
--   2. DROP FUNCTION IF EXISTS public.increment_lot_occupancy(TEXT);
--   3. DROP FUNCTION IF EXISTS public.decrement_lot_occupancy(TEXT);
--   4. Restore parking_lots and occupancy_logs from backup.
--   5. ALTER TABLE public.parking_sessions ALTER COLUMN lot_id TYPE UUID USING lot_id::uuid;
--   6. ALTER TABLE public.parking_sessions ADD CONSTRAINT parking_sessions_lot_id_fkey
--        FOREIGN KEY (lot_id) REFERENCES public.parking_lots(id);
