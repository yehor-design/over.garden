# Stable Registry Foundation operator runbook

> History since 2026-09-05: the Stable Registry release model this page
> belongs to was retired by `docs/adr/ADR-0025-stable-registry-retired.md`.
> Nothing here is to be executed or extended; the EPPO archive surface it
> mentions, if any, is retained under that record's D2.

## Purpose

The Foundation Release Center creates a reviewable, immutable local release
from one completed OVE-254 observed capture. It is not a source-payload
viewer, a per-record approval queue, or a production-publication control.

The stable OverGarden concept identifier remains `catalog_items.id`. The
Foundation process adds immutable revision and membership receipts around
already product-owned catalog identities. A source row has no product
eligibility merely because it was observed in EPPO.

## Safety boundaries

- Use `/garden/catalog/registry`; `/garden/catalog/curation` redirects there.
- Only the canonical catalog owner can build, decide, approve, abandon, or
  activate a release.
- The screen displays aggregate counts and reason groups only. It must never
  display raw payloads, source-only fields, precise coordinates, private
  object IDs, or user data.
- A Foundation build starts only from a completed OVE-254 capture receipt.
- Active plant/animal source facts without an independent deterministic
  authority mapping are grouped as `authority_corroboration_required`, not
  assigned a product identity. Unsafe, inactive, or incomplete facts stay in
  `source_only_or_ineligible`.
- The worker receives only a release UUID and has a 300-second claim lease.
  It never receives source payloads or an activation capability.
- The release-center feature flag stays disabled in deployed environments
  until the separately approved OVE-259 rollout. This runbook does not
  authorize a production activation.

## Owner flow

1. Confirm the capture is terminal `completed` and its manifest receipt is
   immutable. Do not start from a partial, failed, or superseded capture.
2. Open the Release Center from the account menu. If it says the feature is
   disabled, the `STABLE_REGISTRY_RELEASE_CENTER` kill switch is off in that
   environment (ADR-0022, D5); it is `true` in production.
3. Build Foundation. The action is idempotent for the capture digest and
   policy version; a repeated click returns the existing draft.
4. Wait for `review_ready`. The build is background work; use **Cancel build**
   if the bounded worker receipt does not recover. Cancelling preserves the
   audit history and cannot mutate the current catalog.
5. Read aggregate counts and resolve each exception group with exactly one
   allowed action: `same_concept`, `different_concept`, `add_alias`,
   `keep_current`, `create_successor`, `defer`, or `block_rule`.
   The decision is an immutable group receipt, never an instruction to mint or
   rewrite a catalog UUID from an observed source row. A source row enters
   membership only after its separate identity and eligibility evidence is
   present.
6. The preview button stays unavailable while a group is open or blocked.
   When preview is approved, it records a digest of release membership and
   decisions; changing either makes an activation request stale.
7. Activation asks for the confirm step (the box that names the eligible and
   total member counts) and then atomically updates the single Foundation pointer,
   records the activation receipt, and queues derived-search intent. It
   reports `queued`, never a false claim that Meilisearch, public discovery,
   or gardener picker parity is complete.
8. Read back the active release, its immutable membership, revision numbers,
   decision receipt, pointer, and search-outbox state. Use a later edition or
   explicit rollback receipt for correction; never rewrite an active release
   in place.

## Where each operation runs

| Operation | Runs | Progress |
| --- | --- | --- |
| Build Foundation release | Server Action inserts the draft (set-based SQL under the interactive deadline) and enqueues `stable_registry_foundation_build`; the Python worker builds it | release state `building` → `review_ready` on the page |
| Decide an exception group, approve a preview | Server Action, in-request SQL | immediate |
| Activate a Foundation release | Server Action after the confirm step; pointer move in one transaction; `admin_role_audit_log` row | immediate |
| Import a pack | Server Action enqueues `stable_registry_extension_pack_build`; worker parses it | pack state on the page |
| Activate a pack | Server Action after the confirm step; audit row | immediate |
| Prepare an edition | Server Action enqueues `stable_registry_edition_build`; worker diffs it | edition state on the page |
| Activate, roll back, or move forward an edition pointer | Server Action after the confirm step; audit row | immediate |

