-- Enable PostGIS for typical coord handling if needed
-- create extension if not exists postgis;

-- 1. Profiles Table (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  username text unique,
  first_name text,
  last_name text,
  avatar_url text,
  role text default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Parking Lots (Source of Truth)
create table if not exists public.parking_lots (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  campus text not null, -- 'Busch', 'College Ave', etc.
  latitude float not null,
  longitude float not null,
  capacity int default 0,
  current_occupancy int default 0, 
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Occupancy Logs (User reports or Sensor Data)
create table if not exists public.occupancy_logs (
  id uuid default gen_random_uuid() primary key,
  lot_id uuid references public.parking_lots(id) not null,
  reporter_id uuid references public.profiles(id), -- null if system/sensor
  occupancy_level int, 
  status text, -- 'open', 'full', 'crowded'
  confidence_score float default 1.0, 
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.parking_lots enable row level security;
alter table public.occupancy_logs enable row level security;

-- Policies
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

create policy "Parking lots are viewable by everyone." on public.parking_lots for select using (true);

create policy "Logs viewable by everyone" on public.occupancy_logs for select using (true);
create policy "Authenticated users can insert logs" on public.occupancy_logs for insert with check (auth.role() = 'authenticated');
