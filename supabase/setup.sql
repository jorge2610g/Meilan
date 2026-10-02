-- Meilan: cuentas y suscripciones
-- Ejecutar en un proyecto Supabase dedicado a Meilan.

create table if not exists public.meilan_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('monthly', 'annual')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'canceled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meilan_subscriptions enable row level security;

grant select, insert, update on table public.meilan_subscriptions to authenticated;
revoke delete on table public.meilan_subscriptions from authenticated;

drop policy if exists "meilan subscriptions read own" on public.meilan_subscriptions;
create policy "meilan subscriptions read own"
on public.meilan_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "meilan subscriptions request own" on public.meilan_subscriptions;
create policy "meilan subscriptions request own"
on public.meilan_subscriptions
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'pending'
);

drop policy if exists "meilan subscriptions edit pending own" on public.meilan_subscriptions;
create policy "meilan subscriptions edit pending own"
on public.meilan_subscriptions
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and status = 'pending'
)
with check (
  (select auth.uid()) = user_id
  and status = 'pending'
);
