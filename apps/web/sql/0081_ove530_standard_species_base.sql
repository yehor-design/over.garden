-- OVE-530 (ADR-0035 D3): the standard species base.
--
-- The plants and animals people grow or keep in Ukraine, Bulgaria and the
-- neighbouring countries, each an existing catalogue organism with its
-- everyday name in uk, bg and ru. A gardener picks a species from this base
-- only; the rest of the catalogue stays in the database and is not offered.
--
-- The base itself is data, built by `scripts/build-standard-species.ts` into
-- `data/standard-species/standard-species.v1.json` and written by
-- `scripts/load-standard-species.ts`. This migration only adds the two tables
-- the loader fills:
--
-- * `catalog_standard_species` — membership: which organism, a plant or an
--   animal, which group, and the base version that put it there;
-- * `catalog_standard_species_names` — which name rows the base wrote or
--   changed (promoted to primary, made heavier, or demoted so that its
--   everyday name is the one primary), with what they were before, so a later
--   version can take back exactly its own changes and nothing a source import
--   wrote.
--
-- Neither holds personal data.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists catalog_standard_species (
  catalog_item_id uuid primary key references catalog_items(id) on delete cascade,
  base_key text not null,
  object_kind text not null,
  base_group text not null,
  latin_name text not null,
  wikidata_id text,
  popularity integer not null default 0,
  base_version text not null,
  assertion_id uuid references catalog_source_assertions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_standard_species_key_uidx unique (base_key),
  constraint catalog_standard_species_key_check
    check (base_key ~ '^(plant|animal):[a-z0-9]+(-[a-z0-9]+)*$' and char_length(base_key) <= 160),
  constraint catalog_standard_species_kind_check
    check (object_kind in ('plant', 'animal')),
  constraint catalog_standard_species_group_check
    check (base_group in (
      'vegetables', 'fruit', 'berries', 'herbs', 'flowers', 'houseplants',
      'trees_shrubs', 'field_crops', 'poultry', 'livestock', 'pets', 'bees',
      'fish', 'reptiles', 'birds', 'other_animals'
    )),
  constraint catalog_standard_species_latin_check
    check (char_length(latin_name) between 1 and 160),
  constraint catalog_standard_species_wikidata_check
    check (wikidata_id is null or wikidata_id ~ '^Q[1-9][0-9]*$'),
  constraint catalog_standard_species_popularity_check
    check (popularity >= 0),
  constraint catalog_standard_species_version_check
    check (base_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

-- The picker asks "is this organism in the base, for this kind?" once per
-- candidate; the primary key answers the first half, this the second.
create index if not exists catalog_standard_species_kind_idx
  on catalog_standard_species (object_kind, catalog_item_id);

create table if not exists catalog_standard_species_names (
  catalog_item_name_id uuid primary key references catalog_item_names(id) on delete cascade,
  catalog_item_id uuid not null
    references catalog_standard_species(catalog_item_id) on delete cascade,
  locale text not null,
  role text not null,
  review_status text not null,
  created_by_base boolean not null,
  previous_is_primary boolean,
  previous_weight numeric(8,4),
  -- The spelling a promoted row had, when the base's display name differs
  -- from it in case alone («домат» → «Домат»); null when unchanged.
  previous_display_name text,
  base_version text not null,
  created_at timestamptz not null default now(),
  constraint catalog_standard_species_names_locale_check
    check (locale in ('uk', 'bg', 'ru', 'la')),
  constraint catalog_standard_species_names_role_check
    check (role in ('display', 'search', 'latin_synonym', 'demoted')),
  constraint catalog_standard_species_names_review_check
    check (review_status in ('confirmed', 'review', 'single_source')),
  -- A promoted row remembers what it was; a row the base wrote has nothing
  -- to go back to.
  constraint catalog_standard_species_names_previous_check
    check (created_by_base = (previous_is_primary is null and previous_weight is null)),
  constraint catalog_standard_species_names_previous_display_check
    check (
      previous_display_name is null
      or (not created_by_base and char_length(previous_display_name) between 1 and 120)
    ),
  constraint catalog_standard_species_names_version_check
    check (base_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

create index if not exists catalog_standard_species_names_item_idx
  on catalog_standard_species_names (catalog_item_id, locale, role);
