# ADR-0025 — The Stable Registry release model and the Release Center are retired; the EPPO observed capture stays

- **Status:** Accepted (decision 2026-09-05). The code and schema retirement is
  one pending slice, `OVE-385`; nothing in the product depends on it happening
  today.
- **Date:** 2026-09-05
- **Decision owner:** founder/owner
- **Supersedes:** ADR-0016 for everything past the observed capture — immutable
  Foundation releases, stable identities, the independent product-eligibility
  gates, and the product projection; ADR-0020 in full; the example list in
  ADR-0022 D5 ("the Stable Registry Release Center, extension packs, and
  editions"), not the rule that admin is the product; section 7 of
  `docs/product-research/PRODUCT_CANON_2026-09.md` and entries G1 and I1 of its
  ledger. Older ADRs are immutable history and are not edited.
- **Relates to:** ADR-0022 D5 (admin is the product) stays. The catalog
  gardeners use today is untouched.

## Context

The Stable Registry was a second catalog pipeline: an isolated layer of
observed sources in quarantine, immutable Foundation releases assembled from
them, editions and extension packs on top, an owner-facing Release Center in
which each release is built, previewed, approved and activated, and a public
projection — the "Stable Catalog" at `/catalog`. Its schema landed in
production on 2026-09-03 (migrations `0023`–`0028`, `0040`–`0043`, `0048`);
the Release Center, editions and extension packs render for the sealed owner;
the first observed capture of every documented EPPO identifier — 129,214 of
them — closed on 2026-09-04 on a loopback database
(`docs/EPPO_OBSERVED_CAPTURE_PROOF_2026-09.md`).
No Foundation release was ever built. Every release, decision, edition and pack
table is empty in every database, and a gardener has never seen anything
through it.

On 2026-09-05 the owner said, first, that they do not need the Release Center
and will not use it, and then, asked which one they meant: remove the Release
Center and the Stable Registry from the plans completely. Asked once more, they
added the one constraint this record has to carry: the downloaded EPPO data
stays with us; they have plans for it.

What the registry cost while it stood is on the record of the same day. Its
three job kinds were the change that broke the matching image release for
eight days, and the nine-handler worker they required found two more defects
on its first deploy. A surface nobody uses is still code, schema, tests and a
handler set the product has to keep correct.

What the product already has is the catalog gardeners use: `catalog_items` and
`catalog_item_names`, filled by the Slice 12 imports and by gardeners'
own names, curated through deterministic matching suggestions, searched by the
trigram typeahead in Postgres (`0043`), and shown at `/objects`, `/species/*`,
`/variety/*` and `/breed/*`. That catalog never depended on a Foundation
release; the registry's product-selection path sat behind a feature gate and
contributed nothing because no release was active.

## Decision

### D1. Retired

Retired from the product and from every plan: Foundation releases, editions,
extension packs, the Release Center at `/garden/catalog/registry` and its two
sub-pages, the Stable Catalog projection and its public explorer at `/catalog`
and `/catalog/[stableTaxon]`, the `stable_registry_foundation_build`,
`stable_registry_extension_pack_build` and `stable_registry_edition_build`
job kinds and their worker handlers, the pack-artifact adapters, the
`stable_registry` scope of search documents, the registry product-selection
gate in the gardener catalog, and the registry actor rekey in erasure once the
tables it rekeys are gone. No Foundation release will be built. No source-built
catalog is planned. `docs/STABLE_REGISTRY*.md` become history.

### D2. Retained: the EPPO observed capture and every table that holds EPPO data

The owner has plans for the EPPO data. Nothing here specifies them, and
nothing here may pre-empt them. Retained, and never on a drop list:

- the capture itself — `catalog_source_capture_runs` and
  `catalog_source_capture_units`, which hold the raw payloads (0042 made the
  units the payloads' single home);
- the shared source layer the capture materialises into and the earlier imports
  also use — `catalog_source_records`, `catalog_source_snapshots`,
  `catalog_source_links`, `catalog_source_refresh_*`;
- the public EPPO archive projection — `stable_registry_public_eppo_records`
  and `stable_registry_public_eppo_search_terms` — and its read-only route at
  `/sources/eppo` and `/sources/eppo/[code]`, which is today the only reader of
  the capture. Its `stable_registry_` prefix is a name, not a dependency;
- the capture tooling (`pnpm eppo:observed-capture` and
  `apps/web/src/server/catalog-source`), the EPPO credential bootstrap,
  migrations `0023`, `0042` and `0048`, and the receipts.

The completed capture (`df3852ea-3233-4883-8886-92d9e68f5193`) lives only in
the owner's loopback database, which is a scratch database by design. A
`pg_dump` of the retained tables is kept outside it, at
`~/Desktop/Startups/OverGarden-data/eppo/`, with the restore command beside it,
so a local reset cannot lose the data. Production holds no capture; the
retirement slice proves that with a read-only inventory before touching a
schema.

### D3. The gardener catalog is unchanged

`catalog_items`, `catalog_item_names`, the matching suggestion queues, the
trigram typeahead, and the public object pages stay exactly as they are. The
only change they see is the removal of a gate that never opened.

### D4. How the retirement happens

One Linear slice, `OVE-385`, in two parts, on the usual branch-per-issue rule:

1. **Non-destructive first.** Remove the routes, pages, components, handlers,
   job kinds, adapters, search scope, feature gate, scripts, tests and
   documents named in D1; regenerate the job queue contract; let CI's executed
   database proofs and the release workflow prove the six-handler worker; seal
   and deploy it through `install`, `migrate`, `deploy` as on 2026-09-05. Any
   `stable_registry_*` job still queued in production terminalises as
   `unsupported_kind`, which is the correct outcome for a cancelled kind.
2. **Destructive last, and gated.** One migration drops the empty release
   tables (every `catalog_registry_*` table, `stable_registry_product_*`,
   `stable_registry_public_catalog_*`, the registry's payload CHECK constraints
   on `job_queue`) with a rollback script that recreates them. It is applied to
   production only after a read-only inventory shows zero rows in each, and
   only with the owner's explicit approval, as `AGENTS.md` rule 10 requires.
   The D2 tables are absent from that migration by construction, and the
   executed-SQL proof asserts they survive it.

## Consequences

- The worker's handler set returns to six kinds; the generated contract,
  the CI database proof and the release seal follow the manifest, so no
  hand-written list has to change.
- The account menu loses the Release Center; `/health` and the owner pages
  that remain are unchanged.
- `/catalog` and `/catalog/[stableTaxon]` disappear. They were empty and
  `noindex`, and the sitemap never listed them — its chunks are entries,
  profiles and communities — so nothing indexed is lost.
- `docs/PROJECT_STATE.md` no longer names "the catalog activated from real
  source data" as the next work; known gap 5 becomes the pending retirement.
- The EPPO plans, when the owner states them, get their own ADR. Until then
  the archive route and the capture tooling are maintained, not extended.

## Superseded clauses

- ADR-0016: "immutable releases", "stable identities", "independent
  product-eligibility gates", "product projection" — superseded. Its
  observed-capture clauses describe evidence that exists and is retained;
  they are history that nothing extends.
- ADR-0020: superseded in full; `0027` and `0028` were allocated and applied
  and will be dropped by the D4 migration.
- ADR-0022 D5: the sentence naming the Release Center, extension packs and
  editions as the operator pages is superseded; the rule stands.
- `docs/STABLE_REGISTRY.md` and its six companions, and the registry
  reservations in `docs/MIGRATION_ALLOCATION.md`: history.
