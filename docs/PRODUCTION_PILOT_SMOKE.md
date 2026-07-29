# Production Pilot Smoke

Status: live smoke contract for OVE-27 plus OVE-36 worker/search proof plus OVE-37 current-main public-pilot closure plus OVE-38 iOS Safari offline entry + photo field proof plus OVE-39 backup/PITR + worker recovery durability proof plus OVE-41 closed-cohort invite loop plus OVE-48 closed-pilot auth recovery plus OVE-51 canonical `over.garden` pilot origin plus OVE-54 founder-only pilot rehearsal separation plus OVE-91 app-layer HTML no-store guardrail plus OVE-111/OVE-112 social OAuth continuity plus OVE-131 owner/public-smoke redacted proof plus OVE-143 canonical launch smoke plus OVE-163 deterministic matching rollout readiness plus OVE-190 immutable matching release parity and rollback proof plus OVE-191 production scaffold isolation plus OVE-203 automatic public identity plus OVE-226 exact-SHA self-serve runtime proof plus OVE-247/OVE-248 account-method continuity
Last updated: 2026-07-29

This document defines the production or preview pilot smoke that must pass before OverGarden can treat the live environment as ready for a first real pilot user. It is intentionally narrow: it proves one deployed first-user path end to end, not every future production concern.

The smoke is a product-learning gate, not only a deployment check. If public visitors or crawlers see Vercel SSO, broken auth, missing media derivatives, cached HTML, or unprocessed public/search jobs, H1/H4/H6 data becomes deployment noise rather than product evidence.

## Current Live Deployment Snapshot

Verified through the connected Vercel app and provider CLIs on 2026-06-29.

- Vercel team: `yehor's projects` / `team_vs3oQAk6OT4vVVvcL7Mf5m8t`
- Vercel project: `over-garden` / `prj_Tm5HXFEPqc46StpIfsoKjU9GtHBy`
- Latest verified OVE-51 production deployment: `dpl_AkMJozhSmood7NdvSkqvfUQDySKm`
- Latest verified OVE-51 production URL: `https://over-garden-d49wqs9kc-yehors-projects-01221e2b.vercel.app`
- Latest verified OVE-51 deployed commit: `f46850dcba7ed529ad286390bafe3c18f6eab7aa`
- Production domains/aliases: `over.garden`, `www.over.garden`, `over-garden.vercel.app`, `over-garden-yehors-projects-01221e2b.vercel.app`, `over-garden-git-main-yehors-projects-01221e2b.vercel.app`
- Canonical app domains `over.garden` and `www.over.garden` are attached to the Vercel project and point to Vercel through DNS-only Cloudflare A records.
- Earlier on 2026-06-27, fetching `/health` on the production deployment returned HTTP `302` to Vercel SSO, not OverGarden HTML.
- Later on 2026-06-27, `https://over-garden.vercel.app/health`, `/`, and `/privacy` returned HTTP `200` OverGarden HTML without Vercel SSO.
- Deployment env has the Better Auth versioned policy pair `BETTER_AUTH_SECRETS` (Sensitive ordered entries) and `BETTER_AUTH_CURRENT_SECRET_VERSION` (non-secret current-version metadata). A historical singular `BETTER_AUTH_SECRET` is read only during its bounded compatibility grace; an inadmissible or expired value is clean-cut from auth reads while the active versioned key is passed explicitly to Better Auth. It also has R2 runtime env, `DATABASE_SSL=true`, `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_CA`, `PILOT_INVITE_SIGNING_SECRET`, and canonical production `PUBLIC_SITE_URL=https://over.garden` / `BETTER_AUTH_URL=https://over.garden` installed in Vercel. OVE-111 adds Google OAuth env names `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; OVE-112 adds Facebook Login env names `FACEBOOK_CLIENT_ID` and `FACEBOOK_CLIENT_SECRET`; values are never recorded. OVE-142 gates production Facebook exposure behind the non-secret `FACEBOOK_LOGIN_PUBLIC_READY` class, so credentials alone no longer render or register Facebook in production. Runtime auth fails closed in production-like environments unless the ordered versioned secret set is syntactically valid, its first version equals the declared current version, and the active value is a canonical 32-byte encoded key class; it also fails closed for Google OAuth env missing for production social sign-in smoke, Facebook explicitly public-ready without credentials, or a legacy `.vercel.app` auth/public origin. Internal operator surfaces use durable `admin_user_roles` capabilities and credential-only owner bootstrap through `pnpm admin:bootstrap-owner`; `CATALOG_CURATOR_USER_IDS` is no longer the primary long-term admin model.
- Production managed Postgres is provisioned in DigitalOcean `FRA1`, reachable through public TLS with the configured CA, and bootstrapped with the app schema plus Better Auth tables. OVE-51 reran the non-destructive app bootstrap and confirmed the closed-pilot `pilot_invite_grants` table exists before the canonical invited-gardener smoke.
- OVE-27 branch preview `codex/ove-27-production-pilot-smoke` was redeployed after setting branch-specific `PUBLIC_SITE_URL` / `BETTER_AUTH_URL` to the branch alias and adding that alias to the R2 quarantine CORS origins.
- On 2026-06-27, that branch preview passed the browser pilot smoke through homepage first-entry with photo, derivative-only authenticated readback, same-object follow-up, public SSR journal readback, public variety CTA back to `/garden`, archive to `410 Gone`, and authenticated `/garden/pilot-health` aggregate readout.
- On 2026-06-28, OVE-36 provisioned the production worker/Meilisearch runtime at `matching.over.garden` and `meili.over.garden`, installed the production Vercel worker/search env names, and passed a redacted live journal index/unindex smoke against production Postgres and Meilisearch.
- On 2026-07-02, OVE-111 deployed Google OAuth sign-in continuity on production commit `183962c13a026f2a215951c171b5095b455feae3`. Redacted provider smoke proved `https://over.garden/garden` renders the Google option, Better Auth starts Google OAuth successfully, the generated callback is exactly `https://over.garden/api/auth/callback/google`, and Google does not reject the start with `redirect_uri_mismatch`, `INVALID_ORIGIN`, or `origin_mismatch`. Client id, client secret, state, cookies, tokens, and callback query parameters were not recorded. OVE-113 later narrowed admin access so Google-linked accounts remain valid gardener accounts but cannot satisfy `/admin`.
- On 2026-07-02, OVE-112 deployed Facebook Login sign-in continuity on production commit `e5496c3e2454c5c2dcf7c39a785f51697b81f33e`. Production deployment `dpl_49ThewAMcDKZKxRPJDv3NuoViScg` was `READY` and aliased to `https://over.garden`. Redacted provider smoke proved production Vercel env has non-placeholder `FACEBOOK_CLIENT_ID` and `FACEBOOK_CLIENT_SECRET`, Better Auth starts Facebook Login successfully, the generated callback is exactly `https://over.garden/api/auth/callback/facebook`, and Meta does not reject the start with `redirect_uri_mismatch`, `INVALID_ORIGIN`, or `origin_mismatch`. App id, app secret, state, cookies, tokens, and callback query parameters were not recorded. OVE-113 later narrowed admin access so Facebook-linked accounts remain valid gardener accounts but cannot satisfy `/admin`.

Implication: the OVE-27 preview proved the internal live-path contract against managed Postgres and R2; OVE-37 moved that proof to current `main` on the public Vercel production alias; OVE-51 makes `https://over.garden` the selected pilot origin. A protected preview is acceptable for internal deployment inspection, but it does not replace public visitor/crawler validation for H6 on the canonical domain.

## OVE-226 Exact-SHA Self-Serve Runtime Proof

The canonical guest `/garden` shell must stay independent of native image decode.
The only native decoder boundary is the authenticated `/api/media/process` route;
it retains quarantine admission, stripped-derivative creation, and original
absence proof. Before browser-backed production proof, use the Vercel deployment
read-back to obtain the immutable deployment URL and its exact Git SHA, then run:

```bash
cd apps/web
pnpm smoke:exact-sha-self-serve -- \
  --environment production \
  --confirm-environment production \
  --base-url https://over.garden \
  --immutable-deployment-url https://<exact-deployment>.vercel.app \
  --expected-commit <exact-main-sha> \
  --deployed-commit <exact-vercel-git-sha>
```

The command accepts only the canonical origin, an HTTPS immutable Vercel origin,
matching full lowercase SHA values, and rendered guest `/garden` plus
`/garden/profile` auth-shell markers from both origins within 10 seconds. Its
JSON receipt intentionally contains only status, elapsed time, and boolean
classes. It does not create an account, accept media, or prove provider identity
by itself. The subsequent browser journey must use disposable non-personal
provider identities: begin one first-time Google or Facebook account normally,
confirm that the profile records it as connected, add a password for the
provider-supplied verified email, then explicitly connect the other provider
and prove that either social method or email/password returns to the same
garden. A matching email alone must never merge an existing garden. Retain no
credential, token, email, private text, media bytes, object key, stable identity,
or precise location; finish through native account/media/projection cleanup
before considering the proof terminal.

## OVE-191 Production Scaffold Isolation

Goal: keep the historical walking-skeleton integration proof available to a
developer without shipping a shared identity or an alternate production journal
entrance.

Binding contract:

- `/skeleton`, `/skeleton/**`, `/api/skeleton`, and `/api/skeleton/**` return a
  null-body `404` in production, Vercel Preview, disabled environments, and for
  non-loopback request hosts. Proxy and API handlers require both the framework
  URL host and raw HTTP `Host` header to be loopback, while canonical `pnpm dev`
  binds the listener to `127.0.0.1`. Page and API handlers enforce the boundary
  before authentication, payload parsing, repository, or queue access.
- Source and postbuild scans reject legacy shared identity markers, the removed
  auth panel/server action, and any reintroduced local shared auth defaults. Old
  immutable Git history is historical exposure, not valid current proof, and its
  values are permanently compromised. Any still-accessible old Vercel deployment
  that serves the scaffold is a live exposure and must be removed or protected
  after the exact replacement deployment is ready.
- The local API returns only fixed opaque error classes: `401` signed out, `403`
  authenticated but ineligible, `400` invalid payload, and `500` unexpected
  internal failure. It never serializes the caught error message.
- Local developers authenticate only through the canonical `/garden` flow. The
  scaffold page is readback-only; the explicitly gated JSON endpoint is the
  single remaining diagnostic write path.
- `pnpm smoke:drive2-production` retains its OVE-186 report identity and adds a
  separate OVE-191 section. It performs credential-free `GET /skeleton`,
  `GET /api/skeleton/journal`, and `POST /api/skeleton/journal` probes and
  requires exact `404` for all three without reading or recording their bodies.
  The canonical `/api/garden/entries` signed-out `401` proof remains unchanged.

The 2026-07-18 production incident response established this redacted state:

- the original skeleton identity has no user, account, session, grant, role, or
  owned-data rows;
- one former local-development identity remains as a deliberately preserved
  retired record because it owns lifecycle-bearing data. Its historical shared
  password was rotated to an unavailable random value, all 15 session rows are
  expired, active sessions are zero, and current auth code reserves the address,
  rejects sign-in generically, refuses user creation/update, refuses session
  creation, and treats any returned old session as signed out;
- the access-only remediation preserved 15 spaces, 15 living objects, 23
  journals, 9 media rows, and 180 analytics events exactly. Two public-active
  journals are the only matching Meilisearch documents; 11 journals are
  private-active and 10 archived with their existing Gone lifecycle;
- eight stripped derivatives still exist in the public bucket, but none belongs
  to a current public-active journal. Four belong to private-active journals,
  three to archived journals, and one has no journal association. One
  `quarantined` database row has no remaining private original object. This is a
  lifecycle/data-disposition finding for OVE-195/OVE-199/OVE-200, not permission
  to delete user/content/media rows during OVE-191.

Done requires exact-main CI, a canonical exact-SHA Vercel `READY` deployment,
the redacted production smoke above, zero still-accessible old deployments that
serve the scaffold, a rejected historical credential with no session cookie,
zero active retired sessions, current-main containment, and the aggregate
preservation/exposure proof above. Retired data disposition remains an exact-plan
and explicit-sign-off operation under OVE-195/OVE-199/OVE-200. Never record the
retired values, any user identifier, content, object key, URL, or provider secret.

## OVE-203 Automatic Public Identity

Goal: prove that every supported Better Auth creation path receives exactly one
pseudonymous public profile/current handle claim without asking for a nickname,
and that later renames cannot break privacy, stable references, or lifecycle.

Binding exact-SHA production proof:

- install the additive identity schema and run the aggregate-only
  dry-run/rollback/apply-twice/verify sequence from
  `docs/PUBLIC_IDENTITY_MIGRATION_RUNBOOK.md` against the current deployed SHA;
