-- OVE-392 (ADR-0026 D2, D7): the Catalogue of Life checklist in the source
-- layer, verbatim.
--
-- Catalogue of Life is the classification and accepted-name backbone.
-- OverGarden authors no tree of its own: it keeps the release as source
-- usages, materializes canonical nodes only for what gardeners, registers and
-- EPPO touch, and reaches everything else through the picker's secondary
-- "search the full catalogue" path.
--
-- The release runs to millions of usages, so these tables are addressed by
-- `(source_snapshot_id, col_id)` and pruned to the two newest snapshots: one
-- to serve, one to diff against.

create table if not exists catalog_source_col_usages (
  source_snapshot_id uuid not null
    references catalog_source_snapshots(id) on delete cascade,
  col_id text not null check (char_length(col_id) between 1 and 64),
  parent_col_id text
    check (parent_col_id is null or char_length(parent_col_id) between 1 and 64),
  rank text check (rank is null or char_length(rank) between 1 and 40),
  -- The ColDP TaxonomicStatus vocabulary, lower-cased and underscored as the
  -- archive writes it. A value outside it is a parser defect, not data.
  status text not null check (
    status in (
      'accepted',
      'provisionally_accepted',
      'synonym',
      'ambiguous_synonym',
      'misapplied',
      'bare_name'
    )
  ),
  scientific_name text not null
    check (char_length(scientific_name) between 1 and 500),
  authorship text check (authorship is null or char_length(authorship) <= 500),
  canonical_name text not null
    check (char_length(canonical_name) between 1 and 500),
  kingdom text check (kingdom is null or char_length(kingdom) between 1 and 80),
  -- One normalizer, the same one the picker and the ladder use (0054).
  normalized_name text generated always as (
    catalog_normalize_name(canonical_name)
  ) stored,
  -- OverGarden's own nodes are often named with their authority ("Solanum
  -- lycopersicum L."), which Catalogue of Life keeps in a column of its own.
  -- Both spellings are stored normalized so a node matches on either through
  -- an index; computing this at query time turns one match into a sequential
  -- scan of five million rows (measured: 0.6 s per node).
  normalized_scientific_name text generated always as (
    catalog_normalize_name(scientific_name)
  ) stored,
  constraint catalog_source_col_usages_pkey
    primary key (source_snapshot_id, col_id)
);

-- A database that already holds the table gains the column in place.
alter table catalog_source_col_usages
  add column if not exists normalized_scientific_name text
  generated always as (catalog_normalize_name(scientific_name)) stored;

create index if not exists catalog_source_col_usages_scientific_idx
  on catalog_source_col_usages (source_snapshot_id, normalized_scientific_name);

-- Prefix search for the secondary path, and fuzzy search for the ladder.
create index if not exists catalog_source_col_usages_normalized_prefix_idx
  on catalog_source_col_usages (source_snapshot_id, normalized_name text_pattern_ops);

create index if not exists catalog_source_col_usages_normalized_trgm_idx
  on catalog_source_col_usages using gin (normalized_name gin_trgm_ops);

-- Walking a usage up to its ancestors, and reading a whole branch.
create index if not exists catalog_source_col_usages_parent_idx
  on catalog_source_col_usages (source_snapshot_id, parent_col_id)
  where parent_col_id is not null;

create index if not exists catalog_source_col_usages_accepted_idx
  on catalog_source_col_usages (source_snapshot_id, status)
  where status in ('accepted', 'provisionally_accepted');

create table if not exists catalog_source_col_vernaculars (
  id uuid primary key default gen_random_uuid(),
  source_snapshot_id uuid not null
    references catalog_source_snapshots(id) on delete cascade,
  col_id text not null check (char_length(col_id) between 1 and 64),
  name text not null check (char_length(name) between 1 and 300),
  -- ColDP writes ISO 639-3; a row without one is kept and filtered later.
  language text check (language is null or char_length(language) between 2 and 12),
  normalized_name text generated always as (catalog_normalize_name(name)) stored
);

create unique index if not exists catalog_source_col_vernaculars_uidx
  on catalog_source_col_vernaculars (
    source_snapshot_id, col_id, coalesce(language, ''), normalized_name
  );

