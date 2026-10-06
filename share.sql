-- Run this once in Supabase Dashboard > SQL Editor, after supabase.sql.
-- Adds a private token so one command can be opened from a link.
alter table public.commands add column if not exists share_token uuid unique;

create or replace function public.get_shared_command(token uuid)
returns table (name text, command text, note text)
language sql
security definer
set search_path = ''
stable
as $$
  select c.name, c.command, c.note
  from public.commands c
  where c.share_token = $1
  limit 1;
$$;

revoke all on function public.get_shared_command(uuid) from public;
grant execute on function public.get_shared_command(uuid) to anon, authenticated;
