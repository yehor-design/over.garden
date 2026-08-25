# Verification Instrument Posture Alignment

Status: current repository authority for OVE-342 instrument classification
Classification schema: `ove342.assertionClass.v2`
Aggregate receipt schema: `ove342.instrumentPostureAggregate.v1`
Reconciled baseline: `4e76c6c4ecd37469df46223e0a24c29927edcabc`
Reconciled on: 2026-08-25

## Outcome

The active verification instruments now describe the behavior shipped by
OVE-330 and the later ADR-0019 media program. The catalog receipts prove the
served result classes, invalid focal input proves a served centre position with
class `clamped`, and the legacy/stale cases remain explicit no-mutation
controls. No product runtime, API, schema, migration, provider, or production
state changed in OVE-342.

The checked-in classifier reports:

- five active instrument paths;
- two paths retired by OVE-349 and still absent;
- eight active package commands;
- three commands retired by OVE-349 and still absent;
- zero remaining `retired_posture` assertions;
- zero `unclassified` assertions or artifacts.

## Active instrument classification

| Path | Assertion or control | Class | Current proof |
| --- | --- | --- | --- |
| `apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts` | `approvedCanonicalServeClass` | `preserved_control` | Requires the exact served class `exact`. |
| `apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts` | `legacyWorkerCompatibilityPreservesSuggestionOnly` | `preserved_control` | Confirms a legacy no-safe-match row remains suggestion-only and does not mutate canonical product state. |
| `apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts` | `approvedAliasServeClass` | `preserved_control` | Requires the exact served class `generated`. |
| `apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts` | `staleSourceApprovalPreservesCanonicalState` | `preserved_control` | Confirms a stale approval attempt preserves canonical state. |
| `apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts` | `authenticatedGardenSurface` | `preserved_control` | Requires the transitive gardener receipt to prove `operational_home`. |
| `apps/web/scripts/prove-deterministic-matching-rollout.ts` | aggregate matching receipt | `preserved_control` | Executes and aggregates both converted catalog smoke receipts without changing their product behavior. |
| `apps/web/scripts/smoke-catalog-alias-approval.ts` | `approvedAliasServeClass` | `preserved_control` | Reads the real typeahead result and asserts `generated`. |
| `apps/web/scripts/smoke-catalog-alias-approval.ts` | `staleSourceApprovalPreservesCanonicalState` | `preserved_control` | Preserves the stale-source no-mutation control without refusal terminology. |
| `apps/web/scripts/smoke-catalog-match-approval.ts` | `approvedCanonicalServeClass` | `preserved_control` | Reads the real typeahead result after approval and asserts `exact`. |
| `apps/web/scripts/smoke-catalog-match-approval.ts` | `legacyWorkerCompatibilityPreservesSuggestionOnly` | `preserved_control` | Preserves the legacy worker compatibility row as suggestion-only evidence. |
| `apps/web/scripts/smoke-media-focal-presentation.ts` | `containServesCenter` | `preserved_control` | Confirms contain mode is served at the safe centre position. |
| `apps/web/scripts/smoke-media-focal-presentation.ts` | `invalidFocalServeClass` | `preserved_control` | Resolves invalid focal input through the shipped resolver and asserts `clamped`. |

The classifier also records its read-only ownership boundaries:

| Path | Class | Owner/reason |
| --- | --- | --- |
| `apps/web/scripts/check-linear-contract-posture.ts` | `preserved_control` | OVE-341 contract scanner; OVE-342 does not edit it. |
| `apps/web/scripts/report-localization-coverage.ts` | `owned_elsewhere` | Localization instrument; OVE-342 does not edit it. |
| `apps/web/scripts/verify-responsive-accessibility.ts` | `owned_elsewhere` | Responsive/accessibility instrument; OVE-342 does not edit it. |
| `apps/web/scripts/verify-retired-journal-media-runtime.ts` | `preserved_control` | OVE-349 retirement guard; OVE-342 reads but does not edit it. |

