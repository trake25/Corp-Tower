alter table public.player_accounts
    add column if not exists name_onboarding_seen boolean;

update public.player_accounts
set name_onboarding_seen = true
where name_onboarding_seen is null;

alter table public.player_accounts
    alter column name_onboarding_seen set default false,
    alter column name_onboarding_seen set not null;

alter table public.player_profiles
    add column if not exists name_change_used boolean not null default false;

create unique index if not exists player_profiles_permanent_name_unique
    on public.player_profiles (lower(btrim(display_name)))
    where name_change_used = true;

drop policy if exists player_profiles_update_own on public.player_profiles;
