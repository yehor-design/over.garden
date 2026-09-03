# Infrastructure Registry

Status: live operational source of truth
Last verified: 2026-08-12 for the OVE-298 Google-linking production rollback, exact-index state, and current default-off deployment; 2026-08-11 for the OVE-314 aggregate production database/env preflight and current repository contract; 2026-08-10 for the OVE-290 R2 presign TTL preflight and stale-document media contract; other provider verification dates remain recorded per section
Owner: founder/operator

This document records non-secret infrastructure settings, stable identifiers, URLs, and operational links for OverGarden. It exists so future AI agents do not ask for the same values repeatedly and do not invent provider-specific configuration.

## Agent Rules

1. Read this file before touching DNS, Cloudflare, R2, media URLs, deployment env, production storage, or external service wiring.
2. Do not commit secrets. This file may contain account IDs, zone IDs, bucket names, public URLs, and dashboard links; it must not contain passwords, API tokens, `R2_SECRET_ACCESS_KEY`, database passwords, Better Auth secrets, or Meilisearch master keys.
3. If this file conflicts with live provider state, verify through the provider API/dashboard, make the smallest safe change, and update this file in the same patch.
4. Any Linear SDD issue that touches media, DNS, production env, deployment, external storage, or external services must include this file under the exact `Required context` heading.
5. Keep tasks vertical. Do not create standalone "configure infra" tasks unless the same issue proves a concrete user behavior end to end.

## OVE-314 obsolete control-plane retirement

Current product access is self-serve email/password or Google. The former
product-access invite, closed-pilot/founder-rehearsal model, pilot UI, `/join`,
`/admin`, and `/admin/users` are retired. Lineage invitations remain a distinct
provenance feature.

The approved production preflight found 43 legacy grant rows (6 closed-pilot,
37 founder-rehearsal), zero learning-attribution outbox/hinted/unfinished rows,
and zero incoming foreign keys or view dependencies. Migration `0021` converts
bounded historical attribution and removes only the grant table plus the two
hint columns; it does not delete users or content.

After an exact-SHA `READY` deployment and authenticated route/menu proof,
remove only `PILOT_INVITE_SIGNING_SECRET` from Vercel production, preview, and
development, then read target-name absence twice without reading its value.
Preserve every Better Auth, Google, lineage, R2, database, matching, analytics,
and unrelated Vercel setting. The forward-only plan/apply/rollback contract is
`docs/PRODUCTION_PILOT_SMOKE.md` and
`docs/runbooks/OVE_314_OBSOLETE_CONTROL_PLANE_RETIREMENT.md`.

## Source Priority

1. Live provider API/dashboard.
2. This registry.
3. Current stack docs: `AGENTS.md`, `docs/TECH_STACK_DECISIONS.md`, `docs/adr/ADR-0014-agentic-stack-realignment.md`.
4. Older ADRs and chat history.

## Local Apple Container Runtime (OVE-189)

This is host-local, non-secret operational state. It does not describe production R2 and must not be copied into Vercel or Cloudflare configuration.

- Runtime: Apple Container 1.0.0 on a supported Apple Silicon/macOS 26 host.
- Canonical service volumes: Postgres `overgarden-postgres-18-data`, Meilisearch `overgarden-meili-data`, and the exact MinIO volume selected by `infra/.runtime/minio-volume`.
- OVE-189 active MinIO target on the proof host: `overgarden-minio-recovered-20260717-ove189`.
- Preserved corrupt source: `overgarden-minio-data`; retirement is not authorized. Recovery and normal stop/start commands must not delete or overwrite it.
- Source plan inventory on 2026-07-17: two user-bucket namespaces, 164 regular files, 82 `xl.meta` object-metadata files, zero user-bucket traversal errors, and four errors confined to rebuildable `.minio.sys` state. Object names, object bytes, credentials, and raw container inspection were excluded from evidence.
- Recovery result: the source was mounted read-only; the new target matched the full readable user-bucket tree; isolated target MinIO reached readiness; the old source remained present after canonical container recreation.
- Runtime proof: an actual metadata-bearing JPEG followed upload -> private quarantine -> server-side WebP re-encode -> durable processed row -> original deletion -> authenticated/public derivative readback. After a full deletion/recreation of all three container objects without `--volumes`, prior Postgres, Meilisearch, processed-media, quarantine-absence, and visual-fixture canaries were read successfully before any reseed or upload. All 16 visual-fixture media objects then passed the full verifier.
- Binding runbook: `docs/LOCAL_MEDIA_RUNTIME_RECOVERY.md`.
- Loopback safety: run local bootstrap, fixtures, and media smoke through `infra/run-with-local-infra-env`. `apps/web/scripts/bootstrap-local.ts` independently rejects non-loopback endpoints and Vercel Production.

Never commit `infra/.runtime/` or `apps/web/.runtime/`. Those directories contain local activation identifiers or short-lived synthetic proof handles and are git-ignored.

## GitHub Actions budget freeze (OVE-208 closeout, 2026-07-23)

Status: GitHub-hosted Actions cannot start jobs (`Actions budget is preventing further use`) and spending limit cannot be raised.

Operational bypass in force:

- `.github/workflows/ci.yml` and `.github/workflows/matching-image.yml` are `workflow_dispatch` only (no auto `push` / `pull_request` triggers).
- Merge gate: green CI on the pull request (install, bootstrap, generated-types check, lint, typecheck, banned-dependency gate, tests, build) plus a `READY` Vercel deployment for the merged SHA.
- Cleared Actions artifacts and listed caches during OVE-208; usage meters may lag 6–12 hours.
- When included minutes/storage recover, restore auto `pull_request`/`push` triggers on CI and optional `push` on matching-image; keep `KEEP_COUNT=0` and short retention.

## Cloudflare

Account:

- Account label: founder Cloudflare account
- Account ID: `cb03b15042adc74edfe2d8201636300a`
- R2 endpoint for S3-compatible SDKs: `https://cb03b15042adc74edfe2d8201636300a.r2.cloudflarestorage.com`

Zone:

- Zone name: `over.garden`
- Zone ID: `aa4ef4e26d4de961897f29555d20b662`
- Status: `active`
- Setup type: `full`
- Plan: `Free Website`
- Cloudflare nameservers:
  - `ines.ns.cloudflare.com`
  - `mitch.ns.cloudflare.com`
- Registrar: GoDaddy
- Original GoDaddy nameservers:
  - `ns41.domaincontrol.com`
  - `ns42.domaincontrol.com`
- Activated at: `2026-06-26T11:03:23.868258Z`

DNS and edge invariants:

- Cloudflare is authoritative DNS for `over.garden`.
- Cloudflare stays DNS-only for the app domain; Vercel's cache serves the public HTML shells (ADR-0022, D4). Cloudflare must not sit in front of app HTML.
- App-layer cache rule (ADR-0022, D4; supersedes the OVE-91 guardrail): `apps/web/src/proxy.ts` sets `Cache-Control: private, no-store, max-age=0, s-maxage=0, must-revalidate` only on `/garden`, `/account`, `/auth`, `/erasure`, `/api`, `/health`, and on every response the proxy answers itself (redirects, lifecycle 404/410 documents). Public pages keep the headers Next emits: with Cache Components their prerendered shell is served from Vercel's cache and the request-time part (session, personalized controls) streams from the function; data behind them is `use cache` with tags that every mutation revalidates. R2 media and static assets are unchanged.
- OVE-195 media revoke requires production Vercel env `CLOUDFLARE_ZONE_ID` (`aa4ef4e26d4de961897f29555d20b662`) and `CLOUDFLARE_CACHE_PURGE_API_TOKEN` (Zone Cache Purge only) so archived/erased immutable derivatives stop serving at `media.over.garden` within the declared window. Also set `CRON_SECRET` for `/api/cron/media-lifecycle`.
- Do not manually CNAME media traffic to the `r2.dev` public development URL. R2 custom domains must be attached through the R2 bucket custom-domain flow.
- OVE-51 canonical app DNS:
  - `over.garden A 76.76.21.21`, DNS-only, auto TTL, bound to Vercel project `over-garden`
  - `www.over.garden A 76.76.21.21`, DNS-only, auto TTL, bound to Vercel project `over-garden`
- Because the app DNS records are DNS-only, app HTML responses carry Vercel's `x-vercel-cache` status, never a Cloudflare one. A public page shell answers `HIT`/`PRERENDER` from Vercel's cache; workspace routes answer `MISS`/`BYPASS` with `no-store`. If the app domain is ever proxied at Cloudflare, an HTML `cf-cache-status: HIT` is a launch blocker.
- `media.over.garden` is the R2 custom domain and is proxied by Cloudflare: a GET of an immutable derivative answers `cf-cache-status: MISS` then `HIT`; HEAD is never cached, so probes must use GET (OVE-371 proof, 2026-09-03).

Domain reputation incident (OVE-188):

- Status: `closed` as of 2026-07-22. Redacted outcome class: `false-positive remediation propagated / customer path recovered`. This was not an authoritative DNS drift.
- Direct Cloudflare authoritative queries return `76.76.21.21` for both `over.garden` and `www.over.garden`. Cloudflare, Cloudflare Security, Google Public DNS, and Quad9 agree.
- The default resolver on the current A1 Bulgaria connection and both public Cisco Umbrella resolver endpoints now return `76.76.21.21` for both hostnames. A fresh normal Chrome session on that default connection loaded apex and `www`, followed the Bulgarian canonical routes, and rendered OverGarden without custom DNS, VPN, a hosts override, provider bypass, a temporary allow action, or a security block page.
- Bounded safety evidence on 2026-07-13: Google Safe Browsing reported no unsafe content; the observed VirusTotal domain analysis reported zero detections and ESET clean; canonical TLS, Vercel routes, exact deployed commit, production logs, and current application asset origins showed no compromise indicator. This supports a false-positive hypothesis but does not waive repeat checks after deployments.
- Reproduce without logging private resolver/client data: `cd apps/web && pnpm smoke:protective-dns`. Exit `2` means at least one checked resolver disagrees with authoritative DNS; exit `1` means the check itself failed; exit `0` means all automated resolver comparisons pass.
- Required upstream remediation without A1 support: request global false-positive review from Whalebone at `domain-report@whalebone.io` and security reclassification through the authenticated Cisco Talos Reputation Center. ESET escalation is not currently justified because the observed ESET result is clean.
- Whalebone confirmed removal of `over.garden` from its global threat database and closed the false-positive case on 2026-07-14. A private case ID is present. System-default parity and normal system-DNS HTTPS access have remained healthy; the redacted outcome class is `false positive removed / case closed`.
- Two authenticated Cisco Web Reputation submissions were created on 2026-07-13, with private case IDs present for apex and `www`. Both were still `PENDING / Untrusted` on 2026-07-17. By 2026-07-20 one case was resolved; the related apex case was re-opened with an unknown dashboard reputation and no resolution, so a bounded follow-up was submitted on 2026-07-22. This correspondence remains monitored without treating an asynchronous dashboard label as stronger than current resolver and browser-path evidence.
- Historical redacted evidence on 2026-07-17 produced `10 pass / 4 Cisco endpoint mismatches / 0 error`. Closure evidence on 2026-07-22 produced `14 pass / 0 mismatch / 0 error`: system-default and every checked public/protective resolver returned the authoritative address for apex and `www`.
- Exact-main baseline `0b7ac6c294894791b20d9998a6f7e6856130240d` passed GitHub CI run `29662442419`; Vercel deployment `dpl_4JqRWGXLEQLstKKk9877f39mTRPS` was `READY` for that SHA and owned both canonical aliases. Canonical apex, `www`, `/health`, and representative Bulgarian routes, hostname-specific TLS, the refreshed production dependency audit, and bounded production error/HTTP-500 log checks passed without a compromise signal.
- User-side custom DNS, VPN, hosts overrides, temporary passthrough, allowlisting, or changing the domain are workarounds and do not close the incident.
- Completion gate passed on 2026-07-22. Reopen OVE-188 or a successor incident if the default A1 resolver or Cisco Umbrella diverges again, a normal A1-connected browser cannot load canonical HTTPS without a bypass, or a bounded security check finds a credible compromise indicator.
- Full redacted process and evidence rules: `docs/DOMAIN_REPUTATION_INCIDENT_RUNBOOK.md`.

Dashboard links:

- Cloudflare zone DNS: `https://dash.cloudflare.com/cb03b15042adc74edfe2d8201636300a/over.garden/dns/records`
- Cloudflare R2 overview: `https://dash.cloudflare.com/cb03b15042adc74edfe2d8201636300a/r2/overview`
- Cloudflare R2 API tokens: `https://dash.cloudflare.com/cb03b15042adc74edfe2d8201636300a/r2/api-tokens`

Reference docs:

- R2 public buckets and custom domains: `https://developers.cloudflare.com/r2/buckets/public-buckets/`
- R2 S3-compatible API tokens: `https://developers.cloudflare.com/r2/api/tokens/`

## Cloudflare R2

### ADR-0019 ephemeral staging (provisioned by OVE-346)

OVE-346 provisioned and read back the following exact production identities on
2026-08-23:

- private R2 Standard bucket `overgarden-media-staging`, created
  `2026-08-23T09:05:44.620Z` in `EEUR` and kept non-public;
