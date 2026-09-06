-- 0056 (OVE-390, ADR-0026 D4–D6): the reconciliation ladder's contracts.
--
-- Four job kinds join the matching queue and three leave it; each new kind's
-- payload is a Postgres CHECK in the 0052 pattern, so the TypeScript producer,
-- the Python worker and the database agree on the shape by construction. The
-- per-rule auto-accept thresholds live in `catalog_reconcile_thresholds`,
-- seeded at 0.95 and recalibrated by the worker within [0.80, 0.99]. Every
-- apply and every revert of a curation decision is one transaction inside
-- `catalog_apply_queue_item` and `catalog_revert_action`, whether the worker
-- (automatic, above threshold) or the owner's page (accepted) triggers it;
-- the action row carries the inverse, and a revert is itself an action.
--
-- Idempotent: constraints are dropped and re-created by name, the table and
-- its seed use IF NOT EXISTS / ON CONFLICT, and the functions are CREATE OR
-- REPLACE.

-- ======================================================================
-- 1. Payload contracts of the four new kinds (0052 pattern)
-- ======================================================================

alter table job_queue
  drop constraint if exists job_queue_catalog_reconcile_payload_check;

alter table job_queue
  add constraint job_queue_catalog_reconcile_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_reconcile'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'scope']::text[]
      and payload - array['kind', 'scope', 'source_slug', 'since']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'scope') = 'string'
      and payload->>'kind' = 'catalog_reconcile'
      and payload->>'scope' in ('labels', 'source_records', 'duplicates')
      and (
        not payload ? 'source_slug'
        or (
          jsonb_typeof(payload->'source_slug') = 'string'
          and payload->>'source_slug' ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        )
      )
      and (
        not payload ? 'since'
        or (
          jsonb_typeof(payload->'since') = 'string'
          and payload->>'since' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$'
        )
      )
    )
  );

alter table job_queue
  drop constraint if exists job_queue_catalog_curation_apply_payload_check;

alter table job_queue
  add constraint job_queue_catalog_curation_apply_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_curation_apply'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'queue_item_id']::text[]
      and payload - array['kind', 'queue_item_id']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'queue_item_id') = 'string'
      and payload->>'kind' = 'catalog_curation_apply'
      and payload->>'queue_item_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

alter table job_queue
  drop constraint if exists job_queue_catalog_threshold_recalibrate_payload_check;

alter table job_queue
  add constraint job_queue_catalog_threshold_recalibrate_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_threshold_recalibrate'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind']::text[]
      and payload - array['kind']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and payload->>'kind' = 'catalog_threshold_recalibrate'
    )
  );

alter table job_queue
  drop constraint if exists job_queue_catalog_source_refresh_payload_check;

