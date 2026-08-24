# Runtime Scaffold — Current Status and Verification

Last reconciled: 2026-08-25 (OVE-338 moved surviving moderation into the
ordinary account shell and retired the complete `/admin` namespace; OVE-349
retired server drafts, legacy journal-media processing, and private-then-publish
after OVE-346/347/348 established the atomic final-WebP path)

This file is the concise current-state mirror for the implemented OverGarden
runtime. Authenticated Linear and the issue-specific execution contract remain
the queue authority; `docs/SDD_VERTICAL_SLICE_ROADMAP.md` remains the vertical
slice/dependency authority; `docs/TECH_STACK_DECISIONS.md` plus ADR-0014 as
superseded by ADR-0017 and ADR-0019 remain the stack authority. Every new or materially rewritten Linear task must follow
`docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`.

ADR-0017 and ADR-0019 are the current save authority. Authoring is transient in
the active tab, image conversion produces the final WebP in the browser, and
one acknowledged atomic Publish is the only durable boundary. There is no
server draft, durable browser draft, offline replay, source-original
quarantine, server image conversion, private journal state, or later publish
action. The dependency-free browser-storage retirement boundary remains
content-free and cannot become authoring storage.

## Current product model

OverGarden is a self-serve gardening journal plus catalog-as-social-graph for
Ukraine and Bulgaria. A user gets full MVP product access through normal
email/password registration or Google authentication. There is no invite-only
product-access state, closed-pilot cohort, founder-rehearsal access path, pilot
dashboard, admin landing page, or owner-status page.

Implemented user journeys include:

- public discovery and localized authored/legal/support surfaces;
- self-serve authentication, account-method continuity, recovery, and
  current-session sign-out convergence;
- automatic pseudonymous public identity and owner profile management;
- garden space, plant/animal object, transient structured authoring, atomic
  public journal creation/editing, same-object follow-up, archive/`410`, and
  browser-final WebP media through short-lived edge staging;
- catalog typeahead, unknown/user-added identities, curation, canonical merge,
  official source provenance, and derived search indexing;
- public journals, object passports, varieties, profiles, community/social
  surfaces, and conservative SEO/AEO promotion;
- lineage provenance invitations, claim handoff, questions, follows, and
  consent boundaries;
- privacy/erasure, moderation, recovery, retention, public-projection
  revocation, and exact-main production verification.

Object kinds are exactly `plant` and `animal`; a hive is an animal with a
bee-breed catalog identity.

## Active navigation and operator surfaces

Every authenticated gardener uses the ordinary product navigation and avatar
menu. The sealed credential-only owner receives one additional localized menu
section containing exactly:

- `/account/communities`
- `/account/moderation/comments`
- `/garden/catalog/curation`
- `/garden/privacy/erasure-requests`

The server sends only a boolean owner-capability projection to the client. Each
destination repeats the authoritative sealed-owner `operator:mutate` check
within the 250 ms bound. An ordinary gardener, guest, session error, non-sealed
role row, owner lookup failure, timeout, or cancellation sees no owner section
and reaches no private moderation read or mutation.

These routes are completely retired and must return exact `404` for every
session/locale class:

- the complete `/admin` namespace, including all descendants and supported
  localized/encoded/trailing/nested representations
- `/garden/pilot-health`
- `/garden/pilot-smoke`
- `/garden/pilot-learning/interviews`
- `/garden/pilot-learning/decision`
- `/join`

Lineage invitation routes remain because they grant only bounded provenance
claim authority, not access to the product.

## Authentication and account boundary

- Better Auth is the only authentication owner.
- Supported sign-in methods are email/password and Google.
- Matching email alone never merges an existing garden; linking requires an
  authenticated session and explicit flow.
- The sealed owner must be a verified credential-only account with exactly one
  credential row and no linked social provider.
- The profile recovery flow prevents removal of the final usable method.
- Sign-out invalidates only the current server session and requires
  authoritative null-session convergence. The retired owner-vault runtime no
  longer participates in sign-out; exact-name legacy cleanup is independent,
  bounded, content-free, and non-authoritative.
- Retired provider and product-access invitation code cannot be re-enabled by
  environment configuration.

## Journal, online-only saves, media, and public lifecycle

- Canonical journal mutations are owner/space/object scoped and idempotent.
- All four composer contexts share local-only transient state. An acknowledged
  atomic response creates or edits the public journal plus final media; failure
  keeps current-tab work retryable and leaves canonical state unchanged.
- The browser-created WebP is previewed and sent directly to bounded private
  edge staging. Vercel receives signed receipts and JSON only, never image
  bytes. Finalization and abandonment are idempotent and alarm-recoverable.
- OVE-322's content transfer bridge is retired. The surviving localized banner
  reports only content-free exact-name cleanup failure or unresolved-binding
  state, never hydrates legacy records, and offers bounded retry/cancel plus a
  safe sign-out action when an authenticated shell is present. See
  `docs/LEGACY_DEVICE_DATA_RETIREMENT.md`.
- The app has no original retention, server decoder/re-encoder, admission or
  quality-processing state, private toggle, or separate publish control.
- Atomic publication records the disclosure version. Archive removes the
  public projection transactionally and the public route converges to `410`.
- Meilisearch contains public-safe derived documents only. Every canonical
  write that can change a public projection records outbox intent in the same
  database transaction.

## Catalog, search, and lineage

- Current Stable Registry authority: ADR-0016 and
  `docs/STABLE_REGISTRY.md`. The `129188` EPPO observation is a sizing receipt,
  not an official release or product-completeness claim. OVE-318 changes canon
  only: no observed capture, SQL, release, search row, runtime behavior,
  deployment, or production state is created here.