create index if not exists catalog_source_col_vernaculars_lookup_idx
  on catalog_source_col_vernaculars (source_snapshot_id, col_id);

/**
 * Keeps the two newest Catalogue of Life snapshots and drops the rest.
 *
 * Two, not one: the refresh diff of ADR-0026 D4 compares the new release with
 * the one it replaces, and the secondary search path reads the newest. The
 * usages and vernaculars go with their snapshot through the cascade, so this
 * function names only the snapshots. Snapshots that another table still
 * references (an assertion, a record) are kept: a source row that a node's
 * evidence points at is not disposable.
 */
create or replace function catalog_col_prune_snapshots(keep integer default 2)
returns integer
language plpgsql
as $$
declare
  removed integer := 0;
begin
  if keep < 1 then
    raise exception 'catalog_col_prune_snapshots: keep must be at least 1'
      using errcode = 'invalid_parameter_value';
  end if;

  -- A refresh event is bookkeeping about a comparison that has already been
  -- applied to the graph, and its foreign keys are `restrict`: leaving them
  -- in place would pin every release forever. The event for the window being
  -- kept survives; the ones about releases leaving do not.
  delete from catalog_source_refresh_events as event
  where event.source_slug = 'catalogue-of-life-checklistbank'
    and exists (
      select 1
      from (
        select
          snapshot.id,
          row_number() over (order by snapshot.fetched_at desc, snapshot.id) as position
        from catalog_source_snapshots as snapshot
        where snapshot.source_slug = 'catalogue-of-life-checklistbank'
      ) as ranked
      where ranked.position > keep
        and (event.previous_snapshot_id = ranked.id
             or event.refreshed_snapshot_id = ranked.id)
    );

  with ranked as (
    select
      snapshot.id,
      row_number() over (order by snapshot.fetched_at desc, snapshot.id) as position
    from catalog_source_snapshots as snapshot
    where snapshot.source_slug = 'catalogue-of-life-checklistbank'
  ),
  deletable as (
    select ranked.id
    from ranked
    where ranked.position > keep
      and not exists (
        select 1 from catalog_source_assertions as assertion
        where assertion.source_snapshot_id = ranked.id
      )
      and not exists (
        select 1 from catalog_source_records as record
        where record.source_snapshot_id = ranked.id
      )
      and not exists (
        select 1 from catalog_source_refresh_events as event
        where event.previous_snapshot_id = ranked.id
           or event.refreshed_snapshot_id = ranked.id
      )
  ),
  deleted as (
    delete from catalog_source_snapshots
    where id in (select id from deletable)
    returning id
  )
  select count(*)::int into removed from deleted;

  return removed;
end;
$$;

/**
 * The newest Catalogue of Life snapshot, or null before the first ingest.
 * Every read of the checklist goes through this, so "newest" is defined once.
 */
create or replace function catalog_col_current_snapshot()
returns uuid
language sql
stable
as $$
  select snapshot.id
  from catalog_source_snapshots as snapshot
  where snapshot.source_slug = 'catalogue-of-life-checklistbank'
    and snapshot.status = 'imported'
  order by snapshot.fetched_at desc, snapshot.id
  limit 1
$$;

comment on table catalog_source_col_usages is
  'Catalogue of Life name usages, verbatim per release (OVE-392, ADR-0026 D2).';
comment on table catalog_source_col_vernaculars is
  'Catalogue of Life vernacular names per release (OVE-392).';

-- ======================================================================
-- Materialization: canonical nodes from the checklist
-- ======================================================================

/**
 * A ColDP rank in the closed set `catalog_items_rank_check` allows.
 *
 * Catalogue of Life carries fifty-five ranks; OverGarden's node table holds
 * twenty-one. A rank outside the set is not invented and not dropped: it
 * becomes `unranked`, which is what the card and the picker already show for
 * a node whose rank nobody has decided.
 */