- Worker `overgarden-media-staging` on the custom domain
  `media-stage.over.garden` with `workers_dev` disabled;
- SQLite-backed Durable Object binding `MEDIA_STAGING_SESSIONS`, namespace ID
  `84963a6e9a62469e935876b0d5c1e07a`, class `MediaStagingSession`, migration
  tag `v1`; the same namespace holds opaque owner-admission coordinators as
  well as per-session coordinators and creates no Postgres state;
- Worker Rate Limiting binding `MEDIA_STAGING_UPLOAD_RATE_LIMIT`, namespace
  `346001`, with a permissive edge-local `30` calls per `60` seconds guard;
  the authoritative global owner guard remains the SQLite coordinator at no
  more than `20` upload attempts per minute and `3` concurrent 15-minute
  staging sessions per owner hash;
- existing public bucket binding `PUBLIC_MEDIA_BUCKET` ->
  `overgarden-public`, without changing that bucket's public delivery domain or
  cache policy.

This surface accepts only the browser-generated final WebP through a
short-lived, owner/session/media-generation-specific capability. It stores no
journal text or source original, remains private, and is not a public delivery
origin. The exact bucket CORS allowlist is `http://localhost:3000`,
`https://over-garden.vercel.app`, `https://over.garden`, and
`https://www.over.garden`; methods are `PUT, HEAD`, allowed headers are `*`,
the exposed header is `ETag`, and max age is `3600` seconds. Normal
abandoned-object cleanup targets 15 minutes. Enabled lifecycle rule
`delete-staged-webp-after-1-day` applies only to prefix `staging/` and expires
objects and incomplete multipart uploads after one day as the catastrophic
fallback.

The Worker has exactly three secret bindings:
`EPHEMERAL_MEDIA_CAPABILITY_SECRETS`,
`EPHEMERAL_MEDIA_RECEIPT_SECRETS`, and
`EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET`. Vercel production has those three plus
`EPHEMERAL_MEDIA_CAPABILITY_CURRENT_VERSION`,
`EPHEMERAL_MEDIA_RECEIPT_CURRENT_VERSION`, and
`EPHEMERAL_MEDIA_STAGING_BASE_URL`; all six are stored as encrypted production
environment variables. Secret values and provider-generated Worker version
UUIDs never belong in this registry. The terminal OVE-346 receipt must instead
record the redacted exact feature-SHA Worker version and exact-SHA READY Vercel
deployment read-backs.

Cloudflare Free automatically applies the 10 ms HTTP Worker CPU ceiling. The
tracked Wrangler configuration deliberately declares no `limits.cpu_ms`
override because Cloudflare rejects that field for this Free Worker; no paid
plan or plan change was required. Workers observability stays enabled for
aggregate/provider health, while `observability.logs.invocation_logs=false`
prevents automatic persistence of session/media/generation URL identifiers;
application code emits no capability or media-identifier logs. The bounded
live proof streams the request body Worker -> R2 with R2-enforced SHA-256,
verifies exact CORS, owner admission, and idempotent explicit delete, and
requires alarm/claim/finalize convergence after the exact application
deployment. A generation replacement first records every superseded object key
in the session Durable Object's SQLite delete ledger, deletes and confirms the
old R2 object before accepting the new body, and removes the ledger entry only
after R2 acknowledges deletion. An interrupted replacement therefore remains
alarm-recoverable instead of orphaning the old object; a bounded backlog of
`100` entries fails closed. Every claimed public object also carries a
server-derived HMAC ownership proof bound to the owner hash, staging session,
media UUID, generation, and SHA-256. Promotion, finalization, and cleanup all
require that exact proof, so a byte-identical object created by another session
cannot be adopted or deleted. The Durable Object acquires a persisted
`finalizing` or `abandoning` fence before any finalization or cleanup R2 effect;
alarms recover those states idempotently, and no stale cleanup may cross a
successful finalization. Rollback disables the staging custom domain and
reservation route first, then removes only synthetic objects and the newly
created empty OVE-346 resources after read-back; it never mutates the public
bucket or shared credentials, and the deleted legacy provider must remain
absent.

OVE-349 removed every application/schema/package owner of the former
`overgarden-quarantine` and server-conversion path after the exact zero-use and
approved test-residue gates. OVE-350 then completed the provider retirement on
2026-08-24: the founder waived the former seven-day and 24-hour observation
delays, two independent exact-main reads at least 60 seconds apart proved zero
objects, zero bytes, zero multipart uploads and zero writers, the application
token was narrowed in place to `overgarden-public`, and the exact empty bucket
plus its bucket-owned CORS/lifecycle surface was deleted. The provider is now
terminally absent and must not be recreated. See the redacted terminal receipt
below and `docs/runbooks/OVE_350_LEGACY_QUARANTINE_PROVIDER_RETIREMENT.md`.

Production S3-compatible client settings:

```env
R2_ENDPOINT="https://cb03b15042adc74edfe2d8201636300a.r2.cloudflarestorage.com"
R2_FORCE_PATH_STYLE="true"
R2_PUBLIC_BUCKET="overgarden-public"
R2_PUBLIC_BASE_URL="https://media.over.garden"
```

The same exact non-secret `R2_PUBLIC_BASE_URL` is required in the DigitalOcean
matching runtime's protected `worker.env`, not only in Vercel. Matching
candidate preflight and active readiness fail closed when it is missing or
drifted so Meilisearch cannot settle a journal projection with an omitted
public cover URL.

Production addressing is a fail-closed runtime and deployment contract, not a
best-effort SDK preference. `apps/web/src/lib/r2-addressing-contract.ts`
requires the exact endpoint above and exact `R2_FORCE_PATH_STYLE=true` whenever
`VERCEL_ENV=production`; missing, `false`, `1`, whitespace, or endpoint drift
refuses production presigning and fails the production prebuild guard. Preview
and local runtimes retain the existing boolean compatibility behavior.

On 2026-08-13, the consumed OVE-315 canary exposed live Vercel Production drift:
`R2_FORCE_PATH_STYLE=false` generated a virtual-hosted presigned capability and
the harness stopped before PUT. Cleanup proved zero task residue twice. OVE-316
owns the bounded production-only correction, exact-main redeployment, closed
runtime read-back, and separately approved one-canary proof. The approval plan
and rollback rules are in `docs/runbooks/OVE_316_R2_PATH_STYLE_RECOVERY.md`.

Secret values still required outside git:

```env
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
```

Where secrets belong:

- Local app development: `apps/web/.env.local` holds loopback MinIO values only. A production R2 credential does not belong on a developer machine; see the 2026-09-01 rotation receipt below.
- Vercel/project deployment env: the `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` pair belongs to the `production` target only. On 2026-09-01 it was removed from `development` (from where `vercel env pull` had been copying it into `apps/web/.env.local`) and from the retired OVE-27 branch preview. The non-secret `R2_ENDPOINT`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_BASE_URL`, and `R2_FORCE_PATH_STYLE` remain on `development`.
- Never in repository docs, source files, Linear comments, or chat
- R2 values in Vercel must not include trailing newlines or pasted whitespace. A trailing newline in `R2_ACCESS_KEY_ID` produces signed upload URLs that Cloudflare rejects before the app can process media.

R2 API token requirement:

- Permission: Object Read and Write
- Current app use and exact bucket scope: `overgarden-public` only. OVE-350
  removed the legacy-bucket scope in place; no application credential may
  regain it.
- Token type: **account** API token. Cloudflare ties a user API token to one person and deactivates it when that user leaves the account, so a service credential must not be one. Only a Super Administrator can create an account token.
- Token name convention: `overgarden-public-rw-vercel-<yyyy-mm>` — bucket scope, permission, consumer, and creation month. The month is what makes the previous token unambiguous during the next rotation without comparing access key identifiers.
- Expiry: **none**. The project has no automated renewal and no alerting: `indeterminate_auth` in `apps/web/src/lib/storage.ts` and `apps/web/src/server/media/lifecycle-revoke.ts` is a control-flow value that is never raised anywhere. An expired token would therefore stall media revocation silently, because the OVE-216 contract lets cleanup settle only after a successful `HeadObject`. The compensating control is the scope above, not a timer nobody watches. A finite expiry is acceptable only alongside a calendar reminder set before it.
- Cloudflare R2 does not support S3 `PutBucketPolicy` on this endpoint. Public reads are controlled through R2 bucket/domain settings, not by committing or replaying S3 bucket policy JSON from the app bootstrap script.

OVE-216 lifecycle proof contract:

- Cleanup may settle only after the official S3-compatible `HeadObject` classifies the object as not found; authentication, transport, and provider uncertainty remain unfinished.
- A public derivative additionally requires the canonical `media.over.garden` URL to converge to exactly `404` or `410`.
- The production provider probe creates one random synthetic object, uses bounded requests and canonical polling, and proves deletion again in a mandatory `finally` cleanup. Its receipt is class-only and must not expose bucket names, object keys, object URLs, credentials, or user content.
- Run the probe only through the Vercel production environment on the exact deployed SHA: `cd apps/web && vercel env run -e production -- pnpm exec tsx scripts/prove-r2-media-lifecycle-provider.ts`.

Historical OVE-244 safe-media admission receipts remain provenance only.
OVE-349 removed that runtime, its commands, claims, fields, and package owners.
Current capability and byte-integrity authority is the OVE-346 edge-staging
contract above plus the browser final-WebP policy; do not rerun or reconstruct
the historical safe-media-admission command.

OVE-290 document-generation media contract:

- Authenticated Vercel production preflight on 2026-08-10 found no `R2_UPLOAD_URL_TTL_SECONDS` override. The source class is therefore `default` and the effective configured value is `900` seconds; no provider or environment mutation was required.
- Runtime rejects any explicit malformed, non-positive, or non-900 override. Effective presign lifetime is additionally capped at 900 seconds and the remaining signed document-envelope lifetime.
- ADR-0022 (OVE-367) removed document-mutation admission: there is no `DOCUMENT_MUTATION_ADMISSION_ENABLED`, no readback route, and no admission smoke. Sessions are cookie-cached (`session.cookieCache`, 300 s); every mutation compares the rendered owner id and answers `401 session_required` or `409 session_account_changed`.
- On 2026-08-10, Git-backed deployment `dpl_Di1Mwcbtms8mQjjNxgZL9fr2WcwR` reached `READY` at `over-garden-fwg7ddk6a-yehors-projects-01221e2b.vercel.app` and served feature SHA `da38a2c2b5901426353e8d0a55a91a79b584863f` through the canonical aliases. Immutable and canonical read-back both reported enforcement enabled and the default `900`-second TTL. The exact-SHA reject-only smoke proved owner-change, same-owner session-refresh, and malformed-protocol rejection with zero journal-entry and mutation-receipt effects before and after; all three synthetic sessions were revoked and confirmed guest afterward.

### Session contract and orphan sweep (OVE-372)

Worker `overgarden-media-staging` routes:

- `PUT /v1/staging/{session}/{asset}/{generation}[/v{longEdge}]` — upload
  under the session capability; headers `content-sha256`, `x-media-width`,
  `x-media-height`
- `DELETE /v1/staging/{session}/{asset}/{generation}[/v{longEdge}]` — per-object
  delete capability (the primary's delete removes its variants)
- `POST /v1/staging/{session}/touch` — extends the two-hour lease
- `POST /v1/staging/{session}/claim`, `POST /v1/staging/{session}/finalize`
- `GET /v1/status`

Vercel issues the session capability at `POST /api/media/staging/sessions`
(owner-authenticated); the reservations route is gone. Vercel cron
`/api/cron/media-orphans` (`0 5 * * 1`, `CRON_SECRET`) sweeps unreferenced
`derivatives/` objects older than seven days; its receipt is counts only.

### Production availability probe (OVE-361)

- Non-secret operator command:
  `cd apps/web && pnpm exec tsx scripts/probe-production-prefetch-availability.ts --mode verify --repeats 5`.
  It issues safe methods only against public paths, never authenticates, and
  refuses an unsafe method outright. `--mode plan` issues no request at all.
- Measured on 2026-09-01 against `https://over.garden`: 234 observations across
  two request classes, nine public paths, and three concurrency ceilings (3, 18,
  32) returned **zero non-success statuses**. Slowest single response 1656 ms.
- Decision and open question live in `docs/PRODUCTION_PREFETCH_AVAILABILITY.md`.
  The intermittent `503` class observed in an authenticated browser session is
  not a property of the public reading surface, the prefetch request shape, or
  burst concurrency at any tested ceiling. The authenticated rendering path is
  the one difference the probe does not sample, and no repair may be scoped
  before the class is reproduced there.

### R2 credential rotation and catalog retirement (2026-09-01 receipt)

- Cause: a July 2026 assistant session recorded a whole `apps/web/.env.local` into a
  transcript, exposing the then-current `R2_ACCESS_KEY_ID` and
  `R2_SECRET_ACCESS_KEY`. The values were never in git; `apps/web/.gitignore`
  ignores the file. Of the seven values in that dump only the R2 pair was
  production: the Meilisearch, matching-service, and auth secrets matched their
  current local values, and both database URLs were loopback.
