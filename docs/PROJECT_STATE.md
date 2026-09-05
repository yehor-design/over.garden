# Project state

Status: living document. Update it whenever production behaviour, the direction,
or the list of known gaps changes. Read it first, then `AGENTS.md`.
Last reviewed: 2026-09-05.

This page answers four questions for anyone returning to OverGarden: what the
product is today, what is actually true in production right now, what is being
worked on next, and what is knowingly unfinished. Dated receipts live in
`docs/DELIVERY_LOG_2026-09.md`; decisions live in `docs/adr/`.

## What the product is

A public gardening journal for Ukraine and Bulgaria. A gardener keeps a
narrative journal per plant or animal; every entry is public and indexable;
public variety, topic, profile, and community pages aggregate first-hand
experience. There are no private entries, no drafts, no offline mode, and no
separate admin panel. Speed and search discovery come before defensive refusal.

The governing decisions are `docs/adr/ADR-0022-owner-mvp-reset.md` (D1–D7,
accepted 2026-09-02) and `docs/adr/ADR-0023-workspace-resilience.md` (D8,
accepted and implemented 2026-09-03). Older ADRs are immutable history and
never override them.

## What is true in production

Verified on 2026-09-03 against `https://over.garden` and the live providers.

| Area          | State                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy        | `main` at `1c8d186`, Vercel production READY, functions in `fra1` beside the database                                                                                                                       |
| Public pages  | Cache Components: shells answer `x-vercel-cache: HIT`, tags revalidate on every mutation, workspace and API stay `no-store`                                                                                 |
| Indexability  | Every live public page is `index, follow` with one canonical and one JSON-LD graph; sitemap index plus entries, profiles, and communities chunks                                                            |
| Media         | Browser-made WebP: 2560 primary, 1280 and 480 variants, 16 px placeholder, served as plain `<img srcset>` from `media.over.garden`, immutable and CDN-cached. No Vercel image optimizer                     |
| Media upload  | One session capability per composer, uploads straight to the Cloudflare Worker, two-hour lease renewed every five minutes, parallel promotion, weekly orphan sweep                                          |
| Sessions      | Server-authoritative. The cookie-cached session decides at the moment of the mutation; no client gate                                                                                                       |
| Admin         | Owner pages live in the account menu under the sealed owner role; `/health` is owner-only. The Release Center, editions and extension packs still render but are retired by ADR-0025 and await removal |
| Workspace     | Every page under `/garden/**` renders its own shell first and streams its data; failures are designed states with a class, a digest, and a retry (ADR-0023)                                                 |
| Server errors | Two JSON lines: `workspace_section_degraded` from `settleSection` for a section that failed and still rendered, and `workspace_server_error` from `src/instrumentation.ts` for anything that actually threw |
| Schema        | Migrations `0001`–`0047` and `0049` applied, minus the two deliberately skipped. See `docs/PRODUCTION_SCHEMA_STATE.md`                                                                                      |
| Interaction   | Like, bookmark, follow and comment are Server Actions on a form with a real endpoint, so they work before hydration and with JavaScript off. A like is a permanent row owned by an account or by one signed visitor cookie, with no expiry and no ceiling |
| Sign-in       | One screen: `/auth/sign-in` and `/auth/sign-up` over one component and Server Actions. Every other page shows its own empty state and one link to it                                                        |
| Matching      | The worker on the droplet runs the sealed release of `63ce91d` since 2026-09-05 with all nine handlers and a fresh heartbeat; the API container, its route, and `matching.over.garden` were retired on 2026-09-03 |
| Hosting       | Decided 2026-09-03: the DigitalOcean managed database and the `fra1` droplet stay                                                                                                                           |

The seven owner requirements have one committed production receipt:
`docs/OWNER_MVP_RESET_PROOF_2026-09.md`, regenerated by
`pnpm prove:owner-mvp-reset`.

## Where the project is heading

**Just delivered.** SDD Slice 22 (`OVE-376`–`OVE-379`) — the interaction,
language and sign-in surfaces stop layering hand-written client protocols over
platform primitives. Clicking Like answered `500` with an empty body on 7 of the
8 public journal entries because the capability token embedded the slug and
overflowed its own length bound on any Cyrillic text; it is now a permanent
owned row behind a Server Action. Fourteen pages embedded the sign-in form, two
of them offering Google and four remembering where to return; there is one
screen now. Choosing a language ran a two-phase distributed commit ending in a
full document replacement; it is a link. Net for the slice: roughly 7 000 lines
removed against 2 500 added.

The rule the slice leaves behind, learned the hard way and then corrected in
public: **a control on a public page may not depend on hydration to do its job.**
A `<form action={…}>` gets a real endpoint only when the action is a Server
Action reference or the `formAction` `useActionState` derives from one; wrap it
in any client closure and React renders `action="javascript:throw …"`, which
does nothing until the bundle runs. Three source-level tests now hold that
shape for the engagement controls, the sign-in screen, and the language control.

