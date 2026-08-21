-- Agent usage limits. Run this after `schema.sql`.
--
-- The `agent` Edge Function loops up to six model turns per request and has no
-- natural ceiling, so one script pointed at it is a real bill. This table is
-- the cap.
--
-- Written to be re-runnable, same as the rest of the folder.

create table if not exists public.agent_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  turns    integer not null default 0,

  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Claim a turn.
--
-- security definer because the client must not be able to reset its own
-- counter — the whole point is that it is not writable from the app. The Edge
-- Function calls this before its first model call and bails on false.
-- ---------------------------------------------------------------------------
create or replace function public.claim_agent_turn(daily_limit integer default 50)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller  uuid := auth.uid();
  today   date := (now() at time zone 'utc')::date;
  used    integer;
begin
  if caller is null then
    raise exception 'Not authenticated.';
  end if;

  insert into public.agent_usage (user_id, day, turns)
  values (caller, today, 1)
  on conflict (user_id, day)
    do update set turns = public.agent_usage.turns + 1
  returning turns into used;

  return used <= daily_limit;
end;
$$;

revoke all on function public.claim_agent_turn(integer) from public;
grant execute on function public.claim_agent_turn(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — read-only to the owner. Writes go through claim_agent_turn only, so
-- there is deliberately no insert or update policy here.
-- ---------------------------------------------------------------------------
alter table public.agent_usage enable row level security;

drop policy if exists "Users read own agent usage" on public.agent_usage;

create policy "Users read own agent usage"
  on public.agent_usage for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Optional: keep the table from growing without bound. Supabase can run this
-- on a schedule via pg_cron, or you can ignore it — the table is tiny.
-- ---------------------------------------------------------------------------
-- delete from public.agent_usage
--   where day < (now() at time zone 'utc')::date - interval '90 days';
