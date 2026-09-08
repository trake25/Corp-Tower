-- Top or Drop persistent Supabase foundation.
-- Prerequisites: migrations 0001 through 0004 have already been applied.
-- This migration is additive and backward-compatible and is intended for manual
-- application in the Supabase SQL Editor. Existing players, accounts, profiles,
-- and identities do not need to be deleted or recreated. This is structural
-- foundation for later Wave usage; it does not wire gameplay behavior.

begin;

-- tod_kb_durable_foundation_anchor

do $$
begin
    if to_regclass('public.profiles') is null then
        raise exception '0005 requires the legacy profiles table from migration 0001';
    end if;

    if to_regclass('public.player_accounts') is null
        or to_regclass('public.player_identities') is null
        or to_regclass('public.player_profiles') is null then
        raise exception '0005 requires player_accounts, player_identities, and player_profiles from migration 0002';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'player_accounts'
          and column_name = 'name_onboarding_seen'
    ) or not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'player_profiles'
          and column_name = 'name_change_used'
    ) or to_regclass('public.player_profiles_permanent_name_unique') is null then
        raise exception '0005 requires profile name lifecycle migration 0003';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'player_accounts'
          and column_name = 'linked_provider'
          and data_type = 'text'
    ) or to_regprocedure('public.claim_player_provider(uuid,text,integer,text)') is null then
        raise exception '0005 requires linked provider migration 0004';
    end if;

    if exists (
        select 1
        from public.player_accounts
        where created_at is null
    ) or exists (
        select 1
        from public.player_profiles
        where created_at is null
    ) then
        raise exception '0005 cannot backfill timestamps because an existing account or profile has no created_at';
    end if;

    if exists (
        select 1
        from public.player_accounts
        where linked_provider is not null
          and linked_provider not in ('google', 'facebook')
    ) then
        raise exception '0005 found an invalid pre-existing linked_provider';
    end if;

    if exists (
        select 1
        from (
            select identities.player_account_id as account_id, identities.provider
            from public.player_identities identities
            where identities.provider = 'facebook'

            union

            select accounts.id as account_id, identities.provider
            from public.player_accounts accounts
            join auth.identities identities
                on identities.user_id = accounts.supabase_user_id
            where identities.provider in ('google', 'facebook')

            union

            select accounts.id as account_id, accounts.linked_provider as provider
            from public.player_accounts accounts
            where accounts.linked_provider in ('google', 'facebook')
        ) logical_providers
        group by logical_providers.account_id
        having count(distinct logical_providers.provider) > 1
    ) then
        raise exception '0005 found an account with more than one logical external provider';
    end if;
end;
$$;

alter table public.player_accounts
    add column if not exists account_status text,
    add column if not exists provider_linked_at timestamptz,
    add column if not exists last_seen_at timestamptz,
    add column if not exists deleted_at timestamptz;

alter table public.player_profiles
    add column if not exists updated_at timestamptz;

do $$
declare
    incompatible_columns text;
begin
    select string_agg(expected.table_name || '.' || expected.column_name, ', ')
    into incompatible_columns
    from (
        values
            ('player_accounts', 'account_status', 'text'::regtype),
            ('player_accounts', 'provider_linked_at', 'timestamptz'::regtype),
            ('player_accounts', 'last_seen_at', 'timestamptz'::regtype),
            ('player_accounts', 'deleted_at', 'timestamptz'::regtype),
            ('player_profiles', 'updated_at', 'timestamptz'::regtype)
    ) as expected(table_name, column_name, type_oid)
    left join pg_catalog.pg_namespace namespace
        on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation
        on relation.relnamespace = namespace.oid
       and relation.relname = expected.table_name
    left join pg_catalog.pg_attribute attribute
        on attribute.attrelid = relation.oid
       and attribute.attname = expected.column_name
       and attribute.attnum > 0
       and not attribute.attisdropped
    where attribute.atttypid is distinct from expected.type_oid;

    if incompatible_columns is not null then
        raise exception '0005 found incompatible pre-existing foundation columns: %', incompatible_columns;
    end if;
end;
$$;

update public.player_accounts accounts
set account_status = 'active'
where accounts.account_status is null;

do $$
begin
    if exists (
        select 1
        from public.player_accounts
        where account_status not in ('active', 'banned', 'deleted')
    ) then
        raise exception '0005 found an invalid pre-existing account_status';
    end if;
end;
$$;

update public.player_accounts accounts
set last_seen_at = coalesce(
    (
        select profiles.last_login_at
        from public.player_profiles profiles
        where profiles.player_account_id = accounts.id
    ),
    accounts.created_at
)
where accounts.last_seen_at is null;

update public.player_profiles
set updated_at = coalesce(last_login_at, created_at)
where updated_at is null;

do $$
begin
    if exists (
        select 1 from public.player_accounts where last_seen_at is null
    ) or exists (
        select 1 from public.player_profiles where updated_at is null
    ) then
        raise exception '0005 timestamp backfill produced a null required timestamp';
    end if;

    if exists (
        select 1
        from public.player_accounts
        where (account_status = 'deleted') is distinct from (deleted_at is not null)
    ) then
        raise exception '0005 found inconsistent pre-existing account deletion state';
    end if;
end;
$$;

alter table public.player_accounts
    alter column account_status set default 'active',
    alter column account_status set not null,
    alter column last_seen_at set default now(),
    alter column last_seen_at set not null;