Verifying the slice in production on 2026-09-04 found two defects the slice had
shipped, one of them reported by the owner. Pressing "sign in" in the header
landed on `/garden`, an empty state offering a second "sign in" before the form,
because the header read the navigation item's label and hard-coded its own href;
every sign-in link is built by one function now, and an intent control returns
the reader to the composer rather than to the workspace around it.

The other: merely *hovering* a language option rewrote the reader's saved language.
The proxy reads the preference from the locale prefix a request lands on, and
Next strips `Next-Router-Prefetch` before middleware runs, so the guard written
to exclude prefetches never fired. Cross-locale links now carry
`prefetch={false}`; a source test and a browser test hold it, and ADR-0024 D4
records the mechanism.

**Previously delivered.** `OVE-374` — workspace resilience. Every page under
`/garden/**` renders its own shell immediately, streams its data in sections, and
turns every failure into a designed state with a retry and a reference code. It
existed because a verified framework defect leaves a skeleton on screen forever
when a Server Component throws during a postponed resume; see ADR-0023 and the
receipt in `docs/WORKSPACE_RESILIENCE_PROOF_2026-09.md`.

**Now.** The MVP reset is delivered, so the next work is product, not
platform: real gardeners publishing, and organic discovery measured rather than
assumed. One measurement gap blocks honest prioritisation; see known gaps
below.

**Decided 2026-09-05.** The Stable Registry release model and the Release
Center are retired from the product and from every plan (ADR-0025). No
Foundation release will be built and no source-built catalog is planned; the
catalog gardeners use — `catalog_items`, matching suggestions, the trigram
typeahead, `/objects` and the species, variety and breed pages — is unchanged.
The EPPO observed capture that `OVE-375` closed on 2026-09-04 stays, with every
table that holds EPPO data, the capture tooling and the credential: the owner
has plans for that data, and they will get their own decision record when
stated. Removing the retired code and its empty tables is one pending slice,
`OVE-385`; the destructive half waits for a read-only inventory and the owner's
approval.

**Not planned.** Private entries, drafts, offline mode, a separate admin panel,
voice dictation, server-side image processing, an ORM, and a source-built
catalog through Foundation releases, editions, extension packs or a Release
Center. Each is a positive decision in ADR-0022 or ADR-0025, not an omission.

## Known gaps, stated deliberately

1. **The framework defect itself is unfixed, and unreported.** Under Cache
   Components a thrown Server Component error during a postponed resume never
   completes or errors its Suspense boundary on a hard load, so `error.tsx`
   never renders. `OVE-374` removed every workspace page's reliance on thrown
   errors, so no reader is stranded — but the defect is still there for any code
   that forgets, and the upstream report with the three-page reproduction has not
   been filed. ADR-0023 records the mechanism.
2. **The signed-in chrome can disagree with the page during an outage.** When
   the session store is unreachable, a workspace page says so, but the site
   header still renders its signed-out state ("sign in"). The page is honest;
   the chrome is not yet, and it sits outside `/garden/**`.
3. **The slice's browser proofs are partial, and one of them was overstated.**
   Like, language and sign-in each had their *endpoint* proved with a real
   no-JavaScript POST against a production build, and all three were then
   verified end to end on production in a real browser. That is not the same as
   working with JavaScript off, and the earlier wording here said it was: every
   public page renders inside streamed Suspense boundaries, so with scripts
   disabled it shows nothing at all and no control is reachable. See ADR-0024
   D3 for the measurement and for why the crawler cases are nonetheless
   covered. A *successful* sign-in was never
   walked through in a browser — only the refusal path — so the `next`
   round-trip and the ADR-0022 D6 cross-tab reload are asserted by tests rather
   than observed. CI runs `tests/public-hydration.spec.ts` against a real
   Chromium on every push; the other Playwright specs still run by hand.
4. **No denominator for reader-facing failures.** Vercel Web Analytics is not
   enabled for the project, and runtime logs are retained for about an hour, so
   there is no denominator for "how often does a reader hit a failure". Server
   errors are aggregated for seven days, and a degraded section now writes its
   own line with a bounded class and the digest the reader can see on screen.
   This gap is narrower than "no analytics": GA4 and GTM are wired in
   `root-document.tsx` behind a consent banner, and Microsoft Clarity behind an
   env flag — but only on a marketing subset of paths (`/`, `/blog`, `/privacy`,
   `/support`, `/first-publication-disclosure`, and the `/answers/`, `/blog/`,
   `/guides/`, `/markets/` prefixes). Journal entries, the feed, objects and the
   workspace send nothing, so activation and retention — how many gardeners
   journal, how often they publish, whether anyone reads back — are not measured
   anywhere today.
