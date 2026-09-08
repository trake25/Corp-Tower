-- Top or Drop persistent foundation contract alignment.
-- Prerequisite: 0005_persistent_foundation.sql has already been applied.
-- Apply manually in the Supabase SQL Editor. This corrective migration preserves
-- all existing rows and leaves the applied 0005 migration immutable.

begin;

do $$
declare
    incompatible_columns text;
begin
    if to_regclass('public.trios') is null
       or to_regclass('public.game_runs') is null
       or to_regclass('public.item_catalog') is null
       or to_regclass('public.account_items') is null
       or to_regclass('public.economy_events') is null
       or to_regclass('public.content_rotations') is null then
        raise exception '0006 requires the persistent foundation tables from migration 0005';
    end if;

    select string_agg(expected.table_name || '.' || expected.column_name, ', ')
    into incompatible_columns
    from (
        values
            ('trios', 'last_played_at', 'timestamptz'::regtype, false),
            ('game_runs', 'result', 'text'::regtype, true),
            ('game_runs', 'build_version', 'text'::regtype, true),
            ('item_catalog', 'rarity', 'text'::regtype, true),
            ('account_items', 'source_key', 'text'::regtype, true),
            ('account_items', 'source_event_id', 'uuid'::regtype, false),
            ('economy_events', 'id', 'uuid'::regtype, true),
            ('content_rotations', 'ends_at', 'timestamptz'::regtype, true)
    ) as expected(table_name, column_name, type_oid, required)
    join pg_catalog.pg_namespace namespace
        on namespace.nspname = 'public'
    join pg_catalog.pg_class relation
        on relation.relnamespace = namespace.oid
       and relation.relname = expected.table_name
    left join pg_catalog.pg_attribute attribute
        on attribute.attrelid = relation.oid
       and attribute.attname = expected.column_name
       and attribute.attnum > 0
       and not attribute.attisdropped
    where (expected.required and attribute.attnum is null)
       or (attribute.attnum is not null and attribute.atttypid <> expected.type_oid);

    if incompatible_columns is not null then
        raise exception '0006 found missing or incompatible foundation columns: %', incompatible_columns;
    end if;
end;
$$;

alter table public.trios
    add column if not exists last_played_at timestamptz;

-- Prevent a concurrent run insert from introducing a new NULL between the
-- backfill and the NOT NULL constraint validation.
lock table public.game_runs in share row exclusive mode;

update public.game_runs
set result = 'in_progress'
where result is null;

alter table public.game_runs
    alter column result set default 'in_progress',
    alter column result set not null,
    alter column build_version drop not null;

alter table public.item_catalog
    alter column rarity drop not null;

alter table public.account_items
    add column if not exists source_event_id uuid;

do $$
declare
    source_event_attnum smallint;
    economy_event_id_attnum smallint;
    source_fk_count integer;
    matching_fk_count integer;
    matching_fk_name text;
    matching_fk_validated boolean;
begin
    select attribute.attnum::smallint
    into source_event_attnum
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.account_items'::regclass
      and attribute.attname = 'source_event_id'
      and attribute.attnum > 0
      and not attribute.attisdropped;

    select attribute.attnum::smallint
    into economy_event_id_attnum
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.economy_events'::regclass
      and attribute.attname = 'id'
      and attribute.attnum > 0
      and not attribute.attisdropped;

    select count(*)
    into source_fk_count
    from pg_catalog.pg_constraint constraint_definition
    where constraint_definition.conrelid = 'public.account_items'::regclass
      and constraint_definition.contype = 'f'
      and source_event_attnum = any (constraint_definition.conkey);

    select
        count(*),
        min(constraint_definition.conname::text),
        bool_and(constraint_definition.convalidated)
    into matching_fk_count, matching_fk_name, matching_fk_validated
    from pg_catalog.pg_constraint constraint_definition
    where constraint_definition.conrelid = 'public.account_items'::regclass
      and constraint_definition.contype = 'f'
      and constraint_definition.conkey = array[source_event_attnum]::smallint[]
      and constraint_definition.confrelid = 'public.economy_events'::regclass
      and constraint_definition.confkey = array[economy_event_id_attnum]::smallint[]
      and constraint_definition.confdeltype = 'r';

    if exists (
        select 1
        from pg_catalog.pg_constraint constraint_definition
        where constraint_definition.conrelid = 'public.account_items'::regclass
          and constraint_definition.conname = 'account_items_source_event_id_fkey'
          and not (
              constraint_definition.contype = 'f'
              and constraint_definition.conkey = array[source_event_attnum]::smallint[]
              and constraint_definition.confrelid = 'public.economy_events'::regclass
              and constraint_definition.confkey = array[economy_event_id_attnum]::smallint[]
              and constraint_definition.confdeltype = 'r'
          )
    ) then
        raise exception '0006 found an incompatible account_items_source_event_id_fkey definition';
    end if;

    if source_fk_count <> matching_fk_count or matching_fk_count > 1 then
        raise exception '0006 found an incompatible or duplicate source_event_id foreign key';
    end if;

    if matching_fk_count = 0 then
        alter table public.account_items
            add constraint account_items_source_event_id_fkey
            foreign key (source_event_id)
            references public.economy_events (id)
            on delete restrict;
    elsif not matching_fk_validated then
        execute format(
            'alter table public.account_items validate constraint %I',
            matching_fk_name
        );
    end if;
end;
$$;

-- This pointer is optional provenance for the current aggregate ownership row;
-- complete multi-acquisition history remains a future inventory-ledger concern.
create index if not exists account_items_source_event_id_idx
    on public.account_items (source_event_id)
    where source_event_id is not null;

do $$
declare
    source_event_attnum smallint;
begin
    select attribute.attnum::smallint
    into source_event_attnum
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.account_items'::regclass
      and attribute.attname = 'source_event_id'
      and attribute.attnum > 0
      and not attribute.attisdropped;

    if not exists (
        select 1
        from pg_catalog.pg_index index_definition
        where index_definition.indexrelid = 'public.account_items_source_event_id_idx'::regclass
          and index_definition.indrelid = 'public.account_items'::regclass
          and index_definition.indisvalid
          and index_definition.indisready
          and not index_definition.indisunique
          and index_definition.indnkeyatts = 1
          and index_definition.indkey[0] = source_event_attnum
          and pg_catalog.pg_get_expr(
              index_definition.indpred,
              index_definition.indrelid
          ) in ('(source_event_id IS NOT NULL)', 'source_event_id IS NOT NULL')
    ) then
        raise exception '0006 found an incompatible account_items_source_event_id_idx definition';
    end if;
end;
$$;

alter table public.account_items
    alter column source_key drop not null;

alter table public.content_rotations
    alter column ends_at drop not null;

commit;
