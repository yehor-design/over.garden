# ADR-0023 — Workspace failures are rendered values, never thrown exceptions

- **Status:** Accepted and implemented (OVE-374, 2026-09-03)
- **Date:** 2026-09-03
- **Decision owner:** founder/owner (D8)
- **Linear:** OVE-374
- **Relates to:** ADR-0022 D4 (Cache Components for public pages). Supersedes
  nothing; it constrains how every page under `/garden/**` is written.

## Context

On 2026-09-03 the owner opened `/garden/catalog/registry/editions` in production
before its migrations had been applied. The page threw a Postgres `42P01` for a
missing relation. The reader saw the garden loading skeleton — the wrong
skeleton, belonging to a different page — and it never went away. No error UI,
no message, no control. The Vercel runtime log recorded the error, but the HTTP
response was `200`, so nothing in the platform's own dashboards called it a
failure.

The obvious fix was to trust `error.tsx`, which the segment already had. That
turned out to be wrong, and the difference matters enough to write down.

### The mechanism, reproduced rather than assumed

Reproduced locally on Next 16.2.11 and React 19.2.4 with `cacheComponents: true`,
using three throw-away pages under `/garden` and a production build served by
`next start`:

1. **The page throws after the shell.** The response is a postponed shell
   (`x-nextjs-postponed: 1`, status 200). The HTML stream closes cleanly with
   the Suspense boundary still pending: no `$RX` instruction is written. After
   hydration React keeps the server fallback on screen forever. `error.tsx`
   never renders and the console stays empty.
2. **A nested `<Suspense>` section throws.** The RSC stream does carry the
   `E{"digest"}` row, but the HTML boundary is neither completed nor errored.
   The section's fallback stays.
3. **The same section inside an in-page client error boundary.** The boundary
   never catches.
4. **A client-side navigation to the same page.** The boundary does catch, the
   digest reaches the client, and the console logs the Server Components error.

So the framework's own documentation — `ppr-platform-guide.md`, "Error handling
mid-stream", which promises the nearest `error.js` renders in place of the failed
component — does not hold for a hard load of a postponed route in this version.
This is a framework defect to report upstream, not something configuration can
fix.

## Decision

**A page under `/garden/**` never awaits a read that may throw.** Every read is
settled into a value with a bounded failure class, and the page renders that
value. Concretely:

1. **One failure vocabulary.** The closed set already used by the workspace home
   page — `permission_denied`, `schema_missing`, `query_timeout`,
   `connection_unavailable`, `serialization_failure`, `unknown` — moves into a
   shared module and every workspace surface uses it. Renaming a member is a
   breaking change for the observability proof and for every `data-section-failure`
   assertion.
2. **Shell first, sections streamed.** The default export renders the heading,
   navigation, and static copy synchronously; each data section is an async
   child inside its own `<Suspense>` with a skeleton that mirrors the real
   layout. Access decisions — sign-in required, denied, feature disabled — stay
   returned states and are the only reads allowed before the shell.
3. **A failure is a designed state.** A localized explanation, a retry control
   that works, and a reference code the owner can match in the logs. The machine
   class travels as a data attribute; a non-owner never sees a Postgres code.
   Owner-only surfaces may name the missing relation, because the owner is the
   person who can apply the migration.
4. **A skeleton belongs to its own page.** Per-surface `loading.tsx` files share
   the page's shell component, so the fallback and the page agree and nothing
   jumps when content arrives. A watchdog inside the skeleton says "still
   loading" after ten seconds and offers a reload after thirty; it never reloads
   on its own.
5. **`error.tsx` stays, with its limits written down.** It is real coverage for
   client-side navigation and client render errors. It is not the mechanism for
   a hard load, and no design may depend on it being one.
6. **Server errors are recorded.** `instrumentation.ts` exports `onRequestError`
   and writes one line per error with digest, route, and failure class, so a
   page that degrades gracefully and answers 200 still leaves a trace.

## What shipping it taught

Two things were only learned by running it, and both changed the design.

**A null session is not proof that nobody is signed in.** Measured on 2026-09-03
against a local production build with `DATABASE_URL` on a closed port: Better
Auth swallows its own read failure and answers `null`. Left alone, every
workspace page would have told a signed-in gardener to sign in during a database
outage — a false statement pointing at the wrong fix. `resolveWorkspaceViewer`
therefore asks a second question, and only of the one person it can help: a
bearer of a session cookie who resolved to nobody gets one liveness read, and an
`unavailable` state if that fails. A visitor with no cookie never pays for it.

**A refusal and an outage must not share a code path.** `assertCatalogCuratorAccess`
and `resolveAdminCapabilityAccess` both collapsed every rejection onto "denied",
which is right for a gate and wrong for a screen: it told the owner to audit
permissions while the role table was simply unreachable. `AdminAccessDeniedError`
now carries the refusal, and anything else keeps its own failure class.

**A skeleton in the bytes is not a skeleton on screen.** A route with its own
`loading.tsx` always writes that fallback into the HTML stream; React replaces
it with a completion instruction. The check that means something is therefore
"was a fallback left standing", not "did a fallback appear" — which is also the
exact signature of the defect: the fallback is written, the stream closes, and
no completion instruction ever arrives. `pnpm prove:workspace-resilience` checks
it that way, and the final DOM was verified in a real browser besides.

## Consequences

A partial failure degrades one block instead of the whole screen, and a reader
always has a sentence and a control instead of an indefinite skeleton. The first
paint gets faster for everyone, because the shell no longer waits for data. New
workspace pages inherit the behaviour from shared components rather than
re-implementing it.

The costs are real and accepted: eleven pages are restructured, three duplicated
access panels collapse into one, and every page test gains a failure case. A
page author must now reach for `settleSection` rather than `await`, which is a
rule to remember and a rule the review must enforce.

The decision survives the framework defect being fixed. If a later Next release
restores the boundary instruction on hard loads, nothing here becomes wrong —
rendered failure values are the stronger design regardless, because they carry a
class the operator can act on and the thrown path does not.

One decision the implementation made that this ADR did not anticipate: a record
that is absent or belongs to someone else is now a rendered "not available"
state rather than `notFound()`. A `notFound()` raised during a postponed resume
reaches the reader as the same stuck skeleton as any other throw, so the
exception was never going to work here; and a signed-in gardener following a
stale bookmark is better served by a sentence and a way back than by a bare 404.
The wording does not vary with the reason, so it tells an enumerator nothing.
These pages are `noindex` and behind a session, so no discovery surface changes.

Falsified if: a workspace page still reaches a reader as a bare skeleton after
`OVE-374` ships, or if the shared failure classes prove too coarse to explain a
real production incident. On falsification, extend the vocabulary in this ADR
rather than adding a second one.

Receipts: `docs/WORKSPACE_RESILIENCE_PROOF_2026-09.md` (11 of 11 surfaces),
`apps/web/scripts/prove-workspace-resilience.ts`, and the per-surface failure
cases in every page test under `apps/web/src/app/(default)/garden/`.