create or replace function catalog_col_rank(input text)
returns text
language sql
immutable
parallel safe
as $$
  select case lower(coalesce(input, ''))
    when 'kingdom' then 'kingdom'
    when 'phylum' then 'phylum'
    when 'division' then 'phylum'
    when 'class' then 'class'
    when 'order' then 'order'
    when 'family' then 'family'
    when 'subfamily' then 'subfamily'
    when 'tribe' then 'tribe'
    when 'genus' then 'genus'
    when 'subgenus' then 'subgenus'
    when 'section' then 'section'
    when 'species' then 'species'
    when 'subspecies' then 'subspecies'
    when 'variety' then 'variety'
    when 'subvariety' then 'subvariety'
    when 'form' then 'form'
    when 'cultivar' then 'cultivar'
    when 'cultivar group' then 'cultivar_group'
    when 'grex' then 'grex'
    when 'strain' then 'strain'
    else 'unranked'
  end
$$;

/** A scientific name as an address segment: the normalizer, then hyphens. */
create or replace function catalog_col_slug(input text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(lower(catalog_normalize_name(input)), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      ),
      '-'
    ),
    ''
  )
$$;

/** The first free slug in a namespace, `-2`, `-3` … after a collision. */
create or replace function catalog_col_free_slug(base text)
returns text
language plpgsql
as $$
declare
  candidate text := base;
  suffix integer := 1;
begin
  if base is null then
    return null;
  end if;
  loop
    exit when not exists (
      select 1 from catalog_items where public_slug = candidate
      union all
      select 1 from catalog_item_slug_history where slug = candidate
    );
    suffix := suffix + 1;
    candidate := base || '-' || suffix::text;
    exit when suffix > 50;
  end loop;
  return candidate;
end;
$$;

/**
 * Ensures the node for one Catalogue of Life usage exists, with its ancestors.
 *
 * Idempotent through the `(scheme, value)` uniqueness of
 * `catalog_item_identifiers`: a usage already materialized returns its node
 * and writes nothing. Ancestors are created as `taxon` nodes, and only a
 * species or a rank below it gets an address — a family is a node in the
 * graph, not a page.
 *
 * A synonym never becomes a node of its own: it resolves to the accepted
 * usage it hangs under and adds its name there (ADR-0026 D2).
 */
create or replace function catalog_col_ensure_node(
  p_col_id text,
  p_assertion uuid,
  p_depth integer default 0
)
returns uuid
language plpgsql
as $$
declare
  snapshot uuid := catalog_col_current_snapshot();
  usage catalog_source_col_usages%rowtype;
  existing uuid;
  parent uuid;
  parent_ancestors uuid[];
  node uuid;
  node_rank text;
  slug text;
