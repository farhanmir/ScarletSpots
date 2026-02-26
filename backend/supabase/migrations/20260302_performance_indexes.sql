  -- Migration: Performance indexes for production scale
  -- Depends on: all prior migrations
  -- Uses CONCURRENTLY to avoid table locks (requires NOT being in a transaction block)

  CREATE INDEX IF NOT EXISTS idx_occupancy_logs_reporter_status
    ON public.occupancy_logs(reporter_id, status, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_occupancy_logs_lot_created
    ON public.occupancy_logs(lot_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_friendships_user_status
    ON public.friendships(user_id, status);

  CREATE INDEX IF NOT EXISTS idx_friendships_friend_status
    ON public.friendships(friend_id, status);

  CREATE INDEX IF NOT EXISTS idx_profiles_email
    ON public.profiles(email);
