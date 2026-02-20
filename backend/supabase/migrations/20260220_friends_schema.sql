-- 4. Friendships Table
create table if not exists public.friendships (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  friend_id uuid references public.profiles(id) not null,
  status text check (status in ('pending', 'accepted', 'blocked')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, friend_id)
);

alter table public.friendships enable row level security;

-- Policies for Friendships
create policy "Users can view their own friendships." 
  on public.friendships for select 
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can insert their own friend requests." 
  on public.friendships for insert 
  with check (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can update their friendships." 
  on public.friendships for update 
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can delete their friendships." 
  on public.friendships for delete 
  using (auth.uid() = user_id or auth.uid() = friend_id);