begin
  if snapshot is null then
    raise exception 'catalog_col_ensure_node: no Catalogue of Life snapshot'
      using errcode = 'no_data_found';
  end if;
  if p_depth > 40 then
    raise exception 'catalog_col_ensure_node: classification deeper than 40'
      using errcode = 'program_limit_exceeded';
  end if;

  select * into usage
  from catalog_source_col_usages
  where source_snapshot_id = snapshot and col_id = p_col_id;
  if not found then
    raise exception 'catalog_col_ensure_node: unknown usage %', p_col_id
      using errcode = 'no_data_found';
  end if;

  -- A synonym is a name on the accepted node, never a node.
  if usage.status in ('synonym', 'ambiguous_synonym', 'misapplied') then
    if usage.parent_col_id is null
       or not exists (
         select 1 from catalog_source_col_usages as accepted
         where accepted.source_snapshot_id = snapshot
           and accepted.col_id = usage.parent_col_id
       ) then
      raise exception 'catalog_col_ensure_node: synonym % has no accepted usage in this snapshot', p_col_id
        using errcode = 'invalid_parameter_value';
    end if;
    node := catalog_col_ensure_node(usage.parent_col_id, p_assertion, p_depth + 1);
    insert into catalog_item_names (
      catalog_item_id, display_name, normalized_name, locale, script,
      is_primary, name_type, authorship, assertion_id, weight
    )
    values (
      node, left(usage.canonical_name, 120),
      catalog_normalize_name(left(usage.canonical_name, 120)),
      'la', 'latin', false, 'scientific_synonym',
      left(usage.authorship, 200), p_assertion, 1
    )
    on conflict do nothing;
    return node;
  end if;

  select identifier.catalog_item_id into existing
  from catalog_item_identifiers as identifier
  where identifier.scheme = 'col' and identifier.value = p_col_id;
  if existing is not null then
    return existing;
  end if;

  -- A scoped snapshot holds a branch, not the whole tree: production keeps
  -- the plant kingdoms, whose chain runs up into rows above kingdom that
  -- carry no kingdom of their own and are therefore not in it. A parent the
  -- snapshot does not have ends the chain here rather than failing the run.
  if usage.parent_col_id is not null
     and exists (
       select 1 from catalog_source_col_usages as ancestor
       where ancestor.source_snapshot_id = snapshot
         and ancestor.col_id = usage.parent_col_id
     ) then
    parent := catalog_col_ensure_node(usage.parent_col_id, p_assertion, p_depth + 1);
    select ancestor_ids into parent_ancestors from catalog_items where id = parent;
  end if;

  node_rank := catalog_col_rank(usage.rank);
  if node_rank in ('species', 'subspecies', 'variety', 'subvariety', 'form') then
    slug := catalog_col_free_slug(catalog_col_slug(usage.canonical_name));
  end if;

  insert into catalog_items (
    canonical_name, catalog_kind, normalized_name, public_slug, status, source,
    source_id, locale, node_kind, kingdom, rank, identity_state,
    parent_catalog_item_id, ancestor_ids
  )
  values (
    left(usage.canonical_name, 120), 'species',
    catalog_normalize_name(left(usage.canonical_name, 120)), slug, 'seeded',
    'species_backbone', 'catalogue-of-life-checklistbank:' || p_col_id, 'la',
    'taxon', usage.kingdom, node_rank, 'active',
    parent,
    case
      when parent is null then '{}'::uuid[]
      else coalesce(parent_ancestors, '{}'::uuid[]) || array[parent]
    end
  )
  returning id into node;

  insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
  values (node, 'col', p_col_id, p_assertion)
  on conflict (scheme, value) do nothing;

  insert into catalog_item_names (
    catalog_item_id, display_name, normalized_name, locale, script,
    is_primary, name_type, authorship, assertion_id, weight
  )
  values (
    node, left(usage.canonical_name, 120),
    catalog_normalize_name(left(usage.canonical_name, 120)),
    'la', 'latin', true, 'scientific_accepted',
    left(usage.authorship, 200), p_assertion, 5
  )
  on conflict do nothing;

  return node;
end;
$$;

/**
 * The picker's create-on-pick path (ADR-0026 D7): a gardener chooses a usage
 * from the full checklist and the node exists from that moment, with its
 * ancestors, its Catalogue of Life identifier and its accepted name.
 */
create or replace function catalog_col_materialize(p_col_id text)
returns uuid
language plpgsql
as $$
declare
  snapshot uuid := catalog_col_current_snapshot();
  assertion uuid;
  node uuid;
begin
  if snapshot is null then
    raise exception 'catalog_col_materialize: no Catalogue of Life snapshot'
      using errcode = 'no_data_found';
  end if;
  insert into catalog_source_assertions (
    source_slug, source_snapshot_id, rights_class, confidence, decision, reason_codes
  )
  values (
    'catalogue-of-life-checklistbank', snapshot, 'source_public', 1, 'automatic',
    array['col_materialize']
  )
  returning id into assertion;

  node := catalog_col_ensure_node(p_col_id, assertion, 0);

  -- An assertion nothing points at is noise, not evidence.
  delete from catalog_source_assertions as unused
  where unused.id = assertion
    and not exists (
      select 1 from catalog_item_identifiers where assertion_id = unused.id
    )
    and not exists (
      select 1 from catalog_item_names where assertion_id = unused.id
    );

  return node;
end;
$$;

/**
 * Attaches one existing node to a Catalogue of Life usage: the identifier, the
 * classification (parent, rank, kingdom, ancestors) and the accepted name.
 *
 * The node keeps its identity — its slug, its gardener objects, its
 * first-hand clock. What it gains is the backbone's place for it.
 */
