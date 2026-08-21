# Session and locale convergence

Status: OVE-214 canonical locale protocol; OVE-286 route-scoped session convergence; OVE-287 immediate retain-only exit

This document owns the bounded recovery contract for an authenticated session
gate and a Bulgaria `bg`/`ru` interface transition. It is deliberately a
control-plane contract: it contains no owner identifier, draft, queue payload,
cookie value, request body, timing sample, or private route.

## Protected outcome

A gardener can always leave a slow local persistence or session read without
losing the current owner-scoped in-memory work. During an ordinary locale
handoff, the current locale and private tree remain in place until a current
operation has made a guarded handoff. On the OVE-290 effect-closed
existing-entry editor, focus and visible-page session observations keep the
already-authorized editor mounted and interactive until terminal evidence
exists. Every other authenticated route retains the OVE-236 payload-free
compatibility fence until OVE-291 closes and promotes its remaining mutation
surface.
Shell navigation and the existing sign-out control are not disabled by a locale
wait.

## Canonical owners

| Owner                                                     | Responsibility                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `interfaceLocaleChangeCoordinator`                        | One locale operation, participant registry, synchronous commit gate, cancellation, and retryable release.                             |
| `online-journal-composer-participants`                    | Acquires each mounted composer fence synchronously, flushes the latest server generation, then resumes or cancels exactly that fence. |
| `SessionConvergenceBoundary`                              | Bounded authoritative session read and owner-local hydration/recheck epoch.                                                           |
| `language-switcher`                                       | Inline pending/recovery status, explicit cancellation, guarded preference rollback, and document handoff cleanup.                     |
| `sign-out-provider` / `browser-auth-mutation-coordinator` | Immediate retain-only local exit plus serialized sign-in, link, unlink, and exact-session reconciliation.                             |

## Deadline and state contract

The product recovery budget is **at most three seconds** from a locale action
to interactive recovery. Dependency work stops at 2.25 seconds to reserve
browser rendering and event-loop settlement within that budget. Authoritative
session reads and owner-local hydration are independently bounded at one
second. The existing locale preference request receives the operation signal
and the same 2.25-second dependency deadline.

Locale state is:

`idle -> preparing -> prepared -> handing_off`

or

`idle -> preparing -> cancelled|timed_out|failed -> recovering -> idle`.

Each attempt holds an opaque in-memory epoch and an `AbortController`. Only the
current epoch may change React state, write a preference, seal a composer, or
begin a document replacement. Cancellation invalidates that epoch first. A
late prepare, flush, seal, auth read, or hydration completion has no product
effect.

Every safe-flush participant returns its recovery handle before awaited durable
work. On failure, timeout, or cancellation, the coordinator aborts the owned
signal and uses the participant's `cancel` release when available; it never
waits for a second flush merely to return control. A failed release is retained
as the one explicit retryable recovery handle. There are no automatic retries.

An uncertain preference request is never assumed uncommitted. Its recovery
first performs the existing guarded rollback before local work is resumed.
Document-handoff listeners and temporary no-referrer policy are removed on
cancel, timeout, page-show recovery, or page-hide completion.

## Verification

Focused deterministic contract and race proof:

```bash
cd apps/web
pnpm exec vitest run src/lib/interface-locale-change-coordinator.test.ts src/lib/garden/online-journal-composer-participants.test.ts src/components/public/language-switcher.test.tsx src/components/auth/session-convergence-boundary.test.tsx
pnpm exec vitest run src/components/site-shell/interface-locale-change-boundary.test.tsx src/components/site-shell/auth-locale-mutation-fences.test.tsx src/components/site-shell/local-state-locale-mutation-fences.test.tsx
```

The local visual fixture `visualLocaleState=safe-flush-timeout` is admitted
only by the existing fail-closed local/preview visual-fixture environment. It
models an acquired fence whose initial durable flush never settles. The
Chromium accessibility matrix asserts an inline recovery before the three
second product budget, no locale preference request or document navigation,
one Bulgaria control, no modal, an enabled control, and a responsive real shell
link. It never runs against the production domain.

```bash
cd apps/web
ACCESSIBILITY_BASE_URL=http://127.0.0.1:3000 pnpm test:a11y
```

The production-safe smoke is read-only and public: it proves one Bulgaria
control and the `bg` to `ru` document handoff on the canonical domain. The
authenticated Vercel deployment read-back supplies the exact SHA and alias
ownership; the smoke neither logs in nor mutates a locale preference.

```bash
cd apps/web
pnpm smoke:session-locale-convergence -- --environment production --confirm-environment production --base-url https://over.garden --expected-commit "$OVE214_IMPLEMENTATION_SHA"
```

## OVE-286 route-scoped session convergence

`getSessionRecheckMode` is the only rollout authority. Exactly the normalized
unprefixed pathname `/garden/entries/{valid UUID}/edit` receives
`effect_closed_non_fencing`. Locale-prefixed, query-bearing, encoded,
malformed, adjacent, and every other authenticated pathname receive
`compatibility_fenced`. The allowlist is narrow because OVE-290 already guards
all journal edit, upload, process, and focal mutations reachable from that
editor. OVE-291 owns the remaining authenticated mutation entrypoints and is
the only task that may later expand this rollout.

