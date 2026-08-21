# Launch Corpus (OVE-199)

Status: exact editorial manifest approved · production apply awaits exact-main deployment
Owner: maintainer
Issue: [OVE-199](https://linear.app/overgarden/issue/OVE-199/launch-corpus-bulgarian-and-ukrainian-visitors-see-real-localized)

## Purpose

Bulgarian and Ukrainian guests must see useful, locale-coherent first-party living journals — never `OVE-*` smoke labels, 10×10 placeholders, visual fixtures, or English enum stubs pretending to be gardeners.

## Content classes

Persisted on `journal_entries.content_class`:

| Class | Guest presentation |
|-------|--------------------|
| `real_ugc` | Real gardener (default for ordinary creates) |
| `founder_first_hand` | Honest founder journal label; requires `source_language` |
| `editorial` | Editorial; not an independent gardener; requires `source_language` |
| `catalog_fact` | Catalog/source fact; not a gardener |
| `production_smoke` | Never guest-launch; archive after sign-off |
| `visual_fixture` | Local/preview only; production refused |

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
The shared predicate admits `visual_fixture` only when the fail-closed visual
fixture environment resolver proves an isolated local or preview target; it
rejects Vercel Production and canonical OverGarden origins. This preserves the
CI/visual harness without weakening launch eligibility in production.

## Commands

```bash
cd apps/web
pnpm launch:corpus:plan -- --environment production --confirm-environment production
pnpm launch:corpus:check -- --environment production --confirm-environment production --base-url https://over.garden
# After Phase B seed, require readiness:
pnpm launch:corpus:check -- --environment production --confirm-environment production --require-launch-ready --base-url https://over.garden
```

Reports are redacted: counts, quality classes, disposition targets — never titles, bodies, emails, or media keys.

The plan also emits deterministic SHA-256 target hashes for the exact
public-active `real_ugc` rows. They bind maintainer review and later apply to
individual rows without placing database IDs, titles, bodies, owners, or media
identifiers in evidence. The current redacted plan output digest is
`25480c784580dd7b5d008bf33511b0f5d427c14f1b038a72631bee07cbd8accf`.

SQL used by plan/check is SELECT-only (`assertLaunchCorpusInventorySqlIsSelectOnly`).

## Launch media quality policy

OVE-231 owns `ove231.launch-media-quality.v1` in
`apps/web/src/lib/media/launch-media-quality.ts` and the bounded server analyzer
in `apps/web/src/server/media/launch-media-quality-analyzer.ts`. It classifies only the
server-stripped derivative, never the quarantine original:

- `accepted` is the only class that a new processing claim may publish.
- `rejected` covers corrupt/tiny, fully transparent, flat-color, and pinned
  mechanical placeholder failures.
- `review_required` is fail-closed for ambiguous darkness or low contrast;
  it never auto-revokes existing real-user media.

`pnpm audit:launch-corpus-media-quality -- --environment production
--confirm-environment production --mode inventory` reuses the OVE-244 public
eligibility state and reads only persisted receipt classes through aggregate
SQL. It performs zero R2/provider-object reads and emits policy version plus
aggregate classes only. Its SQL is part of the SELECT-only inventory manifest. Any archive,
revoke, seed, reclassify, reindex, or other production mutation remains an
OVE-199 exact-manifest sign-off action.

## Shot-list (truthfully labelled editorial content pack)

Topology: **2 spaces**, **4 objects** (UA plant+animal, BG plant+animal), **14 journals**.

| ID | Lang | Kind | Visibility | Cover branch | Photos |
|----|------|------|------------|--------------|--------|
| UA-J01 | uk | plant | public | no-media | 0 |
| UA-J02 | uk | plant | public | 1 inline + auto (landscape) | 1 |
| UA-J03 | uk | plant | public | multi + explicit non-first (portrait) | 3 |
| UA-J04 | uk | animal(hive) | public | cover-only square | 1–3 |
| UA-J05 | uk | plant | public | explicit stable after reorder | 2 |
| UA-J06 | uk | plant | private | 1 inline | 1 |
| UA-J07 | uk | plant | archived→410 | 1 inline | 1 |
| BG-J01…BG-J07 | bg | mirror | mirror | mirror | mirror |

Photo budget ≈ 18–22 owned/licensed files. Pipeline: quarantine → stripped derivative. Never seed `test/visual-fixtures/media/` into production.

Machine source of truth: `apps/web/src/lib/launch-corpus/shot-list.ts`.

The approved content pack uses
`ove199.launch-corpus-content-pack.v1` from
`apps/web/src/lib/launch-corpus/content-pack.ts`. It requires every shot-list
slot, reviewed source language, truthful rights/provenance receipts, media byte
digests, closed cover semantics, the four signed target hashes, and the
authoritative precise-location firewall. Validation reads local files but emits
only counts, closed error codes, and the content-pack digest:

```bash
pnpm launch:corpus:validate-pack -- --environment local --confirm-environment local --pack-file "$OVE199_CONTENT_PACK"
```

`launch:corpus:apply` validates the exact plan and content-pack digests before
loading any mutating module. `--dry-run` performs zero mutations. `--apply`
uses the sealed editorial owner, deterministic slot/media IDs, canonical
quarantine and stripped-derivative processing, canonical journal publish/archive,
OVE-242 outbox intents, exact legacy-target hashes, and a final topology/media
read-back. Missing or drifted digests fail before mutation:

```bash
pnpm launch:corpus:apply -- \
  --environment production --confirm-environment production \
  --pack-file "$OVE199_CONTENT_PACK" \
  --plan-digest "$OVE199_PLAN_DIGEST" \
  --content-pack-digest "$OVE199_CONTENT_PACK_DIGEST" \
  --apply
```

The approved 2026-07-29 pack contains 14 OverGarden-authored editorial entries
and 18 normalized Unsplash photographs. The official-license and exact source
receipt is [`docs/launch-corpus-unsplash-license-receipt.md`](launch-corpus-unsplash-license-receipt.md).

## Local cover matrix (fixtures / unit — not production photos)

`apps/web/src/lib/launch-corpus/cover-matrix.ts` covers 10+1, eleventh reject, keep-as-cover, replace failure, removal fallback, aspects, lifecycle surfaces, and production fixture refusal **without** mutating the frozen `ove187-v9` visual fixture manifest hash.

## Before → after disposition (exact classes)

| Quality class | Before | After (only with sign-off) |
|---------------|--------|----------------------------|
| `production_smoke_suspect` / technical-label public | Visible smoke | `archive` (lifecycle archived; out of feed/search) |
| `tiny_or_placeholder_media` | Dimension-tiny legacy fast count; OVE-231 supplies byte-quality classes | `revoke_via_ove195` only after exact OVE-199 review |
| `visual_fixture_namespace` (production) | Must be zero | Remove/reclassify; never seed |
| `archived_public_slug` (incl. OVE-191 retired synthetic) | Lifecycle tombs | `reclassify_retain_lifecycle` — not real UGC; keep Gone/Meili parity |
| `editorial_seed_slot` | Missing | `seed_after_signoff` via canonical operator path; `content_class=editorial`, an explicit OverGarden editorial byline, and licensed illustrative media attribution |

No bulk delete. No production mutation until the maintainer approves the exact editorial content-pack and plan digests. Editorial seed must never be presented as independent gardener evidence, a testimonial, or first-hand chronology.

## Current production plan snapshot (redacted)

See checked-in [`docs/launch-corpus-plan-production-redacted.json`](launch-corpus-plan-production-redacted.json).

Observed aggregates at Phase A cut:

- `publicActiveCount`: 4 (`real_ugc` legacy rows pending exact review)
- `archivedWithPublicSlug`: 23 (retain lifecycle; OVE-191 class)
- `visualFixtureMutationHits`: 0 in production
- `launchReady`: **false** — `insufficient_editorial_launch_public`
- Disposition: review/reclassify the 4 legacy public `real_ugc` rows under sign-off; seed 14 explicitly labelled editorial shot-list journals from a licensed content pack

Re-run `pnpm launch:corpus:plan -- --environment production --confirm-environment production` before signing off so counts stay current.


1. Run `launch:corpus:plan` against production; attach redacted JSON.
2. Confirm disposition targets match the table above.
3. Deliver the OverGarden-authored `uk`/`bg` editorial pack and exact Unsplash source/license receipts matching shot-list IDs.
4. Reply: `SIGN-OFF OVE-199 manifest <report-id-or-sha> — proceed with archive/seed`.
5. Phase B: seed → archive/revoke exact targets → parity → guest uk/bg proof → Linear Done.

## Pre-production non-claims

- No production archive/seed in Phase A.
- No OVE-186 Done.
- No claim that H1/H4/H6 passed.
- Visual fixture manifest remains `ove187-v9`.
