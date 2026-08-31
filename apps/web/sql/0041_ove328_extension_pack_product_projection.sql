-- OVE-328 correction — activating an extension pack actually publishes it.
--
-- `0027`'s `materialize_stable_registry_extension_pack` joined each pack row to
-- its *parent* release member and then inserted that parent into the product
-- projection. The parent is already projected — that is why the join could
-- succeed at all — so every candidate row hit `on conflict do nothing` and the
-- function was a guaranteed no-op. It also never wrote
-- `stable_registry_product_catalog_names`, so no denomination ever became
-- searchable. Activating a variety or breed pack published nothing at all.
--
-- A variety and a breed are their own selectable catalog identities: a gardener
-- records that they planted `San Marzano`, not merely `Solanum lycopersicum`.
-- Activation therefore appends one identity per product-eligible row.
--
-- Appending is legitimate here. Release membership is append-only rather than
-- frozen — `catalog_registry_release_members_append_only` fires on update and
-- delete, never on insert — and extending an active Foundation is exactly what
-- a pack is for. Nothing existing is rewritten: the parent's own member row,
-- revision, projection record, and names are untouched.

-- A denomination that cannot become a catalog identity must never be classified
-- publishable. `official_denomination` allows 240 characters while
-- `catalog_items.canonical_name` allows 120, so without this a long
-- denomination would be approved by an owner and then silently vanish at
-- activation — the same class of failure this migration exists to remove. An
-- over-long denomination now stays an exception the owner can see.
alter table catalog_registry_extension_pack_rows
  drop constraint if exists catalog_registry_extension_pack_rows_publishable_check;

alter table catalog_registry_extension_pack_rows
  add constraint catalog_registry_extension_pack_rows_publishable_check
  check (
    row_class <> 'product_eligible'
    or (
      char_length(official_denomination) between 1 and 120
      and char_length(normalized_denomination) between 1 and 120
    )
  );

create or replace function materialize_stable_registry_extension_pack(
  target_pack_id uuid
)
returns void
language plpgsql
as $$
declare
  target_release_id uuid;
  pack_kind_value text;
  pack_source_slug text;
  activated_at_value timestamptz;