create or replace function catalog_col_attach_node(
  p_item uuid,
  p_col_id text,
  p_assertion uuid
)
returns void
language plpgsql
as $$
declare
  snapshot uuid := catalog_col_current_snapshot();
  usage catalog_source_col_usages%rowtype;
  parent uuid;
  parent_ancestors uuid[];
begin
  select * into usage
  from catalog_source_col_usages
  where source_snapshot_id = snapshot and col_id = p_col_id;
  if not found then
    raise exception 'catalog_col_attach_node: unknown usage %', p_col_id
      using errcode = 'no_data_found';
  end if;

  insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
  values (p_item, 'col', p_col_id, p_assertion)
  on conflict (scheme, value) do nothing;

  -- A synonym describes a name, not a place in the tree. A node that carries
  -- a synonym's identifier — a merge moves the loser's identifiers onto the
  -- survivor — would otherwise be re-parented to the accepted usage, which is
  -- itself, and `catalog_items_parent_not_self_check` refuses exactly that.
  if usage.status in ('synonym', 'ambiguous_synonym', 'misapplied') then
    return;
  end if;

  if usage.parent_col_id is not null
     and exists (
       select 1 from catalog_source_col_usages as ancestor
       where ancestor.source_snapshot_id = snapshot
         and ancestor.col_id = usage.parent_col_id
     ) then
    parent := catalog_col_ensure_node(usage.parent_col_id, p_assertion, 0);
    if parent = p_item then
      parent := null;
    end if;
    select ancestor_ids into parent_ancestors from catalog_items where id = parent;
  end if;

  update catalog_items
  set parent_catalog_item_id = coalesce(parent, parent_catalog_item_id),
      rank = coalesce(catalog_col_rank(usage.rank), rank),
      kingdom = coalesce(usage.kingdom, kingdom),
      ancestor_ids = case
        when parent is null then ancestor_ids
        else coalesce(parent_ancestors, '{}'::uuid[]) || array[parent]
      end,
      content_updated_at = now(),
      updated_at = now()
  where id = p_item;

  insert into catalog_item_names (
    catalog_item_id, display_name, normalized_name, locale, script,
    is_primary, name_type, authorship, assertion_id, weight
  )
  values (
    p_item, left(usage.canonical_name, 120),
    catalog_normalize_name(left(usage.canonical_name, 120)),
    'la', 'latin', false, 'scientific_accepted',
    left(usage.authorship, 200), p_assertion, 4
  )
  on conflict do nothing;

  -- Every synonym the checklist hangs under this usage becomes a name here.
  insert into catalog_item_names (
    catalog_item_id, display_name, normalized_name, locale, script,
    is_primary, name_type, authorship, assertion_id, weight
  )
  select
    p_item, left(synonym.canonical_name, 120),
    catalog_normalize_name(left(synonym.canonical_name, 120)),
    'la', 'latin', false, 'scientific_synonym',
    left(synonym.authorship, 200), p_assertion, 1
  from catalog_source_col_usages as synonym
  where synonym.source_snapshot_id = snapshot
    and synonym.parent_col_id = p_col_id
    and synonym.status in ('synonym', 'ambiguous_synonym')
  on conflict do nothing;
end;
$$;

/**
 * The scoped materialization of ADR-0026 D2: every node gardeners, the
 * registers or EPPO already touch is placed on the Catalogue of Life tree,
 * and a node the checklist does not know becomes an owner decision rather
 * than a guess.
 *
 * Matching is deliberately narrow — the same normalized canonical name, one
 * candidate, and no kingdom conflict. Anything looser belongs to the ladder,
 * which explains itself and can be reverted.
 */
create or replace function catalog_col_materialize_existing(p_limit integer default 2000)
returns jsonb
language plpgsql
as $$
declare
  snapshot uuid := catalog_col_current_snapshot();
  assertion uuid;
  node record;
  match_col text;
  match_count integer;
  taken uuid;
  attached integer := 0;
  queued integer := 0;
  skipped integer := 0;
