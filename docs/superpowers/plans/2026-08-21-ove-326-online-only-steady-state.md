# OVE-326 Online-Only Steady-State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan. The operator explicitly
> prohibited subagents for this execution, so execute every batch inline with
> `superpowers:executing-plans` and stop at every stated failure gate.

**Goal:** Close the last active offline analytics and request-contract residue,
enforce the reduced analytics vocabulary without rewriting history, and prove
the complete web product is online-only across source, database, build, browser,
production providers, and Linear.

**Architecture:** Preserve OVE-322's name-only returning-device cleanup as the
sole browser-storage boundary. Remove `syncStatus`, `EntrySyncStatus`,
`sync_status`, `offline_queued`, and the two retired analytics event names from
all active contracts. Reserve and apply additive migration `0035`, which replaces
only the event-name check with a `NOT VALID` reduced constraint so existing rows
remain untouched. A deterministic classified scanner and three-engine browser
matrix keep the steady state enforceable.

**Tech Stack:** Next.js App Router, TypeScript, Kysely, PostgreSQL SQL
migrations, Vitest, Playwright, Vercel, DigitalOcean Managed PostgreSQL,
Cloudflare R2, GitHub Actions, Linear.

## Global constraints

- Work only on `codex/ove-326-online-only-steady-state`, based on the fetched
  `origin/main` commit named in the validated Linear contract.
- Do not use subagents.
- Preserve immutable migrations, accepted ADRs, completed receipts, product
  research, historical analytics rows, and unrelated local state byte-for-byte.
- Do not broaden storage cleanup, read browser payloads, emit content or
  identity evidence, reintroduce offline behavior, or claim cleanup for a device
  that never reconnects.
- Commit the provenance slice before adding migration `0035`.
- Apply no production mutation before the final implementation SHA has passed
  required checks, merged normally, and reached an exact-SHA READY deployment.

### Task 1: Preserve the pre-enforcement production aggregate

**Files:**

- Create: `docs/OFFLINE_RETIREMENT_PROVENANCE.md`
- Modify: `docs/MIGRATION_ALLOCATION.md`
- Modify: `docs/ONLINE_ONLY_CANON_CLASSIFICATION.json`

1. Run a fail-closed, read-only production query through the Vercel environment.
   Require the registered DigitalOcean host and return only monthly counts,
   total count, an ordered database-side row hash, and constraint classes.
2. Record the `normalizeSyncStatus` suppression caveat and the exact baseline
   SHA. Do not retain the temporary query script.
3. Reserve `0035` to OVE-326 while explicitly preserving OVE-322's unused,
   non-transferable `0030` reservation.
4. Classify this plan and provenance as exact historical paths.
5. Verify:

   ```bash
   cd apps/web
   pnpm online-only:canon:check
   git diff --check
   ```

6. Commit this slice before any migration file exists:

   ```bash
   git add docs/OFFLINE_RETIREMENT_PROVENANCE.md \
     docs/MIGRATION_ALLOCATION.md \
     docs/ONLINE_ONLY_CANON_CLASSIFICATION.json \
     docs/superpowers/plans/2026-08-21-ove-326-online-only-steady-state.md
   git commit -m "docs: capture online-only retirement provenance"
   ```

### Task 2: Drive the reduced database and analytics contract from failing tests

**Files:**

