begin;

create or replace function public.claim_player_facebook_provider(
    p_account_id uuid,
    p_facebook_key_version integer,
    p_facebook_subject_hmac text,
    p_previous_key_version integer default null,
    p_previous_subject_hmac text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    current_provider text;
    active_owner uuid;
    previous_owner uuid;
    has_facebook_identity boolean;
    subject_matches boolean := false;
begin
    if p_facebook_key_version is null
        or p_facebook_key_version <= 0
        or coalesce(p_facebook_subject_hmac, '') = '' then
        return 'rejected';
    end if;

    if (p_previous_key_version is null) <> (p_previous_subject_hmac is null)
        or (p_previous_key_version is not null and (
            p_previous_key_version <= 0
            or coalesce(p_previous_subject_hmac, '') = ''
        )) then
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

    if current_provider is not null and current_provider <> 'facebook' then
        return 'provider_conflict';
    end if;

    select player_account_id
    into active_owner
    from public.player_identities
    where provider = 'facebook'
      and key_version = p_facebook_key_version
      and subject_hmac = p_facebook_subject_hmac;

    if found and active_owner is distinct from p_account_id then
        return 'identity_conflict';
    end if;

    if found then
        subject_matches := true;
    end if;

    if p_previous_key_version is not null then
        select player_account_id
        into previous_owner
        from public.player_identities
        where provider = 'facebook'
          and key_version = p_previous_key_version
          and subject_hmac = p_previous_subject_hmac;

        if found and previous_owner is distinct from p_account_id then
            return 'identity_conflict';
        end if;

        if found then
            subject_matches := true;
        end if;
    end if;

    select exists (
        select 1
        from public.player_identities
        where provider = 'facebook'
          and player_account_id = p_account_id
    )
    into has_facebook_identity;

    if has_facebook_identity and not subject_matches then
        return 'identity_conflict';
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
    into active_owner
    from public.player_identities
    where provider = 'facebook'
      and key_version = p_facebook_key_version
      and subject_hmac = p_facebook_subject_hmac;

    if active_owner is distinct from p_account_id then
        return 'identity_conflict';
    end if;

    if current_provider is null then
        update public.player_accounts
        set linked_provider = 'facebook'
        where id = p_account_id
          and linked_provider is null;
    end if;

    return 'accepted';
end;
$$;

revoke all on function public.claim_player_facebook_provider(uuid, integer, text, integer, text) from public;
grant execute on function public.claim_player_facebook_provider(uuid, integer, text, integer, text) to service_role;

commit;
