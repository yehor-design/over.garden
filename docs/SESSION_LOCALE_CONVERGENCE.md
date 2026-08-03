# Session and locale convergence

Status: OVE-214 canonical protocol; OVE-236 ordinary-recheck privacy fence

This document owns the bounded recovery contract for an authenticated session
gate and a Bulgaria `bg`/`ru` interface transition. It is deliberately a
control-plane contract: it contains no owner identifier, draft, queue payload,
cookie value, request body, timing sample, or private route.

## Protected outcome

A gardener can always leave a slow local persistence or session read without
losing the current owner-scoped in-memory work. During an ordinary locale
handoff, the current locale and private tree remain in place until a current
operation has made a guarded handoff. During a focus, visible-page, or explicit
session retry, the old private tree is synchronously replaced by a payload-free
gate before any asynchronous identity read; only exact-A proof may re-admit it.
Shell navigation and the existing sign-out control are not disabled by a locale
wait.

## Canonical owners

| Owner                                           | Responsibility                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `interfaceLocaleChangeCoordinator`              | One locale operation, participant registry, synchronous commit gate, cancellation, and retryable release.                      |
| `owner-composer-participants`                   | Acquires each mounted composer fence synchronously, flushes the latest generation, then resumes or cancels exactly that fence. |
| `SessionConvergenceBoundary`                    | Bounded authoritative session read and owner-local hydration/recheck epoch.                                                    |
| `language-switcher`                             | Inline pending/recovery status, explicit cancellation, guarded preference rollback, and document handoff cleanup.              |
| `owner-session-lifecycle` / `sign-out-provider` | Existing owner activity and sign-out commit fence; neither is replaced by this protocol.                                       |

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
pnpm exec vitest run src/lib/interface-locale-change-coordinator.test.ts src/lib/offline/owner-composer-locale-change-participant.test.ts src/components/public/language-switcher.test.tsx src/components/auth/session-convergence-boundary.test.tsx
pnpm exec vitest run src/components/site-shell/interface-locale-change-boundary.test.tsx src/components/site-shell/auth-locale-mutation-fences.test.tsx src/components/site-shell/local-state-locale-mutation-fences.test.tsx src/lib/offline/owner-session-lifecycle.test.ts
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

## OVE-236 ordinary recheck fence

Focus, visible-page, and explicit recovery retries are identity boundaries. The
boundary increments an in-memory epoch and synchronously commits the
payload-free `checking` gate before its no-cache session read or owner-local
work begins. It aborts owner-A sync attempts and starts the existing
owner-A composer/offline pause path; no new queue, session, or sign-out owner
exists.

Only an authoritative result matching the immutable document-A baseline, a
current epoch, a settled matching pause/composer fence, and successful
owner-generation hydration may reopen the tree. A signed-out or changed
session uses the existing terminal finalizers. A malformed, rejected, unknown,
or timed-out result remains `blocked`, does not retry automatically, and keeps
both enabled payload-free escapes: public-home navigation and reload-and-
recheck. Before a user-triggered or BFCache reload replaces the document, the
boundary finalizes only its own retained owner-session-recheck fence through
`finalizeForHardReload`. If that bounded three-second finalization cannot
settle, no reload occurs: the private tree remains hidden and the same recovery
controls stay available. A late session, hydration, composer, or sync continuation cannot
override a later epoch or release a terminal fence.

The browser race harness is deliberately local and synthetic. Its route is
inside the already fail-closed visual-fixture environment, its only private
markup is labelled synthetic, and the runner accepts loopback origins only. It
does not read production accounts, cookies, drafts, queues, media, or service
credentials.

```bash
cd apps/web
pnpm smoke:session-recheck-fence -- --browser chromium --base-url http://127.0.0.1:3000
pnpm smoke:session-recheck-fence -- --browser safari-technology-preview --base-url http://127.0.0.1:3000
```
