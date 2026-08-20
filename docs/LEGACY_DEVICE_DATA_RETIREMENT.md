# Legacy device data retirement

Status: temporary production bridge owned by OVE-322
Lifetime: from the OVE-322 production deployment until the OVE-323 production
deployment
Connectivity authority: `docs/adr/ADR-0017-online-only-product.md`

## Purpose and non-claim

The current OverGarden product is network-required and server-authoritative.
This bridge exists only for a browser that returns with journal work created by
an older build. It can transfer the current authenticated owner's known legacy
records through the current server APIs, verify the authoritative effects, and
then remove the exact resolved device state.

The bridge creates no new durable browser journal record and is not an offline
fallback. A device that never returns cannot be inspected or cleaned by the
server. Completion evidence therefore applies only to the exact browser profile
that was opened and verified; it must never be generalized to another or
unreachable device.

## Gardener journey

The retirement control mounts only inside the authenticated garden plane after
session convergence has produced one current owner, session generation, owner
vault binding, and document-mutation generation. It is not mounted on public,
authentication, safe-erasure, or operator routes.

- No current-owner items means silent targeted cleanup; no banner is shown.
- Current-owner items produce a dismissible, non-blocking banner in Ukrainian,
  Bulgarian, or Russian. Reading, composing, publishing, navigation, locale
  change, and sign-out remain available.
- Transfer processes at most 200 classified items per batch with one network
  item in flight. Each network/media attempt has a 30-second deadline; storage
  and exclusive-fence operations have a 3-second deadline.
- Cancel aborts the current attempt and cannot authorize a late deletion.
- Retry is explicit. A conflict, changed session, timeout, blocked database
  deletion, or uncertain read retains the source.
- Discard is secondary and requires two explicit confirmations. It deletes only
  the displayed current-owner legacy items and never cookies, authentication
  state, or unrelated origin storage.
- The banner states that the transfer window ends with the OVE-323 production
  deployment. A banner surviving that deployment is a defect.

Another-owner and unresolved binding state is content-opaque. The UI may show a
generic count/state and a safe sign-out action, but it must not show an owner
identifier, record key, title, body, media bytes, timestamp tied to an identity,
or other private content. Those rows and databases are retained.

## Exact browser-storage boundary

The bridge recognizes only these existing physical names:

- shared database `overgarden-offline`;
- content-free control database `overgarden-control-v1`;
- owner database
  `overgarden-offline-owner-v1-{43-character-opaque-binding}`;
- same-origin service-worker script path `/sw.js`.

The current service worker owns no cache. Consequently the exact known
OverGarden Cache API set is empty: an unexpected OverGarden-named cache is an
inconclusive state, not permission for broad deletion. Unrelated IndexedDB
databases, Cache API entries, cookies, local storage, session storage, and
service-worker registrations are outside the cleanup scope.

Database enumeration is used when the browser supports it. A browser without
enumeration may use the content-free control registry to locate an exact
current binding, but it cannot report physical absence success without the
required independent enumeration receipt. `Clear-Site-Data: "storage"`, broad
origin clearing, name globs, and user-supplied database names are forbidden.

The shared database is opened dynamically at its installed schema version so
inspection cannot run the former schema-upgrade writers. Owner-scoped v3+
records can be read without creating summary or durability rows. Pre-owner v1
or v2 rows are unattributable: their content is not read, their database is not
upgraded or cleared, and the bridge reports retained unresolved residue.

## Transfer and verification protocol

Every transfer starts from a bounded read-only snapshot under the exact owner
fence. The fence is released before a network call and reacquired before source
deletion; it is never held across a 30-second request. Ordinary legacy writers
are drained/aborted at the fence, and the source digest is re-read inside the
delete transaction.

The item classes are handled as follows:

1. A legacy draft is normalized to the OVE-321 private server draft contract.
   Its stable draft generation and payload digest bind retries. The returned
   server revision/hash is read back before local deletion.
2. A content-bearing mutation is submitted through the current journal create
   path with its original stable `clientMutationId`, then its canonical result
   is verified before deletion.
3. A receipt-only synced row is verified through the payload-free,
   owner-scoped journal receipt lookup for its stable `clientMutationId`.
4. A photo intent uses a deterministic upload-generation UUID. Repeating the
   same generation returns the same owner-scoped media asset. If the original
   was already processed and removed, retry does not recreate or re-upload the
   original; the processed derivative is read back instead.

A same-key payload mismatch is a closed conflict. Divergent device/server
copies require an explicit gardener choice, shown only with content-free count
and timestamp context. Positively resolved invalid input, precise-location
text, unsupported media, another-owner content, or a changed session never
authorizes deletion.

After each verified batch, the bridge deletes only the matching source rows
under a fresh exact-owner exclusive fence. Finalization removes empty resolved
owner/shared databases, the current control record, the exact `/sw.js`
registration, and the control database only when no retained foreign/orphan
record needs it. A shared database containing another owner's rows remains and
records `foreign_owner_residue`; a foreign or orphan owner database remains
opaque and records `foreign_or_orphan_retained`.

Completion requires two consecutive reads proving absence of every expected
current-owner database, the exact service worker, and the empty exact known
cache set. A blocked delete, open handle, unavailable enumeration, unexpected
cache, or single absence read is not success.

## Server cutoff

Current journal publication and both media mutation routes send the positive
header
`x-overgarden-online-journal-protocol: ove321.server-authoritative-journal.v1`.
An authenticated request without that exact marker receives private/no-store
`409 {"code":"legacy_client_retired"}` before private payload parsing or any
repository/media effect. The journal route also rejects `syncStatus` equal to
`offline_synced` as a redundant retired-replay boundary even if the marker is
present. All supported current callers and production smoke clients send the
positive marker explicitly.

## Rollout, rollback, and evidence

OVE-322 rolls out first to a disposable exact-SHA preview/browser matrix and
then to the READY production deployment. Live proof may create only synthetic
known stores and records. Evidence is limited to state/count classes, two-read
absence, preserved-unrelated-state booleans, implementation/deployment IDs, and
provider capability classes. It must not contain identity, journal content,
media bytes/keys, credentials, cookies, request metadata, or precise location.

Rollback cancels or rolls forward the bridge while retaining every unverified
source. It must not restore an old local writer, old replay admission, service
worker registration, or a durable browser fallback. OVE-323 removes the bridge,
legacy runtime, Dexie/package residue, PWA artifacts, fixtures, and temporary
copy only after OVE-322 is independently merged, deployed, contained, and read
back.

## Verification

```bash
cd apps/web
pnpm online-only:canon:check
pnpm exec vitest run src/lib/retirement/legacy-device-retirement.test.ts
pnpm exec playwright test tests/legacy-device-retirement.spec.ts \
  --project=chromium --project=firefox --project=webkit
pnpm smoke:legacy-device-retirement -- --base-url http://127.0.0.1:3000
```

The broad repository, media/privacy, session, localization, accessibility,
build, exact-main containment, Vercel READY/alias, and authenticated Linear
read-backs remain additive closeout gates; a local browser result alone is not
a production retirement receipt.
