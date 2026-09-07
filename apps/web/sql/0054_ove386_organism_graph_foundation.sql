-- OVE-386 — the organism graph foundation under the gardener catalog (ADR-0026).
--
-- `catalog_items` becomes the node table of the organism graph: a node has a
-- kind (taxon, cultivar, breed), a rank, a kingdom, a parent and its ancestor
-- path, an identity state, an accepted name, ranking features and the two
-- timestamps the public card and the sitemap read. `catalog_item_names` learns
-- what kind of name each row is. Six narrow tables hold what the flat catalog
-- could not: external identifiers (the crosswalk), relations between nodes,
-- facts with a region, reified source assertions (the provenance of every row
-- above), the curation queue with its append-only actions, slug history and
-- search misses. One immutable SQL function, `catalog_normalize_name`, is the
-- same normalizer the TypeScript and Python halves implement against one shared
-- fixture (`contracts/catalog/normalize-name.fixture.json`).
--
-- Additive and idempotent: every column, constraint, table, index, function
-- and trigger is guarded, and every backfill touches only rows that still look
-- un-backfilled, because `scripts/bootstrap-db.ts` replays every versioned
-- migration on a fresh database. Nothing a gardener or a crawler sees changes:
-- no existing row is deleted, no name is rewritten, `catalog_kind` and `status`
-- stay for the legacy readers until the closeout task (`0061`) retires them.
-- `scripts/prove-organism-graph-foundation.ts` executes this file forward,
-- back and forward again on a fresh bootstrap and fingerprints the loopback
-- database before and after.

-- ======================================================================
-- 1. Nodes: catalog_items
-- ======================================================================