alter table public.player_profiles
    alter column updated_at set default now(),
    alter column updated_at set not null;

alter table public.player_accounts
    add constraint player_accounts_account_status_check
        check (account_status in ('active', 'banned', 'deleted')),
    add constraint player_accounts_deleted_state_check
        check ((account_status = 'deleted') = (deleted_at is not null));

create or replace function public.set_foundation_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function public.stamp_provider_linked_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if new.linked_provider is not null and new.provider_linked_at is null then
        if tg_op = 'INSERT' then
            new.provider_linked_at = now();
        elsif old.linked_provider is null then
            new.provider_linked_at = now();
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists player_profiles_set_updated_at on public.player_profiles;
create trigger player_profiles_set_updated_at
before update on public.player_profiles
for each row execute function public.set_foundation_updated_at();

drop trigger if exists player_accounts_stamp_provider_linked_at on public.player_accounts;
create trigger player_accounts_stamp_provider_linked_at
before insert or update of linked_provider on public.player_accounts
for each row execute function public.stamp_provider_linked_at();

create table public.account_settings (
    player_account_id uuid primary key
        references public.player_accounts (id) on delete cascade,
    settings jsonb not null default '{}'::jsonb
        check (jsonb_typeof(settings) = 'object'),
    updated_at timestamptz not null default now()
);

create table public.progression_tracks (
    track_key text primary key check (track_key = btrim(track_key) and track_key <> ''),
    season_key text check (season_key is null or (season_key = btrim(season_key) and season_key <> '')),
    config jsonb not null default '{}'::jsonb
        check (jsonb_typeof(config) = 'object'),
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_at is null or starts_at is null or ends_at > starts_at)
);

insert into public.progression_tracks (track_key, config)
values ('trio_main', '{}'::jsonb)
on conflict (track_key) do nothing;

