# Runtime Scaffold — Current Status and Verification

Last reconciled: 2026-08-11 (OVE-314)

This file is the concise current-state mirror for the implemented OverGarden
runtime. Authenticated Linear and the issue-specific execution contract remain
the queue authority; `docs/SDD_VERTICAL_SLICE_ROADMAP.md` remains the vertical
slice/dependency authority; `docs/TECH_STACK_DECISIONS.md` plus ADR-0014 remain
the stack authority. Every new or materially rewritten Linear task must follow
`docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`.

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
- garden space, plant/animal object, structured journal entry, same-object
  follow-up, publication, archive/`410`, and derivative-only media;
- offline first-entry/follow-up queueing with owner/session binding,
  idempotency, explicit retry, and no duplicate canonical writes;
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

- `/admin/communities`
- `/admin/moderation/comments`
- `/garden/catalog/curation`
- `/garden/privacy/erasure-requests`

The server sends only a boolean owner-capability projection to the client. Each
destination repeats the authoritative sealed-owner capability check. An
ordinary gardener, guest, session error, non-sealed role row, or owner lookup
failure sees no owner section.

These routes are completely retired and must return exact `404` for every
session/locale class:

- `/admin`
- `/admin/users`
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
- Sign-out freezes new owner-scoped browser writes, resolves unsynced work,
  invalidates only the current server session, purges only the current local
  owner/session scope, and requires authoritative null-session convergence.
- Retired provider and product-access invitation code cannot be re-enabled by
  environment configuration.

## Journal, offline, media, and public lifecycle

- Canonical journal mutations are owner/space/object scoped and idempotent.
- The PWA queue stores bounded structured drafts and optional copied photo bytes
  in IndexedDB; server truth is authoritative after sync.
- Browser-side EXIF handling is only an optimization. Originals enter private
  R2 quarantine; the server re-encodes/resizes/strips them, publishes only the
  derivative, and deletes the original after successful processing.
- Publication is explicit and logs the disclosure version. Archive removes the
  public projection transactionally and the public route converges to `410`.
- Meilisearch contains public-safe derived documents only. Every canonical
  write that can change a public projection records outbox intent in the same
  database transaction.

## Catalog, search, and lineage

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
- Media uses Cloudflare R2 private quarantine plus public stripped derivatives.
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