alter table catalog_items
  add column if not exists node_kind text not null default 'taxon',
  add column if not exists rank text,
  add column if not exists kingdom text,
  add column if not exists parent_catalog_item_id uuid,
  add column if not exists ancestor_ids uuid[] not null default '{}'::uuid[],
  add column if not exists identity_state text not null default 'active',
  add column if not exists accepted_name_id uuid,
  add column if not exists search_weight numeric(8,4) not null default 0,
  add column if not exists registered_ua boolean not null default false,
  add column if not exists registered_eu boolean not null default false,
  add column if not exists has_registered_forms boolean not null default false,
  add column if not exists is_host boolean not null default false,
  add column if not exists indexable_override boolean,
  add column if not exists first_hand_content_at timestamptz,
  add column if not exists content_updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_node_kind_check') then
    alter table catalog_items
      add constraint catalog_items_node_kind_check
      check (node_kind in ('taxon','cultivar','breed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_rank_check') then
    alter table catalog_items
      add constraint catalog_items_rank_check
      check (rank in ('kingdom','phylum','class','order','family','subfamily','tribe','genus','subgenus','section','species','subspecies','variety','subvariety','form','unranked','cultivar','cultivar_group','grex','breed','strain'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_kingdom_check') then
    alter table catalog_items
      add constraint catalog_items_kingdom_check
      check (kingdom in ('Plantae','Animalia','Fungi','Bacteria','Viruses','Chromista','Protozoa','Archaea'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_identity_state_check') then
    alter table catalog_items
      add constraint catalog_items_identity_state_check
      check (identity_state in ('active','merged','retired'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_search_weight_check') then
    alter table catalog_items
      add constraint catalog_items_search_weight_check
      check (search_weight >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_parent_fkey') then
    alter table catalog_items
      add constraint catalog_items_parent_fkey
      foreign key (parent_catalog_item_id) references catalog_items(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_parent_not_self_check') then
    alter table catalog_items
      add constraint catalog_items_parent_not_self_check
      check (parent_catalog_item_id is null or parent_catalog_item_id <> id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_accepted_name_fkey') then
    alter table catalog_items
      add constraint catalog_items_accepted_name_fkey
      foreign key (accepted_name_id) references catalog_item_names(id) on delete set null;
  end if;
end $$;

create index if not exists catalog_items_parent_idx
  on catalog_items (parent_catalog_item_id)
  where parent_catalog_item_id is not null;

create index if not exists catalog_items_ancestors_gin_idx
  on catalog_items using gin (ancestor_ids);

create index if not exists catalog_items_identity_kind_idx
  on catalog_items (identity_state, node_kind);

-- ======================================================================
-- 2. Names: catalog_item_names
-- ======================================================================

alter table catalog_item_names
  add column if not exists name_type text not null default 'vernacular',
  add column if not exists script text not null default 'und',
  add column if not exists authorship text,
  add column if not exists assertion_id uuid,
  add column if not exists weight numeric(8,4) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_item_names_name_type_check') then
    alter table catalog_item_names
      add constraint catalog_item_names_name_type_check
      check (name_type in ('scientific_accepted','scientific_synonym','vernacular','denomination','trade_designation'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_item_names_script_check') then
    alter table catalog_item_names
      add constraint catalog_item_names_script_check
      check (char_length(script) between 1 and 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_item_names_authorship_check') then
    alter table catalog_item_names
      add constraint catalog_item_names_authorship_check
      check (authorship is null or char_length(authorship) between 1 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_item_names_weight_check') then
    alter table catalog_item_names
      add constraint catalog_item_names_weight_check
      check (weight >= 0);
  end if;
end $$;

-- Prefix search on the normalized name. The 0043 trigram index on
-- lower(display_name) stays for typo tolerance.
create index if not exists catalog_item_names_normalized_prefix_idx
  on catalog_item_names (normalized_name text_pattern_ops);

-- ======================================================================
-- 3. Assertions: the provenance of every graph row
-- ======================================================================

create table if not exists catalog_source_assertions (
  id uuid primary key default gen_random_uuid(),
  source_slug text not null check (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  source_snapshot_id uuid not null references catalog_source_snapshots(id) on delete restrict,
  source_record_id uuid references catalog_source_records(id) on delete set null,
  observed_at timestamptz not null default now(),
  rights_class text not null default 'source_public'
    check (rights_class in ('source_public','source_only','forbidden','unknown')),
  confidence numeric(5,4) not null default 1
    check (confidence >= 0 and confidence <= 1),
  decision text not null default 'automatic'
    check (decision in ('automatic','curator_accepted','curator_rejected','superseded')),
  decided_by_user_id uuid,
  decided_at timestamptz,
  reason_codes text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

create index if not exists catalog_source_assertions_snapshot_idx
  on catalog_source_assertions (source_snapshot_id);

create index if not exists catalog_source_assertions_record_idx
  on catalog_source_assertions (source_record_id)
  where source_record_id is not null;

-- A source link is the pre-graph provenance row; from now on every link also
-- names the assertion that reifies it, so the two layers cannot drift.
alter table catalog_source_links
  add column if not exists assertion_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_item_names_assertion_fkey') then
    alter table catalog_item_names
      add constraint catalog_item_names_assertion_fkey
      foreign key (assertion_id) references catalog_source_assertions(id) on delete set null;
  end if;
end $$;

-- ======================================================================
-- 4. Identifiers, relations, facts
-- ======================================================================

create table if not exists catalog_item_identifiers (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  scheme text not null
    check (scheme in ('col','gbif','wfo','eppo','wikidata','ipni','powo','ua_register','eu_common_catalogue','vbo','grin')),
  value text not null check (char_length(value) between 1 and 200),
  assertion_id uuid not null references catalog_source_assertions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint catalog_item_identifiers_scheme_value_uidx unique (scheme, value)
);

create index if not exists catalog_item_identifiers_item_idx
  on catalog_item_identifiers (catalog_item_id, scheme);

create table if not exists catalog_item_relations (
  id uuid primary key default gen_random_uuid(),
  from_catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  to_catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  relation_type text not null check (relation_type in ('form_of','pest_of')),
  host_class text
    check (host_class in ('major_host','host','wild_weed_host','incidental','experimental','artificial','unknown')),
  assertion_id uuid not null references catalog_source_assertions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint catalog_item_relations_uidx
    unique (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id),
  constraint catalog_item_relations_not_self_check
    check (from_catalog_item_id <> to_catalog_item_id),
  constraint catalog_item_relations_host_class_scope_check
    check (relation_type = 'pest_of' or host_class is null)
);

create index if not exists catalog_item_relations_to_idx
  on catalog_item_relations (to_catalog_item_id, relation_type);

create index if not exists catalog_item_relations_from_idx
  on catalog_item_relations (from_catalog_item_id, relation_type);

create table if not exists catalog_item_facts (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  predicate text not null
    check (predicate in ('distribution_status','categorization','registration_status')),
  region_code text
    check (region_code is null or region_code ~ '^[A-Z]{2}(?:-[A-Z0-9]{1,3})?$'),
  value text not null check (char_length(value) between 1 and 200),
  value_normalized text check (value_normalized is null or char_length(value_normalized) between 1 and 200),
  qualifiers jsonb not null default '{}'::jsonb check (jsonb_typeof(qualifiers) = 'object'),
  assertion_id uuid not null references catalog_source_assertions(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists catalog_item_facts_uidx
  on catalog_item_facts (catalog_item_id, predicate, coalesce(region_code, ''), value, assertion_id);

create index if not exists catalog_item_facts_item_predicate_idx
  on catalog_item_facts (catalog_item_id, predicate);

-- ======================================================================
-- 5. Slug history
-- ======================================================================

create table if not exists catalog_item_slug_history (
  id uuid primary key default gen_random_uuid(),
  namespace text not null check (namespace in ('species','form')),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  constraint catalog_item_slug_history_namespace_slug_uidx unique (namespace, slug),
  constraint catalog_item_slug_history_validity_check
    check (valid_to is null or valid_to >= valid_from)
);

create index if not exists catalog_item_slug_history_item_idx
  on catalog_item_slug_history (catalog_item_id);

-- ======================================================================
-- 6. Curation queue and its append-only actions
-- ======================================================================

create table if not exists catalog_curation_queue (
  id uuid primary key default gen_random_uuid(),
  item_type text not null
    check (item_type in ('label_link','node_merge','source_link','split_review')),
  subject_catalog_item_id uuid references catalog_items(id) on delete cascade,
  subject_label text check (subject_label is null or char_length(subject_label) between 1 and 120),
  proposal jsonb not null default '{}'::jsonb check (jsonb_typeof(proposal) = 'object'),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reasons text[] not null default array[]::text[],
  impact_score integer not null default 0 check (impact_score >= 0),
  state text not null default 'open'
    check (state in ('open','accepted','rejected','skipped','auto_applied','reverted')),
  decided_by_user_id uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_curation_queue_subject_check
    check (subject_catalog_item_id is not null or subject_label is not null)
);

create index if not exists catalog_curation_queue_open_impact_idx
  on catalog_curation_queue (impact_score desc, created_at asc)
  where state = 'open';

create index if not exists catalog_curation_queue_subject_idx
  on catalog_curation_queue (subject_catalog_item_id)
  where subject_catalog_item_id is not null;

create table if not exists catalog_curation_actions (
  id uuid primary key default gen_random_uuid(),
  action_type text not null
    check (action_type in ('merge','rename','link','unlink','pin_name','set_indexable','promote_label','revert')),
  queue_item_id uuid references catalog_curation_queue(id) on delete set null,
  subject_catalog_item_ids uuid[] not null default '{}'::uuid[],
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  inverse jsonb not null default '{}'::jsonb check (jsonb_typeof(inverse) = 'object'),
  automatic boolean not null default false,
  performed_by_user_id uuid,
  performed_at timestamptz not null default now(),
  reverted_by_action_id uuid references catalog_curation_actions(id) on delete set null,
  constraint catalog_curation_actions_not_self_revert_check
    check (reverted_by_action_id is null or reverted_by_action_id <> id)
);

create index if not exists catalog_curation_actions_performed_idx
  on catalog_curation_actions (performed_at desc);

create index if not exists catalog_curation_actions_queue_item_idx
  on catalog_curation_actions (queue_item_id)
  where queue_item_id is not null;

-- Append-only. The two transitions the model needs are the only updates
-- allowed: marking an action as reverted by a later action, and nulling the
-- performer on erasure. Everything else, and every delete, is refused.
create or replace function catalog_curation_actions_append_only()
returns trigger
language plpgsql
as $$
declare
  old_shape jsonb;
  new_shape jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'catalog_curation_actions is append-only (delete refused)'
      using errcode = 'restrict_violation';
  end if;
  old_shape := to_jsonb(old) - 'reverted_by_action_id' - 'performed_by_user_id';
  new_shape := to_jsonb(new) - 'reverted_by_action_id' - 'performed_by_user_id';
  if old_shape is distinct from new_shape then
    raise exception 'catalog_curation_actions is append-only (update refused)'
      using errcode = 'restrict_violation';
  end if;
  if new.reverted_by_action_id is distinct from old.reverted_by_action_id
     and old.reverted_by_action_id is not null then
    raise exception 'catalog_curation_actions: an action is reverted at most once'
      using errcode = 'restrict_violation';
  end if;
  if new.performed_by_user_id is distinct from old.performed_by_user_id
     and new.performed_by_user_id is not null then
    raise exception 'catalog_curation_actions: the performer can only be erased'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

drop trigger if exists catalog_curation_actions_append_only_trg on catalog_curation_actions;
create trigger catalog_curation_actions_append_only_trg
  before update or delete on catalog_curation_actions
  for each row execute function catalog_curation_actions_append_only();

-- ======================================================================
-- 7. Search misses
-- ======================================================================

create table if not exists catalog_search_misses (
  query_normalized text not null check (char_length(query_normalized) between 1 and 120),
  locale text not null check (char_length(locale) between 1 and 16),
  object_kind text not null check (object_kind in ('plant','animal')),
  occurrences integer not null default 1 check (occurrences > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_catalog_item_id uuid references catalog_items(id) on delete set null,
  primary key (query_normalized, locale, object_kind)
);

create index if not exists catalog_search_misses_unresolved_idx
  on catalog_search_misses (occurrences desc, last_seen_at desc)
  where resolved_catalog_item_id is null;

-- ======================================================================
-- 8. The outbox reason later tasks use to revalidate a card
-- ======================================================================

alter table public_projection_intents
  drop constraint if exists public_projection_intents_reason_check;

alter table public_projection_intents
  add constraint public_projection_intents_reason_check
  check (
    desired_reason in (
      'publish',
      'edit',
      'journal_delete',
      'archive',
      'erasure',
      'moderation',
      'location_change',
      'catalog_identity',
      'media_presentation',
      'profile_visibility',
      'repair',
      'catalog_card'
    )
  );

-- ======================================================================
-- 9. The normalizer, identical in SQL, TypeScript and Python
-- ======================================================================
--
-- Steps, in order (the fixture pins every one of them):
--   1. Unicode NFKC.
--   2. Every Unicode space and every control whitespace becomes an ASCII space.
--   3. Lower case with the builtin Unicode case mapping (pg_c_utf8), which does
--      not depend on the database's own locale.
--   4. Single-character folds through translate(): apostrophe variants to ',
--      double-quote variants to a space, dash variants to -, the hybrid sign to
--      x, Latin letters with diacritics to their base letter, and the Cyrillic
--      folds ё→е, ґ→г, ѐ→е, ѝ→и.
--   5. Multi-character folds: ß→ss, æ→ae, œ→oe, þ→th, ð→d.
--   6. An apostrophe survives only between two non-space characters, so a
--      quoted cultivar name loses its quotes while м'ята keeps its apostrophe.
--   7. Whitespace runs collapse to one space; the result is trimmed.
-- Authorship is not stripped here; that is the scientific-name parser's job in
-- the worker.
create or replace function catalog_normalize_name(input text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          replace(replace(replace(replace(replace(
            translate(
              lower(normalize(input, NFKC) collate pg_c_utf8),
              U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\0009\000A\000D\000C\000B'
                || U&'\2019\2018\02BC\02B9\0060\00B4\2032\201A'
                || U&'\0022\201C\201D\201E\00AB\00BB\2033'
                || U&'\2010\2011\2012\2013\2014\2212'
                || U&'\00D7\2715'
                || U&'\00E0\00E1\00E2\00E3\00E4\00E5\0101\0103\0105'
                || U&'\00E7\0107\0109\010B\010D'
                || U&'\010F\0111'
                || U&'\00E8\00E9\00EA\00EB\0113\0115\0117\0119\011B'
                || U&'\011D\011F\0121\0123'
                || U&'\0125\0127'
                || U&'\00EC\00ED\00EE\00EF\0129\012B\012D\012F\0131'
                || U&'\0135\0137'
                || U&'\013A\013C\013E\0140\0142'
                || U&'\00F1\0144\0146\0148'
                || U&'\00F2\00F3\00F4\00F5\00F6\00F8\014D\014F\0151'
                || U&'\0155\0157\0159'
                || U&'\015B\015D\015F\0161\0219'
                || U&'\0163\0165\0167\021B'
                || U&'\00F9\00FA\00FB\00FC\0169\016B\016D\016F\0171\0173'
                || U&'\0175'
                || U&'\00FD\00FF\0177'
                || U&'\017A\017C\017E'
                || U&'\0451\0491\0450\045D',
              repeat(' ', 23)
                || repeat('''', 8)
                || repeat(' ', 7)
                || '------'
                || 'xx'
                || 'aaaaaaaaa'
                || 'ccccc'
                || 'dd'
                || 'eeeeeeeee'
                || 'gggg'
                || 'hh'
                || 'iiiiiiiii'
                || 'jk'
                || 'lllll'
                || 'nnnn'
                || 'ooooooooo'
                || 'rrr'
                || 'sssss'
                || 'tttt'
                || 'uuuuuuuuuu'
                || 'w'
                || 'yyy'
                || 'zzz'
                || U&'\0435\0433\0435\0438'
            ),
            U&'\00DF', 'ss'), U&'\00E6', 'ae'), U&'\0153', 'oe'), U&'\00FE', 'th'), U&'\00F0', 'd'),
          '(^|[ -])''+', '\1', 'g'),
        '''+([ -]|$)', '\1', 'g'),
      ' +', ' ', 'g')
  )
$$;

-- ======================================================================
-- 10. Backfill: the existing catalog, expressed as graph rows
-- ======================================================================

-- 10a. Node kind and rank from the legacy catalog kind.
--
-- Keep bootstrap repeatable: migration 0061 (OVE-399) drops `catalog_kind`
-- once the graph owns the answer, and a replay reaches this backfill with the
-- column already gone. There is nothing left to backfill from at that point —
-- `node_kind` is already the truth.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalog_items'
      and column_name = 'catalog_kind'
  ) then
    update catalog_items
    set node_kind = case catalog_kind
          when 'species' then 'taxon'
          when 'plant_variety' then 'cultivar'
          when 'breed' then 'breed'
        end
    where node_kind = 'taxon'
      and catalog_kind in ('plant_variety', 'breed');
  end if;
end $$;

update catalog_items
set rank = case node_kind
      when 'taxon' then 'species'
      when 'cultivar' then 'cultivar'
      when 'breed' then 'breed'
    end
where rank is null;

-- 10b. Kingdom where the legacy shape already implies it.
update catalog_items
set kingdom = 'Plantae'
where kingdom is null
  and (node_kind = 'cultivar' or source = 'species_backbone');

update catalog_items
set kingdom = 'Animalia'
where kingdom is null
  and node_kind = 'breed';

-- 10c. Identity state from the legacy status.
--
-- Keep bootstrap repeatable: migration 0061 (OVE-399) drops `status` once
-- `identity_state` owns the answer, and a replay reaches this backfill with
-- the column already gone. Nothing is left to translate at that point.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalog_items'
      and column_name = 'status'
  ) then
    update catalog_items
    set identity_state = case status
          when 'merged' then 'merged'
          when 'rejected' then 'retired'
        end
    where identity_state = 'active'
      and status in ('merged', 'rejected');
  end if;
end $$;

-- 10d. First-hand content: the newest live public entry on a linked object.
update catalog_items as item
set first_hand_content_at = latest.at
from (
  select object.catalog_item_id, max(coalesce(entry.published_at, entry.created_at)) as at
  from journal_entries as entry
  join plant_objects as object on object.id = entry.plant_object_id
  where object.catalog_item_id is not null
    and entry.deleted_at is null
    and entry.lifecycle_state = 'active'
    and entry.visibility = 'public'
  group by object.catalog_item_id
) as latest
where latest.catalog_item_id = item.id
  and item.first_hand_content_at is null;

-- 10e. Name types from the alias review ledger, denominations for forms,
--      scripts from locales.
update catalog_item_names as name
set name_type = case projection.alias_kind
      when 'accepted_scientific_name' then 'scientific_accepted'
      when 'synonym' then 'scientific_synonym'
    end
from catalog_alias_projections as projection
where projection.catalog_item_name_id = name.id
  and projection.alias_kind in ('accepted_scientific_name', 'synonym')
  and name.name_type = 'vernacular';

update catalog_item_names as name
set name_type = 'denomination'
from catalog_items as item
where item.id = name.catalog_item_id
  and item.node_kind in ('cultivar', 'breed')
  and name.is_primary
  and name.name_type = 'vernacular';

update catalog_item_names
set script = 'Cyrl'
where script = 'und'
  and locale in ('uk', 'bg', 'ru');

update catalog_item_names
set script = 'Latn'
where script = 'und'
  and locale in ('la', 'en', 'de', 'fr', 'pl', 'it', 'es', 'nl', 'pt', 'ro', 'cs', 'sk', 'hu');

-- 10f. Accepted name: the scientific accepted name when there is one, else the
--      primary name, else the oldest name.
update catalog_items as item
set accepted_name_id = chosen.id
from (
  select distinct on (name.catalog_item_id) name.catalog_item_id, name.id
  from catalog_item_names as name
  order by name.catalog_item_id,
           (name.name_type = 'scientific_accepted') desc,
           name.is_primary desc,
           name.created_at asc,
           name.id asc
) as chosen
where chosen.catalog_item_id = item.id
  and item.accepted_name_id is null;

-- 10g. One assertion per existing source link. The link keeps the assertion id
--      so a replay of this file finds nothing left to reify.
update catalog_source_links
set assertion_id = gen_random_uuid()
where assertion_id is null;

insert into catalog_source_assertions (
  id, source_slug, source_snapshot_id, source_record_id, observed_at,
  rights_class, confidence, decision, reason_codes, created_at
)
select
  link.assertion_id,
  link.source_slug,
  record.source_snapshot_id,
  record.id,
  link.created_at,
  'source_public',
  1,
  'automatic',
  array['legacy_source_link']::text[],
  link.created_at
from catalog_source_links as link
join catalog_source_records as record on record.id = link.source_record_id
where link.assertion_id is not null
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_source_links_assertion_fkey') then
    alter table catalog_source_links
      add constraint catalog_source_links_assertion_fkey
      foreign key (assertion_id) references catalog_source_assertions(id) on delete set null;
  end if;
end $$;

-- 10h. Identifiers from the projections the imports already carried.
insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
select distinct on (mapped.scheme, mapped.value)
  mapped.catalog_item_id, mapped.scheme, mapped.value, mapped.assertion_id
from (
  select
    link.catalog_item_id,
    link.assertion_id,
    ids.scheme,
    ids.value
  from catalog_source_links as link
  join catalog_source_records as record on record.id = link.source_record_id
  join catalog_source_snapshots as snapshot on snapshot.id = record.source_snapshot_id
  cross join lateral (
    select 'col' as scheme, record.allowed_projection #>> '{sourceIds,colId}' as value
    union all select 'wfo', record.allowed_projection #>> '{sourceIds,wfoId}'
    union all select 'eppo', record.allowed_projection #>> '{sourceIds,eppoCode}'
    union all select 'wikidata', record.allowed_projection #>> '{sourceIds,wikidataId}'
    union all select 'gbif', record.allowed_projection #>> '{sourceIds,gbifTaxonKey}'
    union all select 'vbo', record.allowed_projection #>> '{sourceIds,vboId}'
    union all select 'ua_register',
      case when snapshot.source_slug = 'ua-state-register' then record.source_record_id end
    union all select 'eu_common_catalogue',
      case when snapshot.source_slug = 'eu-oj-eur-lex-common-catalogue' then record.source_record_id end
    union all select 'grin',
      case when snapshot.source_slug = 'grin-global' then record.source_record_id end
  ) as ids
  where link.assertion_id is not null
    and link.projection_kind = 'canonical_item'
    and ids.value is not null
    and char_length(ids.value) between 1 and 200
) as mapped
order by mapped.scheme, mapped.value, mapped.catalog_item_id
on conflict (scheme, value) do nothing;

-- 10i. Slug history from today's public slugs.
insert into catalog_item_slug_history (namespace, slug, catalog_item_id, valid_from)
select
  case when node_kind = 'taxon' then 'species' else 'form' end,
  public_slug,
  id,
  created_at
from catalog_items
where public_slug is not null
on conflict (namespace, slug) do nothing;

-- ======================================================================
-- 11. Triggers that keep the graph honest from here on
-- ======================================================================

-- A form (cultivar, breed) attaches to a taxon; a pest relation joins two taxa.
create or replace function catalog_item_relations_enforce_kinds()
returns trigger
language plpgsql
as $$
declare
  from_kind text;
  to_kind text;
begin
  select node_kind into from_kind from catalog_items where id = new.from_catalog_item_id;
  select node_kind into to_kind from catalog_items where id = new.to_catalog_item_id;
  if new.relation_type = 'form_of' then
    if from_kind not in ('cultivar', 'breed') or to_kind <> 'taxon' then
      raise exception 'form_of joins a cultivar or breed to a taxon (got % -> %)', from_kind, to_kind
        using errcode = 'check_violation';
    end if;
  elsif new.relation_type = 'pest_of' then
    if from_kind <> 'taxon' or to_kind <> 'taxon' then
      raise exception 'pest_of joins two taxa (got % -> %)', from_kind, to_kind
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists catalog_item_relations_enforce_kinds_trg on catalog_item_relations;
create trigger catalog_item_relations_enforce_kinds_trg
  before insert or update on catalog_item_relations
  for each row execute function catalog_item_relations_enforce_kinds();

-- content_updated_at is the card's dateModified and the sitemap's lastmod.
create or replace function catalog_touch_item_content()
returns trigger
language plpgsql
as $$
declare
  touched uuid[];
begin
  if tg_table_name = 'catalog_item_relations' then
    if tg_op = 'DELETE' then
      touched := array[old.from_catalog_item_id, old.to_catalog_item_id];
    elsif tg_op = 'INSERT' then
      touched := array[new.from_catalog_item_id, new.to_catalog_item_id];
    else
      touched := array[old.from_catalog_item_id, old.to_catalog_item_id,
                       new.from_catalog_item_id, new.to_catalog_item_id];
    end if;
  else
    if tg_op = 'DELETE' then
      touched := array[old.catalog_item_id];
    elsif tg_op = 'INSERT' then
      touched := array[new.catalog_item_id];
    else
      touched := array[old.catalog_item_id, new.catalog_item_id];
    end if;
  end if;
  update catalog_items
  set content_updated_at = now()
  where id = any (touched)
    and content_updated_at < now();
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists catalog_item_names_touch_content_trg on catalog_item_names;
create trigger catalog_item_names_touch_content_trg
  after insert or update or delete on catalog_item_names
  for each row execute function catalog_touch_item_content();

drop trigger if exists catalog_item_identifiers_touch_content_trg on catalog_item_identifiers;
create trigger catalog_item_identifiers_touch_content_trg
  after insert or update or delete on catalog_item_identifiers
  for each row execute function catalog_touch_item_content();

drop trigger if exists catalog_item_relations_touch_content_trg on catalog_item_relations;
create trigger catalog_item_relations_touch_content_trg
  after insert or update or delete on catalog_item_relations
  for each row execute function catalog_touch_item_content();

drop trigger if exists catalog_item_facts_touch_content_trg on catalog_item_facts;
create trigger catalog_item_facts_touch_content_trg
  after insert or update or delete on catalog_item_facts
  for each row execute function catalog_touch_item_content();

-- Every slug a node ever had answers a permanent redirect: assigning a slug
-- writes history, and a slug that moves to another node (a merge) follows it.
create or replace function catalog_item_slug_history_sync()
returns trigger
language plpgsql
as $$
declare
  new_namespace text;
  old_namespace text;
begin
  new_namespace := case when new.node_kind = 'taxon' then 'species' else 'form' end;
  if tg_op = 'UPDATE' then
    old_namespace := case when old.node_kind = 'taxon' then 'species' else 'form' end;
    if old.public_slug is not null
       and (old.public_slug is distinct from new.public_slug
            or old_namespace is distinct from new_namespace) then
      update catalog_item_slug_history
      set valid_to = now()
      where namespace = old_namespace
        and slug = old.public_slug
        and catalog_item_id = old.id
        and valid_to is null;
    end if;
  end if;
  if new.public_slug is not null then
    insert into catalog_item_slug_history (namespace, slug, catalog_item_id, valid_from, valid_to)
    values (new_namespace, new.public_slug, new.id, now(), null)
    on conflict (namespace, slug) do update
      set catalog_item_id = excluded.catalog_item_id,
          valid_from = case
            when catalog_item_slug_history.catalog_item_id = excluded.catalog_item_id
            then catalog_item_slug_history.valid_from
            else now()
          end,
          valid_to = null;
  end if;
  return new;
end $$;

drop trigger if exists catalog_item_slug_history_sync_trg on catalog_items;
create trigger catalog_item_slug_history_sync_trg
  after insert or update of public_slug, node_kind on catalog_items
  for each row execute function catalog_item_slug_history_sync();