5. **The Stable Registry is retired but not yet removed.** ADR-0025 takes the
   release model and the Release Center out of the plan; the pages, the three
   `stable_registry_*` job kinds, the Stable Catalog explorer at `/catalog` and
   the empty release tables are still in the code and the schema until the
   retirement slice, `OVE-385`, lands. The EPPO observed capture — 129,214
   identifiers, closed 2026-09-04 on the owner's loopback database, with a
   `pg_dump` kept outside it — is retained on purpose, together with
   `catalog_source_*`, the public EPPO archive at `/sources/eppo`, and the
   capture tooling; none of them is ever on a drop list.
6. **One owner only.** There is no role-grant interface; the single sealed owner
   is bootstrapped by CLI (ADR-0022, D5).
7. **`matching_worker_heartbeats` has no build timestamp.** The retired API read
   it from the image environment and no column holds it, so the runtime proof
   reports the image digest instead of inventing a value.
8. **The job queue contract is generated now.** The matching image release
   refused seventy-eight correct builds between 2026-08-27 and 2026-09-04 because
   the expected handler set was a frozen literal in five places and the manifest
   had grown three Stable Registry kinds. `apps/web/src/server/job-queue-manifest.ts`
   is now the only place that says what the set is: `pnpm queue:contract:build`
   writes the JSON contract and the Python module, `queue:contract:check` fails
   on drift, and `queue:contract:prove-database` executes the database half.
   Releases are green again, and since 2026-09-05 a candidate image is
   verified on the runner before the one push to the registry, so every tag in
   GHCR is a sealed release; the seventy-eight unverified images published
   during the red window are still there and must not be installed. `0051`
   (the heartbeat handler set is checked for
   shape, not identity — an exact array made a mismatched worker unrecordable
   and therefore indistinguishable from a dead one) and `0052` (the four payload
   CHECK constraints four kinds declared and none had) were applied to
   production on 2026-09-05; `docs/PRODUCTION_SCHEMA_STATE.md` carries the
   receipts and says why one constraint is deliberately `NOT VALID`.
9. **Closed 2026-09-05: production runs the current worker.** The sealed
   release of `63ce91d` was installed and activated on the droplet after the
   eight-day red window; the heartbeat row carries all nine handlers and both
   production proofs answer ready. Getting there took two more defects, each
   found only by deploying: preflight compared the candidate's handler set
   with the incumbent worker's heartbeat, so a release that changes the set
   could never pass (PR #289), and the drain outcome wrote a bare NULL
   parameter that Postgres could not type, so the first nine-handler worker
   restarted on every loop until the release script restored the prior image
   (PR #290). The worker's SQL now executes against a real Postgres in CI and
   in the release path: `services/matching/tests/test_runtime_database.py`.
10. **The media-lifecycle cron had never run in production.** `vercel.json`
    schedules `/api/cron/media-lifecycle` daily at 03:00 UTC and Vercel Cron
    invokes a scheduled path with GET. The route exported `POST` only, so every
    invocation since the schedule was added answered 405. Observed on
    2026-09-05: `media_lifecycle_retention_runs` held zero rows ever, nine queue
    rows sat at `attempts = 0` unclaimed, and the five derivatives of five
    deleted journal entries were still served from `media.over.garden` with HTTP
    200. An unauthenticated GET returned 405 for this path and 401 for the three
    cron routes that export GET, which is the whole difference. Fixed by
    exporting GET, and `src/app/api/cron/vercel-cron-contract.test.ts` now fails
    when any scheduled path has no GET, when a cron route is unscheduled, or
    when a scheduled route does not refuse an unauthenticated caller.
    `release-health.yml` probes the same thing against the deployed build once a
    day, because a route can be right in git and still not be what production
    serves. The fix is live — an unauthenticated GET now answers 401 — and the
    nine queued jobs drain on the next 03:00 UTC pass. Nothing was triggered by
    hand: `vercel env pull` does not return the `CRON_SECRET` value, and the
    evidence that the runtime holds one is that the learning-attribution cron,
    whose only production caller is its own scheduled route, advanced an outbox
    row three and a half days ago.

## How to check any of this yourself

```bash
cd apps/web
pnpm prove:owner-mvp-reset                 # the seven requirements against production
pnpm prove:workspace-resilience -- --base-url <running next start> --cookie-file <cookie>
pnpm smoke:matching-queue-health -- --environment production --confirm-environment production
pnpm smoke:matching-runtime-capabilities   # worker liveness from the heartbeat row
pnpm queue:contract:check                  # the generated queue contract matches the manifest
pnpm queue:contract:prove-database         # the two new CHECK constraints, executed
pnpm test:public-hydration                 # real Chromium, production build: public pages hydrate
pnpm exec tsx scripts/apply-reviewed-migration.ts --mode inventory --env-file <pulled-env>
```

Production reads are fine without asking. Anything that changes production data,
schema, or provider state needs one explicit owner approval each, per
`AGENTS.md`.
