create table if not exists public.player_accounts (
    id                uuid primary key default gen_random_uuid(),
    supabase_user_id  uuid unique references auth.users (id) on delete set null,
    created_at        timestamptz not null default now()
);

create table if not exists public.player_identities (
    provider           text not null,
    key_version        integer not null check (key_version > 0),
    subject_hmac       text not null,
    player_account_id  uuid not null references public.player_accounts (id) on delete cascade,
    created_at         timestamptz not null default now(),
    primary key (provider, key_version, subject_hmac)
);

create table if not exists public.player_profiles (
    player_account_id  uuid primary key references public.player_accounts (id) on delete cascade,
    display_name       text,
    status             text not null default 'active',
    last_login_at      timestamptz,
    created_at         timestamptz not null default now()
);

alter table public.player_accounts enable row level security;
alter table public.player_identities enable row level security;
alter table public.player_profiles enable row level security;

drop policy if exists player_accounts_select_own on public.player_accounts;
create policy player_accounts_select_own
    on public.player_accounts
    for select
    using (supabase_user_id = auth.uid());

drop policy if exists player_profiles_select_own on public.player_profiles;
create policy player_profiles_select_own
    on public.player_profiles
    for select
    using (
        exists (
            select 1
            from public.player_accounts
            where player_accounts.id = player_profiles.player_account_id
              and player_accounts.supabase_user_id = auth.uid()
        )
    );

drop policy if exists player_profiles_update_own on public.player_profiles;
create policy player_profiles_update_own
    on public.player_profiles
    for update
    using (
        exists (
            select 1
            from public.player_accounts
            where player_accounts.id = player_profiles.player_account_id
              and player_accounts.supabase_user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.player_accounts
            where player_accounts.id = player_profiles.player_account_id
              and player_accounts.supabase_user_id = auth.uid()
        )
    );