- Mechanism: `apps/web/.env.local` carried `VERCEL_OIDC_TOKEN`, which only
  `vercel env pull` writes, and that command pulls the `development` target, which
  held the production R2 pair. Removing the pair from `development` closes the
  path that put it on a developer machine.
- Rotation: account token `overgarden-public-rw-vercel-2026-09` created with
  Object Read & Write scoped to `overgarden-public` only, installed on the Vercel
  `production` target, and proved by redeploy. The exposed token
  `overgarden-r2-app-object-rw` (issued 2026-06-26) was revoked afterwards.
- Retired OVE-27 branch preview: all thirteen environment variables scoped to
  `Preview (codex/ove-27-production-pilot-smoke)` were deleted on 2026-09-01. The
  branch no longer exists on `origin`, so no preview deployment can be created for
  it. Twelve of the thirteen also exist on `production`; the exception was the
  legacy singular `BETTER_AUTH_SECRET`, superseded by the OVE-240 versioned
  `BETTER_AUTH_SECRETS` pair that `production` carries.
- R2 Data Catalog: the Apache Iceberg catalog was enabled on `overgarden-public`
  with catalog-level compaction, which is why Cloudflare had auto-created the
  account token `[R2 Data Catalog] Table Maintenance: overgarden-public` with
  **Admin Read & Write over all buckets** — the widest credential in the account.
  Nothing in this repository reads an Iceberg catalog, and no Iceberg table was
  ever written to that bucket. Compaction was disabled, the catalog was disabled,
  and the token was revoked on 2026-09-01, in that order. Re-enabling the catalog
  recreates the token; do not re-enable it without a recorded reason here.
- Worker credentials: `apps/web/cloudflare/media-staging` reaches both buckets
  through native `r2_buckets` bindings and reads no API token, so a rotation of the
  S3 credential does not touch it. `CLOUDFLARE_CACHE_PURGE_API_TOKEN` and the
  optional operator `CLOUDFLARE_API_TOKEN` are separate credentials and were not
  exposed.

### Retired Legacy Quarantine Provider (OVE-350 terminal receipt)

- Former bucket: `overgarden-quarantine`; provider state: absent.
- Deletion completed: `2026-08-24T15:14:46.919Z` in production account
  `cb03b15042adc74edfe2d8201636300a` by the exact empty-bucket delete.
- Exact-main baseline: `7e84c520f0bfdba603d7ed79d85f851d840e6ae9`;
  Vercel deployment `dpl_BmUcv42NLiePHtNdeV3WdM3qBdaq` was READY at
  `2026-08-24T15:06:37.492Z`.
- Independent zero reads: `2026-08-24T15:08:31.999Z` and
  `2026-08-24T15:10:08.972Z`; receipt digests
  `8eeb78bf198182d07c60f0c05d5788e16d719082450aea1dae18b4a76d3adcdb`
  and `0ab58877ce3faba0a0ca2b97029a9d97bae5e0416896a3d5fe1943edfdeac1c9`.
- Approved immutable plan digest:
  `41d026cf8539d2f201ef3594c7bdf8d0dc1728a0fe5a2e05ac72aa5c8853074d`.
- Deleted bucket-owned configuration digests: CORS
  `f9b89ac073922cde7301f2bcd3dd1d402b084bb2dc64060e9bdc3109be05d1ff`;
  lifecycle
  `ecdebbe54d6a8415de3403a3ebd32e6d2e3caff358301b2b757f9afce5e64b0f`.
- Apply receipt digest:
  `2206992541f1ab4283fdb18862e862f484780c0d7a6414b50748d99f439b7436`;
  independent terminal read-back digest:
  `9f57e25c4777e3221bebff19f86bc65cf44e29444fb9f867fc61b2512b7df4cf`.
- Terminal provider read-back: target absent twice; only
  `overgarden-public` and `overgarden-media-staging` remain in the R2 bucket
  inventory; the app token is active with Object Read and Write for
  `overgarden-public` only; public/staging domains, exact-main deployment,
  retired-env absence, contracted Postgres schema, and zero legacy jobs all
  passed.
- Rollback was not required. Recreating the former bucket, its CORS/lifecycle
  rules, its env name, or any credential scope for it is forbidden unless a
  new explicit ADR and executable SDD task supersede this terminal state.

### Public Derivative Bucket

- Bucket name: `overgarden-public`
- Bucket ID: `e913e6e4251a4ba2b132579a9b771884`
- Purpose: stripped public derivatives only
- Preferred production public base URL: `https://media.over.garden`
- Custom domain: `media.over.garden`
- Custom domain status: ownership `active`, SSL `active`
- Minimum TLS: `1.2`
- DNS record: `media.over.garden CNAME public.r2.dev`, proxied, R2-managed/read-only
- Managed `r2.dev` public development URL: `https://pub-e913e6e4251a4ba2b132579a9b771884.r2.dev`
- `r2.dev` status: **disabled** on 2026-07-23 (OVE-195). Live managed-domain API proof moved `enabled → disabled`. Synthetic object probe: canonical `https://media.over.garden` served `2xx`; after disable, managed `r2.dev` no longer serves public development bypass. Keep custom domain `media.over.garden` as the only public read path.

CORS:

- Rule ID: `overgarden-public-derivative-read`
- Origins: `*`
- Methods: `GET`, `HEAD`
- Headers: `*`
- Exposed headers: `ETag`, `Content-Type`, `Cache-Control`
- Max age: `3600`

Lifecycle:

- Rule ID: `abort-public-multipart-uploads-after-7-days`
- Prefix: empty
- Abort multipart uploads after: `604800` seconds
- Historical OVE-195 quarantine lifecycle notes are superseded by the OVE-349
  runtime removal and OVE-350 terminal provider deletion above.

Invariants:

- During transition, legacy rows may still reference server-created WebP
  derivatives. Under ADR-0019, atomic publication promotes the exact staged
  browser-final WebP without re-encoding; both paths must remain final-WebP-only.
- Do not upload source originals here.
- Derivative writes should use long-lived immutable cache headers only for content-addressed or otherwise immutable object keys.

## DigitalOcean

Status: production Managed PostgreSQL plus worker/Meilisearch Droplet are provisioned for the self-serve application and bounded production verification.

Last verified: 2026-07-18 for the OVE-203 additive identity schema,
aggregate-only migration, final integrity verification, and managed-backup
listing. Broader worker health, redacted journal index/unindex smoke, and live
worker restart/recovery smoke were last verified on 2026-06-29.

Project:

- Project name: `overgarden-production`
- Environment type: `Production`
- Purpose: web application production infrastructure

Managed PostgreSQL:

- Cluster name: `overgarden-postgres-prod-fra1`
- Region: Frankfurt, Datacenter 1, `FRA1`
- Plan at creation: Basic Shared CPU, Regular SSD, 1 vCPU, 1 GB RAM, 10 GiB minimum storage
- Public host: `overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com`
- Port: `25060`
- Default database: `defaultdb`
- Runtime username at verification time: `doadmin`
- SSL mode: required, with the DigitalOcean CA certificate passed to the app through `DATABASE_SSL_CA`

Operational state:

- On 2026-06-27, `DATABASE_URL`, `DIRECT_URL`, and `DATABASE_SSL_CA` were installed in Vercel production and in the active OVE-27 branch preview.
- On 2026-06-27, the app schema and Better Auth tables were bootstrapped with `pnpm db:bootstrap -- --env-file /private/tmp/overgarden-db.env --ca-file /private/tmp/overgarden-db-ca.crt`.
- On 2026-06-27, the managed database had 15 public base tables after bootstrap.
- On 2026-06-28, `job_queue` journal index/unindex jobs were processed by the deployed worker against the production database during the OVE-36 redacted live smoke.
- Historical OVE-51 receipt (superseded by OVE-314): on 2026-06-29, production bootstrap created the then-required product-access grant table. This is provenance only; it is not current schema or setup guidance.
- OVE-69 seed-state guard: deployed catalog-source code and local proof imports do not prove that staging or production catalog rows exist. Use `docs/CATALOG_SEED_ROLLOUT_PROOF.md` and record only the final redacted evidence before claiming non-local seed availability.
- On 2026-07-01 (OVE-78), production schema bootstrap was rerun non-destructively because the source-catalog tables required by the rollout command were missing from the live database. The OVE-78 production seed proof then passed against `https://over.garden` with generated timestamp `2026-07-01T12:16:18.722Z`, command code SHA `08db4d0adf8586fb91f8c4f29bf2f55ade15473d`, stable product identity on rerun, no duplicate same-concept suggestions, real `/garden` readback status `200` for every smoke case, and leak check `passed`. Staging still has no checked-in seed proof. No database URL, CA body, source-record ID, raw payload hash, invite token, email, user identifier, or private/source-only field was recorded.
- On 2026-07-12 (OVE-179), production schema bootstrap was rerun non-destructively before the public journal-entry V2 deployment. A redacted schema probe confirmed `media_assets.alt_text`, `media_assets.caption`, and their bounded nonblank length constraints are present. No schema drop, bulk delete, row export, database URL, CA body, media key, journal text, user identifier, or precise location was read into evidence or recorded.
- On 2026-07-12 (OVE-180), production schema bootstrap was rerun non-destructively before the gardener-profile V2 live smoke. A redacted app-TLS probe confirmed all three profile relationship tables, the processed-avatar foreign key, all nine bounded profile columns, and zero forbidden location-column names across the new profile tables. No schema drop, bulk delete, row export, database URL, CA body, profile row, relationship row, user identifier, or precise location was read into evidence or recorded.
- On 2026-07-15 (OVE-162), production schema bootstrap was rerun non-destructively after the exact-SHA Vercel deployment. A booleans-only app-TLS probe confirmed `catalog_fuzzy_duplicate_suggestions` and the closed-payload `job_queue_catalog_fuzzy_duplicate_payload_check` constraint are present. No schema drop, bulk delete, row export, database URL, CA body, catalog row, suggestion row, job payload, user identifier, or private/source-only field was read into evidence or recorded.
- On 2026-07-16 (OVE-163), exact-main deployment `dpl_FR7gxmnHv9j3wEMLvrDbk5KjYPf2` reached Vercel `READY` for commit `e94148fa5a4a097422b5cdf7234e1b1ffad542e2`. A platform-env-injected, read-only production proof passed canonical runtime, matching schema and closed queue-payload constraints, safe typeahead search, entity-resolution QA, and recursive evidence leak checks with `productionDataTouched=false`. The production fuzzy report was safely empty (`0` full, `0` reviewed, `0` rendered); bounded advisory generation was proven locally without importing production data. No external infrastructure value changed, and no env file, schema mutation, database URL, CA body, secret, private/source-only row, user identifier, or precise location was printed or recorded.
- On 2026-07-18 (OVE-203), commit `1edffc351c1c3132f97608083b4b6ea6a63e9a12` was first proven by exact-SHA CI, then used from a clean detached worktree to install the additive identity schema before the same commit reached production. The aggregate-only dry-run found `64` auth users, `6` existing profiles/current claims, `58` missing profiles/current claims, and `6` legacy claims plus `6` legacy profile handles requiring policy review. Transactional rollback proof left aggregate state unchanged. The first apply provisioned `58` identities and reviewed both legacy sets; the second apply reported zero mutations. Final verification reported `64` users, `64` profiles, `64` current claims, zero retired claims, and zero missing, duplicate, mismatched, unresolved-review, or legacy-mention gaps. A bounded synthetic canonical runtime smoke then proved no-name signup, generated identity, duplicate preservation, verified sign-in, immediate rename, cooldown, current route `200`, retired route `410`/`noindex` without redirect, and current/retired mention resolution. The synthetic account was deleted immediately and a second final integrity check returned the same `64`/`64`/`64` zero-gap state. Evidence contained only counts, booleans, status classes, commit/deployment identifiers, and policy version; no email, UUID, handle, rejected term, cookie, token, content, or secret was printed or retained.

Backup and PITR posture (OVE-39, refreshed for OVE-201 managed restore):

- Status: `pass` as of 2026-07-24. Managed backups remain enabled (8 backup rows observed post-maintenance). PITR/retention remains 7d per DigitalOcean Managed PostgreSQL documentation/provider default.
- OVE-201 live disposable PITR drill (`overgarden-pitr-drill-20260724`): predeclared RPO ≤ 1h / RTO ≤ 4h; measured RPO `300000` ms and RTO `662000` ms both pass. Restore-readiness `ok`; ephemeral loopback Meili parity `zeroGap=true` (4/4). Exact disposable teardown confirmed; production remained `online`.
- Pending maintenance: founder-confirmed on-demand install applied 2026-07-24 (`pending` false after `install_update`). Post-maintenance health: cluster online, backups listed, matching/site HTTP 200.
- Operator verification (dashboard): DigitalOcean Cloud -> Databases -> `overgarden-postgres-prod-fra1` -> Backups/Settings. Confirm automatic daily backups are enabled and note the PITR/retention window and the latest backup timestamp.
- Operator verification (CLI/API, secrets omitted): `doctl databases list` to resolve the cluster id, then `doctl databases backups <cluster-id>`; or `GET https://api.digitalocean.com/v2/databases/{cluster_uuid}/backups` with a bearer token that is never recorded here.
- Recoverability validation must be non-destructive: create a fork / restore into a NEW cluster (`doctl databases fork ...`). Never restore over production. Runbook: `docs/MANAGED_RECOVERY_DRILL.md`. Redacted evidence: `docs/managed-recovery-evidence-redacted.json`.
- Record only: backup-enabled boolean, retention/PITR window, latest backup date, RPO/RTO pass class, cleanup boolean, and the check date. Never copy database URLs, the CA certificate body, credentials, or doctl/API tokens into this file, Linear, or chat.
- Cadence: repeat after journal/cover/identity/queue/search-eligibility schema changes, or at least once before public launch if older than 30 days.

