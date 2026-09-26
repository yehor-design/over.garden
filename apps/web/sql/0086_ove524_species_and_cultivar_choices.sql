-- OVE-524 (29.14): an object's species and its cultivar or breed are two
-- explicit choices, each stored as the gardener made it.
--
-- The species is one of three things: not known, a species of the standard
-- base (ADR-0035 D3), or the gardener's own text. The cultivar or breed is
-- not known, an entry of that species' list, or — only after an own species —
-- the gardener's own text. Nothing is guessed on their behalf.
--
-- How the choices are stored:
--
--   * `catalog_item_id` stays the most specific node chosen, with
--     `variety_state = 'selected'`: the species when the cultivar is not
--     known, the cultivar or breed entry otherwise (its species is the target
--     of its `form_of`). Every reader of the object's organism — the species
--     page and its publication rule, the passports, the search weight — reads
--     exactly this pair already, so none of them changes.
--   * `species_text` (new) is the own species. It is private to the gardener
--     (ADR-0026 D6), like the label it replaces.
--   * `variety_state = 'own'` (new) with `variety_text` is the own cultivar
--     text after an own species.
--   * Nothing known is `variety_state = 'unknown'` with both texts null.
--
-- A new CHECK names the four combinations and refuses every other one.
--
-- `free_text` — the label the old picker kept — stays a legal value for one
-- reason only: `catalog_revert_action` (0056) restores a historic label link
-- to it, and production holds two such links. No writer of this release
-- produces it; 29.15 removes the label ladder, its queue items and the value
-- together.
--
-- Existing rows, read in production on 2026-09-26 (read-only):
--
--   * 162 `selected` objects keep their link. Their `variety_text` is a name
--     of their node in every case (160 the canonical name, 2 another of its
--     names), so no own cultivar text sits under a catalogue species and
--     nothing becomes a list entry: the old picker could not store both.
--   * 10 `free_text` objects (the launch smoke's «Launch smoke plant») carried
--     the gardener's own name for what the object is, with no catalogue
--     species. That is the own species now: the text moves to `species_text`
--     and the state becomes `unknown`. The owner's page shows the same text in
--     the same place.
--   * 9 `unknown` objects have no text and stay as they are.
--
-- A gardener-added cultivar or breed is a catalogue node, not a label: kind
-- `cultivar` or `breed`, `form_of` its species, `source = 'gardener'`,
-- created by the gardener (`created_by_user_id`) and not yet reviewed
-- (`reviewed_at` null). The object points at it, so the owner's later
-- corrections, merges and removals (29.21) reach every object that uses it.
-- 0055 retired the earlier, private gardener cards — one per gardener, never
-- shared, kept out of every public read. This entry is the opposite by the
-- owner's decision of 2026-09-25: one per species and name, shared with every
-- gardener at once and published like any form. The retired cards stay
-- retired; nothing here touches them.
--
--   * Its relation needs a source assertion, and an assertion a snapshot: the
--     snapshot below is the gardeners' source, one row, created once.
--   * The per-gardener unique index 0061 kept for the retired cards
--     (`created_by_user_id, normalized_name, locale, node_kind`) is dropped:
--     it would refuse one gardener naming «Рожевий» under a tomato and under
--     a pepper. One entry per species and name is kept by the writer, under
--     a per-species advisory lock, by `catalog_cultivar_key` below.
--   * `catalog_cultivar_key` is the matching key of a cultivar name: the
--     shared normalizer, then Ukrainian and Russian spellings of one sound
--     folded together (і ї ы → и, є э → е, ъ ь and the apostrophe dropped)
--     and hyphens read as spaces. «Черокі» and «Чероки» are one entry.
--     `src/lib/catalog/cultivar-key.ts` is its TypeScript twin; the proof
--     script holds the two to one fixture.
--
-- Additive except the label move above, which the rollback beside this file
-- reverses. Apply before deploying the release that writes the new states;
-- the release before it writes only `selected`, `unknown` and `free_text`,
-- which the new CHECK accepts in the shapes it writes them.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ======================================================================
-- 1. The own species
-- ======================================================================

alter table plant_objects
  add column if not exists species_text text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'plant_objects_species_text_check'
      and conrelid = 'plant_objects'::regclass
  ) then
    alter table plant_objects
      add constraint plant_objects_species_text_check
      check (
        species_text is null
        or (
          char_length(species_text) between 1 and 120
          and species_text = btrim(species_text)
        )
      );
  end if;
end $$;

-- ======================================================================
-- 2. The label becomes the own species
-- ======================================================================

alter table plant_objects
  drop constraint if exists plant_objects_catalog_choice_check;

update plant_objects
set species_text = left(btrim(regexp_replace(variety_text, '\s+', ' ', 'g')), 120),
    variety_text = null,
    variety_state = 'unknown',
    updated_at = now()
where variety_state = 'free_text'
  and catalog_item_id is null
  and nullif(btrim(variety_text), '') is not null;

-- A label with no text was never a choice.
update plant_objects
set variety_text = null,
    variety_state = 'unknown',
    updated_at = now()
where variety_state = 'free_text'
  and catalog_item_id is null
  and nullif(btrim(variety_text), '') is null;

-- An `unknown` object with a text: none in production, but an old fixture
-- wrote some. The owner's page showed the text as the object's identity, so
-- it stays that — the own species — and an empty one goes.
update plant_objects
set species_text = case
      when nullif(btrim(variety_text), '') is null then species_text
      else left(btrim(regexp_replace(variety_text, '\s+', ' ', 'g')), 120)
    end,
    variety_text = null,
    updated_at = now()
where variety_state = 'unknown'
  and variety_text is not null;

-- ======================================================================
-- 3. The closed values and the combinations
-- ======================================================================

alter table plant_objects
  drop constraint if exists plant_objects_variety_state_check;

alter table plant_objects
  add constraint plant_objects_variety_state_check
  check (variety_state in ('selected', 'unknown', 'own', 'free_text'));

alter table plant_objects
  add constraint plant_objects_catalog_choice_check
  check (
    (
      variety_state = 'selected'
      and catalog_item_id is not null
      and species_text is null
    )
    or (
      variety_state = 'unknown'
      and catalog_item_id is null
      and variety_text is null
    )
    or (
      variety_state = 'own'
      and catalog_item_id is null
      and species_text is not null
      and variety_text is not null
    )
    or (
      variety_state = 'free_text'
      and catalog_item_id is null
      and species_text is null
      and variety_text is not null
    )
  );

-- ======================================================================
-- 4. Gardener-added cultivars and breeds
-- ======================================================================

insert into catalog_source_snapshots (
  source_slug,
  source_name,
  source_category,
  source_version,
  source_url,
  license,
  license_url,
  attribution_required,
  attribution_text,
  parser_version,
  payload_sha256,
  fetched_at,
  verified_at
)
values (
  'overgarden-gardeners',
  'Overgarden gardeners',
  'gardener_entry',
  '1',
  'https://over.garden/terms',
  'Overgarden terms of use',
  null,
  false,
  null,
  'ove524',
  encode(sha256(convert_to('overgarden-gardeners', 'UTF8')), 'hex'),
  now(),
  now()
)
on conflict (source_slug, source_version, payload_sha256) do nothing;

drop index if exists catalog_items_owner_normalized_locale_node_uidx;

create or replace function catalog_cultivar_key(input text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select btrim(
    regexp_replace(
      translate(catalog_normalize_name(input), 'іїыєэъь''', 'иииее'),
      '[\s-]+',
      ' ',
      'g'
    )
  )
$$;