On the admitted editor, one bounded no-cache read is coalesced across focus and
visible-page signals. Exact-session success changes nothing. Timeout, malformed
data, unknown classification, or network failure is a silent nonterminal
`background_unavailable` observation: the private React tree, form controls,
composer, and in-memory online participant state remain unchanged. The
compatibility mode retains the eager `checking` gate, composer fence, request
abort, and participant pause before the session await.

A same-owner new session binding is a fresh-document refresh, not an owner
change. It writes no terminal marker, publishes no terminal signal, shows no
owner-change message, and reloads once without pre-hiding the editor. Only the
fresh bounded bootstrap may pass
`allowAuthoritativeSessionRebind: true`; that path updates the same owner's
in-memory session fence without moving, deleting, or reassigning a canonical
server draft. Ordinary stale-document callers remain closed.

Terminal evidence is a confirmed local exit/account switch, peer committed
signal, present or malformed marker, authoritative signed-out/different-owner
result, or `DOCUMENT_OWNER_CHANGED`. It synchronously commits the single
payload-free v1 invalidation marker before terminal publication or any await,
removes the old private tree, and latches the document terminal. No exact old
session completion may reopen it. BroadcastChannel is the fast path;
localStorage is the sleeping-tab and BFCache recovery path. The marker contains
only a version and cryptographically random opaque generation. A fresh
authoritative bootstrap captures the marker before asynchronous work and
compare-clears only that byte-identical snapshot after session admission and
online-composer participant preparation; a newer marker always wins.

The deterministic fixture remains local/isolated-preview only and contains
synthetic markup. Production must return 404 for it. The browser matrix proves
uk/bg/ru, twenty coalesced signals, degraded reads, compatibility fencing,
same-owner refresh, marker reload/BFCache races, irreversible peer invalidation,
responsive controls, and at most 100 ms terminal private-tree removal. No
production account, cookie, journal content, media, identity, or marker
generation enters its receipt.

```bash
cd apps/web
pnpm smoke:session-convergence
```

## OVE-287 immediate retain-only exit

After the single confirmation, sign-out no longer waits for a session read,
browser-storage inspection, participant drain, peer acknowledgement, network
response, cookie expiry, or adapter deletion. The initiating document synchronously
commits the `local_exit` v2 variant under the existing
`overgarden:session-invalidation:v1` key, seals every active online-composer participant,
publishes the payload-free `local_exit_committed` signal, removes the private
React tree, and exposes the localized public-safe surface. Canonical server
draft rows are retained without publication or deletion.

The marker value is exactly a schema version, bounded kind, and opaque random
generation. The v1 generic terminal marker remains compatible. A v2 local-exit
generation is compare-cleared only after a response of any status from the
reconciliation attempt that captured it, or after a serialized product auth
operation proves that it established a new authoritative session. A transport
failure leaves the marker present and schedules no timer, polling, or retry.
The next document bootstrap renders no private region, makes exactly one fresh
attempt, and otherwise stays on the public-safe surface. If durable marker
storage is unavailable, the current document remains public-safe until a
response is observed instead of replacing itself and risking a private repaint.

`POST /api/auth/local-exit-reconcile` is bodyless, same-origin, private,
no-store, and accepts only the immutable bounded session binding emitted for
the admitted document. A byte-exact same-session request makes one best-effort
adapter deletion and receives Better Auth's library-derived session-cookie
expiry even if adapter deletion fails. A missing, malformed, or stale A binding
with a B cookie has the same public `204` body but zero session deletion and
zero `Set-Cookie` effect. HTTP response, browser-cookie expiry, and proved
server revocation remain separate receipt facts.

`browser-auth-mutation-coordinator.ts` is the single browser ordering owner.
Web Locks serialize product session establishment, Google link/unlink, and
session exit across tabs; a promise-tail fallback preserves in-document order.
An account-A completion that crosses a local-exit generation settles as
`stale_operation`. A successful new session compare-clears only its captured
generation, and a delayed generation-A response can never clear generation B.

The focused boundary suite proves `uk`/`bg`/`ru`, marker-storage and network
denial, one-attempt bootstrap, exact generation races, serialized new-session
recovery, peer tabs, BFCache semantics, and confirmed private-tree removal. The
separate OVE-323 browser proof verifies exact legacy-name cleanup while
preserving unrelated browser state; sign-out itself does not own that cleanup.

```bash
cd apps/web
pnpm exec vitest run \
  src/components/auth/sign-out-provider.test.tsx \
  src/components/auth/session-convergence-boundary.test.tsx \
  src/lib/auth/session-invalidation-marker.test.ts \
  src/lib/auth/browser-auth-mutation-coordinator.test.ts \
  src/lib/auth/sign-out-contract.test.ts \
  src/lib/auth/sign-out-hardening.test.ts \
  src/lib/retirement/known-client-storage.test.ts \
  src/app/api/auth
pnpm exec playwright test tests/offline-runtime-absence.spec.ts
```
