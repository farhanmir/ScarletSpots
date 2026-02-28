-- lot_occupancy was created with REPLICA IDENTITY FULL but was never added to
-- the Supabase Realtime publication, so postgres_changes events were never
-- broadcast to mobile clients. This migration fixes that.
ALTER PUBLICATION supabase_realtime ADD TABLE public.lot_occupancy;
