# Session and locale convergence

Status: **the locale half is history.** Sessions are server-authoritative since ADR-0022
(D6, OVE-367) and that half is current. The locale coordinator this document specified was
deleted by OVE-379 (ADR-0024, D4): choosing a language is a navigation now. Read
"Choosing a language today" below before anything else on this page.

This document owns the bounded recovery contract for a Bulgaria `bg`/`ru`
interface transition and records how sessions behave without a client gate. It is deliberately a
control-plane contract: it contains no owner identifier, draft, queue payload,
cookie value, request body, timing sample, or private route.

## Choosing a language today (ADR-0024, D4 — OVE-379)

A language option is a link. On a public page the locale is in the path, so the
option is an `<a>` carrying `prefetch={false}`, and the proxy writes the
preference from the prefix the request lands on — including RSC navigations, so a
soft switch persists immediately. On a route with no locale prefix the option is a
form over a Server Action that writes the cookie; nothing replaces the document,
so text typed into a composer survives the change. There is no status message and
no discard dialog, because there is no delay to explain and nothing to discard.

`prefetch={false}` is load-bearing and not decoration: Next strips
`Next-Router-Prefetch` before middleware runs, so a router prefetch of `/ru/…`
reaches the proxy looking exactly like a reader landing there. Hovering an option
did rewrite the reader's saved language until that was fixed;
`language-switcher.test.tsx` fails if the attribute is removed.

**Everything below this section, down to "Sessions (ADR-0022, D6)", describes the
deleted coordinator** — `interfaceLocaleChangeCoordinator`, its participant
registry, the `idle → preparing → prepared → handing_off` epochs, the 2.25 s
dependency deadline, the document handoff, and the safe-flush fences. None of it
exists: `src/lib/interface-locale-change-coordinator.ts` and the two boundary
test files named under "Verification" were removed with the 1 938 lines OVE-379
deleted. ADR-0024 records why the pattern must not come back — it was the
mutation registry of ADR-0022 D6 returning under another name. The text is kept
only so the mechanism it solved for, and the cost of solving it that way, stay
readable.

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

Focused deterministic contract and race proof. **The first command no longer runs:**
`interface-locale-change-coordinator.test.ts`,
`online-journal-composer-participants.test.ts`,
`interface-locale-change-boundary.test.tsx` and `auth-locale-mutation-fences.test.tsx`
were deleted with the coordinator. What survives is
`src/components/public/language-switcher.test.tsx`, which holds the link shape and
`prefetch={false}`.

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

```

The production-safe smoke is read-only and public: it proves one Bulgaria
control and the `bg` to `ru` document handoff on the canonical domain. The
authenticated Vercel deployment read-back supplies the exact SHA and alias
ownership; the smoke neither logs in nor mutates a locale preference.

```bash
cd apps/web
pnpm smoke:session-locale-convergence -- --environment production --confirm-environment production --base-url https://over.garden --expected-commit "$OVE214_IMPLEMENTATION_SHA"
```

## Sessions (ADR-0022, D6)

There is no client session gate, no mutation admission protocol, and no
"checking" placeholder. One cookie-cached server read
(`session.cookieCache`, 300 s) decides what a document renders; the rendered
owner id is written to `<html data-owner-user-id>` and travels back with every
mutation (`ownerUserId` hidden field or `x-overgarden-owner-user-id` header).
`resolveMutationScope` in `apps/web/src/server/mutation-scope.ts` answers
`401 session_required` when there is no session and `409
session_account_changed` when the signed-in account differs from the rendered
owner. The composer keeps its in-memory text and shows one localized notice;
nothing is retried or reconciled.

Account changes reach every tab of the browser through
`BroadcastChannel("overgarden-session")` with a `localStorage` fallback
(`apps/web/src/lib/auth/session-signal.ts`). Sign-out calls Better Auth once,
announces `signed_out`, and replaces the current location with the localized
home page; sign-in and sign-up announce `signed_in`. A tab whose rendered
owner differs from the announced one, or whose `visibilitychange` recheck sees
another account, reloads to the home page as whoever is signed in now. Unsaved
text is lost by design.

```bash
cd apps/web
pnpm exec vitest run \
  src/components/auth/session-signal-boundary.test.tsx \
  src/lib/auth/session-signal.test.ts \
  src/server/mutation-scope.test.ts \
  src/components/site-shell/site-shell.test.tsx
```