Database invariants:

- Do not store database passwords, full connection URLs, or CA certificate bodies in git, Linear, chat, or docs.
- Vercel runtime should prefer canonical `DATABASE_URL` and `DIRECT_URL`; do not reintroduce legacy empty `POSTGRES_*` aliases as active production configuration.
- `DATABASE_SSL_CA` may be multi-line in Vercel. The app runtime strips `sslmode` from the connection string when a CA is configured so Node `pg` uses the explicit CA with strict verification.
- Vercel/serverless Postgres pool default is one connection per instance unless `DATABASE_POOL_MAX` explicitly overrides it. Do not raise this default without proving production connection-slot headroom or adding a pooled connection endpoint.

Connection pool (2026-09-02):

- The headroom this file demanded is now a read number: the cluster reports
  **22 available backend server connections**, read from the pool creation
  dialog in the DigitalOcean console.
- Pool name `overgarden-app-pool`, database `defaultdb`, mode **transaction**,
  size **12**. Twelve rather than twenty-two because the pooler must not own
  every backend: the matching worker holds a direct session for
  `LISTEN`/`NOTIFY`, the media retention leader lock holds another, migrations
  need one, and an operator needs to be able to connect during an incident.
- Transaction mode is the recorded architecture for this project, not just
  DigitalOcean's recommendation. The composed self-hosted stack pools the same
  way, and the application was written for it — `interaction-admission` uses
  `SET LOCAL` precisely so a timeout cannot leak into a pooled connection, and
  every advisory lock on a request path is `pg_advisory_xact_lock`.
- Two things must never travel over the pooler, because a transaction pooler
  hands out a different backend per transaction: the matching worker's
  `LISTEN`/`NOTIFY`, and the media retention leader lock. Both use
  `DIRECT_URL`.
- The application does not read a flag to know it is pooled. It compares its own
  connection with `DIRECT_URL`, and widens its pool only when they differ, so
  the code is inert until the environment is switched and needs no second
  deployment when it is.
- Operator verification, values omitted: DigitalOcean Cloud -> Databases ->
  `overgarden-postgres-prod-fra1` -> Connection Pools. The pooled connection
  string names the pool as its database and uses a different port from the
  direct one; the direct connection remains `defaultdb` on `25060`.

Cutover receipt (2026-09-02):

- Production `DATABASE_URL` now resolves to the pool; `DIRECT_URL` still
  resolves to the direct endpoint. They differ, which is the signal
  `isPooledDatabaseConnection` reads, so the application pool widened without a
  second deployment.
- The pooled endpoint was proven to be a pooler before the cutover, not
  assumed. The pool name is not a Postgres database: asking the direct port for
  it answers `database "overgarden-app-pool" does not exist`, while the pooler
  port serves it. The direct port serving `defaultdb` was the control.
- Authenticated garden workspace, the surface this work targeted, measured
  after the cutover. Full page load over four samples: `1227`, `533`, `393`,
  `401` ms — a warm band of roughly `393`-`533` ms. Twelve document-only
  samples: median `169` ms, maximum `234` ms, every response `200`. No section
  reported a failure class in any of the sixteen observations.
- `docs/GARDEN_WORKSPACE_SECTION_OBSERVABILITY.md` recorded a warm page latency
  of `2205`-`3426` ms on 2026-09-01, measured the same way. That is the
  comparison, and it is cumulative: the function region moved to `fra1`, a dead
  join left the inventory summary, `journal_entries_owner_recent_idx` landed,
  and the pool widened. No single change is isolated by these numbers.
- Public unauthenticated paths were measured before and after and did not move:
  medians `199`-`246` ms before, `202`-`211` ms after. Expected — they are
  CDN-served and never reach the four-round-trip inventory read. A reader
  looking for the pool's effect there will not find it.

Prefetch 503, root cause and repair (2026-09-02):

- The unexplained 503 on authenticated speculative prefetches was database
  connection exhaustion inside the proxy. Vercel's error table had been
  recording it since 2026-07-27: `remaining connection slots are reserved for
  roles with the SUPERUSER attribute`, PostgreSQL `53300`, severity FATAL,
  count `90`, `routes=/middleware`, plus twelve more of the same code across
  `/middleware`, `/journal/[slug]` and `/lineage/objects/[objectId]`.
- The exhaustion was global rather than route-specific. Each serverless
  instance holds its own connection, the garden workspace render held one
  through four serialized round trips for 2205-3426 ms, and 22 slots do not
  survive that under concurrency. Once the slots were gone, everything needing
  a connection failed at once — which is why the recorded errors name
  `/middleware`, `/journal/[slug]` and `/lineage/objects/[objectId]` rather
  than a single culprit.
- A speculative prefetch of an authenticated route still renders its payload on
  the server, and that render reads the database. That is where the observed
  503s were, not in the proxy.
- **Correction, same day.** An earlier version of this entry said the proxy
  resolves the session on every request including prefetches. It does not.
  Every database touch in `apps/web/src/proxy.ts` — the profile, community,
  passport and journal lookups, and `auth.api.getSession` — is gated on
  `isDocumentNavigationRequest`, which returns false for prefetch requests. The
  proxy's own logged failures were on document navigations. Recorded because
  the wrong version was merged first, and a plausible mechanism in canon is
  worse than none: it invites a repair to something already correct.
- Why it looked like it came from outside the application: the failure happened
  in the proxy, so the page function never ran, so nothing appeared in the
  status-code log. The error was in the error table the whole time. The log
  being read was one layer too late, not wrong.
- Why the OVE-361 probe found nothing in 234 samples: it is unauthenticated,
  and an unauthenticated request is CDN-served without a session lookup. It was
  measuring a path the fault could not reach.
- Repaired by the connection pooler above. Verified after the cutover with 258
  authenticated prefetches in bursts up to 64 concurrent: zero failures, and
  zero new entries in the error table over the covering window.
- Follow-up: the Better Auth session cookie cache is on since OVE-367, so the
  proxy's session read no longer touches the database. The remaining lifecycle
  lookups in the proxy move into `use cache` page lookups under OVE-369.

Worker and Meilisearch Droplet:

Runtime classification: this production worker/search surface is `production-linux-required` under `docs/CONTAINER_RUNTIME_POLICY.md`. Apple Container remains the preferred supported-Mac local runtime, but it is not the DigitalOcean Linux droplet process manager. OVE-76 confirms Docker Compose remains the current production process manager until a separate non-Apple Linux replacement is live-proven.

- Droplet name: `overgarden-worker-prod-fra1`
- Region: Frankfurt, Datacenter 1, `FRA1`
- Current size: Basic 1 vCPU, 1 GB RAM
- Runtime: Docker Compose under `/opt/overgarden`
- Retired hostname: `matching.over.garden` served three self-reporting endpoints until OVE-357. The route, its DNS record, and its container were removed on 2026-09-03; the name resolves to nothing. Worker liveness is read from the `matching_worker_heartbeats` row.
- Public Meilisearch URL: `https://meili.over.garden`
- Reverse proxy/TLS: Caddy on the Droplet, serving the Meilisearch site only
- Containers: active Meilisearch (`overgarden-meilisearch-next` after OVE-198), legacy Meilisearch retained stopped, `matching-worker`, `caddy`
- Meilisearch health returned status `available` on 2026-06-29.

Meilisearch version pin (OVE-198):

- Reviewed pin shared by local Apple Container, Docker fallback, CI, and production: `v1.48.1`.
- Production image ref class: `getmeili/meilisearch:v1.48.1@sha256:93ea15e3e46499281fb5bcd55c63e147d76680073ebd95a3a74d632176225d8a`.
- Upgrade strategy: `dual_volume_postgres_rebuild` only. In-place volume upgrade and experimental dumpless upgrade are forbidden on production.
- Active volume class after cutover: `overgarden-meili-data-v1481`.
- Legacy volume retained for rollback: `overgarden_meili_data` (pre-cutover `v1.15.2` data). Deletion is out of scope for OVE-198.
- Operator CLI: `/opt/overgarden/meilisearch-upgrade` with committed Compose `docker-compose.meilisearch.yml`.
- OVE-228 preflight capacity contract: Linux memory comes from
  `/proc/meminfo`; Docker storage location comes from Docker's
  `.DockerRootDir`; free storage comes from POSIX `df -Pk` and is measured in
  KiB. The immutable safety floors are 2.5 GiB total RAM plus swap, 1 GiB
  available RAM plus free swap, and 5 GiB free on both `/opt/overgarden` and
  Docker root. Missing, nonnumeric, zero, or below-floor values fail before any
  snapshot, provision, rebuild, cutover, rollback, forward, alias, volume, or
  index mutation. `OVERGARDEN_MEILI_MEMINFO_PATH` is accepted only with the
  hermetic test flag, which permits only `preflight`, `status`, and `help`.
  The same preflight is repeatable before and after upgrade: active `1.15.x`
  reports `upgrade_required` only with its running legacy container and volume;
  active `1.48.1` reports `already_target` only with the target container,
  versioned target volume, and retained legacy rollback volume all present.
- Pre-cutover audit source: production `pkgVersion=1.15.2` with catalog document count class ~61888 and journal count class 4.
- Live proof on 2026-07-23: preflight accepted `1.15.2` → pinned `1.48.1` dual-volume rebuild; dump+snapshot tasks succeeded; provisioned digest-pinned next volume; rebuild reached catalog `61888`; journals converged via OVE-196 parity apply to `69`/`69` zero-gap; cutover, rollback rehearsal, and forward restored active `1.48.1` with legacy volume `overgarden_meili_data` retained; public `/health` `available`; Cyrillic catalog typeahead returned nonzero hits class; matching handler canary proved journal index/unindex/restore with cover-safe keys (`leakCheck=passed`).

Worker and search invariants:

- Meilisearch is a derived public index only; Postgres remains the source of truth.
- `MEILI_MASTER_KEY`, `MEILISEARCH_API_KEY`, and `MATCHING_SERVICE_TOKEN` must stay only in platform/env secret stores.
- Do not expose Meilisearch keys, worker env files, database URLs, canary row identifiers, or indexed journal text in docs, Linear, or chat.
- `matching-worker` must process the exact six-handler manifest
  `catalog_alias_suggestions_refresh`,
  `catalog_fuzzy_duplicate_qa_refresh`,
  `catalog_match_suggestions_refresh`, `catalog_typeahead_reindex`,
  `journal_entry_index`, and `journal_entry_unindex` idempotently and reclaim
  stale `processing` rows after the visibility timeout. The canonical manifest
  is `services/matching/app/job_handlers.py`; dispatch, heartbeat, CI sealing,
  deployment, and runtime smoke must all use it rather than duplicating a
  smaller capability claim.
- Runtime writer: `services/matching/app/search.py:journal_entry_search_document_from_row`.
- Machine-readable contract: `contracts/search/public-journal-entry-search-document.json`.
- `journal_entries` index documents may contain only the current public-safe
  machine contract: required keys `body`, `coverSource`, `createdAt`,
  `entryDate`, `entryScope`, `id`, `kind`, `locationVisibility`, `noindex`,
  `publicPath`, `publicSlug`, `qualityClass`, `qualityReasons`, and `title`,
  plus optional `coarseRegionCode` only when `locationVisibility = region` and
  optional `coverPublicUrl` only for the admitted converted public derivative.
  `qualityClass` is the closed `ove331.qualityClass.v1` set `verified`,
  `partial`, or `unverified`; public-journal reasons are limited to
  `coarse_region_unavailable` and `media_projection_unresolved`. Missing coarse
  region or optional cover state may lower derived quality, but precise
  coordinates remain a hard exclusion and never become a quality reason.
  Earlier OVE-36/OVE-39 evidence predates the additive `entryScope`, cover, and
  quality fields and remains a historical exact-shape record.
- No owner/user IDs, space IDs, plant object IDs, precise location, raw coarse-location columns, media keys, quarantine/original keys, signed URLs, request metadata, IPs, user agents, referrers, invite data, or private journal state may enter Meilisearch documents.

Process management and recovery (OVE-39):

