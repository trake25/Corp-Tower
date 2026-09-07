begin;

alter table public.player_accounts
    add column if not exists linked_provider text;

do $$
begin
    if exists (
        select 1
        from (
            select player_account_id as account_id, provider
            from public.player_identities
            where provider = 'facebook'

            union

            select accounts.id as account_id, identities.provider
            from public.player_accounts accounts
            join auth.identities identities
                on identities.user_id = accounts.supabase_user_id
            where identities.provider in ('google', 'facebook')

            union

            select id as account_id, linked_provider as provider
            from public.player_accounts
            where linked_provider in ('google', 'facebook')
        ) logical_providers
        group by account_id
        having count(distinct provider) > 1
    ) then
        raise exception 'player account has more than one logical external provider';
    end if;
end $$;

with logical_providers as (
    select player_account_id as account_id, provider
    from public.player_identities
    where provider = 'facebook'

    union

    select accounts.id as account_id, identities.provider
    from public.player_accounts accounts
    join auth.identities identities
        on identities.user_id = accounts.supabase_user_id
    where identities.provider in ('google', 'facebook')
), candidates as (
    select account_id, min(provider) as provider
    from logical_providers
    group by account_id
)
update public.player_accounts accounts
set linked_provider = candidates.provider
from candidates
where accounts.id = candidates.account_id
  and accounts.linked_provider is null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.player_accounts'::regclass
          and conname = 'player_accounts_linked_provider_check'
    ) then
        alter table public.player_accounts
            add constraint player_accounts_linked_provider_check
            check (linked_provider is null or linked_provider in ('google', 'facebook'));
    end if;
end $$;

create or replace function public.claim_player_provider(
    p_account_id uuid,
    p_provider text,
    p_facebook_key_version integer default null,
    p_facebook_subject_hmac text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    current_provider text;
    subject_owner uuid;
begin
    if p_provider not in ('google', 'facebook') then
        return 'rejected';
    end if;

    select linked_provider
    into current_provider
    from public.player_accounts
    where id = p_account_id
    for update;

    if not found then
        return 'rejected';
    end if;

    if current_provider is not null and current_provider <> p_provider then
        return 'provider_conflict';
    end if;

    if p_provider = 'facebook' then
        if p_facebook_key_version is null
            or p_facebook_key_version <= 0
            or coalesce(p_facebook_subject_hmac, '') = '' then
            return 'rejected';
        end if;

        insert into public.player_identities (
            provider,
            key_version,
            subject_hmac,
            player_account_id
        )
        values (
            'facebook',
            p_facebook_key_version,
            p_facebook_subject_hmac,
            p_account_id
        )
        on conflict (provider, key_version, subject_hmac) do nothing;

        select player_account_id
        into subject_owner
        from public.player_identities
        where provider = 'facebook'
          and key_version = p_facebook_key_version
          and subject_hmac = p_facebook_subject_hmac;

        if subject_owner is distinct from p_account_id then
            return 'identity_conflict';
        end if;
    end if;

    if current_provider is null then
        update public.player_accounts
        set linked_provider = p_provider
        where id = p_account_id
          and linked_provider is null;
    end if;

    return 'accepted';
end;
$$;

revoke all on function public.claim_player_provider(uuid, text, integer, text) from public;
grant execute on function public.claim_player_provider(uuid, text, integer, text) to service_role;

commit;