## Predecessor retirement

The following paths resolve to `retired_by_predecessor` with owner OVE-349.
They must remain absent, and the OVE-349 retirement guard must continue naming
both paths:

| Retired path | Current state |
| --- | --- |
| `apps/web/scripts/verify-launch-media-quality.ts` | absent and guarded |
| `apps/web/scripts/smoke-online-composer-cutover.ts` | absent and guarded |

This is not a request to restore an earlier server-draft, original-quarantine,
server-conversion, or media-admission runtime. ADR-0019 remains authoritative:
the browser-generated WebP is the sole final media artifact and image bytes do
not traverse a Vercel Function.

## Package command map

| Active command | Instrument owner |
| --- | --- |
| `smoke:catalog-match-approval` | `apps/web/scripts/smoke-catalog-match-approval.ts` |
| `smoke:catalog-match-approval:seed-ui` | `apps/web/scripts/smoke-catalog-match-approval.ts` |
| `smoke:catalog-match-approval:reset-ui` | `apps/web/scripts/smoke-catalog-match-approval.ts` |
| `smoke:catalog-alias-approval` | `apps/web/scripts/smoke-catalog-alias-approval.ts` |
| `smoke:catalog-alias-approval:seed-ui` | `apps/web/scripts/smoke-catalog-alias-approval.ts` |
| `smoke:catalog-alias-approval:reset-ui` | `apps/web/scripts/smoke-catalog-alias-approval.ts` |
| `smoke:catalog-matching-rollout` | `apps/web/scripts/prove-deterministic-matching-rollout.ts` |
| `smoke:media-focal-presentation` | `apps/web/scripts/smoke-media-focal-presentation.ts` |

The following predecessor-retired commands remain unregistered:

- `verify:launch-media-quality`;
- `smoke:launch-media-quality`;
- `smoke:online-composer-cutover`.

## Aggregate dependency reconciliation

`smoke:catalog-matching-rollout` still executes
`smoke-catalog-gardener-readback.ts` as a transitive product proof. Its former
literal English picker checks predated the current `uk`, `bg`, and `ru` copy
authority and could not distinguish an authenticated Next.js Flight response
from a guest or error surface. The repaired smoke now proves the composed
boundary without changing a runtime owner:

- the live authenticated `/garden` response carries the operational workspace
  marker, in either raw HTML or React Flight encoding;
- the real typeahead response contains only its allow-listed public fields and
  a valid OVE-330 served class;
- atomic journal creation uses the bounded generation rendered by the current
  authenticated owner document, without logging or returning that credential;
- each canonical save is read back in a rendered browser document, and the
  Postgres fallback, unknown, own-name, duplicate, history, and leak controls
  remain active;
- `first-entry-composer.test.tsx` directly renders all three supported locales
  and proves both localized picker-copy strings for `uk`, `bg`, and `ru`.

These checks are dependencies of the five-owner aggregate receipt, not extra
classified instrument owners, so the literal five/two/eight/three inventory is
unchanged.

## Replay, deadline, and evidence boundary

`apps/web/scripts/check-instrument-posture.ts` reads only the bounded path and
package-command set above. It never edits a tracked file. Its process-local scan
session admits one active generation, returns `scan_already_running` to a second
start, exposes synchronous status and cancellation commands, and fences any
late read after timeout or cancellation. The deadline is 120,000 ms.

The aggregate receipt includes only schema/status, paths, assertion names,
classes, owner issue where applicable, command names, counts, duration, a
semantic digest, and violation codes. It excludes source contents, credentials,
user data, identities, request metadata, media keys, and precise location.

Run the complete task-local proof with:

```bash
cd apps/web
pnpm exec vitest run scripts/check-instrument-posture.test.ts
pnpm exec tsx scripts/check-instrument-posture.ts --prove-determinism --inject-dependency-timeout
pnpm exec tsx scripts/check-instrument-posture.ts --emit-aggregate-receipt
```
