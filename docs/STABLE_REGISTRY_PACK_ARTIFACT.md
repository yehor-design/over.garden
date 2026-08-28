# Stable Registry Pack Artifact

Status: implemented by OVE-327
Owner: `apps/web/src/server/catalog-source/pack-artifact-contract.ts`
Schema version: `ove327.packArtifact.v1`
Persistence owner: OVE-328 (this issue persists nothing)

## Why one artifact

Five official source families — Ukraine State Register, Bulgarian official
varieties, the EU Official Journal Common Catalogue, breeds, and the GRIN
genebank long tail — each encoded parent binding, official name, alias, and
rights in its own private shape. No caller could classify a row without knowing
which importer produced it, so any later pack workflow would have had to
re-implement that knowledge five times.

This contract is the one normalized shape all five now emit.

## The adapter boundary

An adapter is a **pure function**. It reads an already-approved source artifact
and returns a value. It performs no SQL, no catalog mutation, no search write,
no provider call, and no filesystem write. Adapters hold no lock, claim, or
cursor, so any number may run concurrently without interfering.

| Source family                | Slug                                                  | Adapter                                     | Pack kind       |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------- | --------------- |
| Ukraine State Register       | `ua-state-register`                                   | `adaptUaStateRegisterPack`                  | `plant_variety` |
| Bulgarian official varieties | `eu-common-catalogue`                                 | `adaptBgOfficialVarietyPack`                | `plant_variety` |
| EU Official Journal          | `eu-oj-eur-lex-common-catalogue`                      | `adaptEuOfficialJournalCommonCataloguePack` | `plant_variety` |
| Breeds                       | `ua-official-bee-breeds`, `vertebrate-breed-ontology` | `adaptBreedSeedPack`                        | `breed`         |
| Genebank long tail           | `grin-global`                                         | `adaptGenebankLongTailPack`                 | `plant_variety` |

### Scope note

The adapters are **additive**. Each importer's existing persistence path is
unchanged, so catalog rows, aliases, source provenance, user objects, and the
picker behave exactly as they did at the baseline.

The issue text says an importer should "stop writing product rows directly".
Removing the write path in this change would have left the repository with no
working variety or breed import between OVE-327 and OVE-328, and would have
broken the OVE-57/61/81/85/86/88/103/106 proofs and their smokes for that
window — while the same issue's compatibility clause requires that "the product
behaves exactly as it does at the baseline until the successor issue persists a
pack." The adapter is therefore the new single shape and the sole input OVE-328
consumes; retiring the direct-write path belongs with the pack persistence that
replaces it. This is a deliberate, stated deviation, not an oversight.

## Row classification

Every row carries exactly one class. `clean` is the only one a persistence owner
may promote without a human decision.

| Class            | Meaning                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `clean`          | Rights cleared, parent bound, no collision. Promotable.                        |
| `needs_parent`   | No parent species could be proposed.                                           |
| `collision`      | Another row already claims this denomination under the same parent and locale. |
| `duplicate`      | The same source record key appeared twice.                                     |
| `rights_blocked` | The source family may not produce product evidence.                            |
| `review_needed`  | Conditional rights, or a hold the source family already declared.              |

Rights and a missing parent dominate: a row a family may not project, or one
with no parent species, is never `clean` however well formed it is. A declared
hold can narrow a class but can never widen it back to `clean`.

## Parent identity is proposed, never assigned

An adapter emits a `parentCandidate` with its evidence class
(`declared_by_source`, `derived_from_source_record`, `absent`). Assigning or
activating a parent belongs to the persistence and review owner. Every family
happens to declare a parent taxon on its rows today — `taxonNameLat`,
`speciesName`, `speciesOrCrop`, and the breed's supported species group — so
`declared_by_source` is the common case, but the artifact records which it was.

## Name truth

Only `official_denomination` is canonical, and there is exactly one per row. An
alias claiming that class refuses the whole run rather than creating a second
canonical name for one concept. Transliterations, local names, trade names,
generated names, and user-added names are alias assertions and can never become
an independent canonical identity.

## Source authorization

`docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json` remains the sole
source-use authority; an adapter may never override it. `PACK_SOURCE_RIGHTS`
mirrors its verdicts, and `pack-artifact-contract.test.ts` asserts the mirror
still matches the manifest, so a manifest change breaks the build rather than
silently widening what an adapter may project.

- `USE` → rows may reach `clean`.
- `USE-WITH-CONDITIONS` → rows are held `review_needed` inside the artifact.
- `INTERNAL-VALIDATION-ONLY` → rows are `rights_blocked`.
- `REJECT` → the run is refused outright.
- A family declared in code but absent from the manifest (the official Ukrainian
  bee-breed seed) is admitted only if its own `allowedUsage` permits product
  projection, and the artifact records `declared_in_source` so a reviewer sees
  it.

## Determinism and bounds

Artifact identity is source slug plus declared version plus artifact byte digest
plus adapter schema version. Identical bytes replay to an identical digest and
an identical class vector; changed bytes produce a different artifact rather
than mutating the prior one.

Bounds are finite and refuse rather than truncate: at most `200000` rows, at
most `64` aliases per row, and a `60000` ms wall-clock deadline. There is no
resumable or partial state — a failed run leaves nothing behind, and retry is a
full recomputation.

## Verification

```bash
cd apps/web
pnpm exec vitest run \
  src/server/catalog-source/pack-artifact-contract.test.ts \
  src/server/catalog-source/pack-adapters.regression.test.ts
pnpm exec tsx scripts/verify-stable-registry-pack-adapters.ts --prove-determinism
pnpm exec tsx scripts/verify-stable-registry-pack-adapters.ts --inject-read-timeout
```

The verifier emits only aggregate evidence: source-family class, pack kind, row
and classification count buckets, parser-bound class, duration, and digest
presence. It never records a denomination, a source row identifier, a raw
payload, coordinates, or a credential.

`--inject-read-timeout` proves the no-wedge contract: an unreadable source
artifact ends the run with one bounded `timed out` receipt rather than a
half-parsed artifact, and both declared controls stay usable.
