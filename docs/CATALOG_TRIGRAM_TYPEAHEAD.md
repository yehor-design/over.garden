# Catalog trigram typeahead

Status: executable runbook
Owner: OVE-355
Migration: `0043_ove355_catalog_trigram_typeahead.sql`
Flag: `CATALOG_TRIGRAM_TYPEAHEAD_ENABLED` (ships **disabled**)

## Why this exists

`stable_registry_product_catalog_names.normalized_name` was compared with a
substring `like`. One transposed or dropped character made the canonical
Postgres source return nothing, and the merged suggestion list depended entirely
on the derived Meilisearch document — for exactly the queries a gardener is most
likely to type.

That inverts the stated architecture. Postgres is the source of truth and
Meilisearch is a projection, yet for a misspelling the projection was the only
thing that answered. The same predicate also cannot use a b-tree index, because
its leading wildcard defeats one, so every keystroke past the two-character
minimum scanned the name table.

Measured against `pg_trgm` 1.6 on PostgreSQL 18.4:

| Correct | Typed | Similarity |
| -- | -- | -- |
| `помідор` | `помдор` | 0.50 |
| `lycopersicum` | `lycopersicm` | 0.67 |

## What this adds

One more source inside the merge that already exists. `searchCatalogSuggestionsForTypeaheadResult`
runs three resolvers in the same `Promise.all` and hands all three to the same
dedupe and homonym owners it already used for two.

Approximate hits go **last** in the merge. Dedupe keeps the first occurrence, so
an exact or substring match always outranks a fuzzy one for the same identity: a
gardener who spells the name correctly sees the list they saw before.

The trigram query is a second query, not a widened predicate. It applies every
guard the substring query applies — the active-release projection, the release
family, the object-kind scope, the row limit — so a fuzzy hit can never reach a
gardener through a weaker predicate than an exact hit.

## The indexes

Both are **expression** indexes, on the exact expressions the existing queries
already evaluate:

| Table | Indexed expression | Why |
| -- | -- | -- |
| `stable_registry_product_catalog_names` | `lower(normalized_name)` | what the release-scoped picker filters |
| `catalog_item_names` | `lower(display_name)` | what the legacy fallback filters |

The second is deliberately **not** `normalized_name`. That column is what the
legacy path *orders* by, not what it *searches* — see
`buildCatalogTypeaheadQuery`. An index on it would have accelerated nothing and
served no similarity predicate the code actually issues. Indexing the searched
expression is what makes one index serve both the existing substring filter and
the new similarity filter.

## The similarity floor

`STABLE_REGISTRY_PRODUCT_TRIGRAM_THRESHOLD` is `0.3`, and both the release-scoped
picker and the legacy fallback use it, so the same typo gets the same tolerance
regardless of which source holds the identity.

The predicate is written twice on purpose:

```sql
where lower(names.normalized_name) % $query
  and similarity(lower(names.normalized_name), $query) >= 0.3
```

`%` is what reaches the GIN index. The explicit comparison beside it pins the
floor, so a session-level `pg_trgm.similarity_threshold` nobody in this path sets
cannot quietly widen or narrow what a gardener sees.

## `unaccent` is created but not yet used

The migration creates the `unaccent` extension because accent-insensitive
matching is the natural next step, but **this slice does not build on it**.

Making it index-backed requires an `IMMUTABLE` wrapper function — `unaccent()`
itself is `STABLE`, and PostgreSQL refuses a `STABLE` function in an index
expression. Adding that function is a schema addition outside this issue's
boundary. Creating the extension now leaves the prerequisite in place without
pretending the behaviour exists.

## Running the proof

```bash
cd apps/web
pnpm exec tsx scripts/prove-catalog-trigram-typeahead.ts --mode verify --inject-trigram-timeout
```

Hermetic, needs no database. Proves WAIT-01: a trigram scan that never returns
does not extend the wait for the sources that already answered, and both
**Retry search** and **Continue with unknown** stay usable.

```bash
cd apps/web
pnpm exec tsx scripts/prove-catalog-trigram-typeahead.ts --mode verify --database
```

Creates its own disposable database, applies every migration, seeds one active
Foundation release with a 20,003-name corpus, and drops the database. It never
writes to the database whose connection string it borrows.

The corpus size is load-bearing: with a handful of rows Postgres scans the table
no matter what index exists, so an index-usage assertion against a toy corpus
would prove nothing.

## What the proof actually checks

| Claim | How |
| -- | -- |
| The typo is recovered | Three misspellings, Cyrillic and Latin, all found |
| The gap was real | The substring source recovers **none** of them |
| The planner reaches the index | `explain` names the trigram index and shows no `Seq Scan` |
| The budget holds | Measured query latency against the existing 500 ms deadline |
| Ranking is stable | The same query returns the same ranked set |
| Three sources, one identity | Merged through the real merge owner, zero duplicates |
| Receipts carry no query text | Counts and classes only |

## Reading the divergence receipt

`measureCatalogTypeaheadDivergence` reports counts, never queries. A divergence
receipt carrying query strings would be a log of what gardeners are looking for.

The number that decides whether Meilisearch is still load-bearing for
correctness is **`unrecoveredDerivedOnlyCount`**: identities the derived index
found that neither canonical source did. `trigramRecoveredDerivedOnlyCount` is
its complement — what the new source took back.

## Rollout

1. Land with the flag off. Behaviour is byte-identical to today.
2. Record a divergence receipt on the real corpus.
3. Enable `CATALOG_TRIGRAM_TYPEAHEAD_ENABLED` in one change.
4. Record the receipt again before treating the source as load-bearing.

## Rollback

Disable the flag. That restores the exact two-source behaviour.

The extensions and indexes stay: they also accelerate the existing substring
predicate, so removing them would be a regression rather than a rollback.

## Boundaries

- Meilisearch, its indexes, its outbox, its parity contract, and its worker
  handlers are unchanged. This issue removes no source.
- The RapidFuzz, PyICU, and CyrTranslit entity-resolution handlers own identity
  resolution, not suggestion ranking, and are untouched.
- No new UI copy and no new control. The composer's `degraded` state,
  **Retry search**, and **Continue with unknown** already existed and are reused.
- The route request and response contract is unchanged; the divergence sample
  reaches an injected observer, never the wire.
- `docs/product-research/LAYER_COVERAGE.md` records `pg_trgm` as weak on short
  Ukrainian names. That is why this is one ranked source inside an existing
  merge rather than a replacement, and why its acceptance is a measured
  divergence class rather than an assumption.