- Process manager: Docker Compose under `/opt/overgarden` on `overgarden-worker-prod-fra1`, containers `meilisearch`, `matching-worker`, `caddy` (Caddy terminates TLS). The `matching-api` service was retired by OVE-357 and is defined in neither compose file.
- Restart policy: live-confirmed on 2026-06-29 as `unless-stopped` for `matching-worker`, `meilisearch`, and `caddy`, so the worker and Meilisearch return automatically after a process crash or droplet reboot.
- Health endpoints: Meilisearch `https://meili.over.garden/health` (status `available`) passed on 2026-06-29 and again after the OVE-357 teardown on 2026-09-03. Worker liveness comes from the heartbeat row through `pnpm smoke:matching-queue-health` and `pnpm smoke:matching-runtime-capabilities`, not from an HTTP endpoint.
- Stale-job reclaim: the worker claims `job_queue` rows with `FOR UPDATE SKIP LOCKED` and reclaims rows stuck in `processing` once `locked_at` is older than `WORKER_VT_SECONDS` (default 30s). Deterministic catalog matching uses the code-default `CATALOG_MATCH_WORKER_VT_SECONDS` lease (300s), plus a persisted rerun request and claim-token compare-and-set completion, so a concurrent operator rescan cannot be swallowed by the older claim. Handlers are idempotent (Meilisearch upsert by primary key / delete by id; catalog suggestion upsert by source/candidate/kind), so at-least-once re-delivery after a restart cannot duplicate or corrupt derived state. Failed jobs back off `WORKER_VT_SECONDS` and retry; unknown job kinds fail with `last_error` instead of being marked done.
- Local recovery proof: `services/matching/tests/test_worker_recovery.py` deterministically proves reclaim-after-timeout, `journal_entry_index`/`journal_entry_unindex` reaching `done` after a simulated restart, the public-safe document contract, idempotent re-delivery, and fail-then-recover when Meilisearch is briefly unavailable. It runs with `uv run --frozen pytest` and needs no live services.
- Live restart smoke (2026-06-29, redacted): restarted only `matching-worker`, confirmed it returned `Up`, then published a canary through the production app path and confirmed `journal_entry_index` reached `done` in one attempt. The Meilisearch `journal_entries` document had exactly the public-safe keys `body`, `createdAt`, `entryDate`, `id`, `kind`, `locationVisibility`, `noindex`, `publicPath`, `publicSlug`, and `title`, with `noindex = true`, `locationVisibility = hidden`, and no forbidden owner/user IDs, media keys, precise location, IPs, user agents, or referrers. Archiving the same canary confirmed `journal_entry_unindex` reached `done` in one attempt, the Meilisearch document returned `404`, and the old public URL returned `410`. Record only job-state classes, document presence/absence, document key names, and privacy booleans.
- Future non-Docker replacement gate (OVE-76): keep Docker Compose here unless a separate production migration live-proves equivalent process restart/reboot recovery, matching and Meilisearch health, journal publish index completion, journal archive unindex completion, and the same public-safe document contract. Redacted evidence only; never record DB URLs, worker env files, Meili keys, journal text, IPs, user agents, or user-tied row identifiers.

Immutable matching release contract (OVE-190):

- Live status: pass on 2026-07-18. Production API and worker run exact tested-main
  source `710ac0c74559cea698946be31eeea856f0644fb4` from immutable release B;
  the exact-six canary, A/B activation, rollback, forward, final worker restart,
  and redacted external readiness proof passed.
- Publisher: `.github/workflows/matching-image.yml`. It accepts only an exact
  lowercase 40-character SHA contained in `origin/main`, installs
  `uv==0.11.24`, compiles all Python modules, runs frozen Ruff, and runs the full
  frozen matching test suite before a registry write.
- Artifact identity: private GHCR repository class, unique
  `sha-<full-sha>-run-<run-id>-<attempt>` tag, immutable `sha256:` registry
  digest, and a 90-day checksummed Actions artifact containing `release.json`,
  `matching-capabilities.json`, and the compressed exact-image archive. No
  `latest` tag is produced. The registry digest is canonical even though the
  authenticated operator transfers the sealed archive to the droplet so no
  persistent GHCR credential is installed there.
- Production files: `/opt/overgarden/matching-release`,
  `/opt/overgarden/docker-compose.release.yml`, and
  `/opt/overgarden/0002_matching_worker_heartbeats.sql`, sourced from
  `infra/production-worker/`. The pre-existing secret-bearing `worker.env`,
  Caddy, Meilisearch, and `overgarden_default` network remain in place.
- Runtime class remains `production-linux-required`. Docker Compose is the
  committed DigitalOcean Linux process manager for API and worker; this is the
  OVE-76 production exception, not permission to replace the Apple
  Container-first supported-Mac local path.
- Release contract: schema `ove190.matchingRelease.v1`, runtime contract
  `ove190-v1`, runtime API schema `ove190.matchingRuntime.v1`, schema
  compatibility `ove190.matching-schema.v1`, queue `matching`, one exact SHA,
  and one exact digest shared by API and worker.
- `GET /health` is API liveness only. `GET /capabilities` proves immutable
  release identity and the exact six-handler list. `GET /ready` adds Postgres,
  queue schema, Meilisearch, and same-release worker-heartbeat parity; it returns
  HTTP `503` when any dependency or parity gate is degraded.
- Public readiness output is deliberately bounded: dependency
  `available`/`unavailable`; queue `schema_mismatch`; worker
  `missing`/`stale`/`release_mismatch`/`capability_mismatch`; queue depth
  `empty`/`low`/`medium`/`high`; due-work lag
  `none`/`fresh`/`delayed`/`stale`. Raw counts, hosts, DSNs, exception text,
  payloads, row/user identifiers, content, and location are forbidden.
- `matching_worker_heartbeats` is an additive, idempotent production schema
  boundary. Its one `matching` row contains only release SHA, image digest,
  schema class, sorted supported handlers, and heartbeat timestamps. It must
  never grow hostname, process, error, payload, user, connection, or location
  fields. A heartbeat older than 30 seconds is not ready. The worker maintains
  the heartbeat through an independent bounded database connection while an
  active claim renews its lease every 10 seconds using the exact claim token;
  stale tokens cannot renew reclaimed or completed work.
- Meilisearch transport calls are bounded at 10 seconds and async task polling
  at 120 seconds with 250 ms intervals. Only an explicit `succeeded` task may
  complete a queue job; retryable queue failure states remain eligible for the
  bounded canary retry path.
- The current small worker host has a persistent 2 GiB `/swapfile` with
  `vm.swappiness=10`. Normal install/activation fails closed below 2.5 GiB
  combined RAM+active swap, below 1 GiB available RAM+free swap, or below 5 GiB
  plus archive size on either the release or Docker-root filesystem. Expensive
  archive/client operations use reduced CPU/I/O priority and a 30-minute bound.
  Explicit rollback remains capacity-gate independent so recovery is not
  rejected solely by the normal capacity gate. A paid host resize requires a
  separate capacity decision.
- The final release B install live-proved the disk floor by refusing while
  obsolete, unreferenced release generations consumed required headroom. The
  threshold was not weakened: pointer-aware cleanup removed only reconstructible
  release/image copies outside current, previous, forward, running, and new-A
  state. The retry passed, final A/B remain the only sealed rollback pair, and
  no volume or production data was removed.
- Deployment order is install release A, install release B, migrate A, deploy
  A, deploy B, rollback to immediately prior digest A, then forward to B. A and
  B are distinct immutable workflow-run digests built from the same exact
  tested main SHA. Each activation performs schema/queue/Postgres/Meilisearch
  preflight before replacement, then verifies API/worker equality to the
  receiving daemon's checksum-and-config-verified loaded image ID,
  capability equality, and dependency-aware readiness. Failed activation
  restores the prior release.
- Binding host commands and redaction rules are in
  `infra/production-worker/README.md`. External proof command:
  `cd apps/web && pnpm smoke:matching-runtime-capabilities -- --expected-commit <full-main-sha> --expected-digest sha256:<digest>`.
  `--base-url` was retired with the matching API under OVE-357 and is now
  refused rather than ignored; the proof reads the worker heartbeat row.
- All-handler production proof uses `python -m app.canary` inside the active
  `matching-worker` and refuses to execute unless
  `OVERGARDEN_MATCHING_CANARY_APPROVED=true` is supplied for that command. It
  reuses eligible records, changes only derived/advisory state, restores the
  journal search document after index/unindex proof, and never changes a
  canonical catalog decision or user content.

OVE-190 live release evidence:

```text
verified_at_utc: 2026-07-18T09:55:27Z
main_commit_sha: 710ac0c74559cea698946be31eeea856f0644fb4
main_ci_run: 29639178461
release_a_digest: sha256:c11d80b9815e21dc3d02996666a4b90005093a819d2c9bdd614109fe6862c8e9
release_b_digest: sha256:188bc9359b27315c54ef417d5437719ba7fe96dcf09e73406112d96f82879600
matching_image_workflow_runs: 29639178486, 29639190206
capability_smoke: pass
runtime_schema: ove190.matchingRuntime.v1
schema_compatibility: ove190.matching-schema.v1
handlers: exact-six-pass
dependencies: api=available, postgres=available, jobQueue=available, meilisearch=available, worker=available
queue_buckets: depth=empty, lag=none
handler_canary: six-done-and-journal-restored
rollback: release-b-to-immediately-prior-release-a-pass
forward: release-a-to-release-b-pass
worker_restart_recovery: fresh-heartbeat-and-exact-release-b-pass
host_resource_safety: persistent-swap-and-capacity-controller-pass
active_digest_after_forward: sha256:188bc9359b27315c54ef417d5437719ba7fe96dcf09e73406112d96f82879600
result: pass
redaction: pass; no secrets, env contents, payloads, row/user ids, content, precise location, hosts, IPs, user agents, or raw errors
```

OVE-242 superseding production rollout evidence:

```text
verified_at_utc: 2026-07-28T19:07:00Z
runtime_source_sha: bbda84156d4c6bd3088cd208913ae45544d89b64
release_a_digest: sha256:ba428c5ae55249e784857064ac05e0011b4f180c24605e65d7790b306cc52e99
release_b_digest: sha256:fd063367e46f501aee4eafe6e037cfa136581c425b5a462bf21c2660b36223a4
matching_image_workflow_runs: 30386916883, 30387886356
active_digest_after_forward: sha256:fd063367e46f501aee4eafe6e037cfa136581c425b5a462bf21c2660b36223a4
database_binding: authoritative Vercel production DIRECT_URL; digest-compared without exposing the value
application_schema: 0011_ove242_public_projection_outbox.sql additive transaction applied
runtime_readiness: exact-sha-and-digest-pass; exact-six-handlers; all dependencies available
queue_buckets: depth=empty, lag=none, unsupportedRetryingClass=none, terminalCountClass=low
public_index_repair_plan: reindex=4, unindexDelete=69, deleteInvalid=0
public_index_after: zeroGap=true, expected=4, observed=4, every gap class zero
rollback_forward: release-b-to-release-a-to-release-b-pass
cleanup: inactive reconstructible build cache/releases removed; temporary secret backup removed; production data and volumes preserved
result: pass
redaction: pass; no secrets, env contents, payloads, row/user ids, content, precise location, hosts, IPs, user agents, or raw errors
```

Production public-index parity binding invariant (OVE-331): invoke
`smoke:public-index-parity:production`, which starts the pinned Vercel CLI from
a fresh temporary working directory. The underlying parity command refuses a
production run whenever its working directory contains `.env.local` or the
wrapper isolation marker is absent. The wrapper also removes inherited
database, Meilisearch, matching-service, dotenv, and `NODE_OPTIONS` overrides
before the provider fetch. This keeps repo-local or ambient state from
replacing the provider-fetched production bindings; local and recovery-drill
dotenv behavior is unchanged. Receipts remain limited to aggregate classes,
counts, and safe hashes.

OVE-194 live queue-recovery evidence:

```text
verified_at_utc: 2026-07-23T13:31:18Z
main_commit_sha: 4e5385d55ac4ecda8c0c78d9493c5271a4d0a576
vercel_deployment: dpl_5xPJcpyvhkq6L43HzbcLUBA1aooC READY
matching_image_workflow: budget-frozen; isolated host seal releaseRun=19400000001.1
active_digest: sha256:85134c4e551e544034935c399e9aec8dfe5d0dd387eb308cd5c80ae3bd3cafb2
runtime_schema: ove194.matchingRuntime.v1
schema_compatibility: ove190.matching-schema.v1
queue_recovery: claimCompatible=available, handlerCompatible=available, unsupportedRetryingClass=none, terminalCountClass=empty, oldestDueAgeClass=none
dead_letter_canary: supportedSuccess+unsupportedTerminalized+unsupportedNotReclaimed+authorizedReplay pass
smoke_matching_queue_health: pass
result: pass
redaction: pass; no secrets, env contents, payloads, row/user ids, content, precise location, hosts, IPs, user agents, or raw errors
```

OVE-196 live public-index parity evidence:

```text
verified_at_utc: 2026-07-23T15:55:00Z
main_commit_sha: 3eb1506355a4e613ca2ff11a79dde39378329ee6
behavior_commit_sha: 45c712be638ead7f45e3e2e9e011ef0b46502f7a
vercel_deployment: dpl_5Khunrs83rBmQvcf7HH7Wg4AFx6v READY
matching_image_workflow: budget-frozen; isolated host seal releaseRun=19600000001.1
active_digest: sha256:aa1bef90176371a7755439191cfbea59674a171782c95c3eab0fcd2006f8b805
additive_sql: 0005_ove202_ove207_journal_document_cover.sql applied
parity_before: zeroGap=false; unsafe_schema class non-zero; counts/booleans only
parity_after_apply: zeroGap=true; expected=4; meiliDocumentCount=4; all gap classes zero
smoke_matching_queue_health: pass; leakCheck=passed
result: pass
redaction: pass; no secrets, env contents, payloads, row/user ids, content, precise location, hosts, IPs, user agents, or raw errors
```