begin
  select packs.release_id, packs.pack_kind, packs.source_slug
    into target_release_id, pack_kind_value, pack_source_slug
  from catalog_registry_extension_packs as packs
  where packs.id = target_pack_id
    and packs.state = 'active';

  if target_release_id is null then
    return;
  end if;

  select releases.activated_at into activated_at_value
  from catalog_registry_releases as releases
  where releases.id = target_release_id
    and releases.state = 'active';

  if activated_at_value is null then
    return;
  end if;

  -- One catalog identity per product-eligible row. `source_id` carries the pack
  -- row id, so re-running activation is idempotent without a second identity.
  insert into catalog_items (
    canonical_name,
    normalized_name,
    catalog_kind,
    public_slug,
    status,
    source,
    source_id,
    locale
  )
  select
    pack_rows.official_denomination,
    pack_rows.normalized_denomination,
    pack_kind_value,
    pack_rows.public_slug,
    'confirmed',
    pack_source_slug,
    pack_rows.id::text,
    pack_rows.locale
  from catalog_registry_extension_pack_rows as pack_rows
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
    and pack_rows.parent_catalog_item_id is not null
    and not exists (
      select 1
      from catalog_items as existing
      where existing.source = pack_source_slug
        and existing.source_id = pack_rows.id::text
    );

  insert into catalog_item_revisions (
    catalog_item_id,
    revision_number,
    canonical_name,
    normalized_name,
    catalog_kind,
    identity_relation,
    source_evidence_digest,
    revision_digest
  )
  select
    items.id,
    1,
    items.canonical_name,
    items.normalized_name,
    items.catalog_kind,
    'canonical',
    encode(digest(convert_to(
      concat_ws('|', packs.artifact_digest, pack_rows.source_record_key),
      'utf8'), 'sha256'), 'hex'),
    encode(digest(convert_to(
      concat_ws('|', items.id::text, items.canonical_name,
                items.normalized_name, items.catalog_kind),
      'utf8'), 'sha256'), 'hex')
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_registry_extension_packs as packs
    on packs.id = pack_rows.pack_id
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
  on conflict (catalog_item_id, revision_number) do nothing;

  -- Membership is the sole eligibility authority for the projection, so the new
  -- identity has to become a member before it can be projected.
  insert into catalog_registry_release_members (
    release_id,
    catalog_item_id,
    catalog_item_revision_id,
    eligibility,
    membership_digest
  )
  select
    target_release_id,
    items.id,
    revisions.id,
    'product_eligible',
    encode(digest(convert_to(
      concat_ws('|', target_release_id::text, items.id::text,
                revisions.revision_digest, 'product_eligible'),
      'utf8'), 'sha256'), 'hex')
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  join catalog_item_revisions as revisions
    on revisions.catalog_item_id = items.id
   and revisions.revision_number = 1
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
  on conflict (release_id, catalog_item_id) do nothing;

  -- A variety is always a plant and a breed is always an animal, so unlike a
  -- species these identities carry a resolved kind rather than `either`.
  insert into stable_registry_product_catalog_records (
    registry_release_id,
    catalog_item_id,
    catalog_item_revision_id,
    object_kind_scope,
    catalog_kind,
    canonical_name,
    item_locale,
    public_slug,
    activated_at
  )
  select
    target_release_id,
    members.catalog_item_id,
    members.catalog_item_revision_id,
    case pack_kind_value when 'breed' then 'animal' else 'plant' end,
    pack_kind_value,
    stable_registry_public_safe_label(items.canonical_name, 240),
    items.locale,
    stable_registry_product_public_slug(items.id, items.public_slug),
    activated_at_value
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  join catalog_registry_release_members as members
    on members.release_id = target_release_id
   and members.catalog_item_id = items.id
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
    and stable_registry_public_safe_label(items.canonical_name, 240) is not null
  on conflict (registry_release_id, catalog_item_id) do nothing;

  -- The canonical denomination, so the picker finds the variety by its own
  -- name rather than only through its parent species.
  insert into stable_registry_product_catalog_names (
    registry_release_id,
    catalog_item_id,
    object_kind_scope,
    normalized_name,
    locale,
    display_name,
    name_class,
    is_primary
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.object_kind_scope,
    lower(records.canonical_name),
    records.item_locale,
    records.canonical_name,
    'canonical',
    true
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  join stable_registry_product_catalog_records as records
    on records.registry_release_id = target_release_id
   and records.catalog_item_id = items.id
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
  on conflict do nothing;

  -- Trade, local, romanized, and generated names are searchable aliases. A
  -- user-added candidate is deliberately excluded: it has its own review state
  -- and nothing publishes one automatically.
  insert into stable_registry_product_catalog_names (
    registry_release_id,
    catalog_item_id,
    object_kind_scope,
    normalized_name,
    locale,
    display_name,
    name_class,
    is_primary
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.object_kind_scope,
    lower(stable_registry_public_safe_label(pack_names.display_name, 240)),
    coalesce(nullif(trim(pack_names.locale), ''), records.item_locale),
    stable_registry_public_safe_label(pack_names.display_name, 240),
    'accepted_alias',
    false
  from catalog_registry_extension_pack_names as pack_names
  join catalog_registry_extension_pack_rows as pack_rows
    on pack_rows.id = pack_names.pack_row_id
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  join stable_registry_product_catalog_records as records
    on records.registry_release_id = target_release_id
   and records.catalog_item_id = items.id
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
    and pack_names.name_class <> 'user_added'
    and stable_registry_public_safe_label(pack_names.display_name, 240) is not null
  on conflict do nothing;

  -- The picker reads a derived index, so the new identities need a rebuild.
  insert into stable_registry_product_projection_outbox (
    registry_release_id,
    catalog_item_id,
    catalog_item_revision_id,
    desired_state,
    state
  )
  select
    records.registry_release_id,
    records.catalog_item_id,
    records.catalog_item_revision_id,
    'present',
    'pending'
  from catalog_registry_extension_pack_rows as pack_rows
  join catalog_items as items
    on items.source = pack_source_slug
   and items.source_id = pack_rows.id::text
  join stable_registry_product_catalog_records as records
    on records.registry_release_id = target_release_id
   and records.catalog_item_id = items.id
  where pack_rows.pack_id = target_pack_id
    and pack_rows.row_class = 'product_eligible'
  on conflict do nothing;
end;
$$;

-- Packs that were already activated published nothing, so re-run each one. The
-- function is idempotent on the pack row id, so an already-published identity
-- is not duplicated.
select materialize_stable_registry_extension_pack(id)
from catalog_registry_extension_packs
where state = 'active';