- require zero missing profiles/current claims, duplicate or mismatched claims,
  unresolved legacy references, and pending policy reviews;
- prove new credential/Google/Facebook accounts converge on the same generated
  grammar locally/CI, while production provider-start continuity remains bound
  to the existing OVE-111/OVE-112 provider gates;
- prove no-name credential signup and duplicate-signup preservation through the
  canonical auth endpoint without recording email, user id, handle, cookie, or
  provider payload;
- prove one immediate custom rename, persisted 30-day cooldown, current route
  `200`, retired route `410` with `noindex`, and current-handle stable-reference
  readback;
- prove private, removed, inconsistent, and mutually blocked profiles disappear
  from profile metadata/RSC, typeahead, feed, journal, social, community, and
  lineage identity projections;
- retain only booleans, aggregate counts, policy version, exact code/deployment
  SHA, CI/deployment status, and HTTP status/header classes as evidence.

Do not close OVE-203 on local proof alone. Current-main CI, canonical Vercel
`READY`, exact deployed SHA equality, successful production migration verify,
and the redacted runtime smoke above are all required.

Result on 2026-07-18: pass.

- Behavior commit: `1edffc351c1c3132f97608083b4b6ea6a63e9a12` on `main`.
- CI: [run 29652693020](https://github.com/yehor-design/over.garden/actions/runs/29652693020) passed the Python tier, fresh bootstrap and identity recovery contract, DB type check, lint, typecheck, localization coverage, `1,912` web tests, production build, and responsive/accessibility matrix for the exact behavior commit.
- Production deployment: `dpl_5bTNKAWqQJVctuBkESjg7bqVKgsL`, target `production`, state `READY`, ref `main`, exact verified commit above, canonical alias `https://over.garden`.
- Database expand and migration: the exact-SHA additive bootstrap ran before code cutover. Dry-run reported `64` users, `6` existing profiles/current claims, `58` missing profiles/current claims, and two legacy review sets of `6`; rollback proof left aggregate state unchanged. First apply provisioned `58` identities and cleared both review sets. Second apply had zero mutations. Verify returned `64` users, `64` profiles, `64` current claims, zero retired claims, and zero missing, duplicate, mismatch, unresolved-review, or legacy-mention gaps.
- Canonical runtime: `/` and `/health` returned `200`; health reported configured auth and a successful database ping. Guest `/garden/profile` returned `200`, rendered credential fields without a name/nickname input, kept the owner editor absent, and remained `noindex`. A current public profile returned `200`, profile-v2 markup, and no private markers.
- Synthetic flow: one generated, non-PII test identity proved credential signup `2xx`, exactly one generated profile/current claim, duplicate signup `2xx` without mutation, verified sign-in, authenticated My Account, immediate custom rename, persisted cooldown, current route `200`, retired route `410` with `noindex` and no redirect, current mention readback, and retired mention exclusion. The synthetic account and its current/retired claims were deleted immediately; final verification returned the unchanged `64`/`64`/`64` zero-gap state.
- Provider parity: the provider-independent SQL creation trigger and Better Auth database hook are proven locally/CI for credential, Google, and Facebook creation. Production Google/Facebook start continuity remains bound to the existing OVE-111/OVE-112 gates; OVE-203 neither copied provider names into public identity nor changed provider configuration.
- Evidence safety: only aggregate counts, booleans, status/header classes, policy version, CI/deployment state, and exact code/deployment identifiers were retained. No email, UUID, handle, rejected moderation value, session cookie, token, provider payload, private content, or precise location was printed or recorded.

## OVE-204 Reliable Current-Session Sign-out

Goal: prove that a gardener can safely end only the current browser session
from every authenticated product class without losing or crossing local work,
claiming success on failure, or changing server identity, role, provider, garden,
locale, consent, or other-device state.

Binding implementation and local browser proof:

- exercise the same shared control from `/garden/profile`, the desktop account
  menu, the mobile drawer at 320 px, a permitted owner operator route, and the
  signed-in non-owner `/admin` denial boundary;
- prove guest, health, skeleton, and visual-fixture surfaces do not render or
  mount an authenticated sign-out utility;
- with no unsynced rows, require one canonical Better Auth `POST
/api/auth/sign-out`, a fresh database-backed null-session confirmation, and a
  hard replace to `/`, `/bg`, or `/ru` for the selected interface locale;
- with unsynced text and nested photo Blob data, require exactly stay,
  sync-first, or explicit discard-and-sign-out; pause new owner-local writes
  before inventory, abort/drain current sync, and delete only that owner's
  unsynced drafts/mutations/Blobs in one Dexie transaction before sign-out;
- prove Stay changes neither session nor IndexedDB, Sync first reaches the real
  `/garden#drafts` recovery surface, and purge/sign-out failure never redirects
  or renders raw adapter/network/storage details;
- prove account A cannot enumerate or purge account B rows, synced receipts are
  preserved, CacheStorage/service-worker/consent/locale state is untouched, and
  successful completion leaves no stale persistent pause that blocks an
  immediate repeat sign-in;
- prove a no-identity BroadcastChannel plus localStorage signal converges other
  tabs using an exact preparation round, while a persisted BFCache restoration
  hard-reloads before stale private UI can be reused;
- bind every local write to the authoritative opaque session generation, place
  a durable `commit_pending` fence before the canonical POST, and never thaw
  the old generation while the POST outcome or fresh session state is unknown;
- exercise keyboard focus, dialog semantics, live states, 320 px and 1440 px,
  and exact-parity Ukrainian, Bulgarian, and Russian copy.

The healthy-database smoke must use a bounded synthetic account and two cookie
jars. It establishes exactly two current sessions, ends jar A through the
canonical POST, proves only A's row disappeared while jar B remained active,
proves A cannot call a protected mutation, signs A in again, and compares exact
in-memory snapshots of the synthetic user/profile/current claim, structural
provider links, global owner-role records, and a private space/object/entry.
It then deletes only the exact locked synthetic identity and proves that no
synthetic residue remains. This is deliberately not described as restoration
of every global database baseline. A status code or client cookie deletion
alone is not proof.

Standing command shape from the repository root:

```bash
vercel env run --environment=production -- env NODE_OPTIONS=--conditions=react-server \
  apps/web/node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json \
  apps/web/scripts/smoke-account-sign-out.ts \
  --base-url https://over.garden \
  --env-file /private/tmp/ove204-empty.env \
  --expected-commit <full-main-sha> \
  --deployed-commit <full-deployed-sha>
```

Do not run through `apps/web/.env.local` for production evidence. Retained
evidence is limited to booleans, aggregate count/status classes, exact public
commit/deployment identifiers, and CI/deployment state. Never retain the
synthetic email, user/session/account UUID, handle, cookie, token, password,
private text, Blob/filename, provider payload, media key, exact location, IP,
user agent, DSN, or env value.

The two SHA arguments are an operator assertion checked for exact equality by
the smoke; they are not independently discovered from the runtime. Resolve the
contained production revision first from the canonical Vercel deployment
metadata and retain that separate redacted proof. The smoke must report
`caller_asserted_exact_sha_match` and
`independentlyResolvedFromRuntime: false`; never cite that field by itself as
deployment proof.

Do not close OVE-204 on local proof alone. The exact behavior commit must pass
current-main CI and reach a canonical Vercel `READY` deployment; the redacted
production smoke and real rendered-button browser flow must pass against that
same contained revision. A direct auth endpoint probe does not replace the UI
proof.

## OVE-163 Deterministic Matching Rollout Readiness

Goal: prove that the exact deterministic-matching behavior commit is deployed
and that production has the required runtime, schema, closed queue payloads,
safe typeahead projection, and redacted entity-resolution QA surface without
creating fixture or real catalog data.

Result on 2026-07-16: pass for deployment readiness and privacy; behavioral
approve/reject, fuzzy-advisory, recovery, and cleanup claims remain bound to the
exact-commit local proof.

- Behavior commit: `e94148fa5a4a097422b5cdf7234e1b1ffad542e2` on `main`, with a clean working tree during proof.
- CI: [run 29477408972](https://github.com/yehor-design/over.garden/actions/runs/29477408972) passed Python matching, web tests, build, and the responsive/accessibility matrix.
- Production deployment: `dpl_FR7gxmnHv9j3wEMLvrDbk5KjYPf2`, target `production`, state `READY`, exact verified GitHub commit above, canonical alias `https://over.garden`.
- Read-only proof schema: `ove163.deterministicMatchingNonLocalProof.v1`, generated at `2026-07-16T06:50:29.851Z`.
- Runtime, matching schema/queue constraints, safe typeahead search, entity-resolution QA, and recursive leak checks passed.
- Production fuzzy QA counts were `fullPersisted=0`, `boundedReviewed=0`, and `rendered=0`. This proves the report is safely readable while empty; it does not replace the bounded local fixture proof of advisory generation.
- `productionDataTouched=false`. No broad source import, fixture creation, approval/rejection action, search mutation, or schema mutation was performed.
- No database URL, CA body, secret, token, cookie, private user field, source-only payload/key, journal text, media key, request metadata, email, IP, user agent, or precise location was printed or recorded.

## OVE-190 Immutable Matching Release Parity And Rollback

Goal: prove that production API and worker run one exact tested `main` revision
from one immutable image digest, expose the complete six-handler capability
contract, fail closed on schema/dependency/release drift, execute every handler
to a safe terminal state, and survive an immediately-prior-digest rollback plus
forward activation without relying on a mutable `latest` image.

Result on 2026-07-18: pass. Production API and worker run release B from exact
tested-main source `710ac0c74559cea698946be31eeea856f0644fb4`, the all-handler
canary passed, rollback to release A and forward to B passed, and a final worker
restart recovered the same B identity and fresh heartbeat. The redacted binding
record is below.

### Required release contract

- `.github/workflows/matching-image.yml` accepts an exact lowercase full SHA
  contained in `origin/main`. It installs `uv==0.11.24`, compiles every Python
  module, runs `uv run --frozen ruff check .`, and runs the full
  `uv run --frozen pytest -q` suite before publishing.
- Each run publishes one private immutable image under a unique
  `sha-<full-sha>-run-<run-id>-<attempt>` tag and records its `sha256:` registry
  digest. `latest` is forbidden.
- The sealed 90-day Actions artifact contains the exact compressed Docker
  archive, its SHA-256 checksum, `release.json`, and
  `matching-capabilities.json`. The release script rechecks checksum, portable
  archive-config digest, the receiving daemon's loaded image identity, OCI
  revision/build/schema/runtime labels, full SHA, registry digest, unique run
  tag, and exact handlers before installation.
- API and worker run the same installed image id. Runtime schema is
  `ove190.matchingRuntime.v1`, release schema is
  `ove190.matchingRelease.v1`, runtime contract is `ove190-v1`, schema
  compatibility is `ove190.matching-schema.v1`, and queue is `matching`.
- The complete supported-handler list is exactly:
  `catalog_alias_suggestions_refresh`,
  `catalog_fuzzy_duplicate_qa_refresh`,
  `catalog_match_suggestions_refresh`, `catalog_typeahead_reindex`,
  `journal_entry_index`, and `journal_entry_unindex`.

### Liveness, capabilities, readiness, and heartbeat

- `GET https://matching.over.garden/health` is liveness only. Its HTTP `200`
  cannot close OVE-190 by itself.
- `GET https://matching.over.garden/capabilities` returns immutable SHA,
  digest, build time, schema class, queue, and the exact six handlers. Invalid
  or missing release metadata returns bounded `unavailable` with HTTP `503`.
- `GET https://matching.over.garden/ready` returns HTTP `200` only when API,
  Postgres, required queue/heartbeat schema, Meilisearch, and a fresh
  same-SHA/same-digest/same-capability worker heartbeat all pass. Any mismatch
  returns HTTP `503` with `status=degraded`.
- `matching_worker_heartbeats` is an additive, idempotent table with one
  `matching` row containing only release SHA, image digest, schema class,
  sorted handler names, and timestamps. A heartbeat older than 30 seconds is
  stale. Host/process/error/payload/user/connection/location fields are
  forbidden.
- Allowed runtime states are bounded: dependency
  `available`/`unavailable`; queue `schema_mismatch`; worker
  `missing`/`stale`/`release_mismatch`/`capability_mismatch`; depth
  `empty`/`low`/`medium`/`high`; lag
  `none`/`fresh`/`delayed`/`stale`. Raw counts and exception text are not smoke
  evidence.

### Production Linux activation sequence

This surface remains `production-linux-required`: Docker Compose on the
DigitalOcean Linux droplet is the OVE-76 production exception. It does not
change the Apple Container-first supported-Mac local policy. The binding
install/deploy/redaction runbook is `infra/production-worker/README.md`.

Build two workflow-run artifacts from the same exact final `main` SHA. Their
unique run labels produce two distinct immutable digests, allowing a real
rollback while keeping the full OVE-190 readiness contract on both sides.

```bash
sudo /opt/overgarden/matching-release install /path/to/release-a
sudo /opt/overgarden/matching-release install /path/to/release-b
sudo /opt/overgarden/matching-release migrate <release-a-key>
sudo /opt/overgarden/matching-release deploy <release-a-key>
sudo /opt/overgarden/matching-release deploy <release-b-key>
sudo /opt/overgarden/matching-release rollback
sudo /opt/overgarden/matching-release forward
sudo /opt/overgarden/matching-release status
```

`migrate` applies only the committed additive heartbeat migration; never replay
the full bootstrap SQL against production. Every activation runs candidate
Postgres/schema/queue/Meilisearch preflight before replacement and verifies
both services plus live capabilities/readiness afterward. `rollback` accepts no
target except the immediately prior digest; `forward` accepts no target except
the release saved by that rollback. Failed activation must restore the prior
active release.

### External release proof and approved canary

Run the exact-identity public smoke after each activation that is recorded as
proof:

```bash
cd apps/web
pnpm smoke:matching-runtime-capabilities -- \
  --base-url https://matching.over.garden \
  --expected-commit <40-character-main-sha> \
  --expected-digest sha256:<64-hex-digest>
```

The all-handler canary performs bounded production mutations on existing
eligible rows, so it must be explicitly approved for that one execution. It
refuses to run without `OVERGARDEN_MATCHING_CANARY_APPROVED=true`:

```bash
docker compose \
  --project-name overgarden \
  --env-file /opt/overgarden/release-state/active.env \
  --file /opt/overgarden/docker-compose.release.yml \
  exec -T \
  -e OVERGARDEN_MATCHING_CANARY_APPROVED=true \
  matching-worker python -m app.canary
```

The canary must report all six handlers `done`, prove the public-safe journal
document after index, prove its absence after unindex, restore that same derived
search state, and keep catalog effects derived/advisory only. It may not create
or change user content or apply a canonical catalog decision. If no eligible
privacy-safe source exists, the canary fails closed; do not weaken its query or
seed production solely to make the smoke pass.

### OVE-190 live evidence (redacted)

```text
verified_at_utc: 2026-07-18T09:55:27Z
main_commit_sha: 710ac0c74559cea698946be31eeea856f0644fb4
main_ci_run: 29639178461
release_a_workflow_run: 29639178486
release_a_digest: sha256:c11d80b9815e21dc3d02996666a4b90005093a819d2c9bdd614109fe6862c8e9
release_b_workflow_run: 29639190206
release_b_digest: sha256:188bc9359b27315c54ef417d5437719ba7fe96dcf09e73406112d96f82879600
release_contract: exact-sha + distinct-digests + no-latest-pass
migration_preflight: pass
deploy_a: ready
deploy_b: ready
capabilities: exact-six-pass
dependencies: api=available, postgres=available, jobQueue=available, meilisearch=available, worker=available
queue_buckets: depth=empty, lag=none
handler_canary: six-done + public-safe-index + unindex + restore
rollback_b_to_a: ready + exact-release-a-identity
forward_a_to_b: ready + exact-release-b-identity
restart_recovery: worker-restart + fresh-heartbeat + exact-release-b-identity
host_resource_safety: persistent-swap + capacity-gates + bounded-low-priority-import-pass
active_digest_after_forward: sha256:188bc9359b27315c54ef417d5437719ba7fe96dcf09e73406112d96f82879600
result: pass
redaction: pass
```

The first live archive import exposed a production capacity failure mode: the
small worker host had no active swap and became temporarily unresponsive under
Docker/Meilisearch pressure even though no kernel OOM event was recorded. The
release was not activated by that failed attempt, and the already-active
runtime was recovered through the provider restart boundary. A persistent 2 GiB
swap file with low swappiness was then enabled, transferred staging was cleaned,
and both releases installed without further liveness loss. The committed
controller now fails closed on combined-memory, available-memory,
release-filesystem, and Docker-root capacity; bounds expensive archive
operations; lowers client-side CPU/I/O priority; and keeps explicit rollback
outside the normal capacity gate. The
final release B install later refused while obsolete, unreferenced release
generations consumed the required disk headroom. The floor was not weakened:
pointer-aware cleanup removed only reconstructible generations that were not
current, previous, forward, running, or the new release A, after which the same
install passed. No Docker volume or production data was removed. The
subsequent A activation, B activation, six-handler canary, rollback, forward,
delayed readiness probes, and worker restart all passed without reproducing the
freeze. A paid droplet resize remains a capacity-planning decision, not an
unrecorded OVE-190 runtime dependency.

Allowed evidence is limited to public commit SHA, immutable image digests,
public workflow/CI ids, safe schema/runtime classes, six public handler names,
bounded dependency/queue states, and pass/fail outcomes. Never record env-file
contents, DSNs, provider credentials, API keys, job payloads, row or user ids,
journal/catalog text, raw errors, precise location, IPs, user agents, or
private host data.

### OVE-190 Done gate

Do not close OVE-190 if the production image is local-build-only or mutable; if
API and worker SHA/digest equality is unproven; if `/health` is the only runtime
proof; if any of the six handlers is missing or unproven; if schema/dependency
readiness does not fail closed; if release A/B are not distinct immutable
digests from the exact final main SHA; if rollback/forward was not exercised;
if the final forward release is not ready and identity-verified; if exact-main
CI is not green; or if evidence crosses the redaction boundary.

## OVE-143 Canonical Launch Smoke

Goal: prove the canonical production launch path on `https://over.garden` with a fresh authenticated account, one new journal object, one same-object follow-up, one photo through quarantine to a stripped public derivative, public publish/readback, archive to `410`, sitemap exclusion, worker index/unindex, and protected admin/erasure route boundaries.

Result on 2026-07-05: pass.

Execution notes:

- The smoke was run from the repository root through Vercel production env so `apps/web/.env.local` could not override production DB/auth values.
- The first production run exposed real schema drift: `journal_entry_topic_signals` was missing in production. The idempotent production DB bootstrap was run and completed successfully before the final smoke. This was not a destructive migration; it brought production back in line with `sql/0001_walking_skeleton.sql`.
- The final smoke used a fresh email/password account created through the production Better Auth API, verified through a production-compatible email verification token, and signed in through the production auth endpoint. No email, password, token, cookie, user id, or callback query value is recorded.
- The smoke pre-cleans only exact prior OVE-143 smoke publications before a new run so a failed proof cannot leave public smoke content indexed or readable.

Redacted production evidence from the final pass:

- Canonical origin: `https://over.garden`, public access without Vercel SSO.
- Signed-out `/garden`: auth boundary rendered; Google and Facebook auth options visible.
- Signed-in `/garden`: authenticated garden shell rendered with the production-issued auth cookie.
- Journal write: first entry saved and read back; a same-object follow-up saved on the same object.
- Media: private original upload accepted; server processing returned a readable public WebP copy on the `media.over.garden` host class. No quarantine key, derivative key, signed upload URL, or original object key is recorded.
- Public publish: `/journal/[slug]` returned HTTP `200`, stayed `noindex, nofollow`, rendered derivative-only media, and kept location hidden.
- Archive: the same public path returned HTTP `410` with `noindex, nofollow`; the archived path was absent from the sitemap.
- Worker/search: `journal_entry_index` reached `done`; the Meilisearch `journal_entries` document matched the public-safe key contract (`body`, `createdAt`, `entryDate`, `id`, `kind`, `locationVisibility`, `noindex`, `publicPath`, `publicSlug`, `title`) and had no forbidden owner/user ids, media keys, precise location, IP/user-agent, referrer, invite, or private state fields. `journal_entry_unindex` then reached `done`, and the Meilisearch document was absent after archive.
- Public route policy: diagnostic/legal routes remained public `noindex`; localized landing and authored content routes remained indexable; sitemap contained policy-approved public routes only and excluded `/garden`, `/admin`, and auth routes.
- Admin/erasure boundaries: signed-out `/admin` showed the auth boundary; the fresh normal account was blocked from `/admin` and `/garden/privacy/erasure-requests`; irreversible erasure was not executed. The Vercel production owner env name was verified, but the local Vercel CLI runtime did not expose the owner id value to this smoke, so the sealed owner credential login proof remains the previously recorded OVE-131 owner smoke. Owner id and owner email remain intentionally unrecorded.

Standing re-run command shape:

```bash
vercel env run --environment=production -- env NODE_OPTIONS=--conditions=react-server OVE143_OWNER_ENV_LIST_VERIFIED=1 apps/web/node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/smoke-canonical-launch.ts --base-url https://over.garden --env-file /private/tmp/ove143-empty.env
```

The command must be run from the repository root. Running it from `apps/web` is invalid for production proof if `apps/web/.env.local` exists, because local DB/auth values can override production values and create false evidence.

## OVE-131 Production Owner And Public-Smoke Proof

Goal: record one redacted production-readiness proof that a founder/operator can hand to the next agent without exposing owner identity, user ids, emails, cookies, tokens, invite links, journal text, media keys, IP/user-agent data, precise location, raw provider payloads, or private authenticated URLs.

Selected production environment:

- Public origin: `https://over.garden`
- App host class: Vercel production behind DNS-only `over.garden` app records
- Media public host class: `media.over.garden`
- Worker/search health host classes: `matching.over.garden` and `meili.over.garden`
- Evidence date: 2026-07-04 Europe/Sofia; public header probes below were observed at 2026-07-03 21:50 UTC.

Founder-confirmed owner/admin smoke, redacted:

- Owner bootstrap: pass. The dedicated email/password owner account was bootstrapped into the durable `admin_user_roles` owner path. The owner user id, email, session id, and env value are not recorded.
- Signed-out `/admin`: pass. A signed-out request shows the auth boundary, not admin dashboard links.
- Normal signed-in `/admin`: pass. A non-owner signed-in user is denied before admin links or role rows render.
- Owner `/admin`: pass. The owner dashboard opens through the sealed owner credential-only gate.
- Social auth to admin: pass by policy and prior OVE-113 proof. Google/Facebook-linked accounts remain valid gardener accounts but do not satisfy `/admin`.

Live public probes, redacted:

- `/`: HTTP `307` to `/uk`, Vercel response, no Cloudflare cache header, closed-pilot no-store/no-cache header class.
- `/health`: HTTP `200`, Vercel response, no Cloudflare cache header, closed-pilot no-store/no-cache header class.
- `/privacy`: HTTP `200`, OverGarden HTML response, no Cloudflare cache header, `Cache-Control: private, no-store, max-age=0, s-maxage=0, must-revalidate`.
- `/support`: HTTP `200`, OverGarden HTML response, no Cloudflare cache header, `Cache-Control: private, no-store, max-age=0, s-maxage=0, must-revalidate`.
- `/admin` signed out: HTTP `200`, robots `noindex, nofollow`, auth panel rendered, no owner dashboard links recorded.

Auth and account continuity evidence:

- Email/password auth, email verification, and password-reset delivery are covered by OVE-127's Resend-backed auth email implementation and OVE-141's 2026-07-04 redacted production delivery proof. Provider class: Resend transactional email. Sender-domain class: `over.garden`. Visible verification/reset link origin class: `https://over.garden`. Account-continuity class: pass.
- Google OAuth production continuity is covered by OVE-111 redacted provider smoke on 2026-07-02.
- Facebook Login provider-start continuity is covered by OVE-112 redacted provider smoke on 2026-07-02. OVE-142 adds the public launch gate: until `FACEBOOK_LOGIN_PUBLIC_READY` is explicitly true after real non-role Meta proof, production intentionally hides/disables Facebook Login and keeps email/Google as the usable fallback.
- No provider ids, provider secrets, callback query parameters, message ids, reset links, verification links, cookies, or tokens are recorded here.

### OVE-248 final social-method recovery proof

For an approved disposable, non-personal account-method session, open the active
final-provider Disconnect control on `/garden/profile`. A verified social-only
session must expose the password bridge in that dialog and perform one credential
creation before at most one selected-provider unlink. An unverified or otherwise
ineligible social-only session must expose a localized recovery explanation with
zero unlink submit. A non-final provider must require an explicit scoped
confirmation. Cancel, Escape, outside dismissal, invalid password, and a failed
unlink preserve every existing method; after credential success plus unlink
failure, record only the class `credential-success-unlink-failed` and retain both
methods. The native erasure path cleans up the exact disposable account after the
proof. Retain only redacted state classes, exact commit/deployment identifiers,
and pass/fail outcomes—never an email, password, provider subject, callback URL,
token, cookie, account identifier, journal data, media key, or precise location.

Current public-product smoke coverage:

- First entry, media derivative, same-object follow-up, publish, public journal SSR, public variety activation, archive-to-410, and pilot-health readback remain covered by the canonical OVE-51 browser smoke and OVE-37 current-main closure unless the deployed app, R2 media path, auth path, public route semantics, worker/search env, or publication/archive code changes.
- Media proof records only the public derivative host class (`media.over.garden`). Quarantine keys, signed upload URLs, original object keys, EXIF, and derivative object keys remain forbidden evidence.
- Public journal and variety HTML remain governed by the noindex/no-store policy in this document and `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`.

Worker/search and durability evidence:

- Public health probe `https://matching.over.garden/health`: pass (`status=ok`, ICU present).
- Public health probe `https://meili.over.garden/health`: pass (`status=available`).
- Journal index/unindex, public-safe Meilisearch document shape, worker restart recovery, and managed Postgres backup/PITR remain covered by OVE-36/OVE-39 redacted evidence unless worker/search/job payload/env or production process management changes.
- A fresh live worker/search round-trip is deferred for OVE-131 because this issue records the current proof bundle and did not change worker/search runtime behavior. Re-run it before inviting a new cohort if any worker/search surface has changed.

Erasure readiness:

- The operator route `/garden/privacy/erasure-requests` remains in the sealed owner control plane. The checklist now requires signed-out, normal signed-in, and owner checks before production erasure proof is claimed.
- Live erasure execution is deferred for OVE-131 because irreversible erasure requires a maintainer-approved request and must not be simulated against production data. Acceptable evidence is route/access class plus approved-execution pass/fail only; never record user ids, emails, journal text, media keys, precise location, request metadata, or approval text values.

OVE-131 closeout interpretation:

- Pass for redacted owner/admin proof recording, canonical public access/header probes, public worker/search health probes, and documenting the complete production smoke checklist.
- Deferred live proof, with reason: new authenticated first-entry/media/publish/archive run, Resend delivery run, live worker index/unindex round-trip, and live erasure execution were not repeated in this issue because they require private owner/test credentials, email inbox/provider evidence, worker data mutation, or maintainer-approved irreversible erasure. Each deferred item has an explicit re-run condition above.

## OVE-37 Current-Main Public Pilot Closure

Verified on 2026-06-28 against current `main`.

- Historical OVE-37 selected public pilot URL: `https://over-garden.vercel.app`. This alias-based closure is superseded by OVE-51 for current pilot traffic; the selected pilot URL is now `https://over.garden`.
- Production deployment serving the pilot URL: `dpl_5xY21uia8usEAdA7LoLwhYTXhUB5`, target `production`, state `READY`, GitHub ref `main`, commit `a8cd3c95`, commit verification `verified` (connected Vercel app).
- Public probes returned OverGarden HTML without Vercel SSO: `/` `200`, `/health` `200`, `/privacy` `200`.
- Auth on the pilot origin succeeded without `INVALID_ORIGIN` (email sign-in `200`; browser sign-in also passed).
- First plant entry and same-object follow-up both saved through the canonical create path with authenticated readback. Operator-entered title/body are not copied into this evidence.
- Published `/journal/[slug]` (plant note, no photo): SSR `200`, robots `noindex, nofollow`, no region/precise-location label (object `hidden`), no media element, and no quarantine/original key in the HTML.
- Public `/variety/[slug]`: SSR `200`, `cache-control: private, no-store`, robots `noindex, nofollow`, lists active public entries that link back to their `/journal/[slug]`, and the activation CTA carries only the public catalog slug plus the `public-variety` source enum into `/garden`.
- Public-variety activation: the variety CTA opened `/garden` with the catalog match preselected from the safe slug, and a new first entry saved through the canonical path with `public_variety` activation attribution.
- Archive: the previously published `/journal/[slug]` returned `410 Gone` with robots `noindex, nofollow` and a tombstone containing no private content; a sibling still-published entry on the same object stayed `200`.
- Photo derivative path proven through the authenticated media API on current main (the agent browser cannot drive the OS file picker): presigned quarantine upload landed on the private quarantine R2 S3 host, server processing returned status `processed` with a `derivatives/...` key on public host class `media.over.garden`, the public derivative `GET` returned `200 image/webp` (RIFF/WEBP magic), and no quarantine/original key appeared in the public URL. A live CORS preflight to the quarantine bucket from `https://over-garden.vercel.app` returned `204` with `Access-Control-Allow-Origin` for that origin and `Access-Control-Allow-Methods: PUT, HEAD`, so a real pilot gardener's browser upload from the pilot origin passes preflight.
- Search: publishing enqueues `journal_entry_index` and archiving (public-gone) enqueues `journal_entry_unindex`, code-confirmed in the publish/archive server actions. Live index/unindex round-trip remains proven by the standing OVE-36 canary and was not re-run for this closure.

Scope and limitations recorded honestly:

- OVE-51 supersedes the OVE-37 alias limitation: canonical `over.garden` domain attach is no longer deferred, and the selected pilot URL is now `https://over.garden`.
- The OS file-picker upload click was not agent-driven; the photo derivative guarantee is proven via the authenticated media API plus a live CORS-preflight check for the pilot origin, not a browser file-picker run.
- Worker/search index/unindex execution relies on the standing OVE-36 live proof rather than a fresh run for this closure.

## OVE-51 Canonical over.garden Pilot URL Closure

Goal: a real invited gardener's pilot path uses the canonical `https://over.garden` origin, not a temporary Vercel alias, while keeping the same privacy, media, auth, SSR, deletion, search-worker, and no-Cloudflare-HTML-cache boundaries.

Provider state verified on 2026-06-29:

- `over.garden` and `www.over.garden` are attached to Vercel project `over-garden` and resolve to Vercel through DNS-only Cloudflare A records. App HTML should therefore have no Cloudflare cache status; if Cloudflare proxying is enabled later, any HTML cache HIT blocks pilot traffic.
- Vercel production `PUBLIC_SITE_URL` and `BETTER_AUTH_URL` are set to `https://over.garden`. The production readiness readout now fails closed if Vercel production uses the legacy `.vercel.app` alias for either value.
- Vercel production `PILOT_INVITE_SIGNING_SECRET` is present in the env store; its value is never recorded. This was a live OVE-51 blocker discovered during smoke and fixed before the final pass.
- Production DB schema includes `pilot_invite_grants`; this was another live OVE-51 blocker discovered during smoke and fixed through the existing non-destructive bootstrap path before the final pass.
- R2 quarantine CORS includes `https://over.garden` and `https://www.over.garden`; a canonical-origin preflight to the quarantine S3 host returned the allowed origin and `PUT, HEAD` method class. Evidence records only origin/method class, never signed upload URLs or object keys.
- Public probes on `https://over.garden/`, `/health`, and `/privacy` returned `200` OverGarden responses without Vercel SSO. `https://www.over.garden/` also returned `200`. App HTML had Vercel response IDs and no Cloudflare cache status because app DNS is DNS-only.

Final canonical browser-smoke result on 2026-06-29:

- Deployment `dpl_AkMJozhSmood7NdvSkqvfUQDySKm`, commit `f46850dc`, canonical alias `https://over.garden`: pass.
- Invite claim: valid `/join?invite=` claim set a signed HTTP-only eligibility cookie; local verification was boolean-only and did not print the token or cookie value.
- Auth: sign-up on `https://over.garden` reached the write composer without `INVALID_ORIGIN`.
- First entry: saved through the canonical `/garden` UI to `/garden/objects/[objectId]`.
- Photo: browser file input used a generated PNG buffer; upload/process/readback showed only `media.over.garden` derivative host class, with no quarantine/original key in evidence.
- Follow-up: same-object follow-up saved and read back on the same object path.
- Publish: `/journal/[slug]` returned `200`, stayed `noindex, nofollow`, and rendered derivative-only public media.
- Public variety: `/variety/[slug]` returned `200`, stayed `noindex, nofollow`, and its CTA saved a second first-entry path with public-variety activation.
- Archive: authenticated archive UI moved the published entry to archived state; the old `/journal/[slug]` returned `410` and stayed `noindex, nofollow`.

Canonical smoke bar:

- `https://over.garden/`, `/health`, and `/privacy` return OverGarden responses without Vercel SSO.
- Matched app routes send `Cache-Control: private, no-store, max-age=0, s-maxage=0, must-revalidate`. This applies to app HTML/RSC/API responses during the closed pilot; static assets, the service worker, manifest, and R2 media derivatives stay outside this guardrail.
- A pilot user signs in or signs up on `https://over.garden`, creates a first entry, attaches one photo, reads back only a `media.over.garden` derivative, adds a same-object follow-up, publishes, opens the SSR `/journal/[slug]`, opens `/variety/[slug]`, saves through the public-variety activation CTA, and archives to a `410 Gone` tombstone.
- Public journal and variety HTML stay `noindex, nofollow`, location-safe, and free of quarantine/original keys. The public derivative host class may be recorded as `media.over.garden`; derivative keys, signed URLs, raw journal text, EXIF, precise location, cookies, invite links, and emails must not be recorded.
- Worker/search proof from OVE-36/OVE-39 remains valid unless worker, search, job payload, or worker env changes. A fresh live worker/search round-trip is required after such changes.

### Protective DNS reputation gate (OVE-188)

Run from `apps/web`:

```bash
pnpm smoke:protective-dns
```

The command compares the system resolver and major protective/public resolvers with authoritative Cloudflare DNS without printing the system resolver or visitor address. Exit `0` means automated resolver parity, exit `1` means the check could not complete, and exit `2` means at least one resolver replaced or disagreed with the authoritative answer.

Closure status on 2026-07-22: authoritative DNS, the default A1-connected system resolver, Cloudflare, Cloudflare Security, Google, Quad9, and both Cisco Umbrella endpoints agree for apex and `www`. The deterministic result is `14 pass / 0 mismatch / 0 error`. A fresh normal Chrome session on the default A1 connection loaded both canonical hostnames and rendered the Bulgarian OverGarden route without custom DNS, VPN, a hosts override, provider bypass, temporary allow action, or a block page. Exact-main CI and Vercel `READY` deployment, hostname-specific TLS, canonical HTTPS routes, focused DNS tests, the refreshed production dependency audit, and bounded production error/HTTP-500 checks passed. OVE-188 is closed as `false-positive remediation propagated / customer path recovered`; private provider case identifiers remain excluded from evidence.

An automated pass remains necessary but not sufficient. The normal-browser gate passed for this closure, but every later suspected regression must again prove that `https://over.garden` and `https://www.over.garden` load on the default A1 connection without custom DNS, VPN, hosts override, provider bypass, or a temporary allow action. Follow `docs/DOMAIN_REPUTATION_INCIDENT_RUNBOOK.md`; do not treat a user workaround or this historical pass as future production proof.

## OVE-91 HTML Cache Guardrail

Goal: pilot evidence should never be polluted by stale or cross-user HTML from an intermediary cache. During the closed pilot, public SSR routes are intentionally treated as no-store too, even when they are crawler-visible, because H1/H4/H6 learning is more important than caching public shells before real UGC depth exists.

Current code contract:

- `apps/web/src/proxy.ts` sets `Cache-Control: private, no-store, max-age=0, s-maxage=0, must-revalidate` for matched app routes.
- The matcher covers homepage, invite/join, privacy, health, journal, variety, authenticated garden/operator routes, and app API routes.
- The matcher excludes `/_next/static`, `/_next/image`, `favicon.ico`, image files, `sw.js`, and `manifest.webmanifest`. R2 public derivative caching is unchanged and remains governed by the media bucket contract.
- Cloudflare DNS remains DNS-only for the app domain as of the OVE-51 provider state. If Cloudflare proxying is enabled later, any app HTML `cf-cache-status: HIT` still blocks pilot traffic.

Representative header smoke:

```bash
curl -I "$SMOKE_BASE_URL/"
curl -I "$SMOKE_BASE_URL/garden"
curl -I "$SMOKE_BASE_URL/join"
curl -I "$SMOKE_BASE_URL/privacy"
curl -I "$SMOKE_BASE_URL/health"
curl -I "$SMOKE_BASE_URL/journal/<safe-smoke-slug>"
curl -I "$SMOKE_BASE_URL/variety/<safe-smoke-slug>"
```

Expected: each app-route response includes the no-store cache policy above. If the domain is routed through Cloudflare, the same response must not include `cf-cache-status: HIT`.

## OVE-38 iOS Safari Offline Entry + Photo Field Proof

Goal: prove that a real pilot gardener on iOS Safari can start a first or follow-up journal entry with one photo while offline or under forced network failure, see an honest saved-on-this-device state, restore connectivity, retry manually, and end with exactly one canonical server entry plus derivative-only authenticated readback, with no duplicate on repeated retries.

This is a field-behavior gate. The acceptance bar is the offline path on a real iOS Safari device against the OVE-37 pilot URL. Automation that is not real iOS Safari can only de-risk, never satisfy, the gate.

Result (2026-06-29): the maintainer ran the manual real-iOS-Safari smoke on the OVE-37 pilot URL and confirmed pass. The gate is satisfied and OVE-38 is closed. See "Manual device smoke result" below.

### Code hardening landed for this proof (2026-06-28)

- The offline composers copy a picked photo's bytes into an in-memory `Blob` at capture time (`createOfflinePhotoIntent` in `apps/web/src/lib/offline/queue.ts`) so the queued photo intent is owned by IndexedDB rather than a file-backed `File` reference. iOS Safari/WebKit can drop a `File`'s backing store across reload or tab eviction, which is exactly the offline -> reconnect -> retry window for a queued photo.
- First-entry and same-object follow-up composers build the payload asynchronously and fail closed with user-facing copy ("We couldn't read that photo on this device. Choose it again.") if the photo cannot be read, instead of silently queueing an unreadable intent.
- Retry continues to reuse the stable offline idempotency key (`client_mutation_id`); `processPhotoIntent` throws an explicit user-facing error if a queued intent has no readable blob, and failed sync keeps title/body/date/photo intent for another retry.

### Deterministic automated evidence (not a substitute for the device run)

- Node + fake-indexeddb unit tests (`pnpm test`, 166 passing) prove: the photo bytes are copied (the persisted value is a `Blob`, not the `File`), the bytes stay readable after an IndexedDB round-trip, queue/retry is idempotent through `(owner_user_id, client_mutation_id)` with no duplicate, and failed sync retains content plus photo intent for retry.
- Closest-available mobile WebKit field-equivalent: Playwright WebKit with the iPhone 13 device descriptor (`isWebKit === true`, `isMobile === true`). On the engine it confirmed an entry plus photo intent queue while `navigator.onLine === false` and that title/body/date persist in IndexedDB.

### Field-equivalent limitations recorded honestly

- This Playwright WebKit build cannot read an IDB-round-tripped blob's bytes back (`arrayBuffer()` raises `NotReadableError`) and crashes on any page load against an origin that already holds IndexedDB data. Both are automation-build artifacts, not iOS Safari behavior (production PWAs store and read IDB blobs on iOS), so the byte-level retry chain could not be completed in this automation engine and was proven in Node instead.
- The mobile WebKit field-equivalent therefore de-risks the offline-capture half on the WebKit engine but does not satisfy the failure gate. A real iOS Safari device run was therefore still required; it was completed on 2026-06-29 (see next).

### Manual device smoke result (2026-06-29, maintainer-confirmed)

- The maintainer ran the manual real-iOS-Safari field smoke on the OVE-37 pilot URL on a real iOS device and confirmed the full offline path works: an entry with a photo queued while offline, manual retry after reconnect reached the canonical `/api/garden/entries` path, exactly one server entry resulted with no duplicate on repeated retries, and authenticated readback showed derivative-only media. The saved-on-this-device and retry states were understandable.
- Result: pass. This satisfies the OVE-38 field-behavior gate, so OVE-38 is closed (Done).
- Device/browser version specifics were maintainer-confirmed but not captured into this redacted record; the structured evidence template below can be filled in if a fuller redacted record is wanted later.

### Manual real-device smoke procedure (iOS Safari)

This is the procedure used for the 2026-06-29 pass and the standing re-run script. Run against the selected OVE-37 pilot URL. Record only redacted evidence per the rules below.

1. On a real iOS device, open Safari (not an in-app/embedded webview) and load the pilot URL; sign in as the pilot smoke user.
2. Start a first plant entry: enter space, plant, title/body, keep `hidden` or safe region-level location, choose catalog match / user-added / Unknown, and attach one photo from the library or camera.
3. Put the device offline (enable Airplane Mode, or use a forced-failure network) before submitting.
4. Submit. Confirm the UI shows an honest saved-on-this-device state and a queued item under "Saved entries on this device" that preserves title/body/date/object/catalog state and indicates a photo will upload later.
5. Optionally background Safari and reopen it (or reload the tab) while still offline; confirm the queued item and its photo intent are still present.
6. Restore connectivity. Tap retry. Confirm the state moves through syncing to synced (or to a failed state with an understandable retry path that did not lose content/photo intent).
7. Tap retry again one or more times after success to probe duplication.
8. Open the authenticated object readback. Confirm exactly one server entry exists for the mutation and that any media renders as a derivative-only (`media.over.garden` class) image, or shows a safe recoverable media-processing state. Do not copy the journal title/body into evidence.
9. If logged in with an existing object, repeat steps 2-8 for a same-object follow-up entry.

### OVE-38 evidence template (fill from the device run, redacted)

```
date: <YYYY-MM-DD>
pilot_url_class: over.garden (OVE-51 canonical pilot origin)
device_class: <e.g. iPhone, iOS Safari major version class>
runtime_class: mobile Safari (WebKit), real device
path: first_entry | follow_up_entry
offline_method: airplane_mode | forced_network_failure
queued_offline: pass | fail              # navigator offline, saved-on-this-device state shown
queued_fields_preserved: pass | fail     # title/body/date/object/catalog + one photo intent
survived_reopen_offline: pass | fail | n/a
retry_route: /api/garden/entries
retry_result: synced | failed_recoverable
server_entries_for_mutation: <count, must be 1>
repeat_retry_duplicate: none | DUPLICATE
media_readback_class: derivative_only(media.over.garden) | recoverable_processing | none
failed_sync_retained_content: pass | fail | n/a
result: pass | fail
notes: <redacted; no journal text, no signed URLs, no quarantine/original keys, no EXIF, no precise location>
```

### OVE-38 Done gate

Result 2026-06-29: satisfied. The maintainer-confirmed manual real-iOS-Safari smoke passed, so none of the blocking conditions below hold and OVE-38 is Done. The conditions are retained as the standing regression bar for any future change to this offline path.

Do not mark OVE-38 Done if any of the following are true:

- Offline success is only proven on desktop or in a non-iOS engine; the real iOS Safari device run on the pilot URL has not passed.
- A retry can create more than one server entry for the same mutation.
- A failed sync loses body/title/photo intent or hides the retry path behind scaffold language.
- Authenticated readback shows raw (non-derivative) media or a non-recoverable media gap after a successful sync.
- The evidence requires exposing private journal/media details: raw title/body, signed upload URLs, quarantine/original keys, EXIF, or precise location.

## OVE-39 Durability And Recovery

Goal: a founder/operator can run the first closed pilot knowing production journal data and the derived public search path are recoverable enough for a controlled cohort. This is an operational gate on the same pilot journal search path proven in OVE-36/OVE-37, not generic infra hardening. If a worker/process restart or a database incident could silently lose journal data or break `journal_entry_index`/`journal_entry_unindex`, then H1 (journal retention), H4 (publish), and H6 (organic/public discovery) become deployment noise instead of product evidence.

Non-destructive only: this slice does not perform any restore-over-production, bulk delete, schema drop, or history rewrite. Those require explicit maintainer sign-off and are out of scope.

### Backup and PITR status (managed Postgres)

- Cluster: `overgarden-postgres-prod-fra1` (DigitalOcean Managed PostgreSQL, `FRA1`).
- Status: `pass`, backup listing refreshed on 2026-07-18. The provider API reported managed backups enabled, returned `8` backup rows, and identified the latest backup as 2026-07-17 17:33 UTC. The PITR/retention window remains recorded as 7d per DigitalOcean Managed PostgreSQL documentation/provider default; the refreshed provider output showed no override. Worker and search recovery evidence below remains the 2026-06-29 live exercise.
- Closed-pilot interpretation: backup/PITR posture is no longer a launch blocker for the closed pilot. A destructive restore-over-production drill remains out of scope and still requires explicit maintainer sign-off.
- Operator verification (redacted):
  1. Dashboard: DigitalOcean Cloud -> Databases -> `overgarden-postgres-prod-fra1` -> Backups/Settings. Confirm automatic daily backups are enabled; note the PITR/retention window and the latest backup timestamp.
  2. CLI/API (secrets omitted): `doctl databases list` to resolve the cluster id, then `doctl databases backups <cluster-id>`; or `GET https://api.digitalocean.com/v2/databases/{cluster_uuid}/backups` with a bearer token that is never recorded.
  3. To validate recoverability, fork/restore into a NEW cluster (`doctl databases fork ...`). Never restore over production.
- Allowed evidence: backup-enabled boolean, retention/PITR window, latest backup date, check date. Forbidden: database URLs, the CA body, credentials, doctl/API tokens.

OVE-203 adds an identity-specific deterministic recovery contract without
claiming that this historical OVE-39 backup listing is a managed restore.
Immediately after a fresh Postgres bootstrap, CI runs
`pnpm smoke:public-identity` and requires the provisioning function/user
trigger, profile-registry consistency triggers, current/retired uniqueness,
claim provenance, `ove203-identity-v1` policy metadata, persisted rename
cooldown, retired-handle reservation, and clean cascade erasure. The later
OVE-201 managed-recovery drill must repeat equivalent counts-only checks on a
new disposable restored cluster; it must never target or overwrite production.
OVE-201 closed that managed restore on 2026-07-24: see
`docs/MANAGED_RECOVERY_DRILL.md` and
`docs/managed-recovery-evidence-redacted.json` (RPO/RTO pass; exact disposable
teardown; production remained online).

### Worker and Meilisearch process management

Runtime classification: this section is `production-linux-required` under `docs/CONTAINER_RUNTIME_POLICY.md`. OVE-74 proves the matching image build and local health/worker/search smoke on Apple Container for supported Macs, but Apple Container is not the DigitalOcean Linux droplet process manager. OVE-76 confirms Docker Compose remains the current production process manager until a separate non-Apple Linux replacement is live-proven.

- Process manager: Docker Compose under `/opt/overgarden` on `overgarden-worker-prod-fra1` with containers `meilisearch` (legacy retained after OVE-198), active `overgarden-meilisearch-next`, `matching-api`, `matching-worker`, `caddy`.
- Restart policy: live-confirmed on 2026-06-29 as `unless-stopped` for `meilisearch`, `matching-api`, `matching-worker`, and `caddy`, so the worker, API, and Meilisearch return after a crash or droplet reboot. OVE-198 keeps `unless-stopped` on the digest-pinned next container.
- Health endpoints: live-confirmed on 2026-06-29: matching `https://matching.over.garden/health` returned `ok` with ICU present, and Meilisearch `https://meili.over.garden/health` returned `available`.
- Stale-job reclaim: the worker claims `job_queue` rows with `FOR UPDATE SKIP LOCKED` and reclaims `processing` rows once `locked_at` is older than `WORKER_VT_SECONDS` (default 30s). Handlers are idempotent (Meili upsert by primary key / delete by id), so a restart mid-job re-delivers the work at-least-once without duplicating or corrupting the public index. Failed jobs back off and retry; unknown kinds fail with `last_error` rather than being marked done.
- Meilisearch version pin (OVE-198): local/CI/production reviewed pin `v1.48.1` with production digest class `sha256:93ea15e3e46499281fb5bcd55c63e147d76680073ebd95a3a74d632176225d8a`. Upgrade path is dual-volume Postgres rebuild via `/opt/overgarden/meilisearch-upgrade` only. Pre-cutover production source was `1.15.2`. Legacy volume `overgarden_meili_data` stays recoverable; active volume class `overgarden-meili-data-v1481`. Do not delete the legacy volume in this issue.
- Meilisearch operator preflight (OVE-228): run the committed executable
  contract proof and `shellcheck` before installing the script. Install the
  exact reviewed bytes, verify local/remote SHA-256 equality, and invoke only
  `sudo /opt/overgarden/meilisearch-upgrade preflight`. The preflight reads
  Linux `/proc/meminfo`, Docker `.DockerRootDir`, and `df -Pk`; it refuses below
  2.5 GiB total virtual memory, 1 GiB available virtual memory, or 5 GiB free
  storage at either production root or Docker root. Record only digest equality,
  active/target/strategy classes, `upgrade_required|already_target`, capacity
  pass class, bounded duration, public health, and unchanged volume classes.
  `upgrade_required` requires active `1.15.x` plus the running legacy container
  and volume; `already_target` requires active `1.48.1`, the target container and
  target volume, plus the retained legacy rollback volume. Never record host
  addresses, env files, keys, indexed content, job payloads, or user identity.

Do not remove or rewrite these production Docker Compose instructions for Apple Container. A non-Docker production path is a separate production migration, not a local Apple Container follow-up. Acceptable replacement candidates include systemd units, managed Meilisearch plus a separately managed worker, or another Linux runtime, but only after live redacted proof shows equivalent process restart/reboot recovery, matching and Meilisearch health, `journal_entry_index`/`journal_entry_unindex` completion, and the same public-safe Meilisearch document contract proven by OVE-39.

### Deterministic local recovery proof

`services/matching/tests/test_worker_recovery.py` proves, with no live services, that:

- a `processing` row is reclaimed only after the visibility timeout (and a freshly locked row is not), so a restarted worker recovers in-flight jobs;
- after a simulated restart/crash, `journal_entry_index` and `journal_entry_unindex` still reach `done`;
- the indexed document keeps the current public-safe contract enforced by
  `contracts/search/public-journal-entry-search-document.json` and written by
  `services/matching/app/search.py`: required keys `body`, `createdAt`,
  `entryDate`, `entryScope`, `id`, `kind`, `locationVisibility`, `noindex`,
  `publicPath`, `publicSlug`, `title`, with optional `coarseRegionCode` only for
  region-visible entries, and no owner/user IDs, media keys, precise location,
  raw coarse-location columns, request metadata, IPs, user agents, referrers,
  invite data, or private journal state;
- at-least-once re-delivery is idempotent (no duplicate document, identical safe shape);
- a transient Meilisearch outage marks the job `failed` with a future retry and a later run recovers it to `done`.

Run it with:

```bash
cd services/matching
uv run --frozen pytest tests/test_worker_recovery.py
```

### Live worker restart/recovery smoke (operator, redacted)

This is the live counterpart that requires the droplet; the local harness de-risks it but does not replace it.
Docker Compose commands in this section are production-only evidence commands for the current Linux droplet process manager, not local development prerequisites.

1. Confirm the worker restart policy and container health (`docker compose ps`; matching/meili `/health`).
2. Restart the worker: `docker compose restart matching-worker` (or stop it, enqueue work, then start it to exercise stale-job reclaim).
3. Publish a canary journal entry so the app enqueues `journal_entry_index`. Confirm the job reaches `done` and the Meilisearch `journal_entries` document exists with only the public-safe keys and `noindex = true`.
4. Archive the canary so the app enqueues `journal_entry_unindex`. Confirm the job reaches `done`, the document returns `404`, and the old public journal URL returns `410`.
5. Record only redacted job/document state per the rules below.

### OVE-39 evidence template (redacted)

```
date: <YYYY-MM-DD>
db_cluster_class: overgarden-postgres-prod-fra1 (DO managed, FRA1)
backup_enabled: pass | fail | UNVERIFIED-NEEDS-OPERATOR
pitr_window: <e.g. 7d> | unknown
latest_backup_date: <YYYY-MM-DD> | unknown
worker_restart_policy: unless-stopped | always | none | unknown
worker_health: ok | degraded | unknown
meili_health: available | degraded | unknown
restart_recovery: index_done + unindex_done | partial | fail | not-run
public_safe_contract: pass | fail
stale_job_reclaim: pass(local-harness) | pass(live) | fail
result: pass | degraded | blocker | UNVERIFIED-NEEDS-OPERATOR
notes: <redacted; no DB URLs, CA body, credentials, tokens, journal text, Meili keys, or user-tied row IDs>
```

### OVE-39 live evidence (redacted)

The full worker/search recovery block below is historical evidence from
2026-06-29. OVE-203 refreshed only the non-destructive managed-backup listing
on 2026-07-18 (`backup_enabled: pass`, `backup_count: 8`,
`latest_backup_date: 2026-07-17 17:33 UTC`); it did not claim or perform a new
restore drill.

```
date: 2026-06-29
db_cluster_class: overgarden-postgres-prod-fra1 (DO managed, FRA1; pg 18; db-s-1vcpu-1gb; online)
backup_enabled: pass
pitr_window: 7d per DO Managed PostgreSQL docs/provider default; provider output showed no override
latest_backup_date: 2026-06-28 17:33 UTC
worker_restart_policy: unless-stopped for matching-worker, matching-api, meilisearch, caddy
worker_health: ok
meili_health: available
restart_recovery: index_done + unindex_done
public_safe_contract: pass
stale_job_reclaim: pass(local-harness)
result: pass
notes: redacted; only matching-worker was restarted; no restore/fork, schema drop, bulk delete, production DB restart, or all-container restart was performed; evidence recorded only job-state classes, public-safe document key names, privacy booleans, and HTTP status classes
```

### OVE-39 Done gate

Do not treat the durability slice as complete (and do not invite pilot users on durability grounds) if any of the following are true:

- Backup/PITR status for `overgarden-postgres-prod-fra1` is unknown and not even recorded as `UNVERIFIED-NEEDS-OPERATOR` with a date.
- Worker restart behavior is undocumented or unproven (no restart policy confirmed and no recovery proof).
- Search jobs only reach `done` before a restart but not after recovery, or a recovered job drops the public-safe document contract.
- Stale `processing` reclaim is neither proven by the local harness nor by a live canary.
- Any evidence leaks secrets or private data: database URLs, CA body, credentials, doctl/API tokens, Meilisearch keys, worker env files, journal text, precise location, IPs, user agents, or user-tied row IDs.

## OVE-41 Closed-Cohort Invite Loop

Goal: an invited gardener can arrive through a private, unlisted invite path, save a first plant entry, and return for a same-object follow-up, and the operator can read that closed-cohort loop as privacy-safe aggregate counts. This is the H1 activation/retention loop measured for the specific people we deliberately invited, separated from homepage/public-variety/direct traffic, so a small closed pilot produces interpretable go/iterate/stop evidence instead of mixed-source noise.

This slice does not add precise location, raw invite identity, or any per-person attribution. Cohort membership is derived only from the enum `invited_cohort` activation source already carried through `/garden`. The invite page is `noindex` and is never linked from public navigation or the sitemap.

### What landed

- A `noindex` invite landing page at `/join` with calm, non-technical copy. Its only forward action carries the enum source into `/garden?source=invited-cohort` (`gardenFirstEntryInvitePath`). The page is excluded from `sitemap.ts`, which lists only surfaces approved by `apps/web/src/server/public-surface-indexing-policy.ts`.
- `invited_cohort` is an allowed `ActivationSource` and `invite` is an allowed `ActivationSurfaceKind`, validated by the same enum-only normalizers and analytics property allowlist used by the other sources. Raw URLs, hyphenated request values, invite tokens, names, and emails are rejected.
- Intent persists through auth: a signed-out invited gardener keeps `?source=invited-cohort` across sign-up/sign-in (the garden auth panel shows invite-specific copy), so the first saved entry records `entry_logged` with `activation_source = invited_cohort`. That first save is what establishes cohort membership.
- `/garden/pilot-health` shows an "Invited cohort loop" panel per window: invite starts, first-entry saves, first-save rate, same-object follow-ups, and returning gardeners. Follow-ups and returning gardeners are derived from cohort membership plus a prior same-object entry, never from raw entry text.

### Closed-cohort smoke steps (operator, redacted)

Run against the selected pilot URL. Record only enum class, aggregate counts, robots value, and pass/fail. Do not record invite recipients, links, names, emails, or journal text.

1. Open `/join` and confirm OverGarden HTML, robots `noindex, nofollow`, non-technical copy, and that the primary action targets `/garden?source=invited-cohort`. Confirm `/join` is absent from `/sitemap.xml`.
2. While signed out, follow the invite action into `/garden?source=invited-cohort`. Confirm the auth panel shows the invite welcome copy and the source survives sign-up/sign-in (URL still carries `source=invited-cohort`).
3. Save a first plant entry through the canonical create path. Confirm authenticated readback shows exactly one entry.
4. Open the new object and add a same-object follow-up entry. Confirm no duplicate object.
5. Open `/garden/pilot-health`. In a window covering the run, confirm the Invited cohort loop panel shows starts >= 1, first saves >= 1, same-object follow-ups >= 1, and returning gardeners >= 1, with no raw private data anywhere in the readout.

### Decision criteria (continue / iterate / stop)

These are provisional closed-pilot calibrators, not validated OverGarden targets. Ground them in `docs/product-research/OverGarden_B2_METRICS_v0.md` (NSM/H1) and `docs/product-research/KILL_CRITERIA_PREREG_v2.md` (Flag Ж / pre-registered go/no-go). The closed cohort is the denominator: read rates against invited gardeners who actually started. Operators can read the combined behavioral + interview + value-pulse frame without SQL at `/garden/pilot-learning/decision`.

- NSM/H1 for this loop = an invited gardener with >= 2 dated entries on the same object plus a return visit. The pilot-health "returning gardeners" count is the cohort-scoped proxy for that loop.
- Continue: a clear majority of invited gardeners who start also save a first entry, and a meaningful share return for a same-object follow-up within the first weeks (provisional calibrator: first-save rate among starts at or above roughly two-thirds, and returning gardeners at or above roughly 30% of first savers). The loop is real and worth widening the invite.
- Iterate: gardeners save a first entry but rarely return (follow-ups and returning gardeners stay low). Treat as an activation-to-retention problem: improve the return prompt and same-object follow-up path, not the invite, before inviting more people.
- Stop / re-segment: invited gardeners do not even save a first entry (first-save rate among starts stays low) across a fair sample. This matches the pre-registered Flag Ж falsification posture: the closed cohort is not the right audience or the core loop is not wanted; pause inviting and revisit ICP/JTBD rather than scaling.

### OVE-41 Done gate

Do not treat the closed-cohort loop as complete if any of the following are true:

- `/join` is indexable, appears in the sitemap, is linked from public navigation, or exposes anything beyond the enum source on its forward action.
- The invite source is carried as a raw URL, referrer, token, name, or email instead of the `invited_cohort` enum, or the source is lost across auth so the first save is misattributed.
- Pilot-health invited-cohort counts depend on raw journal text, invite identity, or any per-person attribution rather than the enum source plus aggregate membership.
- The decision criteria are presented as validated targets rather than provisional calibrators grounded in the metrics and kill-criteria research.

## OVE-42 Invite-Gated Closed Pilot Writes

Goal: only invited gardeners can write pilot journal data. Non-invited visitors can still read public pages, but cannot accidentally create account-driven pilot data through `/garden` write paths.

### What landed

- Signed HMAC invite tokens (`pilot-invite.ts`) carry only an enum cohort, bounded segment, and issued/expiry seconds. No email, phone, name, IP, referrer, URL, or query string is encoded.
- `/join?invite=<token>` validates the token server-side, sets an HTTP-only eligibility cookie, and redirects to `/garden?source=invited-cohort` with enum-only attribution.
- `pilot_invite_grants` stores one durable row per user (`user_id`, enum `cohort`, enum `segment`, timestamps). No invite link, token, or recipient identity is persisted.
- Canonical write paths (`/api/garden/entries` and follow-up actions) require `requireWriteEligibleRequestScope()`: authenticated plus invited grant or valid eligibility cookie that materializes the grant on first write. The historical skeleton write API is separately loopback-only under OVE-191 and is absent from production.
- Non-invited signed-in gardeners see a calm closed-pilot callout on `/garden` and object follow-up surfaces instead of broken composers.
- `/garden/pilot-health` shows write-eligible gardener count from grant rows, separate from direct/homepage/public-variety starts that may be non-invited.

### Founder invite workflow (no secrets in git or Linear)

1. Set `PILOT_INVITE_SIGNING_SECRET` in Vercel production (and locally in `.env.local` for dev links). Use `openssl rand -base64 32` or equivalent; never commit the value.
2. From `apps/web`, run `pnpm pilot:invite` (optional: `--base-url https://over.garden --ttl-days 14`).
3. Share the printed `/join?invite=...` URL privately with one gardener. Do not paste invite URLs into Linear, git, analytics, or public channels.
4. The gardener opens the link, claims the invite, signs in, and writes through the existing `/garden` first-entry and follow-up flows.
5. Confirm `/garden/pilot-smoke` reports `PILOT_INVITE_SIGNING_SECRET` as configured before inviting on production.

### OVE-42 Done gate

Do not treat invite-gated writes as complete if any of the following are true:

- Non-invited signed-in users can save first or follow-up journal entries through UI or API.
- Public read routes are blocked unintentionally.
- Invitation evidence stores raw invite URLs, tokens, referrers, emails, or query strings in analytics or grant tables.
- Production invite links are signed with the dev fallback secret (`pilot-smoke` must fail the signing-secret check on deployed URLs).

## OVE-54 Founder-Only Pilot Rehearsal

Goal: when real external invited gardeners are unavailable, a founder/operator can rehearse the full closed-pilot product path internally without polluting OVE-53 field-run evidence.

### What landed

- Invite tokens and grant rows now distinguish `closed_pilot` from `founder_rehearsal`. The default remains `closed_pilot`; founders must opt in with `pnpm pilot:invite -- --cohort founder_rehearsal`.
- Founder rehearsal grants can write through the same `/join` -> auth -> `/garden` path as a real invited gardener, so operator readiness can be tested end to end.
- `/garden/pilot-health` counts real `closed_pilot` writers and `founder_rehearsal` writers separately. Core journal, value-pulse, segment, and public-variety health signals filter to real `closed_pilot` grants.
- `/garden/pilot-learning/decision` excludes founder rehearsal grants and `founder_rehearsal` interview records from the continue / iterate / stop frame, while showing the rehearsal count as a separate warning marker.
- Catalog curation pilot-origin signals require a `closed_pilot` grant, so provisional names created during rehearsal do not look like real pilot catalog demand.

### Founder rehearsal workflow (redacted)

1. Generate a private rehearsal invite with `pnpm pilot:invite -- --cohort founder_rehearsal --base-url https://over.garden`.
2. Do not paste the printed invite URL, token, cookie, email, journal text, or media key into docs, Linear, logs, or chat.
3. Claim the link, sign in, save a first entry, optionally attach a photo, add a same-object follow-up, and open `/garden/pilot-health` plus `/garden/pilot-learning/decision`.
4. Record only: route classes, pass/fail, grant cohort class `founder_rehearsal`, aggregate counts, derivative host class if media was tested, and the statement that OVE-53 remains open.

### OVE-54 Done gate

Do not treat the founder-only rehearsal slice as complete if any of the following are true:

- A `founder_rehearsal` grant increments real `closed_pilot` write-eligible, segment, H1, value-pulse, interview, catalog pilot-origin, or H6 public-variety decision metrics.
- Operator readouts fail to explain that rehearsal is internal readiness evidence only.
- Evidence contains invite URLs, raw tokens, cookies, journal text, media keys, contact details, precise location, IP addresses, user agents, referrers, or raw query strings.
- OVE-53 is closed or described as satisfied from founder/internal rehearsal data.

## OVE-48 / OVE-127 Auth Recovery

Goal: a gardener who loses access or forgets how to sign in can recover through a one-time Better Auth reset link and return to the same `/garden` workspace with prior plant objects and entries intact. The OVE-48 operator-assisted path remains available for closed-pilot support; OVE-127 adds Resend-backed self-serve transactional email for verification and password recovery.

### What landed

- `/garden` auth panel accepts real email/password sign-in and sign-up instead of a hardcoded local-only account. Duplicate sign-up attempts map to calm recovery copy that steers the gardener back to sign-in on the existing account rather than creating a second garden.
- Better Auth remains canonical for password-reset tokens, expiry, mutation, and
  session revocation. OVE-241 replaces the requester-path Resend call with a
  durable `auth_email_outbox`: the generic response returns after local
  admission, the route schedules one bounded post-response drain, and the
  Vercel daily Cron is crash/retry recovery. Operator CLI mode still captures a
  one-time reset URL for private handoff when `PILOT_OPERATOR_PASSWORD_RESET=1`.
- Production-like email/password sign-up requires email verification and sends verification email through the same Resend transactional path. Local/test runtimes keep verification optional.
- `/auth/help` (`noindex`) offers a self-serve reset request form plus the closed-pilot operator fallback.
- `/auth/reset-password` (`noindex`) lets a gardener set a new password from the emailed or operator-provided one-time link and return to `/garden`.
- Founders generate reset URLs from `apps/web` with `pnpm pilot:reset-password -- --email <address>` after confirming the gardener already registered that email.

### Self-serve recovery workflow (redacted evidence only)

1. Confirm production/preview readiness reports `RESEND_API_KEY` and `RESEND_AUTH_FROM` as configured without exposing values.
2. From `/auth/help`, request a reset link for an existing gardener account and
   compare the redacted HTTP status/body/cache-header class with an absent
   address; neither request may wait for a provider.
3. Confirm a Resend transactional email is delivered from the approved
   OverGarden sender and that the visible link origin is `https://over.garden`
   in production. If the immediate post-response attempt is interrupted, read
   the authenticated daily Cron schedule and its safe worker-result class
   instead of disclosing an outbox row or recipient identity.
4. Set a new password through `/auth/reset-password`, then confirm `/garden` shows the same owner-scoped plant objects and entries.
5. Evidence may record provider class, sender domain class, canonical origin class, delivery success/failure class, and account-continuity pass/fail only. Do not record recipient email addresses, provider message IDs, reset/verification tokens, tokenized URLs, cookies, or provider payloads.

### OVE-141 production delivery proof (2026-07-04)

- Production deployment class: Vercel production behind `https://over.garden`; latest deployment status was `READY` before the smoke.
- Resend readiness: pass by live delivery. `RESEND_API_KEY` was inferred present from successful provider delivery, `RESEND_AUTH_FROM` was inferred present from the approved `over.garden` sender-domain class, and `RESEND_AUTH_REPLY_TO` was not configured or not required for this flow.
- Sign-up verification: pass. A new email/password sign-up sent a Resend transactional verification email from the `over.garden` sender-domain class; the visible verification link origin class was `https://over.garden`; no Vercel alias was observed; verification returned to `/garden`.
- Password reset: pass. `/auth/help` sent a Resend transactional password-reset email for the same existing account from the `over.garden` sender-domain class; the visible reset link origin class was `https://over.garden`; no Vercel alias was observed; `/auth/reset-password` accepted a new password and `/garden` remained reachable after recovery.
- Account continuity: pass. Signing in with the reset password resolved to the same Better Auth user as the verified sign-up account, and a duplicate sign-up attempt did not issue a session token or create a second active garden path.
- Production runtime check: pass. Vercel production runtime logs and runtime error clusters for the post-smoke window showed no error/fatal Resend auth-email logs and no `/api/auth` runtime errors.
- Evidence redaction: pass. The smoke did not record a recipient email address, provider message id, tokenized verification/reset URL, reset token, verification token, cookie, provider payload, IP address, user agent, or secret.

### OVE-232 Better Auth dependency admission

- Run `cd apps/web && pnpm auth:security:check` before accepting a Better Auth dependency change. The executable guard requires one exact stable `better-auth` package version at or above the patched `1.6.22` floor, a matching importer and package resolution in `pnpm-lock.yaml`, and the current email/password, verification, social, sign-out, retired-identity, and Next cookie boundaries.
- The guard rejects magic-link and email-OTP registration and requires the canonical versioned-secret option boundary. It prints only the patched version, a bounded duration, and pass/fail classes; it never prints package source, credentials, tokens, callback URLs, identities, or email content.
- This is an admission boundary, not a replacement for the OVE-226 exact-SHA real-gardener proof or OVE-241 reset-delivery timing proof. Run the affected auth regression suites and the canonical redacted provider smoke after the dependency is contained in `main`.

### OVE-240 versioned Better Auth secret rotation

- Serving Production and Preview accept only `BETTER_AUTH_SECRETS` plus `BETTER_AUTH_CURRENT_SECRET_VERSION`. The first ordered `version:secret` entry must match the declared non-negative current version and be a canonical 32-byte base64url key class. The app intentionally does not treat an entropy score as proof of provenance; generate each provider value with a cryptographic random source at write time.
- Preserve a pre-versioned `BETTER_AUTH_SECRET` only for the bounded migration grace period. It must itself be an exact 32-byte standard Base64 or base64url value and requires the non-secret strict-UTC `BETTER_AUTH_LEGACY_GRACE_UNTIL`, which must precede the code-capped migration deadline. An absent, malformed, expired, or over-cap legacy value is clean-cut from reads while the active key is supplied explicitly to Better Auth, so the ambient singular environment value cannot become an accidental fallback. A valid in-window legacy value lets Better Auth read legacy session and OAuth envelopes through its native configuration; the narrow server-side verification-link bridge re-signs only a valid, unexpired legacy `/api/auth/verify-email` token with the active key, retaining its original expiry ceiling. The bridge never logs, stores, reflects, or trial-decrypts token or key material.
- Before applying a rotation, read back only Vercel target/name classes, generate independent Sensitive values for Production and Preview without printing them, and set matching non-secret version metadata. First prove the exact-SHA deployment uses the versioned current key. Then remove an inadmissible stale singular provider variable and redeploy the exact artifact; this intentionally invalidates unrecoverable pre-versioned session, OAuth, and verification state. A direct rollback before the provider removal redeploys the known-good artifact; after removal, rollback requires an explicitly approved fresh recovery plan rather than restoring unknown legacy material.
- Exact-SHA proof must show a `READY` deployment, canonical aliases, the noindex `/health` class `versioned_current_vN`, and redacted legacy/current local rehearsal for session, OAuth callback state, and email verification continuity. Record only version class, deployment identity, target, status, and pass/fail; never record key values, values' hashes, lengths, prefixes, tokens, cookies, account identities, or callback parameters.

### Founder fallback workflow (no secrets in git or Linear)

1. Confirm the gardener already created an account with the email they want to recover. Do not create a second account for them.
2. From `apps/web`, run `pnpm pilot:reset-password -- --email gardener@example.com` (optional: `--base-url https://over.garden`).
3. Share the printed one-time reset URL privately. Do not paste reset URLs into Linear, git, analytics, or public channels.
4. The gardener opens the link, sets a new password, signs in, and confirms existing plant objects/entries still appear on `/garden`.
5. If the CLI prints no link, the email is not registered yet. Send a fresh invite link instead of forcing a duplicate account.

### OVE-48 Done gate

Do not treat auth recovery as complete if any of the following are true:

- Recovery depends on manual database mutation rather than the operator reset path.
- Reset links, tokens, or passwords appear in docs, Linear, logs, analytics, or UI evidence.
- A recovered gardener lands in a duplicate account/garden instead of the original owner-scoped data.
- Production self-serve reset or email verification claims are made without Resend env readiness and redacted live delivery proof.
- OVE-241 is claimed complete without the exact-SHA Vercel deployment, a listed
  daily `/api/cron/auth-email-outbox` schedule, a class-only authenticated Cron
  receipt, and the paired generic-response proof.
- OVE-240 is claimed complete without the exact-SHA `versioned_current_vN`
  health class, an independent current/legacy continuity rehearsal, a Vercel
  target/name-class read-back, and the retained singular fallback rollback
  receipt. None of these receipts may contain secret-derived material.

## Product Assumption

The live pilot must measure user behavior, not deployment fragility. The smoke proves that a real pilot user can traverse the deployed product path while privacy-critical boundaries hold:

auth -> first journal entry -> optional photo derivative -> follow-up entry -> publish -> public SSR readback -> public variety activation -> archive to 410 -> aggregate pilot health -> search/worker status.

Relevant product context:

- `docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md`: H6 requires SSR, noindex until sufficient UGC, no cached broken public shells, and live trajectory reading rather than fake pre-build SEO confidence.
- `docs/product-research/AI_SEO_SYNTHESIS_v0.md`: AI/search crawlers often do not execute JS; WAF/deployment protection can silently invalidate public crawl tests.
- `docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md`: first publication disclosure and deletion/de-indexing are binding public-only controls.
- `docs/product-research/OverGarden_B2_METRICS_v0.md`: H1/H4/H6 must be read together; NSM without publish and organic/public trajectory can be a false positive.

## Evidence Redaction Rules

Allowed evidence:

- Route class, status code, robots value, high-level header facts, deployment ID, commit SHA, and pass/fail/degraded status.
- Public derivative host class, for example `media.over.garden`, without object keys.
- Aggregate metric counts from `/garden/pilot-health`.
- Enum attribution classes: `homepage`, `public_variety`, `direct_garden`, `invited_cohort`.

Forbidden evidence:

- Raw journal title/body text.
- Email addresses, signed cookies, session tokens, API keys, database URLs, Vercel SSO nonce/share URLs, or protected preview tokens.
- Quarantine keys, signed upload URLs, original object keys, EXIF data, precise location, IP address, user agent, referrer, or raw query string.
- Full private URLs from authenticated pages.
- Auth secret values. Evidence may only say present, missing, placeholder-like, or local-fallback.
- Google client secrets, OAuth tokens, callback query parameters, provider token responses, or signed cookies. Evidence may name only env presence and exact authorized redirect URI presence.
- Google Analytics / Google Tag Manager cookies, client IDs, session IDs, IP/user-agent values, referrers, private route paths, auth callback params, or Google Analytics report rows containing user-level data. Evidence may name only the public measurement id, public GTM container id, consent-banner presence, public-route script presence/absence after consent, route class, and HTTP status class.
- Facebook App Secret values, OAuth tokens, callback query parameters, provider token responses, app access tokens, user access tokens, signed cookies, Meta user ids, or personal emails. Evidence may name only env presence, `FACEBOOK_LOGIN_PUBLIC_READY` false/true by class, exact Valid OAuth Redirect URI presence, and Meta app mode class.
- Meta Ads attribution CAPI access tokens, Test Events codes, Meta cookies, client ids, user ids, emails, IP/user-agent values, raw URLs/referrers, callback params, private route paths, event payloads containing private garden data, or Meta report rows containing user-level data. Evidence may name only env enabled/disabled class, public Pixel id presence class, marketing consent state, public-route Pixel script presence/absence after consent, safe event class delivery, and CAPI success/failure class.

## Preflight

1. Pick one smoke URL:
   - Production public URL once deployment protection is disabled for the pilot audience.
   - Protected preview only when the goal is internal deployment inspection, not public H6 validation.
2. Complete email verification for the dedicated owner account, then set `OVERGARDEN_ADMIN_OWNER_USER_ID` for the target environment and bootstrap the owner role only through `pnpm admin:bootstrap-owner`; do not copy the user id into evidence. The script must fail before role mutation unless the account has `emailVerified = true`, exactly one credential row with a password hash, and no Google/Facebook or other linked account.
3. Open `/garden/pilot-smoke` as the dedicated owner account. No other role is accepted for operator access.
4. Treat any `fail` check as a blocker for live pilot.
5. Treat `warn` checks as explicit degraded state that must be named in the Linear/GitHub handoff.
6. Confirm Cloudflare is not caching app HTML if the app domain is routed through Cloudflare.
7. Confirm Google OAuth provider setup for the selected environment:
   - Google Cloud OAuth client type is Web application.
   - Authorized redirect URIs include `http://localhost:3000/api/auth/callback/google` for local testing and `https://over.garden/api/auth/callback/google` for production.
   - Vercel production has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` present; do not record either value.
8. Confirm Facebook Login provider setup for the selected environment:
   - Meta app has `over.garden` as an app domain and `https://over.garden` as the public website origin.
   - Facebook Login Valid OAuth Redirect URIs include `http://localhost:3000/api/auth/callback/facebook` for local testing and `https://over.garden/api/auth/callback/facebook` for production.
   - Requested permissions remain basic sign-in only: `email` and `public_profile`; no posting, groups, friends, ads, or social-graph permissions.
   - Development mode smoke is valid only for app role/test users. Real production gardener login requires the Meta app mode/configuration to allow non-role users.
   - Vercel production has `FACEBOOK_CLIENT_ID` and `FACEBOOK_CLIENT_SECRET` present if Facebook is being tested; do not record either value.
   - `FACEBOOK_LOGIN_PUBLIC_READY` must stay absent/false unless a real non-role production smoke passed. When absent/false, production must hide Facebook Login and keep email/Google available.
9. Confirm Google Analytics consent-first tag scope:
   - authored public, legal, and support pages render the analytics consent banner;
   - after analytics acceptance, those pages can render the Google Tag Manager container `GTM-W979KSX3` and expose the GA4 measurement id `G-71LP7XZ5NE` for the container;
   - before analytics acceptance, the external Google Tag Manager container must not load;
   - private garden, admin/operator, auth, join/invite, erasure, journal, lineage, API, and callback routes must not render the consent banner, GTM container, or Google Analytics tag;
   - do not record Google cookies, client ids, session ids, referrers, IP/user-agent values, private URLs, auth params, or user-level Analytics report rows.
10. Confirm Meta Ads consent-first attribution scope when `NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED=true`; otherwise record it as intentionally disabled:

- authored public, legal, and support pages render the Meta marketing consent banner before any Pixel script;
- before marketing acceptance, `connect.facebook.net/en_US/fbevents.js` must not load;
- after marketing acceptance on public pages, Meta Pixel may load and send only allowlisted class events;
- private garden, admin/operator, auth, join/invite, erasure, journal, lineage, API, and callback routes must not render the Meta consent banner or Meta Pixel script;
- `first_entry_saved` may be sent through CAPI only after marketing consent and only as an event class, with no journal text, plant/catalog names, location, media, account identifiers, auth data, cookies, IP/user-agent values, raw URLs, or referrers;
- if using Meta Test Events, record only class-level success/failure and never the test code, access token, cookies, user-level report rows, or event payloads.

11. Open `/admin` signed out and confirm it shows the auth boundary rather than admin links.
12. Open `/admin` as a normal signed-in user and confirm it shows `Access denied.` before dashboard links.
13. Open `/admin` as the dedicated email/password owner account and confirm it renders `Role: Owner`, `Gate: sealed_owner_credential_only`, admin links, owner-only hints, and no raw journal text, user emails, cookies, tokens, IP/user-agent fields, media keys, precise coordinates, or env values.
14. Open `/admin/users` as the owner and confirm the sealed owner assignment plus recent audit rows render with bounded role/action/reason labels only. There must be no grant or revoke form.
15. Open `/admin/users` as a normal signed-in user; it must show `Access denied.` before assignments or audit rows.
16. Open `/admin` as a user with any linked Google/Facebook account; it must show `Access denied.` before admin links.

Header probes:

```bash
curl -I "$SMOKE_BASE_URL/health"
curl -I "$SMOKE_BASE_URL/"
curl -I "$SMOKE_BASE_URL/join"
curl -I "$SMOKE_BASE_URL/privacy"
curl -I "$SMOKE_BASE_URL/support"
```

Public visitor/crawler prerequisite:

- These routes must return OverGarden HTML or route-appropriate redirects, not Vercel SSO.
- Matched app routes must send `Cache-Control: private, no-store, max-age=0, s-maxage=0, must-revalidate` during the closed pilot.
- Public HTML must not have Cloudflare `cf-cache-status: HIT`.
- Public marketing, legal, and supporting routes follow `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`: authored landing/SEO/AEO pages may be indexable when explicitly promoted by the policy, while legal/support/diagnostic surfaces remain `noindex` unless a later slice promotes them deliberately.

## Smoke Sequence

1. Open `/` and follow the primary CTA into `/garden?source=homepage`.
2. Sign up or sign in as the pilot smoke user.
3. For email/password auth email:
   - Create a new email/password account and confirm the verification email arrives from the approved OverGarden sender.
   - Open the verification link, confirm the visible production origin is `https://over.garden`, and confirm the flow returns to `/garden` without recording the tokenized URL.
   - From `/auth/help`, request a password reset for an existing gardener account, confirm the reset email arrives from the approved OverGarden sender, set a new password, and confirm the same garden data remains attached after returning to `/garden`.
4. For Google OAuth:
   - Start "Continue with Google" from `/garden` and confirm Google accepts the callback without `redirect_uri_mismatch` or `INVALID_ORIGIN`.
   - For an existing gardener email/password account, sign in once, use "Link Google sign-in" from `/garden`, sign out, return with Google, and confirm the same garden data and invite grant remain attached to the same OverGarden user id.
   - Open `/admin` as a normal Google-created or Google-linked user and confirm `Access denied.`; Google must not be a path to admin capability.
5. For Facebook Login:
   - If `FACEBOOK_LOGIN_PUBLIC_READY` is absent/false, confirm `/garden` does not render "Continue with Facebook" or "Link Facebook sign-in"; email/Google must remain available and OAuth provider errors must point back to a usable fallback path.
   - If `FACEBOOK_LOGIN_PUBLIC_READY=true`, start "Continue with Facebook" from `/garden` as a real non-role user and confirm Meta accepts the callback without redirect/origin errors.
   - When enabled, for an existing gardener email/password account, sign in once, use "Link Facebook sign-in" from `/garden`, sign out, return with Facebook, and confirm the same garden data and invite grant remain attached to the same OverGarden user id.
   - When enabled, open `/admin` as a normal Facebook-created or Facebook-linked user and confirm `Access denied.`; Facebook must not be a path to admin capability.
   - If the Meta app is still in Development mode, keep `FACEBOOK_LOGIN_PUBLIC_READY` false and record the result as intentional production fallback, not production gardener proof.
6. For Meta Ads attribution, only if `NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED=true` for the smoke window:
   - verify a public route does not load Pixel before marketing consent;
   - accept marketing measurement and confirm only the allowlisted public event class appears in Meta Test Events;
   - keep `/garden` Pixel-free and confirm the first private entry save can produce only `first_entry_saved` by class through CAPI;
   - turn the kill switch back off unless the campaign is intentionally starting.
7. Create one first plant entry with:
   - one space,
   - one plant object,
   - title/body entered by the operator but not copied into evidence,
   - `hidden` or safe region-level location only,
   - catalog selected, user-added, or Unknown.
8. Attach one photo:
   - create the presigned quarantine upload through the app,
   - upload the image,
   - process it server-side,
   - confirm authenticated readback displays only the public derivative.
9. Open the object page and add a follow-up entry to the same object.
10. Publish the first entry after accepting first-publication disclosure.
11. Open the public `/journal/[slug]` URL:

- status `200`,
- SSR HTML visible without client JS dependency,
- robots `noindex, nofollow`,
- no precise location,
- no quarantine/original media key,
- derivative-only media if a photo was attached.

12. From the public entry, open `/variety/[slug]` when linked:

- page renders only if there is safe public entry depth for that catalog item,
- thin pages stay noindex,
- CTA carries only a public catalog slug into `/garden`.

12. Use the public variety CTA, sign in if needed, and save another first-entry path with public-variety activation attribution.
13. Archive the published entry from the authenticated object page.
14. Reopen the old public journal URL and confirm status `410`, robots `noindex, nofollow`, and no private content in the tombstone.
15. Open `/garden/pilot-health` and confirm aggregate H1/H4/H6 metrics update without raw journal text, email, precise location, media keys, referrers, IPs, or user agents.

## Worker And Search Health

Catalog typeahead:

- `/api/garden/catalog/typeahead` should work for authenticated users.
- The Python worker supports `catalog_typeahead_reindex`.
- The `catalog_typeahead` document contract includes only catalog identity fields and excludes owner IDs, private journal text, precise location, media metadata, analytics payloads, email, IP, and user agent.

Public journal search:

- Publishing enqueues `journal_entry_index`.
- Archiving enqueues `journal_entry_unindex`.
- The deployed Python worker processes both journal job kinds, scopes them to the payload owner, and treats Meilisearch as a public privacy boundary.
- On 2026-06-28, the OVE-36 redacted canary smoke proved:
  - public canary URL returned `200` before archive,
  - `journal_entry_index` reached `done` in one attempt,
  - Meilisearch document existed with the public-safe keys from `contracts/search/public-journal-entry-search-document.json`: `body`, `createdAt`, `entryDate`, `id`, `kind`, `locationVisibility`, `noindex`, `publicPath`, `publicSlug`, and `title`,
  - document `locationVisibility` was `hidden`, `noindex` was `true`, and forbidden field scan passed,
  - `journal_entry_unindex` reached `done` in one attempt,
  - the Meilisearch document returned `404` after archive,
  - the old public journal URL returned `410`.

Interpretation: public journal search/worker processing is no longer assumed. It is live-proven for the canary path, with evidence restricted to status codes, job states, document key names, and privacy booleans. Do not copy indexed title/body values, user identifiers, Meilisearch keys, database URLs, IPs, or canary row identifiers into evidence.

Recovery and durability of this path (worker restart, stale-job reclaim, and managed Postgres backup/PITR) are covered in "OVE-39 Durability And Recovery" above.

## Done Gate

Do not mark OVE-27 Done if any of the following are true:

- The selected live URL only works locally or only behind Vercel SSO when the goal is public pilot validation.
- Sign-up/sign-in fails on the deployed URL.
- The selected owner user has not been configured in `OVERGARDEN_ADMIN_OWNER_USER_ID` and bootstrapped into `admin_user_roles`, leaving operator surfaces inaccessible by design.
- `/admin/users` lets any request grant/revoke admin roles, or `admin_user_roles` accepts more than one owner row.
- The first-entry or follow-up flow bypasses canonical server routes/repositories.
- A public page exposes precise location, raw private journal evidence, email, quarantine/original media keys, or signed upload URLs.
- A public photo renders from anything other than a stripped derivative.
- Archive does not return HTTP `410 Gone` for the old public URL.
- Cloudflare caches app HTML.
- Worker/search health is assumed rather than verified or explicitly marked degraded.
- Smoke evidence contains secrets, tokens, cookies, private URLs, raw emails, raw query strings, referrers, IPs, user agents, EXIF, or raw journal text.

## Local Verification

This local gate does not replace the live smoke. It proves that the smoke surface and app contracts compile and remain test-covered before deployment:

```bash
cd apps/web
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Python worker compile gate plus the worker recovery proof:

```bash
cd services/matching
find app tests -type f -name '*.py' -print0 | sort -z | xargs -0 uv run --frozen python -m py_compile
uv run --frozen ruff check .
uv run --frozen pytest
```