create table public.trios (
    id uuid primary key default gen_random_uuid(),
    member_a_id uuid not null
        references public.player_accounts (id) on delete restrict,
    member_b_id uuid not null
        references public.player_accounts (id) on delete restrict,
    member_c_id uuid not null
        references public.player_accounts (id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint trios_canonical_members_check
        check (member_a_id < member_b_id and member_b_id < member_c_id),
    constraint trios_members_unique
        unique (member_a_id, member_b_id, member_c_id)
);

create index trios_member_a_idx on public.trios (member_a_id);
create index trios_member_b_idx on public.trios (member_b_id);
create index trios_member_c_idx on public.trios (member_c_id);

create table public.trio_progress (
    trio_id uuid not null references public.trios (id) on delete restrict,
    track_key text not null
        references public.progression_tracks (track_key) on delete restrict,
    highest_secured_checkpoint integer not null
        check (highest_secured_checkpoint >= 1),
    secured_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (trio_id, track_key)
);

create or replace function public.protect_trio_progress_high_water()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if tg_op = 'DELETE' then
        raise exception 'trio progression high-water rows cannot be deleted';
    end if;

    if new.trio_id is distinct from old.trio_id
       or new.track_key is distinct from old.track_key then
        raise exception 'trio progression identity cannot be changed';
    end if;

    if new.highest_secured_checkpoint < old.highest_secured_checkpoint then
        raise exception 'trio progression high-water cannot decrease';
    end if;

    return new;
end;
$$;

create trigger trio_progress_protect_high_water
before update or delete on public.trio_progress
for each row execute function public.protect_trio_progress_high_water();

create table public.game_runs (
    id uuid primary key default gen_random_uuid(),
    mode text not null check (mode = btrim(mode) and mode <> ''),
    trio_id uuid references public.trios (id) on delete restrict,
    track_key text references public.progression_tracks (track_key) on delete restrict,
    progression_eligible boolean not null default false,
    start_checkpoint integer check (start_checkpoint is null or start_checkpoint >= 1),
    end_checkpoint integer check (end_checkpoint is null or end_checkpoint >= 1),
    result text check (result is null or (result = btrim(result) and result <> '')),
    build_version text not null
        check (build_version = btrim(build_version) and build_version <> ''),
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    created_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    check (not progression_eligible or (trio_id is not null and track_key is not null)),
    check (end_checkpoint is null or (start_checkpoint is not null and end_checkpoint >= start_checkpoint)),
    check (ended_at is null or ended_at >= started_at)
);

create index game_runs_trio_started_idx
    on public.game_runs (trio_id, started_at desc)
    where trio_id is not null;

create table public.game_run_players (
    run_id uuid not null references public.game_runs (id) on delete cascade,
    account_id uuid not null references public.player_accounts (id) on delete restrict,
    seat smallint not null check (seat between 0 and 2),
    score bigint not null default 0,
    is_mvp boolean not null default false,
    joined_at timestamptz not null default now(),
    left_at timestamptz,
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    primary key (run_id, account_id),
    unique (run_id, seat),
    check (left_at is null or left_at >= joined_at)
);

create index game_run_players_account_run_idx
    on public.game_run_players (account_id, run_id);

create table public.currencies (
    currency_code text primary key
        check (currency_code = btrim(currency_code) and currency_code <> ''),
    display_name text not null
        check (display_name = btrim(display_name) and display_name <> ''),
    kind text not null check (kind = btrim(kind) and kind <> ''),
    enabled boolean not null default true,
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default now()
);

insert into public.currencies (currency_code, display_name, kind)
values
    ('SC', 'Soft Currency', 'soft'),
    ('HC', 'Hard Currency', 'hard')
on conflict (currency_code) do nothing;

create table public.account_balances (
    account_id uuid not null
        references public.player_accounts (id) on delete restrict,
    currency_code text not null
        references public.currencies (currency_code) on delete restrict,
    balance bigint not null default 0 check (balance >= 0),
    updated_at timestamptz not null default now(),
    primary key (account_id, currency_code)
);

create table public.economy_events (
    id uuid primary key default gen_random_uuid(),
    idempotency_key text not null unique
        check (idempotency_key = btrim(idempotency_key) and idempotency_key <> ''),
    request_hash text not null
        check (request_hash = btrim(request_hash) and request_hash <> ''),
    event_key text not null check (event_key = btrim(event_key) and event_key <> ''),
    source_key text not null check (source_key = btrim(source_key) and source_key <> ''),
    created_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object')
);

create table public.wallet_ledger (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.economy_events (id) on delete restrict,
    account_id uuid not null references public.player_accounts (id) on delete restrict,
    currency_code text not null
        references public.currencies (currency_code) on delete restrict,
    delta bigint not null check (delta <> 0),
    balance_after bigint not null check (balance_after >= 0),
    created_at timestamptz not null default now(),
    unique (event_id, account_id, currency_code)
);

create index wallet_ledger_account_created_idx
    on public.wallet_ledger (account_id, created_at desc);

create or replace function public.protect_wallet_ledger_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    raise exception 'wallet ledger history is immutable; use a compensating economy event';
end;
$$;

create trigger wallet_ledger_immutable
before update or delete on public.wallet_ledger
for each row execute function public.protect_wallet_ledger_history();

create table public.trio_checkpoint_claims (
    trio_id uuid not null references public.trios (id) on delete restrict,
    track_key text not null
        references public.progression_tracks (track_key) on delete restrict,
    checkpoint integer not null check (checkpoint >= 1),
    run_id uuid not null references public.game_runs (id) on delete restrict,
    reward_sc bigint not null default 0 check (reward_sc >= 0),
    reward_event_id uuid references public.economy_events (id) on delete restrict,
    secured_at timestamptz not null default now(),
    primary key (trio_id, track_key, checkpoint)
);

create index trio_checkpoint_claims_run_idx
    on public.trio_checkpoint_claims (run_id);

create table public.account_milestone_claims (
    account_id uuid not null
        references public.player_accounts (id) on delete restrict,
    milestone_key text not null
        check (milestone_key = btrim(milestone_key) and milestone_key <> ''),
    reward_hc bigint not null check (reward_hc >= 0),
    provider_link_required boolean not null,
    achieved_at timestamptz not null default now(),
    claimed_at timestamptz,
    reward_event_id uuid references public.economy_events (id) on delete restrict,
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    primary key (account_id, milestone_key),
    check ((claimed_at is null) = (reward_event_id is null) or reward_hc = 0),
    check (claimed_at is null or claimed_at >= achieved_at)
);

create index account_milestone_claims_milestone_idx
    on public.account_milestone_claims (milestone_key, achieved_at);

create table public.item_catalog (
    item_key text primary key check (item_key = btrim(item_key) and item_key <> ''),
    category text not null check (category = btrim(category) and category <> ''),
    rarity text not null check (rarity = btrim(rarity) and rarity <> ''),
    stackable boolean not null default false,
    enabled boolean not null default true,
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default now()
);

create table public.account_items (
    account_id uuid not null
        references public.player_accounts (id) on delete restrict,
    item_key text not null references public.item_catalog (item_key) on delete restrict,
    quantity bigint not null check (quantity > 0),
    acquired_at timestamptz not null default now(),
    source_key text not null check (source_key = btrim(source_key) and source_key <> ''),
    updated_at timestamptz not null default now(),
    primary key (account_id, item_key)
);

create table public.account_loadout_slots (
    account_id uuid not null,
    loadout_key text not null
        check (loadout_key = btrim(loadout_key) and loadout_key <> ''),
    slot_key text not null check (slot_key = btrim(slot_key) and slot_key <> ''),
    item_key text not null,
    equipped_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (account_id, loadout_key, slot_key),
    foreign key (account_id, item_key)
        references public.account_items (account_id, item_key) on delete cascade
);

create table public.store_offers (
    offer_key text primary key check (offer_key = btrim(offer_key) and offer_key <> ''),
    enabled boolean not null default true,
    starts_at timestamptz,
    ends_at timestamptz,
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default now(),
    check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.store_offer_costs (
    offer_key text not null
        references public.store_offers (offer_key) on delete cascade,
    currency_code text not null
        references public.currencies (currency_code) on delete restrict,
    amount bigint not null check (amount > 0),
    primary key (offer_key, currency_code)
);

create table public.store_offer_grants (
    offer_key text not null
        references public.store_offers (offer_key) on delete cascade,
    grant_type text not null
        check (grant_type = btrim(grant_type) and grant_type <> ''),
    grant_key text not null check (grant_key = btrim(grant_key) and grant_key <> ''),
    amount bigint not null check (amount > 0),
    primary key (offer_key, grant_type, grant_key)
);

create table public.external_purchase_receipts (
    platform text not null check (platform = btrim(platform) and platform <> ''),
    transaction_id text not null
        check (transaction_id = btrim(transaction_id) and transaction_id <> ''),
    account_id uuid not null
        references public.player_accounts (id) on delete restrict,
    offer_key text references public.store_offers (offer_key) on delete restrict,
    status text not null check (status = btrim(status) and status <> ''),
    purchased_at timestamptz not null,
    verified_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    primary key (platform, transaction_id),
    check (verified_at is null or verified_at >= purchased_at)
);

create index external_purchase_receipts_account_purchased_idx
    on public.external_purchase_receipts (account_id, purchased_at desc);

create table public.account_stats (
    account_id uuid not null
        references public.player_accounts (id) on delete cascade,
    stat_key text not null check (stat_key = btrim(stat_key) and stat_key <> ''),
    value bigint not null default 0,
    updated_at timestamptz not null default now(),
    primary key (account_id, stat_key)
);

create table public.trio_stats (
    trio_id uuid not null references public.trios (id) on delete restrict,
    stat_key text not null check (stat_key = btrim(stat_key) and stat_key <> ''),
    value bigint not null default 0,
    updated_at timestamptz not null default now(),
    primary key (trio_id, stat_key)
);

create table public.achievement_catalog (
    achievement_key text primary key
        check (achievement_key = btrim(achievement_key) and achievement_key <> ''),
    enabled boolean not null default true,
    target bigint check (target is null or target >= 0),
    rule jsonb not null default '{}'::jsonb
        check (jsonb_typeof(rule) = 'object'),
    reward jsonb not null default '{}'::jsonb
        check (jsonb_typeof(reward) = 'object'),
    created_at timestamptz not null default now()
);

create table public.account_achievements (
    account_id uuid not null
        references public.player_accounts (id) on delete cascade,
    achievement_key text not null
        references public.achievement_catalog (achievement_key) on delete restrict,
    progress bigint not null default 0 check (progress >= 0),
    unlocked_at timestamptz,
    reward_claimed_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (account_id, achievement_key),
    check (reward_claimed_at is null or unlocked_at is not null),
    check (reward_claimed_at is null or reward_claimed_at >= unlocked_at)
);

create table public.account_progression (
    account_id uuid not null
        references public.player_accounts (id) on delete cascade,
    track_key text not null
        references public.progression_tracks (track_key) on delete restrict,
    xp bigint not null default 0 check (xp >= 0),
    level integer not null default 0 check (level >= 0),
    updated_at timestamptz not null default now(),
    primary key (account_id, track_key)
);

create table public.challenge_catalog (
    challenge_key text primary key
        check (challenge_key = btrim(challenge_key) and challenge_key <> ''),
    period_type text not null
        check (period_type = btrim(period_type) and period_type <> ''),
    rule jsonb not null default '{}'::jsonb
        check (jsonb_typeof(rule) = 'object'),
    reward jsonb not null default '{}'::jsonb
        check (jsonb_typeof(reward) = 'object'),
    enabled boolean not null default true,
    created_at timestamptz not null default now()
);

create table public.account_challenges (
    account_id uuid not null
        references public.player_accounts (id) on delete cascade,
    challenge_key text not null
        references public.challenge_catalog (challenge_key) on delete restrict,
    period_key text not null check (period_key = btrim(period_key) and period_key <> ''),
    progress bigint not null default 0 check (progress >= 0),
    completed_at timestamptz,
    claimed_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (account_id, challenge_key, period_key),
    check (claimed_at is null or completed_at is not null),
    check (claimed_at is null or claimed_at >= completed_at)
);

create table public.friendships (
    account_a uuid not null
        references public.player_accounts (id) on delete cascade,
    account_b uuid not null
        references public.player_accounts (id) on delete cascade,
    requested_by uuid not null
        references public.player_accounts (id) on delete cascade,
    status text not null check (status = btrim(status) and status <> ''),
    requested_at timestamptz not null default now(),
    responded_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (account_a, account_b),
    check (account_a < account_b),
    check (requested_by = account_a or requested_by = account_b),
    check (responded_at is null or responded_at >= requested_at)
);

create index friendships_account_b_idx on public.friendships (account_b, account_a);

create table public.account_blocks (
    blocker_id uuid not null
        references public.player_accounts (id) on delete cascade,
    blocked_id uuid not null
        references public.player_accounts (id) on delete cascade,
    blocked_at timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    check (blocker_id <> blocked_id)
);

create index account_blocks_blocked_idx
    on public.account_blocks (blocked_id, blocker_id);

create table public.site_catalog (
    site_key text primary key check (site_key = btrim(site_key) and site_key <> ''),
    enabled boolean not null default true,
    config jsonb not null default '{}'::jsonb
        check (jsonb_typeof(config) = 'object'),
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default now()
);

create table public.site_modifier_catalog (
    modifier_key text primary key
        check (modifier_key = btrim(modifier_key) and modifier_key <> ''),
    enabled boolean not null default true,
    config jsonb not null default '{}'::jsonb
        check (jsonb_typeof(config) = 'object'),
    created_at timestamptz not null default now()
);

create table public.content_rotations (
    rotation_key text primary key
        check (rotation_key = btrim(rotation_key) and rotation_key <> ''),
    site_key text not null references public.site_catalog (site_key) on delete restrict,
    modifier_key text
        references public.site_modifier_catalog (modifier_key) on delete restrict,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    created_at timestamptz not null default now(),
    check (ends_at > starts_at)
);

create trigger account_settings_set_updated_at
before update on public.account_settings
for each row execute function public.set_foundation_updated_at();

create trigger progression_tracks_set_updated_at
before update on public.progression_tracks
for each row execute function public.set_foundation_updated_at();

create trigger trio_progress_set_updated_at
before update on public.trio_progress
for each row execute function public.set_foundation_updated_at();

create trigger account_balances_set_updated_at
before update on public.account_balances
for each row execute function public.set_foundation_updated_at();

create trigger account_items_set_updated_at
before update on public.account_items
for each row execute function public.set_foundation_updated_at();

create trigger account_loadout_slots_set_updated_at
before update on public.account_loadout_slots
for each row execute function public.set_foundation_updated_at();

create trigger external_purchase_receipts_set_updated_at
before update on public.external_purchase_receipts
for each row execute function public.set_foundation_updated_at();

create trigger account_stats_set_updated_at
before update on public.account_stats
for each row execute function public.set_foundation_updated_at();

create trigger trio_stats_set_updated_at
before update on public.trio_stats
for each row execute function public.set_foundation_updated_at();

create trigger account_achievements_set_updated_at
before update on public.account_achievements
for each row execute function public.set_foundation_updated_at();

create trigger account_progression_set_updated_at
before update on public.account_progression
for each row execute function public.set_foundation_updated_at();

create trigger account_challenges_set_updated_at
before update on public.account_challenges
for each row execute function public.set_foundation_updated_at();

create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function public.set_foundation_updated_at();

alter table public.account_settings enable row level security;
alter table public.progression_tracks enable row level security;
alter table public.trios enable row level security;
alter table public.trio_progress enable row level security;
alter table public.game_runs enable row level security;
alter table public.game_run_players enable row level security;
alter table public.currencies enable row level security;
alter table public.account_balances enable row level security;
alter table public.economy_events enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.trio_checkpoint_claims enable row level security;
alter table public.account_milestone_claims enable row level security;
alter table public.item_catalog enable row level security;
alter table public.account_items enable row level security;
alter table public.account_loadout_slots enable row level security;
alter table public.store_offers enable row level security;
alter table public.store_offer_costs enable row level security;
alter table public.store_offer_grants enable row level security;
alter table public.external_purchase_receipts enable row level security;
alter table public.account_stats enable row level security;
alter table public.trio_stats enable row level security;
alter table public.achievement_catalog enable row level security;
alter table public.account_achievements enable row level security;
alter table public.account_progression enable row level security;
alter table public.challenge_catalog enable row level security;
alter table public.account_challenges enable row level security;
alter table public.friendships enable row level security;
alter table public.account_blocks enable row level security;
alter table public.site_catalog enable row level security;
alter table public.site_modifier_catalog enable row level security;
alter table public.content_rotations enable row level security;

revoke all privileges on table
    public.account_settings,
    public.progression_tracks,
    public.trios,
    public.trio_progress,
    public.game_runs,
    public.game_run_players,
    public.currencies,
    public.account_balances,
    public.economy_events,
    public.wallet_ledger,
    public.trio_checkpoint_claims,
    public.account_milestone_claims,
    public.item_catalog,
    public.account_items,
    public.account_loadout_slots,
    public.store_offers,
    public.store_offer_costs,
    public.store_offer_grants,
    public.external_purchase_receipts,
    public.account_stats,
    public.trio_stats,
    public.achievement_catalog,
    public.account_achievements,
    public.account_progression,
    public.challenge_catalog,
    public.account_challenges,
    public.friendships,
    public.account_blocks,
    public.site_catalog,
    public.site_modifier_catalog,
    public.content_rotations
from public, anon, authenticated;

grant select, insert, update, delete on table
    public.account_settings,
    public.progression_tracks,
    public.trios,
    public.trio_progress,
    public.game_runs,
    public.game_run_players,
    public.currencies,
    public.account_balances,
    public.economy_events,
    public.wallet_ledger,
    public.trio_checkpoint_claims,
    public.account_milestone_claims,
    public.item_catalog,
    public.account_items,
    public.account_loadout_slots,
    public.store_offers,
    public.store_offer_costs,
    public.store_offer_grants,
    public.external_purchase_receipts,
    public.account_stats,
    public.trio_stats,
    public.achievement_catalog,
    public.account_achievements,
    public.account_progression,
    public.challenge_catalog,
    public.account_challenges,
    public.friendships,
    public.account_blocks,
    public.site_catalog,
    public.site_modifier_catalog,
    public.content_rotations
to service_role;

create or replace function public.apply_wallet_transaction(
    p_idempotency_key text,
    p_event_key text,
    p_source_key text,
    p_deltas jsonb,
    p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    effective_idempotency_key text := btrim(p_idempotency_key);
    effective_event_key text := btrim(p_event_key);
    effective_source_key text := btrim(p_source_key);
    effective_deltas jsonb;
    effective_request_hash text;
    wallet_event_id uuid;
    existing_request_hash text;
    inserted_ledger_rows integer;
begin
    if effective_idempotency_key is null or effective_idempotency_key = '' then
        raise exception 'wallet idempotency key is required';
    end if;

    if effective_event_key is null or effective_event_key = '' then
        raise exception 'wallet event key is required';
    end if;

    if effective_source_key is null or effective_source_key = '' then
        raise exception 'wallet source key is required';
    end if;

    if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
        raise exception 'wallet metadata must be a JSON object';
    end if;

    if p_deltas is null or jsonb_typeof(p_deltas) <> 'array' then
        raise exception 'wallet deltas must be a non-empty JSON array';
    end if;

    if jsonb_array_length(p_deltas) = 0 then
        raise exception 'wallet deltas must be a non-empty JSON array';
    end if;

    if exists (
        select 1
        from jsonb_array_elements(p_deltas) as input(entry)
        where jsonb_typeof(entry) <> 'object'
           or nullif(btrim(entry ->> 'account_id'), '') is null
           or nullif(btrim(entry ->> 'currency_code'), '') is null
           or coalesce(entry ->> 'delta', '') !~ '^-?[0-9]+$'
           or coalesce(entry ->> 'delta', '0') = '0'
    ) then
        raise exception 'each wallet delta requires account_id, currency_code, and a nonzero integer delta';
    end if;

    begin
        select jsonb_agg(
            jsonb_build_object(
                'account_id', aggregated.account_id::text,
                'currency_code', aggregated.currency_code,
                'delta', aggregated.delta::bigint
            )
            order by aggregated.account_id, aggregated.currency_code
        )
        into effective_deltas
        from (
            select
                (input.entry ->> 'account_id')::uuid as account_id,
                btrim(input.entry ->> 'currency_code') as currency_code,
                sum((input.entry ->> 'delta')::numeric) as delta
            from jsonb_array_elements(p_deltas) as input(entry)
            group by
                (input.entry ->> 'account_id')::uuid,
                btrim(input.entry ->> 'currency_code')
            having sum((input.entry ->> 'delta')::numeric) <> 0
        ) aggregated;
    exception
        when invalid_text_representation or numeric_value_out_of_range then
            raise exception 'wallet deltas contain an invalid UUID or out-of-range bigint';
    end;

    if effective_deltas is null then
        raise exception 'wallet deltas cancel to an empty transaction';
    end if;

    effective_request_hash := 'sha256:' || encode(
        sha256(
            convert_to(
                jsonb_build_object(
                    'event_key', effective_event_key,
                    'source_key', effective_source_key,
                    'deltas', effective_deltas,
                    'metadata', p_metadata
                )::text,
                'UTF8'
            )
        ),
        'hex'
    );

    insert into public.economy_events (
        idempotency_key,
        request_hash,
        event_key,
        source_key,
        metadata
    )
    values (
        effective_idempotency_key,
        effective_request_hash,
        effective_event_key,
        effective_source_key,
        p_metadata
    )
    on conflict (idempotency_key) do nothing
    returning id into wallet_event_id;

    if wallet_event_id is null then
        select events.id, events.request_hash
        into wallet_event_id, existing_request_hash
        from public.economy_events events
        where events.idempotency_key = effective_idempotency_key;

        if not found then
            raise exception 'wallet idempotency conflict could not be resolved';
        end if;

        if existing_request_hash <> effective_request_hash then
            raise exception 'wallet idempotency key already represents a different request';
        end if;

        return wallet_event_id;
    end if;

    if exists (
        select 1
        from jsonb_to_recordset(effective_deltas)
            as requested(account_id uuid, currency_code text, delta bigint)
        left join public.player_accounts accounts on accounts.id = requested.account_id
        left join public.currencies currencies
            on currencies.currency_code = requested.currency_code
        where accounts.id is null or currencies.currency_code is null
    ) then
        raise exception 'wallet transaction references an unknown account or currency';
    end if;

    insert into public.account_balances (account_id, currency_code, balance)
    select requested.account_id, requested.currency_code, 0
    from jsonb_to_recordset(effective_deltas)
        as requested(account_id uuid, currency_code text, delta bigint)
    order by requested.account_id, requested.currency_code
    on conflict (account_id, currency_code) do nothing;

    perform balances.account_id
    from public.account_balances balances
    join jsonb_to_recordset(effective_deltas)
        as requested(account_id uuid, currency_code text, delta bigint)
      on requested.account_id = balances.account_id
     and requested.currency_code = balances.currency_code
    order by balances.account_id, balances.currency_code
    for update of balances;

    if exists (
        select 1
        from public.account_balances balances
        join jsonb_to_recordset(effective_deltas)
            as requested(account_id uuid, currency_code text, delta bigint)
          on requested.account_id = balances.account_id
         and requested.currency_code = balances.currency_code
        where balances.balance::numeric + requested.delta::numeric < 0
           or balances.balance::numeric + requested.delta::numeric > 9223372036854775807::numeric
    ) then
        raise exception 'wallet transaction would produce an invalid balance';
    end if;

    with requested as (
        select *
        from jsonb_to_recordset(effective_deltas)
            as entries(account_id uuid, currency_code text, delta bigint)
    ), updated_balances as (
        update public.account_balances balances
        set balance = (balances.balance::numeric + requested.delta::numeric)::bigint
        from requested
        where balances.account_id = requested.account_id
          and balances.currency_code = requested.currency_code
        returning
            balances.account_id,
            balances.currency_code,
            requested.delta,
            balances.balance
    )
    insert into public.wallet_ledger (
        event_id,
        account_id,
        currency_code,
        delta,
        balance_after
    )
    select
        wallet_event_id,
        updated_balances.account_id,
        updated_balances.currency_code,
        updated_balances.delta,
        updated_balances.balance
    from updated_balances
    order by updated_balances.account_id, updated_balances.currency_code;

    get diagnostics inserted_ledger_rows = row_count;

    if inserted_ledger_rows <> jsonb_array_length(effective_deltas) then
        raise exception 'wallet transaction did not write exactly one ledger row per effective delta';
    end if;

    return wallet_event_id;
end;
$$;

create or replace function public.secure_trio_checkpoint(
    p_run_id uuid,
    p_trio_id uuid,
    p_track_key text,
    p_checkpoint integer,
    p_sc_reward bigint,
    p_metadata jsonb default '{}'::jsonb
)
returns table (
    highest_secured_checkpoint integer,
    reward_event_id uuid,
    newly_secured boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    effective_track_key text := btrim(p_track_key);
    trio_member_a uuid;
    trio_member_b uuid;
    trio_member_c uuid;
    run_trio_id uuid;
    run_track_key text;
    run_progression_eligible boolean;
    existing_claim public.trio_checkpoint_claims%rowtype;
    current_high_water integer;
    new_reward_event_id uuid;
    reward_deltas jsonb;
    reward_metadata jsonb;
begin
    if p_run_id is null or p_trio_id is null then
        raise exception 'checkpoint run and trio are required';
    end if;

    if effective_track_key is null or effective_track_key = '' then
        raise exception 'checkpoint track key is required';
    end if;

    if p_checkpoint is null or p_checkpoint < 1 then
        raise exception 'checkpoint must be at least 1';
    end if;

    if p_sc_reward is null or p_sc_reward < 0 then
        raise exception 'checkpoint SC reward must be nonnegative';
    end if;

    if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
        raise exception 'checkpoint metadata must be a JSON object';
    end if;

    select trios.member_a_id, trios.member_b_id, trios.member_c_id
    into trio_member_a, trio_member_b, trio_member_c
    from public.trios trios
    where trios.id = p_trio_id
    for update;

    if not found then
        raise exception 'checkpoint trio does not exist';
    end if;

    select
        runs.trio_id,
        runs.track_key,
        runs.progression_eligible
    into run_trio_id, run_track_key, run_progression_eligible
    from public.game_runs runs
    where runs.id = p_run_id
    for share;

    if not found then
        raise exception 'checkpoint run does not exist';
    end if;

    if not run_progression_eligible
       or run_trio_id is distinct from p_trio_id
       or run_track_key is distinct from effective_track_key then
        raise exception 'checkpoint run is not progression eligible for the requested trio and track';
    end if;

    select claims.*
    into existing_claim
    from public.trio_checkpoint_claims claims
    where claims.trio_id = p_trio_id
      and claims.track_key = effective_track_key
      and claims.checkpoint = p_checkpoint;

    if found then
        select progress.highest_secured_checkpoint
        into current_high_water
        from public.trio_progress progress
        where progress.trio_id = p_trio_id
          and progress.track_key = effective_track_key;

        if not found or current_high_water < p_checkpoint then
            raise exception 'checkpoint claim exists without matching trio high-water progression';
        end if;

        return query
        select current_high_water, existing_claim.reward_event_id, false;
        return;
    end if;

    select progress.highest_secured_checkpoint
    into current_high_water
    from public.trio_progress progress
    where progress.trio_id = p_trio_id
      and progress.track_key = effective_track_key;

    if found and current_high_water >= p_checkpoint then
        raise exception 'trio high-water indicates a secured checkpoint claim is missing';
    end if;

    insert into public.trio_checkpoint_claims (
        trio_id,
        track_key,
        checkpoint,
        run_id,
        reward_sc
    )
    values (
        p_trio_id,
        effective_track_key,
        p_checkpoint,
        p_run_id,
        p_sc_reward
    );

    insert into public.trio_progress as current_progress (
        trio_id,
        track_key,
        highest_secured_checkpoint,
        secured_at
    )
    values (
        p_trio_id,
        effective_track_key,
        p_checkpoint,
        now()
    )
    on conflict (trio_id, track_key) do update
    set highest_secured_checkpoint = greatest(
            current_progress.highest_secured_checkpoint,
            excluded.highest_secured_checkpoint
        ),
        secured_at = case
            when excluded.highest_secured_checkpoint
                > current_progress.highest_secured_checkpoint
            then excluded.secured_at
            else current_progress.secured_at
        end;

    -- A zero reward secures progression without fabricating forbidden zero-delta ledger rows.
    if p_sc_reward > 0 then
        reward_deltas := jsonb_build_array(
            jsonb_build_object(
                'account_id', trio_member_a::text,
                'currency_code', 'SC',
                'delta', p_sc_reward
            ),
            jsonb_build_object(
                'account_id', trio_member_b::text,
                'currency_code', 'SC',
                'delta', p_sc_reward
            ),
            jsonb_build_object(
                'account_id', trio_member_c::text,
                'currency_code', 'SC',
                'delta', p_sc_reward
            )
        );

        reward_metadata := p_metadata || jsonb_build_object(
            'run_id', p_run_id::text,
            'trio_id', p_trio_id::text,
            'track_key', effective_track_key,
            'checkpoint', p_checkpoint,
            'reward_sc', p_sc_reward
        );

        select public.apply_wallet_transaction(
            'trio_checkpoint:' || p_trio_id::text || ':'
                || effective_track_key || ':' || p_checkpoint::text,
            'trio_checkpoint_secured',
            'game_run',
            reward_deltas,
            reward_metadata
        )
        into new_reward_event_id;

        update public.trio_checkpoint_claims claims
        set reward_event_id = new_reward_event_id
        where claims.trio_id = p_trio_id
          and claims.track_key = effective_track_key
          and claims.checkpoint = p_checkpoint;
    end if;

    select progress.highest_secured_checkpoint
    into current_high_water
    from public.trio_progress progress
    where progress.trio_id = p_trio_id
      and progress.track_key = effective_track_key;

    return query
    select current_high_water, new_reward_event_id, true;
end;
$$;

create or replace function public.claim_account_milestone(
    p_account_id uuid,
    p_milestone_key text,
    p_hc_reward bigint,
    p_provider_link_required boolean default true,
    p_metadata jsonb default '{}'::jsonb
)
returns table (
    achieved_at timestamptz,
    claimed_at timestamptz,
    reward_event_id uuid,
    claim_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    effective_milestone_key text := btrim(p_milestone_key);
    linked_provider text;
    milestone_claim public.account_milestone_claims%rowtype;
    snapshot_metadata jsonb;
    new_reward_event_id uuid;
    new_claimed_at timestamptz;
begin
    if p_account_id is null then
        raise exception 'milestone account is required';
    end if;

    if effective_milestone_key is null or effective_milestone_key = '' then
        raise exception 'milestone key is required';
    end if;

    if p_hc_reward is null or p_hc_reward < 0 then
        raise exception 'milestone HC reward must be nonnegative';
    end if;

    if p_provider_link_required is null then
        raise exception 'milestone provider-link requirement is required';
    end if;

    if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
        raise exception 'milestone metadata must be a JSON object';
    end if;

    select accounts.linked_provider
    into linked_provider
    from public.player_accounts accounts
    where accounts.id = p_account_id
    for update;

    if not found then
        raise exception 'milestone account does not exist';
    end if;

    snapshot_metadata := p_metadata || jsonb_build_object(
        'reward_snapshot', jsonb_build_object(
            'currency_code', 'HC',
            'amount', p_hc_reward,
            'provider_link_required', p_provider_link_required
        )
    );

    insert into public.account_milestone_claims (
        account_id,
        milestone_key,
        reward_hc,
        provider_link_required,
        metadata
    )
    values (
        p_account_id,
        effective_milestone_key,
        p_hc_reward,
        p_provider_link_required,
        snapshot_metadata
    )
    on conflict (account_id, milestone_key) do nothing;

    select claims.*
    into milestone_claim
    from public.account_milestone_claims claims
    where claims.account_id = p_account_id
      and claims.milestone_key = effective_milestone_key
    for update;

    if milestone_claim.claimed_at is not null then
        return query
        select
            milestone_claim.achieved_at,
            milestone_claim.claimed_at,
            milestone_claim.reward_event_id,
            'already_claimed'::text;
        return;
    end if;

    if milestone_claim.provider_link_required and linked_provider is null then
        return query
        select
            milestone_claim.achieved_at,
            null::timestamptz,
            null::uuid,
            'provider_link_required'::text;
        return;
    end if;

    new_claimed_at := now();

    -- A zero-value milestone can be claimed without a financial event or ledger row.
    if milestone_claim.reward_hc > 0 then
        select public.apply_wallet_transaction(
            'account_milestone:' || p_account_id::text || ':' || effective_milestone_key,
            'account_milestone_claimed',
            'account_milestone',
            jsonb_build_array(
                jsonb_build_object(
                    'account_id', p_account_id::text,
                    'currency_code', 'HC',
                    'delta', milestone_claim.reward_hc
                )
            ),
            milestone_claim.metadata || jsonb_build_object(
                'account_id', p_account_id::text,
                'milestone_key', effective_milestone_key
            )
        )
        into new_reward_event_id;
    end if;

    update public.account_milestone_claims claims
    set claimed_at = new_claimed_at,
        reward_event_id = new_reward_event_id
    where claims.account_id = p_account_id
      and claims.milestone_key = effective_milestone_key;

    return query
    select
        milestone_claim.achieved_at,
        new_claimed_at,
        new_reward_event_id,
        'claimed'::text;
end;
$$;

revoke all on function public.set_foundation_updated_at() from public;
revoke all on function public.stamp_provider_linked_at() from public;
revoke all on function public.protect_trio_progress_high_water() from public;
revoke all on function public.protect_wallet_ledger_history() from public;

revoke all on function public.apply_wallet_transaction(text, text, text, jsonb, jsonb)
    from public, anon, authenticated;
revoke all on function public.secure_trio_checkpoint(uuid, uuid, text, integer, bigint, jsonb)
    from public, anon, authenticated;
revoke all on function public.claim_account_milestone(uuid, text, bigint, boolean, jsonb)
    from public, anon, authenticated;

grant execute on function public.apply_wallet_transaction(text, text, text, jsonb, jsonb)
    to service_role;
grant execute on function public.secure_trio_checkpoint(uuid, uuid, text, integer, bigint, jsonb)
    to service_role;
grant execute on function public.claim_account_milestone(uuid, text, bigint, boolean, jsonb)
    to service_role;

commit;