## Vercel

Status: project exists; production deployment is created from GitHub `main`; public Vercel access is enabled for the pilot URL.

Last verified: 2026-07-22 for OVE-205 exact-main market-aware localization,
canonical production proof, and branch-scoped release Preview build repair.

Team:

- Team name: `yehor's projects`
- Team slug: `yehors-projects-01221e2b`
- Team ID: `team_vs3oQAk6OT4vVVvcL7Mf5m8t`

Project:

- Project name: `over-garden`
- Project ID: `prj_Tm5HXFEPqc46StpIfsoKjU9GtHBy`
- Framework: `nextjs`
- Vercel project live flag: `false` at verification time
- Node version reported by project API: `24.x`
- OVE-246 repository runtime floor: Node `22`. Authenticated Vercel CLI
  read-back on 2026-08-01 reported project Node `24.x`, which satisfies the
  declared floor. The platform setting is recorded, not mutated by this
  repository remediation.
- Authenticated Vercel billing read-back on 2026-07-29: `Hobby`. This plan
  accepts daily Cron expressions only; it must not be configured with an
  hourly or sub-hourly recovery schedule.

Function execution region (2026-09-01):

- Declared in `apps/web/vercel.json` as `"regions": ["fra1"]`, not in the
  dashboard, so the value is version-controlled and travels with the
  deployment that carries it.
- `fra1` is Frankfurt, `eu-central-1`. It is chosen to match the managed
  database `overgarden-postgres-prod-fra1`, the worker droplet
  `overgarden-worker-prod-fra1`, and the European upstreams the ingestion
  paths call (`api.eppo.int`, `api.gbif.org`, `data.europa.eu`). Vercel's own
  guidance is that functions should execute in the same region as the
  database.
- Before this change the project ran on the platform default `iad1`
  (Washington, D.C.). That was never chosen; `iad1` is the default for all new
  projects. Measured on 2026-09-01 across 48 samples on four cache-busted
  targets, every response carried `x-vercel-id: fra1::iad1::…` — the request
  entered at the Frankfurt point of presence and executed in Virginia, then
  reached back across the Atlantic for every database round trip. The garden
  workspace inventory read costs four such round trips (OVE-360), which is the
  section observed returning `query_timeout`.
- Plan constraint: Hobby permits a **single** function region, not a fixed
  one. Selecting `fra1` therefore needs no paid plan. Pro would allow five
  regions, which this project does not need.
- Live receipt after the cutover (2026-09-01, merge commit `6a18c53`): the
  execution region reported `fra1` about four minutes after merge, and the
  same 48-sample probe over the same four cache-busted targets reported
  `fra1` for every sample. Median time to first byte, before then after:
  `/ua/feed` 301 -> 238 ms, `/ua/knowledge` 288 -> 203 ms, `/ru/feed`
  295 -> 197 ms, `/api/health` 275 -> 184 ms. Fastest observed sample fell by
  80-91 ms on every target, which is the transatlantic round trip no longer
  being paid.
- What the receipt does **not** cover: these are unauthenticated public
  targets. The four-round-trip garden workspace inventory read is behind a
  session and was not exercised, so the largest predicted gain is reasoned,
  not measured. Whether `query_timeout` on that section becomes rarer is still
  open and needs its own observation.
- Reading the live value: `curl -sS -D - -o /dev/null https://over.garden/api/health`
  and read `x-vercel-id`. The middle segment is the execution region; a
  two-segment value means the response came from the CDN without invoking a
  function, so it proves nothing about the region.

OVE-205 behavior deployment at verification time:

- Deployment ID: `dpl_719iz4kshXu7zrk5qzYXwQ3CmFUA`
- Canonical URL: `https://over.garden`
- Immutable URL: `https://over-garden-qda7r8e4b-yehors-projects-01221e2b.vercel.app`
- Ready state: `READY`
- Target: `production`
- Source: GitHub-integrated production deployment for OVE-205 market-aware localization
- GitHub ref: `main`
- GitHub commit: `b6145c1a3c176df5ef8634961b5d5642d5b87cbf`
- GitHub commit message: `feat(localization): add safe market-aware locale switching`
- GitHub commit verification: `verified`
- Alias equality: passed for apex, `www`, project, git-main, and immutable deployment URLs.
- OVE-205 (2026-07-22): exact-SHA CI, immutable matching-image release, schema-v3 static coverage, the fresh 171-scenario/eight-viewport browser matrix, full tests, generated database types, lint, typecheck, visual fixtures, accessibility checks, and production build passed. A fresh browser on the default A1 Bulgaria connection proved apex and `www` route to `/bg`, return Bulgarian document/header language, render exactly one visible shared control, and complete a real `bg` to `ru` switch. Two independent Ukraine egress nodes observed the Ukraine-only root `200` on the immutable deployment while a Bulgaria node observed the expected `/bg` redirect; exact-SHA candidate-browser evidence separately proves the resulting Ukrainian body language and zero-control invariant. Resolver parity passed `14/14`. A redacted real archived journal produced hard `410`, `noindex,nofollow`, `private,no-store`, Bulgarian document language, and exactly one control on canonical and immutable hosts. Evidence excludes the tombstone slug, identities, IP addresses, cities, cookies, user agents, private content, and secrets.

Production aliases and domain bindings:

- `over.garden`
- `www.over.garden`
- `over-garden.vercel.app`
- `over-garden-yehors-projects-01221e2b.vercel.app`
- `over-garden-git-main-yehors-projects-01221e2b.vercel.app`

Domain status:

- `over.garden` and `www.over.garden` are attached to the Vercel project and point at Vercel through DNS-only Cloudflare A records.
- The public media domain `media.over.garden` is Cloudflare R2-managed and separate from the app domain.

Public access observation:

- On 2026-06-27, fetching `https://over-garden-fuscx66ir-yehors-projects-01221e2b.vercel.app/health` returned HTTP `302` to Vercel SSO instead of OverGarden HTML.
- Response headers included `cache-control: no-store, max-age=0` and `x-robots-tag: noindex`.
- This is acceptable for protected preview inspection, but it blocks public visitor/crawler H6 smoke until a public production URL or authenticated preview-share flow is intentionally selected and documented.
- Later on 2026-06-27, `https://over-garden.vercel.app/health`, `/`, and `/privacy` returned HTTP `200` OverGarden HTML without Vercel SSO.
- On 2026-06-28 (OVE-37, current main `a8cd3c95`), `https://over-garden.vercel.app/`, `/health`, and `/privacy` again returned HTTP `200` OverGarden HTML without Vercel SSO.
- On 2026-06-29 (OVE-51), `https://over.garden/`, `/health`, and `/privacy` returned HTTP `200` OverGarden responses without Vercel SSO. `https://www.over.garden/` also returned `200`. App HTML responses had Vercel response IDs and no Cloudflare cache status because app DNS is DNS-only; any future Cloudflare HTML `HIT` would be a launch blocker.
- On 2026-07-02 (OVE-111), production deployment `dpl_BKKuu8jDgChRQLLN6mCKbqbCruop` for main commit `183962c13a026f2a215951c171b5095b455feae3` was `READY` and aliased to `https://over.garden`. Redacted OAuth smoke confirmed `/garden` rendered the Google option, `/api/auth/sign-in/social` returned a Google authorization URL, the generated redirect URI was exactly `https://over.garden/api/auth/callback/google`, and Google did not return `redirect_uri_mismatch`, `INVALID_ORIGIN`, or `origin_mismatch` on authorization start. Evidence excluded client id, client secret, state, cookies, OAuth tokens, and callback query parameters.
- On 2026-07-02 (OVE-112), historical production deployment `dpl_49ThewAMcDKZKxRPJDv3NuoViScg` for main commit `e5496c3e2454c5c2dcf7c39a785f51697b81f33e` was `READY` and aliased to `https://over.garden`. Its redacted receipt proved the then-current Meta social-provider authorization start without recording provider credentials or auth artifacts. OVE-296 supersedes that product surface; it is historical provenance only and is not current configuration authority.
- On 2026-07-12 (OVE-180), production deployment `dpl_EGsxUqACCpKpxJ83t7784u333VkY` for main commit `dac896e896d315b621b6903b597f74a634d43b1b` was `READY`, verified, and aliased to `https://over.garden`. Redacted canonical-host smoke proved the active profile route class returns `200`, Bulgarian content language, `private, no-store`, profile V2 markup, and `noindex`; a valid missing profile returns the generic Bulgarian hard `404` with `noindex, nofollow`; and guest follow returns a `303` opaque intent, sign-in dialog, and exact localized return path without mutation. Google Public DNS and Cloudflare DNS-over-HTTPS both returned Vercel's public `76.76.21.21`, where canonical SNI/Host smoke passed. This workstation's LAN resolver returned a different unreachable address, so a direct local-browser canonical request timed out; exact READY-deployment browser smoke and canonical smoke through the public authoritative answer both passed. Evidence excluded live handles, profile content, relationship rows, emails, cookies, tokens, media keys, raw request metadata, and precise location.
- On 2026-07-18 (OVE-204), production deployment `dpl_3Qu9hvUGn6KdCqbxgEZbZf7nDqaJ` for exact main commit `31954a11f8405a9b125e3ea67963bb0ce963b5f3` was `READY`, verified by filtered deployment metadata, and aliased to `https://over.garden` and `https://www.over.garden`. Canonical traffic returned `200` and resolved to the Bulgarian market root. Bounded two-session and real-browser proof covered current-session-only revocation, cross-tab/private-tree convergence, protected-route denial, continuity, provider-link preservation, and zero synthetic residue without recording identities, credentials, cookies, tokens, OAuth parameters, or private content.
- On 2026-07-22 (OVE-205), production deployment `dpl_719iz4kshXu7zrk5qzYXwQ3CmFUA` for exact main commit `b6145c1a3c176df5ef8634961b5d5642d5b87cbf` was `READY`, GitHub-verified, and owned apex, `www`, project, git-main, and immutable aliases. Default-A1 browser proof covered Bulgaria default routing, one-control ownership, and a real Russian switch; two independent Ukraine egress route decisions plus the exact-SHA browser matrix proved the market split without recording request metadata. Resolver parity was `14 pass / 0 mismatch / 0 error`, and a redacted production tombstone proved the real hard-`410` lifecycle contract on canonical and immutable hosts.

Deployment env observation:

- On 2026-06-27, the Vercel project had `BETTER_AUTH_SECRET` installed for production, development, and the branch preview `codex/ove-27-production-pilot-smoke`.
- Historical runtime auth was fail-closed for production-like environments when `BETTER_AUTH_SECRET` was missing, placeholder-like, or equal to the local development fallback. OVE-240 supersedes this serving contract with a declared versioned current key; do not rely on local/test fallback behavior for any deployed production or preview app.
- On 2026-07-18, the automatic Vercel Preview for release ref `codex/ove-203-release` and commit `1edffc351c1c3132f97608083b4b6ea6a63e9a12` failed during page-data collection because that branch had no Preview `BETTER_AUTH_SECRET`. A newly generated Sensitive secret was added only to that exact Preview branch; no value was printed, stored in git, or copied from production. Redeploy `dpl_9kg2jMn9QNem6NiKEpAuaLxYjNSJ` reached `READY`, compiled all `61` static pages, and replaced the branch alias without an auth-secret, page-collection, or terminal build error. Its public `noindex` health route reports auth configured and database unavailable by design: this release Preview has no production database, R2, email-provider, or other production credentials and is build-only evidence, not authenticated/data runtime proof. Canonical production remained `READY` on `dpl_5xQ7jAduBePLg77Z173ni2jyzKNM` throughout the repair.
- On 2026-07-22, the OVE-188 closeout Preview for ref `codex/ove-188-closeout` and commit `15493e1ed00adda7216b7564a50725a7dcd04a25` failed closed during page-data collection because that branch had no Preview `BETTER_AUTH_SECRET`. A newly generated Sensitive secret was added only to that exact Preview branch; its value was not printed, stored in git, or copied from Production. Cache-free redeploy `dpl_AqByS7RdfFJQyL9beDAr6kC4dsXS` reached `READY`, generated all `61` static pages, passed the walking-skeleton postbuild boundary, and updated the GitHub Vercel check to success. The Preview remains build-only evidence with no production database or other production credentials; canonical Production was not promoted or mutated by this repair.
- On 2026-06-27, the Vercel project had the R2 runtime env family installed for production, development, and the branch preview: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_FORCE_PATH_STYLE`, `R2_QUARANTINE_BUCKET`, `R2_PUBLIC_BUCKET`, and `R2_PUBLIC_BASE_URL`. This is historical inventory only: OVE-349 later removed `R2_QUARANTINE_BUCKET` from every active Vercel target, and OVE-350 deleted its provider resource.
- On 2026-06-27, the Vercel project had `DATABASE_SSL=true` installed for production, development, and the branch preview.
- On 2026-06-27, the Vercel project had `DATABASE_URL`, `DIRECT_URL`, and `DATABASE_SSL_CA` installed for production and the branch preview `codex/ove-27-production-pilot-smoke`.
- On 2026-06-29 (OVE-51), production `PUBLIC_SITE_URL` and `BETTER_AUTH_URL` were updated to the canonical origin `https://over.garden`. Future production readiness checks fail if Vercel production uses the legacy `.vercel.app` alias for either value.
- Historical OVE-51 receipt (superseded by OVE-314): the former product-access signing setting was installed on 2026-06-29. OVE-314 requires its exact-name removal from production, preview, and development only after database completion; its value must never be read or recorded.
- OVE-111 Google OAuth uses a Google Cloud Web application client. Required authorized redirect URIs are `http://localhost:3000/api/auth/callback/google` for local testing and `https://over.garden/api/auth/callback/google` for production. On 2026-07-02, production Vercel env gained `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; authenticated CLI `vercel env run -e production` confirmed only boolean configured/not-placeholder state. Values are secrets or provider credentials and must not be recorded here.
- OVE-295 separates explicit Google account linking from ordinary Google sign-in with the non-secret server flag `GOOGLE_ACCOUNT_LINKING_ENABLED`. Only trimmed exact `true` plus configured Google credentials enables the native link caller; absent, empty, false, or malformed values fail closed while existing connected methods remain visible. OVE-295 deliberately shipped with the flag absent and migration `0022` unapplied. OVE-298 subsequently owned the authorized production duplicate-group preflight, application of both partial Google unique indexes, flag enablement, live callback/link-unlink proof, rollback read-back, and disposable fixture cleanup.
- OVE-298 terminal second-retry proof on 2026-08-12 reports `googleAccountRowCount=1` with zero duplicate Google-subject groups, zero duplicate Google-user groups, zero missing Google subjects, and zero invalid Google-provider rows. Migration `0022` digest is `6392a41f971176eb9de748f54fc15beb76a6a77f8a755694d327fe8eae40f6bd`; the redacted database-target digest is `84503a97fba4e9febf14db87091ce05d2866796d78109f812a649c23f9c36462`. Both approved indexes are exact with definition digests `fed091a72b61aa8d9b9573dadeeb345dbcdea979b7173154dddac81a9fbe7dbe` and `9e68f3c994090992c14869a501de524e96135484426b03dca2211b3bcdba4e66`. The initial attempt ended before callback and the first retry reached callback after the one-time OAuth state expired; both failed closed and were separately cleaned. The approved second retry completed one ordinary credential-account link, authoritative credential-plus-Google read-back with unchanged identity/content digests, fresh credential session, unlink, provider revocation, and canonical erasure. Final inventory returned to `1/0/0/0/0`, both indexes remained exact, `GOOGLE_ACCOUNT_LINKING_ENABLED` remained present/effective, and the sealed owner remained verified credential-only with exactly four avatar-menu operator links. Current-main deployment `dpl_EcPeDH6WY9pLJTDriu2Bi4Y7DtT6` is READY for `a167afe5caacdadd9fa95d5c8ba3db4d396d358e` on apex, `www`, and its immutable URL. Receipt schema `overgarden.google-linking-production-receipt.v1` passed with digest `eaa3c51b565aee03066da6d743215deb36d09d5862ca80d54e7465ef5bfa8262`; its evidence digest is `41c68b8b029af8290947f1d9bef27e1041853575e19bbbe141fe64c5b2c59530`. The disposable identity, grant, sessions, inbox, request identity, browser profile, secrets, and local approval/proof artifacts are absent. Future provider, database, deployment, or configuration drift requires a new read-only proof; this receipt authorizes no further effect.
- OVE-296 removes the former Meta social sign-in provider from Better Auth registration, product UI, repository env templates, readiness checks, current smoke, and current operator documentation. The only retained app behavior is a generic no-effect denial for stale provider initiation/callback traffic. OVE-297 owns the separate bounded inventory and cleanup of dormant production provider state; no dormant credential, account row, or provider-console object is current product configuration, and none may be copied into evidence.
- OVE-291 adds no provider, database, storage, DNS, or Vercel configuration. Its immutable-deployment read-back imports only the bounded deployment-receipt artifact and exposes its schema, counts, and digests; the full registry and enforcement graph are build-time-only. The reject-only production smoke requires two private synthetic session cookies supplied outside git, logs, Linear, and chat; it uses the existing production database connection only for bounded before/after counts and refuses loopback targets. It must not invoke `/api/auth/link-social` or the Google callback, and it records no identity, cookie, generation, OAuth URL/state, provider payload, content, media key, precise location, or request metadata.
- OVE-113/OVE-314 owner auth policy: Google is a gardener sign-in provider only. The sealed owner has a verified email and exactly one password-bearing `credential` account. The gate denies unverified, passwordless, duplicate-credential, or social-linked accounts even when an internal role row exists. There is no `/admin` or `/admin/users` UI; four surviving operator destinations appear conditionally in the ordinary avatar menu and repeat direct server authorization. This boundary requires no new provider env value.
- On 2026-07-18, production `OVERGARDEN_ADMIN_OWNER_USER_ID` was force-replaced as a Vercel Sensitive environment variable from a private, redacted production-DB identity proof and the existing `main` artifact was redeployed as `dpl_HGtt9xVyo4ZGvqMTFhAVn9hx8onx`, which reached `READY` and was aliased to `over.garden`. No user id, email, password hash, session, database credential, or env value was printed or recorded. Sensitive values cannot be read back through normal CLI env execution, so do not interpret an unreadable value as blank; prove changes through the controlled write result, a new deployment, database invariants, and authenticated runtime behavior.
- OVE-127 self-serve auth email uses Resend for transactional Better Auth email verification and password recovery only. Runtime env names are `RESEND_API_KEY` (secret), `RESEND_AUTH_FROM` (sender, for example `OverGarden <auth@over.garden>`), and optional `RESEND_AUTH_REPLY_TO`; production auth email links must use the canonical origin `https://over.garden`. Readiness/smoke evidence may record provider class, sender domain class, delivery success/failure class, and canonical origin class only. Never record Resend API keys, provider message IDs, recipient email addresses, reset/verification tokens, tokenized URLs, provider payloads, or marketing campaign data. Resend sender/domain verification and live delivery still require redacted operator smoke before launch claims.
- OVE-232 pins Better Auth to an exact stable patched package/lock resolution and adds `pnpm auth:security:check` as the repository admission guard. It verifies dependency class and configured auth-boundary classes locally without reading or emitting Vercel, Resend, OAuth, session, user, token, or secret values. It is not a provider readiness or delivery receipt: retain the OVE-127/OVE-141 redacted delivery boundary, OVE-241 reset timing boundary, and OVE-226 exact-SHA production journey.
- OVE-241 password-reset delivery uses `auth_email_outbox`, not a requester-path
  Resend call. After durable local admission, the Next route schedules one
  60-second-bounded `after()` drain; the Vercel Hobby-compatible
  `/api/cron/auth-email-outbox` daily GET schedule is durable recovery only.
  The Cron route also permits a manual POST solely with `Authorization: Bearer
CRON_SECRET`. Authenticated production env-name read-back on 2026-07-29
  confirmed only that `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_AUTH_FROM`, and
  `RESEND_AUTH_REPLY_TO` are present; no values were read or recorded. The
  outbox stores no recipient, token, URL, user id, provider message id, or
  response body. Do not claim this schedule is live until the exact merged
  deployment and Cron listing both identify it.
- OVE-240 versioned Better Auth policy uses `BETTER_AUTH_SECRETS` as an
  encrypted production environment value containing an ordered
  `version:secret` set and `BETTER_AUTH_CURRENT_SECRET_VERSION` as non-secret
  metadata. Serving Production and Preview fail closed unless the
  declared current version is the first unique entry and that active entry is a
  canonical 32-byte base64url key class. `BETTER_AUTH_SECRET` is admitted only
  as a bounded legacy compatibility fallback: it must be an exact 32-byte
  standard Base64 or base64url key and have the non-secret, strict-UTC
  `BETTER_AUTH_LEGACY_GRACE_UNTIL` before the code-capped deadline. Any
  inadmissible or expired singular value is clean-cut from auth reads; the
  active versioned key is passed explicitly so Better Auth cannot fall back to
  the ambient legacy environment variable. The Vercel write order is:
  name-class read-back, independent cryptographic generation per target without
  output, encrypted versioned write, matching metadata write, exact-SHA
  deployment/read-back, then redacted health and continuity proof. Once a
  production deployment proves clean-cut behavior, remove the stale singular
  provider variable and redeploy the exact artifact. Provider evidence records
  only target, env-name/storage class, current version class, deployment
  identity/status, aliases, and pass/fail—never material, a digest, prefix,
  encoded/decoded size, token, cookie, callback parameter, identity, or
  provider payload. On 2026-07-30, OVE-237 proved that a Vercel Sensitive
  placement did not reach this project's server runtime: exact-main health
  stayed `closed` and the unauthenticated Better Auth session route returned
  `500`. The production value was recreated as the standard encrypted Vercel
  environment class, with matching current-version metadata. Exact-main
  deployment `dpl_6T1Nk7dGyFvPfDNq2pA7TmBo2Qg6` reached `READY`, owned every
  canonical alias, returned health class `versioned_current_v1` with database
  health, and returned `200` from the unauthenticated session route. No secret
  value, digest, prefix, size, cookie, identity, or provider payload was read
  or recorded.
- OVE-274 reserves `EPPO_DATA_PORTAL_API_KEY` for the standard encrypted
  Vercel Production environment class only. Do not use Vercel Sensitive for
  this variable: OVE-237 proved that class does not reach this project's server
  runtime. The bootstrap may read only name metadata before a write and must
  prove the value only through the bounded runtime verifier; never record,
  export, or print a credential. The exact operator procedure and redaction
  contract are in `docs/EPPO_CREDENTIAL_BOOTSTRAP.md`.
- OVE-254 owns the local-only EPPO observed-capture runtime described in
  `docs/EPPO_OBSERVED_CAPTURE.md`. It reuses the same encrypted
  `EPPO_DATA_PORTAL_API_KEY` without copying it, permits only the official
  `https://api.eppo.int/gd/v2` read surface, and writes raw evidence only to a
  dedicated Postgres source layer. Its command rejects non-loopback database
  targets, uses one provider request at a time, and creates no new hosted
  storage, queue, search, Vercel deployment, or provider-side resource. Safe
  receipts contain aggregate classes/counts and digests only. The observed
  capture is OverGarden-owned evidence, never an official EPPO release.
