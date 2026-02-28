-- Enable Supabase Realtime on the friendships table.
-- REPLICA IDENTITY FULL is required so that UPDATE and DELETE events
-- include the full old row in the payload (needed by postgres_changes subscribers).
ALTER TABLE public.friendships REPLICA IDENTITY FULL;

-- Add friendships to the Supabase Realtime publication so that CDC events
-- are broadcast to subscribed clients (mirrors what lot_occupancy has).
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
