-- Migration: Ensure parking session coordinates are nullable
--
-- Why:
-- Some environments drifted to NOT NULL constraints on parking_sessions.latitude
-- and parking_sessions.longitude, but the API contract allows sessions to start
-- without GPS coordinates (manual lot selection).
--
-- Rollback:
-- ALTER TABLE public.parking_sessions ALTER COLUMN latitude SET NOT NULL;
-- ALTER TABLE public.parking_sessions ALTER COLUMN longitude SET NOT NULL;

ALTER TABLE public.parking_sessions
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL;
