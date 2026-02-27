-- Migration: atomic occupancy increment/decrement RPCs
-- Replaces the read-modify-write pattern in park.py that is vulnerable to
-- lost updates under concurrent park/end requests.
-- Both functions run entirely inside a single statement, so Postgres applies
-- its own row-level locking — no external transaction needed.

-- ── Increment ──────────────────────────────────────────────────────────────────
-- Returns (current_occupancy, capacity) so the caller can compute occupancy%.
CREATE OR REPLACE FUNCTION increment_lot_occupancy(p_lot_id uuid)
RETURNS TABLE(current_occupancy integer, capacity integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE parking_lots
  SET current_occupancy = current_occupancy + 1
  WHERE id = p_lot_id
  RETURNING current_occupancy, capacity;
$$;

-- ── Decrement ─────────────────────────────────────────────────────────────────
-- Clamps at 0 so counts can never go negative.
-- Returns void — caller only needs to know it succeeded.
CREATE OR REPLACE FUNCTION decrement_lot_occupancy(p_lot_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE parking_lots
  SET current_occupancy = GREATEST(0, current_occupancy - 1)
  WHERE id = p_lot_id;
$$;

-- Grant execute to the service-role key used by the backend admin client.
GRANT EXECUTE ON FUNCTION increment_lot_occupancy(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION decrement_lot_occupancy(uuid) TO service_role;