- Catalog reads use canonical Postgres identity plus derived Meilisearch
  typeahead/search.
- User-added/provisional catalog data stays private until an authorized curation
  decision; source provenance/license gates remain enforceable.
- Public variety and other UGC-derived surfaces remain `noindex` until the
  shared public-surface policy promotes them.
- Lineage invitation tokens stay out of query strings, logs, analytics, and
  product-access authorization. Claim flows remain idempotent and owner scoped.
- Precise location is forbidden throughout product data, analytics, logs,
  public/search projections, UI, operator evidence, and lineage.

## Learning and analytics

The current decision-eligible actor set has one real-user class:
`real_self_serve`. `production_smoke`, `visual_fixture`, `editorial_seed`, and
`automated_bot` are explicit exclusions. Unclassified or inconsistent activity
fails the decision gate closed.

Canonical journal writes record a non-identifying learning-attribution outbox
intent in the same transaction. Attribution resolves an explicit producer
class, an existing durable row, or the self-serve default. There is no cohort or
segment hint and no owner-facing learning-status UI. Operators use the bounded
CLI/Cron contract in `docs/MVP_LEARNING_SIGNALS.md`.

Migration `0021_ove314_retire_obsolete_control_plane.sql` converts historical
cohort values, removes the old hint columns, and drops the product-access grant
table without deleting users or content.

## Internal diagnostic scaffold

The historical walking skeleton remains loopback-only diagnostics:

- `/skeleton`, `/skeleton/**`, `/api/skeleton`, and `/api/skeleton/**` hard-404
  in production, Preview, disabled environments, and on non-loopback hosts;
- no shared identity or credential is shipped;
- local developers authenticate through the canonical garden flow;
- internal visual-fixture namespaces hard-404 before routing in production.

This diagnostic is not an alternate product entrance, test-account surface, or
permission to weaken auth/privacy boundaries.

## Infrastructure state

- Next.js App Router + TypeScript deploys on Vercel.
- Production data is DigitalOcean Managed PostgreSQL.
- Local containerized development prefers Apple Container; Docker is the
  documented fallback/CI/production exception where required.
- Media uses Cloudflare private ephemeral staging plus immutable public final
  WebPs. OVE-350 deleted the exact empty legacy provider resource after proving
  that it had no application caller; it must remain absent.
- Search uses Meilisearch as a derived public index.
- Matching/reindex work uses the Python worker and Postgres `job_queue`.
- Cloudflare owns DNS/edge/WAF/R2 and must not cache app HTML.

Exact non-secret provider identities, aliases, hosts, and current operational
notes live in `docs/INFRASTRUCTURE_REGISTRY.md`. Never infer readiness from an
environment variable name or HTTP `200` alone.

## Local verification

Install and bootstrap from `apps/web`:

```bash
pnpm install --frozen-lockfile
../../infra/container-up
../../infra/run-with-local-infra-env pnpm local:bootstrap
../../infra/run-with-local-infra-env pnpm db:types
../../infra/run-with-local-infra-env pnpm db:types:check
../../infra/run-with-local-infra-env pnpm verify:retired-journal-media-migration
```

Core gates:

```bash
pnpm auth:security:check
pnpm mutation:surface:enforce
pnpm localization:coverage:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec tsx scripts/verify-retired-journal-media-runtime.ts
git diff --check
```

Focused OVE-314 contract:

```bash
pnpm exec vitest run \
  scripts/retire-obsolete-control-plane.test.ts \
  src/components/site-shell/site-shell.test.tsx \
  src/server/site-shell-session.test.ts \
  src/server/admin-access.test.ts \
  src/server/document-mutation-admission.test.ts \
  src/server/mvp-learning/attribution-outbox.test.ts

pnpm smoke:admin-role
pnpm smoke:self-serve-providers
pnpm test:a11y
pnpm localization:coverage:browser
```

Local bootstrap can additionally fail on an independently unhealthy MinIO
volume after the database migrations have succeeded. Treat that as a separate
media-runtime recovery condition; do not erase or replace a volume merely to
make an unrelated schema check green. Database-only convergence and generated
types can be verified through the local infrastructure wrapper while the media
recovery owner is handled under its own task.

## Production closeout

A repository change is not Done until:

1. focused and broad local gates pass;
2. exact PR-head CI passes without bypass;
3. the implementation SHA is contained in current `origin/main`;
4. a Vercel production deployment is `READY` for that exact SHA and owns the
   canonical aliases;
5. authenticated production browser/provider/database proof passes for the
   changed behavior;
6. temporary data/config/evidence is cleaned up;
7. `pnpm mainline:closeout:check` passes from a clean current-main worktree;
8. Linear description, relations, terminal receipt, and Done state read back
   exactly.

OVE-314 additionally requires the aggregate-only database retirement and the
absence of `PILOT_INVITE_SIGNING_SECRET` from Vercel production, preview, and
development after database completion. The authoritative ordering and rollback
boundary are in `docs/PRODUCTION_PILOT_SMOKE.md` and
`docs/runbooks/OVE_314_OBSOLETE_CONTROL_PLANE_RETIREMENT.md`.

## Historical status

Detailed dated implementation narratives previously stored in this file remain
available in Git history and immutable Linear/mainline receipts. Any historical
mention of a pilot page, invite grant, admin landing, founder rehearsal, or
closed cohort is provenance only and cannot be used as a current instruction or
requirement.
