-- Add permit_type column to profiles
-- Stores one of:
--   - A real permit name, e.g. "Busch Commuter" (matches keys in permit_mapping.json)
--   - "__commuter_all"           → show union of all commuter lots
--   - "__custom:student,ev"      → show lots matching the listed attribute flags
--   - NULL                       → no preference set, show all lots

alter table public.profiles
  add column if not exists permit_type text;