begin
  if snapshot is null then
    raise exception 'catalog_col_materialize_existing: no Catalogue of Life snapshot'
      using errcode = 'no_data_found';
  end if;

  insert into catalog_source_assertions (
    source_slug, source_snapshot_id, rights_class, confidence, decision, reason_codes
  )
  values (
    'catalogue-of-life-checklistbank', snapshot, 'source_public', 1, 'automatic',
    array['col_materialize_existing']
  )
  returning id into assertion;

  for node in
    select item.id, item.canonical_name, item.normalized_name, item.kingdom,
           (
             -- One identifier per node, and the accepted usage wins: a merge
             -- moves the loser's identifiers onto the survivor, so a node can
             -- carry several and the tree must follow the accepted one.
             select identifier.value
             from catalog_item_identifiers as identifier
             left join catalog_source_col_usages as usage
               on usage.source_snapshot_id = snapshot
              and usage.col_id = identifier.value
             where identifier.catalog_item_id = item.id and identifier.scheme = 'col'
             order by case
               when usage.status in ('accepted', 'provisionally_accepted') then 0
               when usage.status is null then 2
               else 1
             end, identifier.value
             limit 1
           ) as col_id
    from catalog_items as item
    where item.identity_state = 'active'
      and item.node_kind = 'taxon'
      and item.merged_into_catalog_item_id is null
    order by item.search_weight desc, item.created_at
    limit greatest(p_limit, 1)
  loop
    if node.col_id is not null then
      perform catalog_col_attach_node(node.id, node.col_id, assertion);
      attached := attached + 1;
      continue;
    end if;

    -- OverGarden's canonical names often carry the authority ("Solanum
    -- lycopersicum L.") and Catalogue of Life keeps it in its own column, so
    -- a node matches either the bare canonical name or the name with its
    -- authorship. Both sides go through the one normalizer.
    select count(*)::int, min(usage.col_id)
    into match_count, match_col
    from catalog_source_col_usages as usage
    where usage.source_snapshot_id = snapshot
      and (
        usage.normalized_name = coalesce(
          node.normalized_name, catalog_normalize_name(node.canonical_name)
        )
        or usage.normalized_scientific_name = coalesce(
          node.normalized_name, catalog_normalize_name(node.canonical_name)
        )
      )
      and usage.status in ('accepted', 'provisionally_accepted')
      and (
        node.kingdom is null or usage.kingdom is null or usage.kingdom = node.kingdom
      );

    if match_count = 1 then
      -- The same usage on two nodes is a duplicate, and a duplicate is a
      -- decision: `(scheme, value)` is unique, so silently attaching the
      -- second one would drop its provenance on the floor.
      select identifier.catalog_item_id into taken
      from catalog_item_identifiers as identifier
      where identifier.scheme = 'col' and identifier.value = match_col;
      if taken is not null and taken <> node.id then
        insert into catalog_curation_queue (
          item_type, subject_catalog_item_id, proposal, reasons, impact_score, state
        )
        select
          'node_merge', node.id,
          jsonb_build_object('survivor_id', taken::text, 'col_id', match_col),
          array['col_shared_identifier'], 2, 'open'
        where not exists (
          select 1 from catalog_curation_queue as open_item
          where open_item.subject_catalog_item_id = node.id
            and open_item.item_type = 'node_merge'
            and open_item.state = 'open'
        );
        queued := queued + 1;
        continue;
      end if;
      perform catalog_col_attach_node(node.id, match_col, assertion);
      attached := attached + 1;
    elsif exists (
      select 1 from catalog_item_identifiers as other
      where other.catalog_item_id = node.id and other.scheme <> 'col'
    ) then
      -- A node another source vouches for and the checklist does not resolve
      -- is a decision, not a silent gap.
      insert into catalog_curation_queue (
        item_type, subject_catalog_item_id, proposal, reasons, impact_score, state
      )
      select
        'source_link', node.id,
        jsonb_build_object(
          'source_slug', 'catalogue-of-life-checklistbank',
          'candidates', match_count
        ),
        array['col_unmatched'], 1, 'open'
      where not exists (
        select 1 from catalog_curation_queue as open_item
        where open_item.subject_catalog_item_id = node.id
          and open_item.item_type = 'source_link'
          and open_item.state = 'open'
      );
      queued := queued + 1;
    else
      skipped := skipped + 1;
    end if;
  end loop;

  -- Ancestors are copied from a parent as it stands, so a node attached
  -- before its own parent gained one carries a short chain. One recursive
  -- pass from the roots makes every array exact, whatever order the loop ran
  -- in, and touches only the rows that are actually wrong.
  with recursive tree as (
    select root.id, '{}'::uuid[] as ancestors
    from catalog_items as root
    where root.node_kind = 'taxon'
      and root.parent_catalog_item_id is null
    union all
    select child.id, tree.ancestors || tree.id
    from catalog_items as child
    join tree on child.parent_catalog_item_id = tree.id
    where child.node_kind = 'taxon'
      and array_length(tree.ancestors, 1) is distinct from 40
  )
  update catalog_items as item
  set ancestor_ids = tree.ancestors,
      updated_at = now()
  from tree
  where tree.id = item.id
    and item.ancestor_ids is distinct from tree.ancestors;

  delete from catalog_source_assertions as unused
  where unused.id = assertion
    and not exists (
      select 1 from catalog_item_identifiers where assertion_id = unused.id
    )
    and not exists (
      select 1 from catalog_item_names where assertion_id = unused.id
    );

  return jsonb_build_object(
    'snapshotId', snapshot::text,
    'attached', attached,
    'queued', queued,
    'skipped', skipped
  );