- OVE-247/OVE-248 account-method continuity now exposes Google only. Client OAuth starts may navigate only to the verified `accounts.google.com` HTTPS authorization host after Better Auth returns the URL with automatic redirect disabled. A Google link is allowed only from an authenticated session, including when the provider reports a different email. `disableImplicitLinking` remains required, so matching email alone never merges gardens. A final connected Google method opens an in-profile recovery dialog: a verified gardener may create a credential fallback and then explicitly unlink Google; an ineligible gardener receives a no-mutation verification/second-method recovery state. Better Auth remains the final-method backstop. Dormant rows for a retired provider stay out of the current projection and are handled only by OVE-297. Production proof must use disposable non-personal identities and retain only redacted method-state and deployment classes.
- On 2026-07-05, Google Analytics 4 page measurement was installed through a consent-first Google tag with public measurement id `G-71LP7XZ5NE`. On 2026-07-05, that loader was moved behind the consent-first Google Tag Manager container `GTM-W979KSX3`. The consent banner appears only on authored public, legal, and support pages; the external Google Tag Manager container must not load until the visitor accepts analytics. The tag is intentionally scoped away from private garden, operator, auth, erasure, journal, lineage, retired control-plane, API, and callback routes. The GTM account must publish a GA4 tag that sends to `G-71LP7XZ5NE`; app code only loads the container after consent.
- OVE-144 consent-first Meta Ads attribution is independent of all sign-in providers and remains unchanged by OVE-296. Runtime env names are `NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED` (single public kill switch), `NEXT_PUBLIC_META_PIXEL_ID` (public Pixel/Data Source id), `META_CONVERSIONS_API_ACCESS_TOKEN` (secret), optional `META_CONVERSIONS_API_TEST_EVENT_CODE`, and optional `META_CONVERSIONS_API_GRAPH_VERSION` (default implementation version `v23.0`, re-check Meta before enabling live if the dashboard recommends a newer version). The public flag must stay absent/false unless Meta Pixel/Data Source, CAPI token, Test Events proof, and privacy smoke are ready. App code never loads Meta Pixel before explicit marketing consent, never loads it on private garden/admin/auth/journal/API/callback routes, and never sends Meta journal text, private plant/object/catalog names, precise location, media keys/URLs, auth payloads, account identifiers, IP/user-agent evidence, provider cookies, or raw URLs/referrers. Implementation source checks on 2026-07-05 used Meta Pixel consent controls (`https://developers.facebook.com/docs/meta-pixel/implementation/gdpr`), Pixel+CAPI deduplication (`https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events`), and CAPI customer information parameter docs (`https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters/`).
- OVE-157 consent-first Microsoft Clarity is an optional UX observation layer for authored public, legal, and support pages only. Runtime env names are `NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED` (single public kill switch) and `NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID` (public Clarity project id). Keep `NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED` absent/false in production until the operator creates the Clarity project, verifies project settings and under-18 targeting constraints, and passes the privacy smoke. App code uses the NPM package `@microsoft/clarity`, never the raw GTM Custom HTML snippet, never loads Clarity before explicit analytics consent, calls Clarity consent v2 with ad storage denied and analytics storage granted, revokes Clarity analytics storage when the visitor moves to a disallowed route, never calls `Clarity.identify`, and never initializes Clarity on private garden, operator, auth, journal, lineage, retired control-plane, API, callback, or erasure routes. If Clarity is disabled, the consent flow and app must continue to work with Google Tag Manager only.
- OVE-112's 2026-07-02 source gate for the now-retired Meta social provider is historical provenance only. Its provider setup requirements do not authorize a current login surface, environment key, account mutation, or provider-console change. OVE-296 is the current repository authority and OVE-297 is the current production-cleanup authority.
- On 2026-06-27, the branch preview `codex/ove-27-production-pilot-smoke` had branch-specific `PUBLIC_SITE_URL` and `BETTER_AUTH_URL` set to `https://over-garden-git-codex-ove-27-pr-a698a5-yehors-projects-01221e2b.vercel.app`, then was redeployed so Better Auth accepted that preview origin during browser smoke.
- On 2026-06-27, legacy production `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, and empty `POSTGRES_*` variables were removed from Vercel after canonical runtime env was installed.
- On 2026-06-27, accidental trailing newlines were trimmed from the R2 runtime env family in production and the branch preview `codex/ove-27-production-pilot-smoke`.
- On 2026-06-28, production Vercel env gained `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MATCHING_SERVICE_URL`, and `MATCHING_SERVICE_TOKEN` for the deployed worker/Meilisearch runtime. Values are intentionally not recorded here.
- Product-access invite generation and operator-assisted pilot reset tooling are retired. Ordinary password recovery uses the canonical Better Auth/Resend outbox flow; do not recreate a private invite/reset command.
- Do not infer database readiness from the presence of env var names alone. The live smoke must prove a successful server-side database ping on the deployed app.
- Treat any surviving product-access invite setting, grant table, hint column, route, or caller as retirement drift. It is never a readiness signal.

Vercel invariants:

- OVE-191 walking-skeleton surfaces are never enabled in Vercel. Production and
  Preview must return a null-body `404` for the page and API before auth/data
  access. `WALKING_SKELETON_ENABLED` is a local-only two-key diagnostic gate;
  do not install it as true in any deployed environment. Exact-production proof
  belongs to the credential-free `smoke:drive2-production` result, which records
  only status classes and redaction booleans.
- Stable Registry flags are kill switches (ADR-0022, D5): they ship
  absent/false in the env example and are set to `true` in Vercel production by
  the owner (`vercel env add <NAME> production`). `STABLE_REGISTRY_RELEASE_CENTER`
  enables the owner's Release Center writes, `STABLE_REGISTRY_EXTENSION_PACKS`
  the pack lane, `STABLE_REGISTRY_EDITIONS` the edition lane; none refuses a
  Vercel deployment any more. `STABLE_REGISTRY_PUBLIC_DISCOVERY` enables the
  guest catalog and EPPO source explorer reads. `STABLE_REGISTRY_PRODUCT_SELECTION` (OVE-257)
  switches the authenticated picker, canonical fallback, and save validation
  from the compatibility predicate to the active-release product projection;
  turning it off returns to the compatibility predicate without changing any
  stored `catalog_item_id`. Evidence may record only the flag name, its
  present/absent/effective class, the active-release digest class, aggregate
  eligibility counts, and index parity booleans. Never record catalog identity
  names, source rows, release payloads, or user/object identifiers.
- OVE-259 owns the Stable Registry production landing and is the only issue in
  the program with a direct production-state mutation. Its harness cannot mutate
  production on its own: `--environment` must equal `--confirm-environment`,
  every mutating phase additionally requires a maintainer-approved plan digest,
  and the live module has no apply implementation at all. Approval binds one
  exact digest; any drift in the deployment SHA, applied migrations, source
  inventory, release policy, capacity class, backup class, affected-object
  count, or active release returns authorization to pending. Capacity and backup
  freshness are read from `STABLE_REGISTRY_STORAGE_HEADROOM_CLASS` and
  `STABLE_REGISTRY_BACKUP_FRESHNESS_CLASS`; an unmeasured value blocks the plan
  rather than defaulting to safe. Rollout evidence may record only phase, status,
  terminal class, environment class, approval status/reason, plan digest,
  pending-migration count, duration, parity and orphan counts, and control
  booleans. Never record a connection string, password, authorization header,
  API key, catalog name, source row, object or owner identifier, journal text,
  or coordinates. `docs/STABLE_REGISTRY_PRODUCTION_ROLLOUT.md` is the runbook.
- Do not commit Vercel tokens, protected preview URLs with nonce/share tokens, build logs containing secrets, or environment variable values.
- Do not document or paste auth secret values. Evidence may say only whether the legacy `BETTER_AUTH_SECRET` fallback is present/blocked/local-fallback, whether the versioned policy is `versioned_current_vN`/`legacy_transition`/`local_fallback`/`closed`, and the Vercel target/name/sensitivity class. Never record secret-derived values, hashes, prefixes, or sizes.
- Do not document or paste Google OAuth client secrets, OAuth tokens, callback query parameters, provider token responses, or signed cookies. Evidence may say only whether `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are present and whether the exact redirect URI is authorized.
- Google Analytics / Google Tag Manager evidence may record only the public measurement id, public GTM container id, consent-banner presence, public-route script presence/absence after consent, route class, and HTTP status class. Do not record Google cookies, client IDs, session IDs, IP/user-agent values, referrers, private route paths, auth callback params, or Google Analytics report rows containing user-level data.
- Microsoft Clarity evidence may record only env presence/disabled/enabled class, public project id presence class, analytics consent state class, public-route Clarity script/request presence/absence after consent, route class, and HTTP status class. Do not record Clarity cookies, Clarity session IDs, recordings, heatmap screenshots, user identifiers, raw URLs/referrers, private route paths, auth callback params, invite/reset/verification tokens, journal text, media keys/URLs, precise location, IP/user-agent values, or Clarity report rows containing user-level data.
- Do not document or paste retired provider credentials, OAuth tokens, callback query parameters, provider token responses, app/user access tokens, or signed cookies. OVE-296 evidence is limited to source digests, zero-reference counts, boundary classes, exact commit/deployment class, and generic denial status. OVE-297 defines its own bounded production-state evidence.
- Meta Ads attribution evidence may record only env presence/disabled/enabled class, public Pixel id presence class, marketing consent banner presence, public-route Pixel script presence/absence after consent, safe event class delivery in Test Events, and CAPI success/failure class. Do not record CAPI access tokens, test-event codes, Meta cookies, client ids, user ids, emails, IP/user-agent values, raw URLs/referrers, callback params, private route paths, event payloads containing private garden data, or Meta report rows containing user-level data.
- Public H6 smoke must use an unauthenticated public URL that returns OverGarden SSR HTML, not Vercel SSO.
- Internal operator surfaces use durable `admin_user_roles` capabilities. Bootstrap owner access only through `pnpm admin:bootstrap-owner` for a verified account with exactly one password-bearing credential and no linked provider. The ordinary avatar menu conditionally exposes community moderation, comment moderation, catalog curation, and erasure requests; there is no admin landing/user-status UI. Do not record user IDs, emails, cookies, tokens, connection strings, IP/user-agent fields, or env values in docs, Linear, logs, or chat. Google or any dormant retired-provider account must stay a normal gardener account and must not become admin-capable. `CATALOG_CURATOR_USER_IDS` is a deprecated legacy allowlist pattern, not the primary long-term admin model.
- Keep Cloudflare from caching app HTML if the app domain is later proxied through Cloudflare. Vercel should own app HTML/ISR behavior.

## Local Development

Local templates:

- `infra/.env.example`
- `apps/web/.env.example`
- `services/matching/.env.example`

Local storage emulator:

- MinIO endpoint: `http://localhost:9000`
- Local public base URL: `http://localhost:9000/overgarden-public`
- Local persistent media bucket should mirror the active production name:
  `overgarden-public`. Do not recreate the retired quarantine bucket locally.

OVE-231 adds no provider, bucket, environment variable, or mutable production
control. Additive migration `0014_ove231_launch_media_quality.sql` stores the
versioned, generation-fenced receipt. Its read-only production inventory uses
only the existing DigitalOcean PostgreSQL connection and aggregate SELECT; it
performs zero R2 GetObject calls. Evidence may contain only policy version,
aggregate class counts, SELECT-only status, and duration; never derivative
keys/URLs, image bytes, identity, EXIF, request metadata, credentials, or
location.

## Matching API retirement (OVE-357)

The repository no longer defines the `matching-api` service. `app/main.py` and
its three endpoints are deleted, `fastapi` and `uvicorn` are removed from the
dependency set, the image runs the worker instead of a server, and
`infra/production-worker/docker-compose.release.yml` defines only
`matching-worker`.

Both operator proofs now read `matching_worker_heartbeats` directly. The
endpoints reported the release, digest, schema class, and handler set — every
one of which the worker already writes to Postgres — and a healthy HTTP response
proved the API was up, never that the worker was claiming jobs.

**Terminal absence receipt (2026-09-03).** The teardown was approved against
plan digest `1463999c3956b0078daaf3e1f5f9c0e1bf320eb8255d728e41da4bda2bb1ee7f`
and executed in order — reverse-proxy route, DNS record, container — with two
verifications after each step:

- Route: the `matching.over.garden` site block is gone from `/opt/overgarden/Caddyfile`
  and `caddy reload` exited zero; the `meili.over.garden` block is unchanged and
  answers `200`. The Caddy-managed certificate directory for the retired
  hostname was moved out of the `overgarden_caddy_data` volume, so nothing
  serves or renews it.
- DNS: the `A matching.over.garden` record is absent from the `over.garden`
  zone; three public resolvers return nothing, twice. No other record changed.
- Container: `overgarden-matching-api-1` is absent from `docker ps -a`, and
  neither compose file on the host defines a `matching-api` service any more, so
  no `compose up` recreates it. `overgarden-matching-worker-1` stayed healthy
  throughout, its heartbeat stayed under the freshness bound, and both
  Postgres-sourced operator commands returned `ready` after the teardown.

Rollback stays executable while the sealed release image remains on the host:
restore the route block and reload Caddy, recreate the `A` record, restore the
service definition from `/opt/overgarden/docker-compose.release.yml.ove357-backup-2026-09-03`,
and bring the container up with `release-state/active.env`.

Receipts record class names and absence booleans only; never a token,
certificate body, connection string, or provider credential.

## Composed self-hosted stack (OVE-358)

Non-secret values only. This stack is **not provisioned anywhere**: it is a
definition and a proven restore, and no provider account holds it. It is
deliberately provider-neutral — nothing in `infra/docker-compose.stack.yml`
names a hosting company, and every host-specific value arrives through the
environment.

- Definition: `infra/docker-compose.stack.yml`. Entry point:
  `infra/overgarden-stack`. Runbook: `docs/SELF_HOSTED_STACK.md`.
- Services: Postgres 18 (TLS on), PgBouncer (`transaction` pooling),
  Meilisearch v1.48.1, the matching worker, and Caddy. Caddy publishes the only
  host port; every other service is reachable on the internal network alone.
- Search image pin: the OCI **index** digest
  `sha256:ad98ec0ab2a387da5c140fe9d935eadc6e3a42aee185b4249dfafd985fb49e1c`.
  The production Meilisearch file pins `sha256:93ea15e3…`, which is the
  linux/amd64 manifest alone and cannot be pulled on an ARM host. The arm64
  manifest is `sha256:24896770…`. The index digest is equally immutable and
  resolves per architecture.
- Connection split: the application uses `DATABASE_URL` through the pooler; the
  matching worker uses `DIRECT_URL` straight to Postgres, because
  `LISTEN`/`NOTIFY` needs a session that transaction pooling does not provide.
- TLS material is generated on first `up` into `infra/stack-tls/` and is
  git-ignored. The private key is `chmod 600` and owned by uid 70; Postgres
  refuses to start otherwise. Never copy a key, a certificate body, or a
  connection string into this file, Linear, or chat.
- Restore rehearsal: `infra/overgarden-stack verify <digest>` restores into a
  disposable `overgarden_stack_restore_*` database, serves the canonical product
  read model against it, and deletes the target on every terminal path. Declared
  budget one hour; the local rehearsal completes in about one second against a
  small corpus, which bounds nothing about the full corpus on a real host.
- Record only: service list, pin digests, budget class, pass/fail class, and the
  check date.

## Open Operational Items

- Codify the current Droplet Docker Compose deployment as repeatable infra if the pilot continues beyond the first controlled user, or create a separate production process-manager migration with the OVE-76 live-proof gate before replacing it.
- After `OVE-12` proves production media readback through `https://media.over.garden`, disable the public `r2.dev` development URL for `overgarden-public`.
- OVE-195 (2026-07-23): public `r2.dev` for `overgarden-public` is disabled; canonical custom domain remains `media.over.garden`.
