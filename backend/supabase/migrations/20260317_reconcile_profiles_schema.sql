-- Reconcile optional profile columns in environments where public.profiles
-- drifted from the expected application schema.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS latitude float,
  ADD COLUMN IF NOT EXISTS longitude float,
  ADD COLUMN IF NOT EXISTS permit_type text;

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN full_name text
      GENERATED ALWAYS AS (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) STORED;
  END IF;
END $$;