Every in-request operation completes in well under ten seconds on the current
catalog; a longer one would move to the worker with a progress row. Every
irreversible action needs the confirm box; without it the action answers
`confirmation_required` and changes nothing.

## When the screen says the registry is unavailable

Since OVE-374 (ADR-0023) the three registry surfaces never leave you on a
skeleton. A failure is a panel with a sentence, a retry, and a reference code,
and the machine class sits in `data-section-failure` on the panel's `<section>`.
Read it before deciding what to do:

| What you see | Class | What it means | What to do |
| -- | -- | -- | -- |
| A named relation and a pointer to `docs/MIGRATION_ALLOCATION.md` | `schema_missing` | The production database does not have the relation this screen reads | Apply the migration that owns it, then reload |
| "The release center is unavailable right now" | `connection_unavailable` | The database could not be reached at all | Check the database before touching the registry; nothing here is wrong |
| The same panel with a slow page | `query_timeout` | The read passed its own deadline | Retry once; if it repeats, treat it as a database-load question |
| "Access denied" | — | A genuine refusal, not an outage. Since OVE-374 these are told apart, so this really is the role check | Confirm you are signed in as the sealed owner |

The relation name is shown **only** on owner-only surfaces — the three registry
screens and erasure requests — because the owner is the person who can apply the
migration. A gardener's screen never gains a machine code.

The reference code on the panel is the same string the deployment's runtime log
writes on the `workspace_server_error` line, so you can match one to the other:

```bash
vercel logs <deployment> | grep workspace_server_error
```

### Clearing a `schema_missing` panel

1. Read the relation name off the panel.
2. Find the migration that creates it in `docs/MIGRATION_ALLOCATION.md`.
3. Confirm it is genuinely absent in production —
   `docs/PRODUCTION_SCHEMA_STATE.md` says how to check, and assuming is what
   produced this panel in the first place.
4. Apply it with the reviewed-migration path, then reload the screen. The panel
   is replaced by the release center; no restart or redeploy is needed.

## Recovery and rollback

| Condition                         | Safe response                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Worker lease timeout or restart   | Keep the release non-active. Reopen the same draft after the worker resumes; its inserts are idempotent.                      |
| Failed terminal build             | The release is terminal `failed`. Start a new draft only after correcting the bounded rule or source receipt.                 |
| Stale decision or preview         | Refresh the release receipt; do not retry with an old version or digest.                                                      |
| Search outage                     | The activation receipt remains local and its outbox intent remains pending. Do not call public projection successful.         |
| Need to stop work                 | Abandon the draft. This disables the queued build and preserves history; it does not delete rows or alter the active pointer. |
| Need to reverse an active release | Do not edit membership. Use the successor/rollback lifecycle owned by OVE-258 and retain an explicit activation receipt.      |

## Local, aggregate-only proof

The smoke command is deliberately write-disabled and never contacts a source
provider or production database:

```bash
cd apps/web
tsx scripts/smoke-stable-registry-foundation.ts --fixture complete-foundation --records 129188 --writes-disabled
tsx scripts/smoke-stable-registry-foundation.ts --fixture worker-lease-timeout --records 129188
```

The first receipt proves deterministic aggregate grouping and the 1000 ms
interaction budget. The timeout receipt additionally proves that **Cancel
build** and **Return to current catalog** remain enabled without a global wait
overlay or unbounded retry.

## Closeout checklist

Before an implementation is merged, run migration/type checks, the focused
TypeScript and Python tests, the two smoke fixtures, the standard repository
gates, exact-SHA deployment proof, and the authenticated Linear read-back.
Production activation and public/search/picker parity are intentionally left
for OVE-259 after its own approved rollout plan.
