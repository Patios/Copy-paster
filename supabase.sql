-- Run this once in Supabase Dashboard > SQL Editor > New query.
create table if not exists public.commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  command text not null check (char_length(command) between 1 and 10000),
  note text not null default '' check (char_length(note) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commands enable row level security;

create policy "Users can read their own commands"
  on public.commands for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can add their own commands"
  on public.commands for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can edit their own commands"
  on public.commands for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own commands"
  on public.commands for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger commands_set_updated_at
  before update on public.commands
  for each row execute function public.set_updated_at();
