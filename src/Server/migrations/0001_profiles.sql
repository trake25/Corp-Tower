-- Corp Tower / Top or Drop -- durable player profiles.
--
-- There is no migration runner in this repo. Apply this by hand in the Supabase
-- SQL editor; it lives here so the schema is reviewable and reproducible rather
-- than existing only in a dashboard.
--
-- Safe to re-run: every statement is idempotent.
--
-- The game server reaches this table with the service_role key, which bypasses
-- RLS entirely. The policies below therefore protect nothing the server does --
-- they exist so that if anything ever talks to Supabase directly from a client,
-- one player cannot read or edit another player's row.

create table if not exists public.profiles (
    id            uuid primary key references auth.users (id) on delete cascade,
    display_name  text,
    status        text not null default 'active',
    last_login_at timestamptz,
    created_at    timestamptz not null default now()
);

-- Guests are auth.users rows too (is_anonymous), so this table holds them as
-- well; nothing here distinguishes them.
comment on table public.profiles is
    'Durable per-player profile. One row per auth.users id, guests included.';
comment on column public.profiles.status is
    'active | banned. Carried on the wire but NOT yet enforced by the server.';

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
    on public.profiles
    for select
    using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
    on public.profiles
    for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- Deliberately no insert policy for end users: rows are created server-side on
-- first sight of a verified identity.
