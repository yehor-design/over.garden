# Launch Corpus (OVE-199)

Status: OVE-199 v1 receipts frozen · production corpus mutation suspended after OVE-349
Owner: maintainer
Issue: [OVE-199](https://linear.app/overgarden/issue/OVE-199/launch-corpus-bulgarian-and-ukrainian-visitors-see-real-localized)

## OVE-339 posture classification

The content-class eligibility rules below classify resolved corpus state; they are not an unresolved authorization or ownership decision.
Current journal media follows ADR-0019: the browser-generated WebP is the sole
final artifact, and historical source-original processing receipts remain
provenance only.

## Purpose

Bulgarian and Ukrainian guests must see useful, locale-coherent first-party living journals — never `OVE-*` smoke labels, 10×10 placeholders, synthetic fixtures, or English enum stubs pretending to be gardeners.

## Content classes

Persisted on `journal_entries.content_class`:

| Class                | Guest presentation                                                 |
| -------------------- | ------------------------------------------------------------------ |
| `real_ugc`           | Real gardener (default for ordinary creates)                       |
| `founder_first_hand` | Honest founder journal label; requires `source_language`           |
| `editorial`          | Editorial; not an independent gardener; requires `source_language` |
| `catalog_fact`       | Catalog/source fact; not a gardener                                |
| `production_smoke`   | Never guest-launch; archive after sign-off                         |
| `visual_fixture`     | Legacy value; its fixture environment is deleted; keep at zero     |

`source_language` is nullable `uk|bg`. Required for public founder/editorial rows.

Public feed, journal directory, and Meilisearch eligibility only include `real_ugc | founder_first_hand | editorial`.

### One launch-corpus public-surface policy (OVE-221)

All guest-visible journal reads use `ove221.publicLaunchSurface.v1` from
`apps/web/src/server/launch-corpus/public-surface.ts`. The shared predicate is
applied to feed, directory, journal lifecycle and related reads, object
passports, profiles, lineage, varieties, topics, knowledge evidence, social
readbacks, community counts, engagement targets, and journal mention lookup.
Meilisearch projection eligibility uses the same content-class allowlist.

`apps/web/src/server/launch-corpus/public-surface-inventory.ts` is the
machine-checked caller inventory. Its source audit fails when a listed public
module loses the shared predicate. The local real-Postgres smoke inserts all
six content classes inside a rolled-back transaction and proves that only the
three launch-eligible classes survive direct, lifecycle, relationship, and
count paths:

```bash
cd apps/web
../../infra/run-with-local-infra-env pnpm smoke:launch-corpus-surfaces
```

Operator-only inventory, moderation, owner-control, learning-signal, privacy,
and restore-readiness queries are intentionally outside this guest-surface
policy because they must observe excluded rows to enforce or report on them.
The shared predicate never admits `visual_fixture`. The fixture environment
that produced such rows was deleted under ADR-0022; the inventory keeps
reporting the class so production stays at zero rows.

## Commands

```bash
cd apps/web
pnpm launch:corpus:plan -- --environment production --confirm-environment production
pnpm launch:corpus:check -- --environment production --confirm-environment production --base-url https://over.garden
# Read-only readiness report; no seed/apply mutator exists after OVE-349:
pnpm launch:corpus:check -- --environment production --confirm-environment production --require-launch-ready --base-url https://over.garden
```

Reports are redacted: counts, quality classes, disposition targets — never titles, bodies, emails, or media keys.

The plan also emits deterministic SHA-256 target hashes for the exact
public-active `real_ugc` rows. They bind maintainer review and later apply to
individual rows without placing database IDs, titles, bodies, owners, or media
identifiers in evidence. The current redacted plan output digest is
`25480c784580dd7b5d008bf33511b0f5d427c14f1b038a72631bee07cbd8accf`.

SQL used by plan/check is SELECT-only (`assertLaunchCorpusInventorySqlIsSelectOnly`).

## Retired v1 media/apply path

OVE-349 removed the OVE-231 server analyzer, processing receipts, direct Sharp
dependency, and `launch:corpus:apply` mutator because they depended on the
retired source-original pipeline and private-then-publish state. Their earlier
receipts remain historical evidence only.

Current production corpus mutation is suspended until a fresh vertical task
defines a v2 content pack made entirely of already-final WebPs, uses the
OVE-346 direct staging/atomic-publication contract, re-runs rights and precise-
location review, and receives exact maintainer approval. The existing
SELECT-only plan/check may continue to inventory and classify current public
state; it grants no mutation authority.

## Frozen historical v1 shot-list (not executable)

Topology: **2 spaces**, **4 objects** (UA plant+animal, BG plant+animal), **14 journals**.

| ID            | Lang | Kind         | Visibility   | Cover branch                          | Photos |
| ------------- | ---- | ------------ | ------------ | ------------------------------------- | ------ |
| UA-J01        | uk   | plant        | public       | no-media                              | 0      |
| UA-J02        | uk   | plant        | public       | 1 inline + auto (landscape)           | 1      |
| UA-J03        | uk   | plant        | public       | multi + explicit non-first (portrait) | 3      |
| UA-J04        | uk   | animal(hive) | public       | cover-only square                     | 1–3    |
| UA-J05        | uk   | plant        | public       | explicit stable after reorder         | 2      |
| UA-J06        | uk   | plant        | private      | 1 inline                              | 1      |
| UA-J07        | uk   | plant        | archived→410 | 1 inline                              | 1      |
| BG-J01…BG-J07 | bg   | mirror       | mirror       | mirror                                | mirror |

Photo budget was approximately 18–22 owned/licensed files. The listed private
slot and former conversion path are incompatible with the current public-only
atomic contract.

Machine source of truth: `apps/web/src/lib/launch-corpus/shot-list.ts`.

The approved content pack uses
`ove199.launch-corpus-content-pack.v1` from
`apps/web/src/lib/launch-corpus/content-pack.ts`. It requires every shot-list
slot, reviewed source language, truthful rights/provenance receipts, media byte
digests, closed cover semantics, and the four signed target hashes.
Validation reads local files but emits
only counts, closed error codes, and the content-pack digest:

```bash
pnpm launch:corpus:validate-pack -- --environment local --confirm-environment local --pack-file "$OVE199_CONTENT_PACK"
```

No `launch:corpus:apply` command exists after OVE-349. Do not reconstruct it
from this frozen v1 pack or an earlier receipt. Any replacement must use the
current final-WebP atomic path and a new signed plan/content-pack identity.

The approved 2026-07-29 pack contains 14 OverGarden-authored editorial entries
and 18 normalized Unsplash photographs. The official-license and exact source
receipt is [`docs/launch-corpus-unsplash-license-receipt.md`](launch-corpus-unsplash-license-receipt.md).

## Local cover matrix (unit — not production photos)

`apps/web/src/lib/launch-corpus/cover-matrix.ts` lists the cover, reorder, and lifecycle branches with the unit proof that covers each. Branches that only the deleted fixture media exercised (aspect ratios, lifecycle surfaces) are marked `manual-review`.

## Before → after disposition (exact classes)

| Quality class                                            | Before                                                                  | After (only with sign-off)                                                                                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `production_smoke_suspect` / technical-label public      | Visible smoke                                                           | `archive` (lifecycle archived; out of feed/search)                                                                                                                                              |
| `tiny_or_placeholder_media`                              | Dimension-tiny legacy fast count; OVE-231 supplies byte-quality classes | `revoke_via_ove195` only after exact OVE-199 review                                                                                                                                             |
| `visual_fixture_namespace` (production)                  | Must be zero                                                            | Remove/reclassify; never seed                                                                                                                                                                   |
| `archived_public_slug` (incl. OVE-191 retired synthetic) | Lifecycle tombs                                                         | `reclassify_retain_lifecycle` — not real UGC; keep Gone/Meili parity                                                                                                                            |
| `editorial_seed_slot`                                    | Frozen v1 evidence only                                                 | `no_action_pending_signoff`; OVE-349 removed its mutator. A fresh public-only final-WebP vertical contract, rights/location review, and exact sign-off are required before any corpus mutation. |

No bulk delete. No production mutation is authorized by the v1 content-pack or plan digests. Editorial material must never be presented as independent gardener evidence, a testimonial, or first-hand chronology.

## Historical Phase A plan snapshot (redacted, non-executable)

See checked-in [`docs/launch-corpus-plan-production-redacted.json`](launch-corpus-plan-production-redacted.json).

Observed aggregates at Phase A cut:

- `publicActiveCount`: 4 (`real_ugc` legacy rows pending exact review)
- `archivedWithPublicSlug`: 23 (retain lifecycle; OVE-191 class)
- `visualFixtureMutationHits`: 0 in production
- `launchReady`: **false** — `insufficient_editorial_launch_public`
- Historical disposition: review/reclassify the 4 legacy public `real_ugc` rows; the former 14-slot seed proposal is frozen evidence and cannot be applied to the current public-only final-WebP contract.

Run `pnpm launch:corpus:plan -- --environment production --confirm-environment production` only for a current read-only inventory. It does not authorize archive, revoke, seed, media upload, or any other mutation.

Any future production corpus work requires a new vertical issue and v2 plan that
uses already-final WebPs through OVE-346 staging and atomic publication,
contains no private journal target, repeats the rights review,
and obtains a new exact approval. The historical OVE-199 sign-off phrase is not
valid authority for that work.

## Historical receipt non-claims

- No production archive/seed in Phase A.
- No OVE-186 Done.
- No claim that H1/H4/H6 passed.