end;
$$;

/**
 * The monthly refresh, as ADR-0026 D4 classifies it.
 *
 * Between the two newest releases, per `col_id`:
 *
 * * a **renamed** usage renames its node and keeps the old name as a synonym,
 *   automatically: Catalogue of Life is the naming authority and the old
 *   spelling stays reachable;
 * * an **accepted name that became a synonym** is a merge into the usage it
 *   now hangs under. A node carrying no gardener object merges itself; a node
 *   gardeners have used becomes a decision in the owner's queue;
 * * a **usage that disappeared** supersedes its assertions and touches
 *   nothing else — a node is never deleted;
 * * a **new** usage needs nothing: the secondary path reaches it, and picking
 *   it materializes it.
 *
 * Returns the counts, and writes a `catalog_source_refresh_events` row so the
 * sources page can show the diff.
 */
create or replace function catalog_col_refresh_diff()
returns jsonb
language plpgsql
as $$
declare
  current_snapshot uuid;
  previous_snapshot uuid;
  entry record;
  node uuid;
  survivor uuid;
  objects integer;
  queue_item uuid;
  renamed integer := 0;
  merged integer := 0;
  queued integer := 0;
  superseded integer := 0;
  assertion uuid;
begin
  select id into current_snapshot from (
    select snapshot.id, row_number() over (order by snapshot.fetched_at desc, snapshot.id) as position
    from catalog_source_snapshots as snapshot
    where snapshot.source_slug = 'catalogue-of-life-checklistbank'
      and snapshot.status = 'imported'
  ) as ranked where position = 1;
  select id into previous_snapshot from (
    select snapshot.id, row_number() over (order by snapshot.fetched_at desc, snapshot.id) as position
    from catalog_source_snapshots as snapshot
    where snapshot.source_slug = 'catalogue-of-life-checklistbank'
      and snapshot.status = 'imported'
  ) as ranked where position = 2;

  if current_snapshot is null or previous_snapshot is null then
    return jsonb_build_object('status', 'nothing_to_diff');
  end if;

  insert into catalog_source_assertions (
    source_slug, source_snapshot_id, rights_class, confidence, decision, reason_codes
  )
  values (
    'catalogue-of-life-checklistbank', current_snapshot, 'source_public', 1,
    'automatic', array['col_refresh']
  )
  returning id into assertion;

  -- 1. Renames, and 2. accepted names that became synonyms.
  for entry in
    select
      before.col_id,
      before.canonical_name as before_name,
      before.status as before_status,
      after.canonical_name as after_name,
      after.status as after_status,
      after.parent_col_id as after_parent,
      after.authorship as after_authorship
    from catalog_source_col_usages as before
    join catalog_source_col_usages as after
      on after.source_snapshot_id = current_snapshot and after.col_id = before.col_id
    where before.source_snapshot_id = previous_snapshot
      and (
        before.canonical_name is distinct from after.canonical_name
        or before.status is distinct from after.status
      )
  loop
    select identifier.catalog_item_id into node
    from catalog_item_identifiers as identifier
    where identifier.scheme = 'col' and identifier.value = entry.col_id;
    continue when node is null;

    if entry.after_status in ('accepted', 'provisionally_accepted')
       and entry.before_name is distinct from entry.after_name then
      update catalog_item_names
      set is_primary = false
      where catalog_item_id = node and is_primary;
      insert into catalog_item_names (
        catalog_item_id, display_name, normalized_name, locale, script,
        is_primary, name_type, authorship, assertion_id, weight
      )
      values (
        node, left(entry.after_name, 120),
        catalog_normalize_name(left(entry.after_name, 120)), 'la', 'latin',
        true, 'scientific_accepted', left(entry.after_authorship, 200),
        assertion, 5
      )
      on conflict do nothing;
      update catalog_items
      set canonical_name = left(entry.after_name, 120),
          normalized_name = catalog_normalize_name(left(entry.after_name, 120)),
          content_updated_at = now(),
          updated_at = now()
      where id = node;
      renamed := renamed + 1;
      continue;
    end if;

    if entry.before_status in ('accepted', 'provisionally_accepted')
       and entry.after_status in ('synonym', 'ambiguous_synonym')
       and entry.after_parent is not null then
      survivor := catalog_col_ensure_node(entry.after_parent, assertion, 0);
      continue when survivor is null or survivor = node;

      select count(*)::int into objects
      from plant_objects where catalog_item_id = node;

      insert into catalog_curation_queue (
        item_type, subject_catalog_item_id, proposal, reasons, impact_score, state
      )
      values (
        'node_merge', node,
        jsonb_build_object('survivor_id', survivor::text, 'col_id', entry.col_id),
        array['col_accepted_became_synonym'], greatest(objects, 1), 'open'
      )
      returning id into queue_item;

      if objects = 0 then
        -- Nobody's garden depends on this node: the checklist decides.
        perform catalog_apply_queue_item(queue_item, null, true);
        merged := merged + 1;
      else
        queued := queued + 1;
      end if;
    end if;
  end loop;

  -- 3. Usages that left the release.
  update catalog_source_assertions as stale
  set decision = 'superseded'
  where stale.source_slug = 'catalogue-of-life-checklistbank'
    and stale.decision = 'automatic'
    and exists (
      select 1
      from catalog_item_identifiers as identifier
      where identifier.assertion_id = stale.id
        and identifier.scheme = 'col'
        and not exists (
          select 1 from catalog_source_col_usages as usage
          where usage.source_snapshot_id = current_snapshot
            and usage.col_id = identifier.value
        )
    );
  get diagnostics superseded = row_count;

  insert into catalog_source_refresh_events (
    source_slug, previous_snapshot_id, refreshed_snapshot_id, refresh_label,
    payload_sha256, summary
  )
  select
    'catalogue-of-life-checklistbank', previous_snapshot, current_snapshot,
    'catalogue-of-life monthly diff',
    snapshot.payload_sha256,
    jsonb_build_object(
      'renamed', renamed,
      'merged', merged,
      'queued', queued,
      'supersededAssertions', superseded
    )
  from catalog_source_snapshots as snapshot
  where snapshot.id = current_snapshot
  on conflict (source_slug, refreshed_snapshot_id) do update
    set summary = excluded.summary, updated_at = now();

  delete from catalog_source_assertions as unused
  where unused.id = assertion
    and not exists (select 1 from catalog_item_identifiers where assertion_id = unused.id)
    and not exists (select 1 from catalog_item_names where assertion_id = unused.id);

  return jsonb_build_object(
    'status', 'diffed',
    'previousSnapshotId', previous_snapshot::text,
    'currentSnapshotId', current_snapshot::text,
    'renamed', renamed,
    'merged', merged,
    'queued', queued,
    'supersededAssertions', superseded
  );
end;
$$;
