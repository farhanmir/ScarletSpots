-- Migration: Add location columns to profiles table
-- This ensures the backend can store and retrieve user coordinates for friend tracking.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS latitude float;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS longitude float;

-- Add a comment for clarity
COMMENT ON COLUMN public.profiles.latitude IS 'Last reported latitude of the user.';
COMMENT ON COLUMN public.profiles.longitude IS 'Last reported longitude of the user.';
