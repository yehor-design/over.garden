-- OVE-355 — the canonical Postgres typeahead gets its own typo tolerance.
--
-- `stable_registry_product_catalog_names.normalized_name` was compared with a
-- substring `like`, so one transposed or dropped character made the canonical
-- source return nothing and the merged suggestion list depended entirely on the
-- derived Meilisearch document. That inverts the stated architecture — Postgres
-- is the source of truth and Meilisearch is a projection — for exactly the
-- queries a gardener is most likely to type. The same predicate also cannot use
-- a b-tree index, because its leading wildcard defeats one.
--
-- These are expression indexes, on the exact expressions the existing queries
-- already evaluate:
--
--   * the release-scoped picker filters `lower(names.normalized_name)`
--   * the legacy fallback filters `lower(catalog_item_names.display_name)`
--
-- The second is deliberately not `normalized_name`: that column is what the
-- legacy path *orders* by, not what it *searches*. An index on it would have
-- accelerated nothing and served no similarity predicate the code actually
-- issues. Indexing the searched expression is what makes the same index serve
-- both the existing substring filter and the new similarity filter.
--
-- No column, constraint, or table is added, and no row is rewritten. Trigram
-- indexes are built from the rows that already exist.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

create index if not exists stable_registry_product_catalog_names_trgm_idx
  on stable_registry_product_catalog_names
  using gin (lower(normalized_name) gin_trgm_ops);

create index if not exists catalog_item_names_display_trgm_idx
  on catalog_item_names
  using gin (lower(display_name) gin_trgm_ops);