- Create: `apps/web/sql/0035_online_only_retirement.sql`
- Modify: `apps/web/sql/0001_walking_skeleton.sql`
- Modify: `apps/web/src/db/types.ts`
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/server/analytics-events.ts`
- Modify: `apps/web/src/server/analytics-events.test.ts`
- Modify: generated database and restore manifests only through their official
  commands.

1. Add tests that require the active analytics owner and fresh bootstrap to omit
   both retired event names, `sync_status`, and `offline_queued`, while preserving
   consent, event-version, exclusions, bounded properties, and failure isolation.
2. Run the focused test and observe failure for the old contract.
3. Add migration `0035` that drops and recreates only
   `analytics_events_event_name_check`, omits the two retired names, uses
   `NOT VALID`, and contains no row mutation.
4. Remove the retired enums/property from active TypeScript and fresh bootstrap;
   do not edit migration `0009` or other history.
5. Bootstrap a fresh local database, apply replay, regenerate types and schema
   manifests, prove an attempted retired insert is rejected, and prove the
   before/after historical count and hash are identical.
6. Run:

   ```bash
   cd apps/web
   ../../infra/run-with-local-infra-env pnpm local:bootstrap
   ../../infra/run-with-local-infra-env pnpm db:types
   ../../infra/run-with-local-infra-env pnpm db:types:check
   pnpm exec vitest run src/server/analytics-events.test.ts
   ```

### Task 3: Remove the request/member residue end to end

**Files:**

- Modify: `apps/web/src/app/api/garden/entries/route.ts`
- Modify: `apps/web/src/app/api/garden/entries/route.test.ts`
- Modify: `apps/web/src/app/api/garden/drafts/[draftKey]/route.ts`
- Modify: `apps/web/src/lib/garden/entry-contracts.ts`
- Modify: `apps/web/src/app/garden/actions.ts`
- Modify: `apps/web/src/app/garden/objects/[objectId]/actions.ts`
- Modify: first-entry, space-entry, and follow-up composers and their tests.
- Modify: the twelve active smoke/recertification callers named in Linear.
- Regenerate: authenticated mutation registry, graph, and receipt artifacts.

1. First change contract and route tests to reject/omit the retired member and
   preserve the positive-marker `legacy_client_retired` response with zero event
   emission.
2. Run focused tests and observe the old writers fail them.
3. Remove all active callers and normalization logic. Do not change the server
   draft/direct online protocol or the name-only cleanup boundary.
4. Regenerate the authenticated mutation artifacts with their official scripts.
5. Run the route, composer, submit, mutation-enforcement, session, and sign-out
   tests until green.

### Task 4: Add the deterministic classified absence checker

**Files:**

- Create: `apps/web/scripts/verify-online-only-retirement.ts`
- Create: `apps/web/scripts/verify-online-only-retirement.test.ts`
- Modify: `apps/web/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/ONLINE_ONLY_CANON_CLASSIFICATION.json`

1. Write negative fixtures before the checker. Cover active runtime, import,
   current copy, package, lockfile, build output, unclassified history, and an
   allowlist entry lacking a semantic non-operative fixture.
2. Require exact path classifications; prohibit wildcard allowlisting. Historical
   files must contain an explicit semantic provenance marker. Name-only cleanup
   must prove it reads or deletes only declared store names, never payloads.
3. Use a monotonic deadline and cancellation token. The timeout test must prove a
   single degraded receipt within five seconds and zero late evidence writes.
4. Hash only the deterministic sorted evidence model; exclude wall-clock duration
   from its digest. Run twice and require identical digests.
5. Register `verify:online-only-retirement` and run it in CI beside the existing
   online-only canon gate.
6. Run:

   ```bash
   cd apps/web
   pnpm exec vitest run scripts/verify-online-only-retirement.test.ts
   pnpm verify:online-only-retirement -- --prove-determinism
   ```

### Task 5: Prove the real browser and redacted live product

**Files:**

- Create: `apps/web/tests/online-only-product.spec.ts`
- Create: `apps/web/scripts/smoke-online-only-product.ts`
- Modify: `apps/web/package.json`
- Modify: `docs/ONLINE_ONLY_CANON_CLASSIFICATION.json`

1. Add Chromium, Firefox, and WebKit coverage for fresh and exact returning
   profiles across `uk`, `bg`, and `ru`.
2. On two reads, assert no manifest link, worker registration, OverGarden cache,
   or retired database. Preserve an unrelated database/cache fixture.
3. Induce network down after an online read. Prove reload cannot boot a cached
   shell, the mutation request never succeeds, no local durable mutation appears,
   and returning online restores the server path explicitly.
4. Inject a bounded exact-name deletion timeout. Prove the localized degraded
   announcement, keyboard focus, cleanup retry, and account sign-out remain
   usable with no global overlay or pointer trap.
5. Emit only locale counts, booleans, status classes, durations, and digests from
   the live smoke.
6. Run the three-engine suite and loopback smoke.

### Task 6: Reconcile active docs and complete local verification

**Files:**

- Modify: `docs/MVP_LEARNING_SIGNALS.md`
- Modify: `docs/MVP_PRIVACY_RETENTION_POLICY.md`
- Modify: other current analytics/learning docs reported by the checker.

1. Replace the active event vocabulary with the reduced set and link retired
   history only to `docs/OFFLINE_RETIREMENT_PROVENANCE.md`.
2. Preserve auth, precise-location, media, erasure, and public-projection owners.
3. Run focused privacy/media/search tests, migration replay, browser matrix,
   source/build check, then lint, typecheck, full test, production build, canon,
   localization, accessibility, mutation enforcement, and `git diff --check`.
4. Review the full diff for scope, evidence safety, immutable-history changes,
   and provenance/migration commit ordering.
5. Commit with `feat(web): enforce online-only steady state`.

### Task 7: PR, exact-SHA production proof, and OVE-326 closeout

1. Push the branch, open a PR, and wait for all required checks without bypass.
2. Record the final implementation SHA once, merge normally, fetch `origin/main`,
   and prove the implementation SHA is an ancestor.
3. Synchronize the local main checkout and run `pnpm mainline:closeout:check`.
4. Apply migration `0035` through the official production database capability.
   Read back the reduced constraint, rejected retired insert in a rollback-only
   transaction, and unchanged zero-row aggregate/hash.
5. Require the exact implementation SHA deployment to be Vercel READY with all
   canonical aliases. Run the live scanner/smoke/browser matrix against the
   canonical HTTPS origin.
6. Read Cloudflare R2 capability classes without listing keys or changing config;
   confirm the existing quarantine/private and derivative/public boundaries.
7. Re-read the entire OVE-326 Linear body and relations, validate its normalized
   SHA-256, attach only redacted closeout receipts, and transition to Done.

### Task 8: Close the non-executable OVE-324 container

1. Do not create a branch, commit, deployment, provider mutation, or assignee for
   OVE-324.
2. Read all six child issues and receipts twice. Require the exact acyclic order
   `OVE-320 -> OVE-321 -> OVE-325 -> OVE-322 -> OVE-323 -> OVE-326 -> OVE-324`
   and verify that only OVE-324 directly blocks OVE-186.
3. Require every child Done, each implementation SHA contained in current main,
   exact deployment/provider receipts present where applicable, and each saved
   description digest valid.
4. Validate OVE-324's complete normalized body, add a content-free integration
   receipt, perform a second authenticated graph read-back, and transition the
   container directly from Backlog to Done.
5. Finish with a clean, fetched local main equal to `origin/main` and a final
   `pnpm mainline:closeout:check` receipt.