alter table job_queue
  add constraint job_queue_catalog_source_refresh_payload_check check (
    not (
      jsonb_typeof(payload) = 'object'
      and payload->>'kind' = 'catalog_source_refresh'
    )
    or (
      jsonb_typeof(payload) = 'object'
      and payload ?& array['kind', 'source_slug']::text[]
      and payload - array['kind', 'source_slug']::text[] = '{}'::jsonb
      and jsonb_typeof(payload->'kind') = 'string'
      and jsonb_typeof(payload->'source_slug') = 'string'
      and payload->>'kind' = 'catalog_source_refresh'
      and payload->>'source_slug' ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  );

-- ======================================================================
-- 2. The three retired kinds lose their contracts (the worker terminalises
--    any such job still queued as unsupported_kind)
-- ======================================================================

alter table job_queue
  drop constraint if exists job_queue_catalog_match_payload_check;

alter table job_queue
  drop constraint if exists job_queue_catalog_alias_payload_check;

alter table job_queue
  drop constraint if exists job_queue_catalog_fuzzy_duplicate_payload_check;

-- ======================================================================
-- 3. Per-rule auto-accept thresholds
-- ======================================================================

create table if not exists catalog_reconcile_thresholds (
  rule_code text primary key
    check (rule_code in (
      'shared_identifier',
      'exact_scientific_authorship',
      'canonical_same_kingdom_rank',
      'fuzzy_same_genus',
      'denomination_equal',
      'denomination_transliteration'
    )),
  threshold numeric(5,4) not null
    check (threshold >= 0.8 and threshold <= 0.99),
  revert_rate_30d numeric(5,4) not null default 0
    check (revert_rate_30d >= 0 and revert_rate_30d <= 1),
  decisions_30d integer not null default 0 check (decisions_30d >= 0),
  updated_at timestamptz not null default now()
);

insert into catalog_reconcile_thresholds (rule_code, threshold)
values
  ('shared_identifier', 0.95),
  ('exact_scientific_authorship', 0.95),
  ('canonical_same_kingdom_rank', 0.95),
  ('fuzzy_same_genus', 0.95),
  ('denomination_equal', 0.95),
  ('denomination_transliteration', 0.95)
on conflict (rule_code) do nothing;

-- ======================================================================
-- 4. Apply a queue item: one transaction, one action row with its inverse
-- ======================================================================

create or replace function catalog_record_card_intents(subjects uuid[])
returns void
language plpgsql
as $$
begin
  insert into public_projection_intents (
    entity_kind, entity_id, owner_user_id, desired_state, desired_generation,
    desired_reason, privacy_reducing
  )
  select 'catalog_item', subject, null, 'present',
         nextval('public_projection_generation_seq'), 'catalog_card', false
  from unnest(subjects) as subject
  on conflict (entity_kind, entity_id) do update set
    desired_generation = excluded.desired_generation,
    status = 'pending',
    attempts = 0,
    available_at = now(),
    lease_owner = null,
    lease_expires_at = null,
    last_error_class = null,
    updated_at = now();
end $$;

create or replace function catalog_apply_queue_item(item uuid, actor uuid, automatic boolean)
returns uuid
language plpgsql
as $$
declare
  queue catalog_curation_queue%rowtype;
  target uuid;
  loser uuid;
  survivor uuid;
  target_state text;
  action_kind text;
  action_id uuid;
  rule_code text;
  subjects uuid[];
  inverse jsonb := '{}'::jsonb;
  object_ids uuid[];
  moved_mentions jsonb;
  dropped_mentions jsonb;
  name_snapshot jsonb;
  identifier_ids uuid[];
  relation_snapshot jsonb;
  fact_ids uuid[];
  slug_ids uuid[];
  assertion_id uuid;
  link_id uuid;
  identifier jsonb;
  inserted uuid;
begin
  select * into queue from catalog_curation_queue where id = item for update;
  if not found then
    raise exception 'catalog_apply_queue_item: unknown queue item %', item
      using errcode = 'no_data_found';
  end if;
  if queue.state <> 'open' then
    raise exception 'catalog_apply_queue_item: queue item % is %', item, queue.state
      using errcode = 'invalid_parameter_value';
  end if;
  if queue.item_type = 'split_review' then
    raise exception 'catalog_apply_queue_item: split_review is never applied by this function'
      using errcode = 'feature_not_supported';
  end if;
  rule_code := split_part(coalesce(queue.reasons[1], ''), ':', 1);

  if queue.item_type = 'label_link' then
    target := coalesce((queue.proposal->>'catalog_item_id')::uuid, queue.subject_catalog_item_id);
    if target is null or queue.subject_label is null then
      raise exception 'catalog_apply_queue_item: label_link needs a label and a target'
        using errcode = 'invalid_parameter_value';
    end if;
    select identity_state into target_state from catalog_items where id = target;
    if target_state is distinct from 'active' then
      raise exception 'catalog_apply_queue_item: target % is not active', target
        using errcode = 'invalid_parameter_value';
    end if;
    -- Every object carrying the label, by the shared normalizer, keeps its
    -- text (the gardener's own name stays private, ADR-0026 D6) and gains
    -- the card.
    with linked as (
      update plant_objects
      set catalog_item_id = target,
          variety_state = 'selected',
          updated_at = now()
      where variety_state = 'free_text'
        and catalog_item_id is null
        and variety_text is not null
        and catalog_normalize_name(variety_text) = catalog_normalize_name(queue.subject_label)
        and (queue.proposal->>'object_kind' is null or object_kind = queue.proposal->>'object_kind')
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into object_ids from linked;
    update catalog_items as ci
    set first_hand_content_at = greatest(coalesce(ci.first_hand_content_at, latest.at), latest.at),
        content_updated_at = now()
    from (
      select max(coalesce(entry.published_at, entry.created_at)) as at
      from journal_entries as entry
      join plant_objects as object on object.id = entry.plant_object_id
      where object.id = any(object_ids)
        and entry.deleted_at is null
        and entry.lifecycle_state = 'active'
        and entry.visibility = 'public'
    ) as latest
    where ci.id = target
      and latest.at is not null;
    inverse := jsonb_build_object(
      'objects', to_jsonb(object_ids),
      'prior_state', 'free_text',
      'target', target
    );
    action_kind := 'link';
    subjects := array[target];

  elsif queue.item_type = 'node_merge' then
    loser := queue.subject_catalog_item_id;
    survivor := (queue.proposal->>'survivor_id')::uuid;
    if loser is null or survivor is null or loser = survivor then
      raise exception 'catalog_apply_queue_item: node_merge needs two distinct nodes'
        using errcode = 'invalid_parameter_value';
    end if;
    perform 1 from catalog_items where id = loser and identity_state = 'active' for update;
    if not found then
      raise exception 'catalog_apply_queue_item: % is not an active node', loser
        using errcode = 'invalid_parameter_value';
    end if;
    perform 1 from catalog_items where id = survivor and identity_state = 'active' for update;
    if not found then
      raise exception 'catalog_apply_queue_item: survivor % is not an active node', survivor
        using errcode = 'invalid_parameter_value';
    end if;

    with moved as (
      update plant_objects set catalog_item_id = survivor, updated_at = now()
      where catalog_item_id = loser
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into object_ids from moved;

    with moved as (
      update journal_entry_catalog_mentions as mention
      set catalog_item_id = survivor
      where mention.catalog_item_id = loser
        and not exists (
          select 1 from journal_entry_catalog_mentions as existing
          where existing.journal_entry_id = mention.journal_entry_id
            and existing.catalog_item_id = survivor
        )
      returning journal_entry_id
    )
    select coalesce(jsonb_agg(journal_entry_id), '[]'::jsonb) into moved_mentions from moved;
    with dropped as (
      delete from journal_entry_catalog_mentions
      where catalog_item_id = loser
      returning journal_entry_id, owner_user_id, space_id, created_at
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'journal_entry_id', journal_entry_id,
      'owner_user_id', owner_user_id,
      'space_id', space_id,
      'created_at', created_at
    )), '[]'::jsonb) into dropped_mentions from dropped;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', name.id, 'name_type', name.name_type, 'is_primary', name.is_primary
    )), '[]'::jsonb) into name_snapshot
    from catalog_item_names as name
    where name.catalog_item_id = loser
      and not exists (
        select 1 from catalog_item_names as existing
        where existing.catalog_item_id = survivor
          and existing.normalized_name = name.normalized_name
          and existing.locale = name.locale
      );
    update catalog_item_names as name
    set catalog_item_id = survivor,
        name_type = case when name.name_type = 'scientific_accepted' then 'scientific_synonym' else name.name_type end,
        is_primary = false
    where name.id in (select (element->>'id')::uuid from jsonb_array_elements(name_snapshot) as element);

    with moved as (
      update catalog_item_identifiers set catalog_item_id = survivor
      where catalog_item_id = loser
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into identifier_ids from moved;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', relation.id, 'from', relation.from_catalog_item_id, 'to', relation.to_catalog_item_id
    )), '[]'::jsonb) into relation_snapshot
    from catalog_item_relations as relation
    where (relation.from_catalog_item_id = loser or relation.to_catalog_item_id = loser)
      and relation.from_catalog_item_id <> survivor
      and relation.to_catalog_item_id <> survivor
      and not exists (
        select 1 from catalog_item_relations as existing
        where existing.from_catalog_item_id = case when relation.from_catalog_item_id = loser then survivor else relation.from_catalog_item_id end
          and existing.to_catalog_item_id = case when relation.to_catalog_item_id = loser then survivor else relation.to_catalog_item_id end
          and existing.relation_type = relation.relation_type
          and existing.assertion_id = relation.assertion_id
      );
    update catalog_item_relations as relation
    set from_catalog_item_id = case when relation.from_catalog_item_id = loser then survivor else relation.from_catalog_item_id end,
        to_catalog_item_id = case when relation.to_catalog_item_id = loser then survivor else relation.to_catalog_item_id end
    where relation.id in (select (element->>'id')::uuid from jsonb_array_elements(relation_snapshot) as element);

    with moved as (
      update catalog_item_facts as fact set catalog_item_id = survivor
      where fact.catalog_item_id = loser
        and not exists (
          select 1 from catalog_item_facts as existing
          where existing.catalog_item_id = survivor
            and existing.predicate = fact.predicate
            and coalesce(existing.region_code, '') = coalesce(fact.region_code, '')
            and existing.value = fact.value
            and existing.assertion_id = fact.assertion_id
        )
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into fact_ids from moved;

    with moved as (
      update catalog_item_slug_history set catalog_item_id = survivor
      where catalog_item_id = loser
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into slug_ids from moved;

    update catalog_items
    set identity_state = 'merged',
        merged_into_catalog_item_id = survivor,
        updated_at = now()
    where id = loser;
    update catalog_items
    set content_updated_at = now(),
        first_hand_content_at = greatest(
          coalesce(first_hand_content_at, (select first_hand_content_at from catalog_items where id = loser)),
          coalesce((select first_hand_content_at from catalog_items where id = loser), first_hand_content_at)
        )
    where id = survivor;

    inverse := jsonb_build_object(
      'loser', loser,
      'survivor', survivor,
      'objects', to_jsonb(object_ids),
      'moved_mentions', moved_mentions,
      'dropped_mentions', dropped_mentions,
      'names', name_snapshot,
      'identifiers', to_jsonb(identifier_ids),
      'relations', relation_snapshot,
      'facts', to_jsonb(fact_ids),
      'slugs', to_jsonb(slug_ids)
    );
    action_kind := 'merge';
    subjects := array[loser, survivor];

  elsif queue.item_type = 'source_link' then
    target := queue.subject_catalog_item_id;
    if target is null or queue.proposal->>'source_slug' is null or queue.proposal->>'source_snapshot_id' is null then
      raise exception 'catalog_apply_queue_item: source_link needs a target, a source slug and a snapshot'
        using errcode = 'invalid_parameter_value';
    end if;
    insert into catalog_source_assertions (
      source_slug, source_snapshot_id, source_record_id, observed_at, rights_class,
      confidence, decision, decided_by_user_id, decided_at, reason_codes
    )
    values (
      queue.proposal->>'source_slug',
      (queue.proposal->>'source_snapshot_id')::uuid,
      (queue.proposal->>'source_record_id')::uuid,
      now(),
      coalesce(queue.proposal->>'rights_class', 'source_public'),
      coalesce(queue.confidence, 1),
      case when automatic then 'automatic' else 'curator_accepted' end,
      actor,
      now(),
      queue.reasons
    )
    returning id into assertion_id;
    identifier_ids := '{}'::uuid[];
    for identifier in select * from jsonb_array_elements(coalesce(queue.proposal->'identifiers', '[]'::jsonb)) loop
      insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
      values (target, identifier->>'scheme', identifier->>'value', assertion_id)
      on conflict (scheme, value) do nothing
      returning id into inserted;
      if inserted is not null then
        identifier_ids := identifier_ids || inserted;
      end if;
      inserted := null;
    end loop;
    if queue.proposal->>'source_record_id' is not null then
      insert into catalog_source_links (catalog_item_id, source_record_id, source_slug, source_record_key, projection_kind, assertion_id)
      values (
        target,
        (queue.proposal->>'source_record_id')::uuid,
        queue.proposal->>'source_slug',
        coalesce(queue.proposal->>'source_record_key', queue.proposal->>'source_record_id'),
        'canonical_item',
        assertion_id
      )
      on conflict (catalog_item_id, source_record_id) do nothing
      returning id into link_id;
    end if;
    update catalog_items set content_updated_at = now() where id = target;
    inverse := jsonb_build_object(
      'assertion_id', assertion_id,
      'identifiers', to_jsonb(identifier_ids),
      'link_id', link_id,
      'target', target
    );
    action_kind := 'link';
    subjects := array[target];
  else
    raise exception 'catalog_apply_queue_item: unsupported item type %', queue.item_type
      using errcode = 'feature_not_supported';
  end if;

  update catalog_curation_queue
  set state = case when automatic then 'auto_applied' else 'accepted' end,
      decided_by_user_id = actor,
      decided_at = now(),
      updated_at = now()
  where id = item;

  insert into catalog_curation_actions (
    action_type, queue_item_id, subject_catalog_item_ids, payload, inverse, automatic, performed_by_user_id
  )
  values (
    action_kind,
    item,
    subjects,
    queue.proposal || jsonb_build_object(
      'item_type', queue.item_type,
      'rule_code', rule_code,
      'confidence', queue.confidence,
      'reasons', to_jsonb(queue.reasons),
      'subject_label', queue.subject_label
    ),
    inverse,
    automatic,
    actor
  )
  returning id into action_id;

  perform catalog_record_card_intents(subjects);
  return action_id;
end $$;

-- ======================================================================
-- 5. Revert an action: the inverse, applied in one transaction
-- ======================================================================

create or replace function catalog_revert_action(action uuid, actor uuid)
returns uuid
language plpgsql
as $$
declare
  act catalog_curation_actions%rowtype;
  revert_id uuid;
  loser uuid;
  survivor uuid;
  target uuid;
  element jsonb;
begin
  select * into act from catalog_curation_actions where id = action for update;
  if not found then
    raise exception 'catalog_revert_action: unknown action %', action
      using errcode = 'no_data_found';
  end if;
  if act.reverted_by_action_id is not null then
    raise exception 'catalog_revert_action: action % is already reverted', action
      using errcode = 'invalid_parameter_value';
  end if;
  if act.action_type = 'revert' then
    raise exception 'catalog_revert_action: a revert is not reverted'
      using errcode = 'feature_not_supported';
  end if;

  if act.action_type = 'link' and act.payload->>'item_type' = 'label_link' then
    target := (act.inverse->>'target')::uuid;
    update plant_objects
    set catalog_item_id = null,
        variety_state = 'free_text',
        updated_at = now()
    where id in (select (value#>>'{}')::uuid from jsonb_array_elements(act.inverse->'objects') as value)
      and catalog_item_id = target;
    update catalog_items set content_updated_at = now() where id = target;

  elsif act.action_type = 'merge' then
    loser := (act.inverse->>'loser')::uuid;
    survivor := (act.inverse->>'survivor')::uuid;
    update catalog_items
    set identity_state = 'active',
        merged_into_catalog_item_id = null,
        updated_at = now()
    where id = loser;
    update plant_objects set catalog_item_id = loser, updated_at = now()
    where id in (select (value#>>'{}')::uuid from jsonb_array_elements(act.inverse->'objects') as value)
      and catalog_item_id = survivor;
    update journal_entry_catalog_mentions set catalog_item_id = loser
    where catalog_item_id = survivor
      and journal_entry_id in (select (value#>>'{}')::uuid from jsonb_array_elements(act.inverse->'moved_mentions') as value);
    for element in select * from jsonb_array_elements(coalesce(act.inverse->'dropped_mentions', '[]'::jsonb)) loop
      insert into journal_entry_catalog_mentions (journal_entry_id, owner_user_id, space_id, catalog_item_id, created_at)
      values (
        (element->>'journal_entry_id')::uuid,
        (element->>'owner_user_id')::uuid,
        (element->>'space_id')::uuid,
        loser,
        coalesce((element->>'created_at')::timestamptz, now())
      )
      on conflict do nothing;
    end loop;
    for element in select * from jsonb_array_elements(coalesce(act.inverse->'names', '[]'::jsonb)) loop
      update catalog_item_names
      set catalog_item_id = loser,
          name_type = element->>'name_type',
          is_primary = (element->>'is_primary')::boolean
      where id = (element->>'id')::uuid;
    end loop;
    update catalog_item_identifiers set catalog_item_id = loser
    where id in (select (value#>>'{}')::uuid from jsonb_array_elements(act.inverse->'identifiers') as value);
    for element in select * from jsonb_array_elements(coalesce(act.inverse->'relations', '[]'::jsonb)) loop
      update catalog_item_relations
      set from_catalog_item_id = (element->>'from')::uuid,
          to_catalog_item_id = (element->>'to')::uuid
      where id = (element->>'id')::uuid;
    end loop;
    update catalog_item_facts set catalog_item_id = loser
    where id in (select (value#>>'{}')::uuid from jsonb_array_elements(act.inverse->'facts') as value);
    update catalog_item_slug_history set catalog_item_id = loser
    where id in (select (value#>>'{}')::uuid from jsonb_array_elements(act.inverse->'slugs') as value);
    update catalog_items set content_updated_at = now() where id in (loser, survivor);

  elsif act.action_type = 'link' and act.payload->>'item_type' = 'source_link' then
    target := (act.inverse->>'target')::uuid;
    if act.inverse->>'link_id' is not null then
      delete from catalog_source_links where id = (act.inverse->>'link_id')::uuid;
    end if;
    delete from catalog_item_identifiers
    where id in (select (value#>>'{}')::uuid from jsonb_array_elements(act.inverse->'identifiers') as value);
    update catalog_source_assertions
    set decision = 'superseded',
        decided_by_user_id = actor,
        decided_at = now()
    where id = (act.inverse->>'assertion_id')::uuid;
    update catalog_items set content_updated_at = now() where id = target;

  else
    raise exception 'catalog_revert_action: no inverse for action type % (%)', act.action_type, act.payload->>'item_type'
      using errcode = 'feature_not_supported';
  end if;

  insert into catalog_curation_actions (
    action_type, queue_item_id, subject_catalog_item_ids, payload, inverse, automatic, performed_by_user_id
  )
  values (
    'revert',
    act.queue_item_id,
    act.subject_catalog_item_ids,
    jsonb_build_object('reverted_action_id', act.id, 'item_type', act.payload->>'item_type', 'rule_code', act.payload->>'rule_code'),
    '{}'::jsonb,
    false,
    actor
  )
  returning id into revert_id;

  update catalog_curation_actions set reverted_by_action_id = revert_id where id = act.id;
  if act.queue_item_id is not null then
    update catalog_curation_queue set state = 'reverted', updated_at = now() where id = act.queue_item_id;
  end if;
  perform catalog_record_card_intents(act.subject_catalog_item_ids);
  return revert_id;
end $$;
