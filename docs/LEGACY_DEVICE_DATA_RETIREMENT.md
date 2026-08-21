# Legacy device data retirement

Status: reduced exact-name cleanup shipped by OVE-323
Connectivity authority: `docs/adr/ADR-0017-online-only-product.md`
Historical predecessor: OVE-322 read-only retirement bridge

## Current purpose and non-claim

OverGarden is network-required and server-authoritative. OVE-323 removed the
Dexie/PWA runtime, local journal writers, replay queue, owner-vault lifecycle,
foreground autosync, service-worker asset/registration, manifest, icons,
runtime fixtures, and retired package dependencies.
The proxy hard-404s the four retired public asset paths (`/sw.js`,
`/manifest.webmanifest`, `/icon-192.png`, and `/icon-512.png`) before locale or
App Router fallback handling.

One deliberately narrow browser boundary remains for a profile that previously
opened an older build. It may enumerate and delete exact known physical names.
It does not import the retired runtime, open journal stores, read records or
Blobs, infer an owner, transfer content, write local state, or claim remote
cleanup. A device that never returns cannot be inspected or cleaned.

## Exact browser-storage boundary

The dependency-free native implementation recognizes only:

- shared database `overgarden-offline`;
- content-free control database `overgarden-control-v1`;
- owner database
  `overgarden-offline-owner-v1-{43-character-opaque-binding}`;
- same-origin service-worker script path `/sw.js`.

The exact known Cache API set is empty because the retired worker owned no
cache. Any OverGarden-looking cache is therefore an inconclusive condition,
not deletion authority. Unrelated IndexedDB databases, cache entries, cookies,
local storage, session storage, and service-worker registrations are preserved.
Broad origin clearing, `Clear-Site-Data: "storage"`, name globs, user-provided
names, and cleanup inferred from application content are forbidden.

Browser database enumeration is mandatory for a positive physical-absence
receipt. If `indexedDB.databases()` is unavailable, cleanup fails closed and
the user can retry or leave. The control registry is read only when its exact
database already exists; the cleanup must never create it through an upgrade.

## Deletion admission

The shared database can be deleted by exact name because OVE-322 already ended
all supported content transfer. An owner database can be deleted only when its
matching content-free control record is in one of these terminal states:

- `retirement_resolved`;
- `foreign_or_orphan_retained`.

An absent, malformed, duplicate, or non-terminal binding is unresolved. Its
owner database and the control database are retained. The UI receives only a
bounded unresolved count and opaque error class; it never receives identity,
record keys, journal content, media bytes, or timestamps tied to a person.

The cleanup unregisters only a same-origin registration whose active,
installing, or waiting script URL has pathname `/sw.js`. Any failure, blocked
database deletion, unexpected cache, missing enumeration, invalid control
record, cancellation, or timeout remains `deletion_blocked`.

## Runtime and UI semantics

The boundary runs once per normal document for guests and authenticated users;
internal visual fixtures are excluded. Successful absence is silent. Failure
or unresolved binding shows a localized non-blocking banner with retry and
dismiss controls. While an attempt is active, cancel is available. An
authenticated shell also exposes the existing safe current-session sign-out
action.

There is one in-flight operation, a global three-second deadline, synchronous
cancellation, and stale-result suppression. The banner cannot block reading,
navigation, authoring, publication, locale change, or sign-out. It never
reports journal work as saved.

Completion requires two consecutive inventory reads proving absence of every
database admitted for deletion, the exact worker, and the empty exact known
cache set. Unresolved owner/control databases are intentionally excluded from
the expected-absence set and are explicitly reported as retained.

## Historical OVE-322 transfer window

OVE-322 previously shipped a temporary read-only retirement bridge. On an
exact returning browser it could classify current-owner legacy work, submit it
through the server-authoritative journal/media protocols, verify each canonical
effect, and then delete only the verified source. Foreign, orphaned, changed,
or uncertain state was retained. Its production closeout proved a synthetic
transfer, owner-scoped server read-back, targeted browser cleanup, unrelated
state preservation, authoritative account erasure, and two zero-residue reads.

That transfer protocol, its adapters, content UI, fixtures, and server binding
route are historical and non-operative after OVE-323. They must not be restored
as rollback. Rollback of the reduced boundary keeps exact legacy names in
place, cancels or rolls forward cleanup, and preserves the network-required
product contract.

## Verification

```bash
cd apps/web
pnpm online-only:canon:check
pnpm exec vitest run \
  src/lib/retirement/known-client-storage.test.ts \
  src/lib/retirement/legacy-device-retirement.test.ts \
  src/components/retirement/legacy-device-retirement-banner.test.tsx
pnpm exec playwright test tests/offline-runtime-absence.spec.ts \
  --project=chromium --project=firefox --project=webkit
pnpm smoke:offline-runtime-absence -- \
  --base-url http://127.0.0.1:3000 --require-build-output
```

The broad repository, privacy, media, session, localization, accessibility,
build, exact-main containment, Vercel READY/alias, and authenticated Linear
read-backs remain additive closeout gates. A local browser result alone is not
a production completion receipt.
