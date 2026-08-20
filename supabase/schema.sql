-- Recurrly schema. Run this in the Supabase SQL editor (or `supabase db push`)
-- against a fresh project. It is written to be re-runnable.

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,

  name           text not null check (length(trim(name)) > 0),
  plan           text,
  category       text,
  payment_method text,
  status         text not null default 'active'
                   check (status in ('active', 'paused', 'cancelled')),

  price          numeric(12, 2) not null check (price > 0),
  currency       text not null default 'USD',

  -- `billing` is the cadence shown on the card ("Monthly" / "Yearly").
  billing        text not null default 'Monthly',
  frequency      text,

  start_date     timestamptz,
  renewal_date   timestamptz,

  -- Key into `constants/icons.ts`; the app maps it back to a bundled asset and
  -- falls back to the generic "plus" glyph when the key is unknown.
  icon_key       text not null default 'plus',
  color          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);

-- Renewal ordering is the app's most common read pattern.
create index if not exists subscriptions_user_renewal_idx
  on public.subscriptions (user_id, renewal_date);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — every row is private to the user that owns it.
-- ---------------------------------------------------------------------------
alter table public.subscriptions enable row level security;

drop policy if exists "Users read own subscriptions"   on public.subscriptions;
drop policy if exists "Users insert own subscriptions" on public.subscriptions;
drop policy if exists "Users update own subscriptions" on public.subscriptions;
drop policy if exists "Users delete own subscriptions" on public.subscriptions;

create policy "Users read own subscriptions"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own subscriptions"
  on public.subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own subscriptions"
  on public.subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own subscriptions"
  on public.subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);
