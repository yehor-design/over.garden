# Infrastructure Registry

Status: live operational source of truth
Last verified: 2026-06-29
Owner: founder/operator

This document records non-secret infrastructure settings, stable identifiers, URLs, and operational links for OverGarden. It exists so future AI agents do not ask for the same values repeatedly and do not invent provider-specific configuration.

## Agent Rules

1. Read this file before touching DNS, Cloudflare, R2, media URLs, deployment env, production storage, or external service wiring.
2. Do not commit secrets. This file may contain account IDs, zone IDs, bucket names, public URLs, and dashboard links; it must not contain passwords, API tokens, `R2_SECRET_ACCESS_KEY`, database passwords, Better Auth secrets, or Meilisearch master keys.
3. If this file conflicts with live provider state, verify through the provider API/dashboard, make the smallest safe change, and update this file in the same patch.
4. Any Linear SDD issue that touches media, DNS, production env, deployment, external storage, or external services must include this file in `Context files`.
5. Keep tasks vertical. Do not create standalone "configure infra" tasks unless the same issue proves a concrete user behavior end to end.

## Source Priority

1. Live provider API/dashboard.
2. This registry.
3. Current stack docs: `AGENTS.md`, `docs/TECH_STACK_DECISIONS.md`, `docs/adr/ADR-0014-agentic-stack-realignment.md`.
4. Older ADRs and chat history.

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
- Cloudflare may proxy DNS records, but must not cache app HTML. Vercel owns app HTML/ISR behavior.
- App-layer cache guardrail (OVE-91): matched Next app routes set `Cache-Control: private, no-store, max-age=0, s-maxage=0, must-revalidate` in `apps/web/src/proxy.ts`. This is defense-in-depth for app HTML/RSC/API responses; it does not change R2 media or static asset caching.
- Do not manually CNAME media traffic to the `r2.dev` public development URL. R2 custom domains must be attached through the R2 bucket custom-domain flow.
- OVE-51 canonical app DNS:
  - `over.garden A 76.76.21.21`, DNS-only, auto TTL, bound to Vercel project `over-garden`
  - `www.over.garden A 76.76.21.21`, DNS-only, auto TTL, bound to Vercel project `over-garden`
- Because the app DNS records are DNS-only, app HTML responses should not carry Cloudflare cache status. If the app domain is proxied later, any HTML `cf-cache-status: HIT` is a launch blocker and must be fixed before pilot traffic resumes.

Dashboard links:

- Cloudflare zone DNS: `https://dash.cloudflare.com/cb03b15042adc74edfe2d8201636300a/over.garden/dns/records`
- Cloudflare R2 overview: `https://dash.cloudflare.com/cb03b15042adc74edfe2d8201636300a/r2/overview`
- Cloudflare R2 API tokens: `https://dash.cloudflare.com/cb03b15042adc74edfe2d8201636300a/r2/api-tokens`

Reference docs:

- R2 public buckets and custom domains: `https://developers.cloudflare.com/r2/buckets/public-buckets/`
- R2 S3-compatible API tokens: `https://developers.cloudflare.com/r2/api/tokens/`

## Cloudflare R2

Production S3-compatible client settings:

```env
R2_ENDPOINT="https://cb03b15042adc74edfe2d8201636300a.r2.cloudflarestorage.com"
R2_FORCE_PATH_STYLE="true"
R2_QUARANTINE_BUCKET="overgarden-quarantine"
R2_PUBLIC_BUCKET="overgarden-public"
R2_PUBLIC_BASE_URL="https://media.over.garden"
```

Secret values still required outside git:

```env
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
```

Where secrets belong:

- Local app development: `apps/web/.env.local`
- Vercel/project deployment env: production, development, and the active OVE-27 branch preview
- Never in repository docs, source files, Linear comments, or chat
- R2 values in Vercel must not include trailing newlines or pasted whitespace. A trailing newline in `R2_ACCESS_KEY_ID` produces signed upload URLs that Cloudflare rejects before the app can process media.

R2 API token requirement:

- Permission: Object Read and Write
- Scope: `overgarden-quarantine` and `overgarden-public`
- Prefer an account API token for production if available. A user API token is acceptable for local/dev continuity but is tied to the individual Cloudflare user.
- Cloudflare R2 does not support S3 `PutBucketPolicy` on this endpoint. Public reads are controlled through R2 bucket/domain settings, not by committing or replaying S3 bucket policy JSON from the app bootstrap script.

### Quarantine Bucket

- Bucket name: `overgarden-quarantine`
- Bucket ID: `13b1358d8ffb40d996c50aa7b089a792`
- Purpose: private original uploads only
- Public development URL: disabled
- Managed `r2.dev` domain: `pub-13b1358d8ffb40d996c50aa7b089a792.r2.dev` (disabled)

CORS:

- Rule ID: `overgarden-quarantine-browser-upload`
- Origins:
  - `http://localhost:3000`
  - `https://over-garden.vercel.app`
  - `https://over-garden-git-codex-ove-27-pr-a698a5-yehors-projects-01221e2b.vercel.app`
  - `https://over.garden`
  - `https://www.over.garden`
- Methods: `PUT`, `HEAD`
- Headers: `*`
- Exposed headers: `ETag`
- Max age: `3600`
- Dynamic Vercel preview deployment origins are intentionally not listed here by default. A full browser upload smoke should use an allowed app origin or an explicitly approved temporary preview origin; Node/API smoke alone does not exercise browser CORS preflight.
- The selected public pilot URL is now `https://over.garden` (OVE-51). Keep `https://over.garden` and `https://www.over.garden` in the quarantine CORS rule before any canonical-domain browser upload smoke. The current object-scoped R2 token can upload/read objects but cannot read or update bucket CORS configuration.
- On 2026-06-27, the OVE-27 branch preview origin was explicitly added for the production pilot browser smoke. Remove or rotate temporary preview origins when the branch is closed or the pilot URL changes.
- On 2026-06-28 (OVE-37), a live CORS preflight to the quarantine S3 host from `https://over-garden.vercel.app` returned `204` with `Access-Control-Allow-Origin` for that origin and `Access-Control-Allow-Methods: PUT, HEAD`. On 2026-06-29 (OVE-51), the canonical `https://over.garden` origin remained allowed with the same `PUT, HEAD` method class, confirming a real pilot gardener's browser upload from the canonical origin passes preflight.

Lifecycle:

- Rule ID: `delete-quarantine-originals-after-1-day`
- Prefix: `quarantine/`
- Delete objects after: `86400` seconds
- Abort multipart uploads after: `86400` seconds

Invariants:

- Quarantine keys are server/internal and must not appear in public read models, public HTML, search documents, analytics events, or client-visible derivative URLs.
- Public pages must never render this bucket or its `r2.dev` domain.

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
- `r2.dev` status: enabled temporarily as a development fallback; disable after the first production media slice is verified through `https://media.over.garden`.

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

Invariants:

- Only worker/server-created stripped derivatives belong in this bucket.
- Do not upload user originals here.
- Derivative writes should use long-lived immutable cache headers only for content-addressed or otherwise immutable object keys.

## DigitalOcean

Status: production Managed PostgreSQL plus worker/Meilisearch Droplet are provisioned for the pilot smoke.

Last verified: 2026-07-01 for the OVE-78 production catalog seed rollout proof. Broader direct TLS database ping, schema count, worker health, redacted journal index/unindex smoke, DigitalOcean backup listing, and live worker restart/recovery smoke were last verified on 2026-06-29.

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
- On 2026-06-29 (OVE-51), production bootstrap was rerun non-destructively through the app bootstrap path after canonical-domain smoke exposed that `pilot_invite_grants` had not been applied to the live database. Post-bootstrap schema probe confirmed `pilot_invite_grants` exists with `user_id`, `cohort`, `granted_at`, `created_at`, and `updated_at`. No schema drop, bulk delete, restore-over-production, or user-data export was performed.
- OVE-69 seed-state guard: deployed catalog-source code and local proof imports do not prove that staging or production catalog rows exist. Use `docs/CATALOG_SEED_ROLLOUT_PROOF.md` and record only the final redacted evidence before claiming non-local seed availability.
- On 2026-07-01 (OVE-78), production schema bootstrap was rerun non-destructively because the source-catalog tables required by the rollout command were missing from the live database. The OVE-78 production seed proof then passed against `https://over.garden` with generated timestamp `2026-07-01T12:16:18.722Z`, command code SHA `08db4d0adf8586fb91f8c4f29bf2f55ade15473d`, stable product identity on rerun, no duplicate same-concept suggestions, real `/garden` readback status `200` for every smoke case, and leak check `passed`. Staging still has no checked-in seed proof. No database URL, CA body, source-record ID, raw payload hash, invite token, email, user identifier, or private/source-only field was recorded.

Backup and PITR posture (OVE-39):

- Status: `pass` as of 2026-06-29. `doctl databases list` verified `overgarden-postgres-prod-fra1` as online in `fra1` (`pg`, version 18, `db-s-1vcpu-1gb`, one node), and `doctl databases backups <cluster-id>` returned managed backup rows.
- Latest observed backup: 2026-06-28 17:33 UTC, small backup size class (<0.1 GiB). PITR/retention window is recorded as 7d per DigitalOcean Managed PostgreSQL docs/provider default; provider output showed no override.
- Operator verification (dashboard): DigitalOcean Cloud -> Databases -> `overgarden-postgres-prod-fra1` -> Backups/Settings. Confirm automatic daily backups are enabled and note the PITR/retention window and the latest backup timestamp.
- Operator verification (CLI/API, secrets omitted): `doctl databases list` to resolve the cluster id, then `doctl databases backups <cluster-id>`; or `GET https://api.digitalocean.com/v2/databases/{cluster_uuid}/backups` with a bearer token that is never recorded here.
- Recoverability validation must be non-destructive: create a fork / restore into a NEW cluster (`doctl databases fork ...`). Never restore over production. A restore-over-production drill requires explicit maintainer sign-off and is out of scope for the closed pilot.
- Record only: backup-enabled boolean, retention/PITR window, latest backup date, and the check date. Never copy database URLs, the CA certificate body, credentials, or doctl/API tokens into this file, Linear, or chat.
- Closed-pilot interpretation: backup/PITR posture is no longer a launch blocker for the closed pilot. A destructive restore drill remains out of scope without explicit maintainer sign-off.

Database invariants:

- Do not store database passwords, full connection URLs, or CA certificate bodies in git, Linear, chat, or docs.
- Vercel runtime should prefer canonical `DATABASE_URL` and `DIRECT_URL`; do not reintroduce legacy empty `POSTGRES_*` aliases as active production configuration.
- `DATABASE_SSL_CA` may be multi-line in Vercel. The app runtime strips `sslmode` from the connection string when a CA is configured so Node `pg` uses the explicit CA with strict verification.

Worker and Meilisearch Droplet:

Runtime classification: this production worker/search surface is `production-linux-required` under `docs/CONTAINER_RUNTIME_POLICY.md`. Apple Container remains the preferred supported-Mac local runtime, but it is not the DigitalOcean Linux droplet process manager. OVE-76 confirms Docker Compose remains the current production process manager until a separate non-Apple Linux replacement is live-proven.

- Droplet name: `overgarden-worker-prod-fra1`
- Region: Frankfurt, Datacenter 1, `FRA1`
- Current size: Basic 1 vCPU, 1 GB RAM
- Runtime: Docker Compose under `/opt/overgarden`
- Public matching health URL: `https://matching.over.garden/health`
- Public Meilisearch URL: `https://meili.over.garden`
- Reverse proxy/TLS: Caddy on the Droplet
- Containers: `meilisearch`, `matching-api`, `matching-worker`, `caddy`
- Matching API health returned status `ok` with ICU present on 2026-06-29.
- Meilisearch health returned status `available` on 2026-06-29.

Worker and search invariants:

- Meilisearch is a derived public index only; Postgres remains the source of truth.
- `MEILI_MASTER_KEY`, `MEILISEARCH_API_KEY`, and `MATCHING_SERVICE_TOKEN` must stay only in platform/env secret stores.
- Do not expose Meilisearch keys, worker env files, database URLs, canary row identifiers, or indexed journal text in docs, Linear, or chat.
- `matching-worker` must process `journal_entry_index` and `journal_entry_unindex` idempotently and reclaim stale `processing` rows after the visibility timeout.
- Runtime writer: `services/matching/app/search.py:journal_entry_search_document_from_row`.
- Machine-readable contract: `contracts/search/public-journal-entry-search-document.json`.
- `journal_entries` index documents may contain only the public-safe field contract proven in OVE-36/OVE-39: required keys `body`, `createdAt`, `entryDate`, `id`, `kind`, `locationVisibility`, `noindex`, `publicPath`, `publicSlug`, and `title`, plus optional `coarseRegionCode` only when `locationVisibility = region`.
- No owner/user IDs, space IDs, plant object IDs, precise location, raw coarse-location columns, media keys, quarantine/original keys, signed URLs, request metadata, IPs, user agents, referrers, invite data, or private journal state may enter Meilisearch documents.

Process management and recovery (OVE-39):

- Process manager: Docker Compose under `/opt/overgarden` on `overgarden-worker-prod-fra1`, containers `meilisearch`, `matching-api`, `matching-worker`, `caddy` (Caddy terminates TLS).
- Restart policy: live-confirmed on 2026-06-29 as `unless-stopped` for `matching-worker`, `matching-api`, `meilisearch`, and `caddy`, so the worker, API, and Meilisearch return automatically after a process crash or droplet reboot.
- Health endpoints: matching `https://matching.over.garden/health` (status `ok`, ICU present) and Meilisearch `https://meili.over.garden/health` (status `available`) passed on 2026-06-29.
- Stale-job reclaim: the worker claims `job_queue` rows with `FOR UPDATE SKIP LOCKED` and reclaims rows stuck in `processing` once `locked_at` is older than `WORKER_VT_SECONDS` (default 30s). Handlers are idempotent (Meilisearch upsert by primary key / delete by id), so at-least-once re-delivery after a restart cannot duplicate or corrupt the public index. Failed jobs back off `WORKER_VT_SECONDS` and retry; unknown job kinds fail with `last_error` instead of being marked done.
- Local recovery proof: `services/matching/tests/test_worker_recovery.py` deterministically proves reclaim-after-timeout, `journal_entry_index`/`journal_entry_unindex` reaching `done` after a simulated restart, the public-safe document contract, idempotent re-delivery, and fail-then-recover when Meilisearch is briefly unavailable. It runs with `uv run --frozen pytest` and needs no live services.
- Live restart smoke (2026-06-29, redacted): restarted only `matching-worker`, confirmed it returned `Up`, then published a canary through the production app path and confirmed `journal_entry_index` reached `done` in one attempt. The Meilisearch `journal_entries` document had exactly the public-safe keys `body`, `createdAt`, `entryDate`, `id`, `kind`, `locationVisibility`, `noindex`, `publicPath`, `publicSlug`, and `title`, with `noindex = true`, `locationVisibility = hidden`, and no forbidden owner/user IDs, media keys, precise location, IPs, user agents, or referrers. Archiving the same canary confirmed `journal_entry_unindex` reached `done` in one attempt, the Meilisearch document returned `404`, and the old public URL returned `410`. Record only job-state classes, document presence/absence, document key names, and privacy booleans.
- Future non-Docker replacement gate (OVE-76): keep Docker Compose here unless a separate production migration live-proves equivalent process restart/reboot recovery, matching and Meilisearch health, journal publish index completion, journal archive unindex completion, and the same public-safe document contract. Redacted evidence only; never record DB URLs, worker env files, Meili keys, journal text, IPs, user agents, or user-tied row identifiers.

## Vercel

Status: project exists; production deployment is created from GitHub `main`; public Vercel access is enabled for the pilot URL.

Last verified: 2026-06-28 through the connected Vercel app (OVE-37 current-main closure; earlier OVE-27/OVE-36 checks were 2026-06-27 to 2026-06-28).

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

Current production deployment at verification time:

- Deployment ID: `dpl_AkMJozhSmood7NdvSkqvfUQDySKm`
- Deployment URL: `https://over-garden-d49wqs9kc-yehors-projects-01221e2b.vercel.app`
- Ready state: `READY`
- Target: `production`
- Source: redeploy of GitHub-integrated production deployment after OVE-51 env correction
- GitHub ref: `main`
- GitHub commit: `f46850dcba7ed529ad286390bafe3c18f6eab7aa`
- GitHub commit message: `chore(pilot): canonicalize production pilot domain`
- GitHub commit verification: `verified`
- Branch alias: `over-garden-git-main-yehors-projects-01221e2b.vercel.app`
- OVE-51 (2026-06-29): this deployment served the canonical-domain browser smoke after `PUBLIC_SITE_URL`, `BETTER_AUTH_URL`, `PILOT_INVITE_SIGNING_SECRET`, and the missing `pilot_invite_grants` schema were corrected.

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

Deployment env observation:

- On 2026-06-27, the Vercel project had `BETTER_AUTH_SECRET` installed for production, development, and the branch preview `codex/ove-27-production-pilot-smoke`.
- Runtime auth is fail-closed for production-like environments when `BETTER_AUTH_SECRET` is missing, placeholder-like, or equal to the local development fallback. Do not rely on local/test fallback behavior for any deployed production or preview app.
- On 2026-06-27, the Vercel project had the R2 runtime env family installed for production, development, and the branch preview: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_FORCE_PATH_STYLE`, `R2_QUARANTINE_BUCKET`, `R2_PUBLIC_BUCKET`, and `R2_PUBLIC_BASE_URL`.
- On 2026-06-27, the Vercel project had `DATABASE_SSL=true` installed for production, development, and the branch preview.
- On 2026-06-27, the Vercel project had `DATABASE_URL`, `DIRECT_URL`, and `DATABASE_SSL_CA` installed for production and the branch preview `codex/ove-27-production-pilot-smoke`.
- On 2026-06-29 (OVE-51), production `PUBLIC_SITE_URL` and `BETTER_AUTH_URL` were updated to the canonical origin `https://over.garden`. Future production readiness checks fail if Vercel production uses the legacy `.vercel.app` alias for either value.
- On 2026-06-29 (OVE-51), production `PILOT_INVITE_SIGNING_SECRET` was installed in Vercel env store after canonical smoke showed invited writes could not be proven without it. The value is intentionally not recorded. Authenticated CLI `vercel env run -e production` confirmed only boolean presence, and invite links/tokens remain private evidence.
- OVE-111 Google OAuth uses a Google Cloud Web application client. Required authorized redirect URIs are `http://localhost:3000/api/auth/callback/google` for local testing and `https://over.garden/api/auth/callback/google` for production. On 2026-07-02, production Vercel env gained `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; authenticated CLI `vercel env run -e production` confirmed only boolean configured/not-placeholder state. Values are secrets or provider credentials and must not be recorded here.
- On 2026-06-27, the branch preview `codex/ove-27-production-pilot-smoke` had branch-specific `PUBLIC_SITE_URL` and `BETTER_AUTH_URL` set to `https://over-garden-git-codex-ove-27-pr-a698a5-yehors-projects-01221e2b.vercel.app`, then was redeployed so Better Auth accepted that preview origin during browser smoke.
- On 2026-06-27, legacy production `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, and empty `POSTGRES_*` variables were removed from Vercel after canonical runtime env was installed.
- On 2026-06-27, accidental trailing newlines were trimmed from the R2 runtime env family in production and the branch preview `codex/ove-27-production-pilot-smoke`.
- On 2026-06-28, production Vercel env gained `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MATCHING_SERVICE_URL`, and `MATCHING_SERVICE_TOKEN` for the deployed worker/Meilisearch runtime. Values are intentionally not recorded here.
- Closed-pilot invite links (OVE-42) require `PILOT_INVITE_SIGNING_SECRET` in every environment that shares production invite URLs. Generate links from `apps/web` with `pnpm pilot:invite` after setting the secret in `.env.local` or Vercel. Never commit the secret or printed invite URLs.
- Closed-pilot auth recovery (OVE-48) uses operator-assisted Better Auth password reset. Generate one-time reset URLs from `apps/web` with `pnpm pilot:reset-password -- --email <address>` against the target environment database. Share printed links privately; never commit reset URLs, tokens, or passwords.
- Do not infer database readiness from the presence of env var names alone. The live smoke must prove a successful server-side database ping on the deployed app.
- Do not infer invite readiness from `PILOT_INVITE_SIGNING_SECRET` presence alone. The live smoke must also prove `/join?invite=` sets an eligibility cookie, first authenticated write materializes `pilot_invite_grants`, and the user reaches the write composer.

Vercel invariants:

- Do not commit Vercel tokens, protected preview URLs with nonce/share tokens, build logs containing secrets, or environment variable values.
- Do not document or paste auth secret values. Evidence may say `BETTER_AUTH_SECRET` is present, missing, placeholder-like, or local-fallback only.
- Do not document or paste Google OAuth client secrets, OAuth tokens, callback query parameters, provider token responses, or signed cookies. Evidence may say only whether `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are present and whether the exact redirect URI is authorized.
- Public H6 smoke must use an unauthenticated public URL that returns OverGarden SSR HTML, not Vercel SSO.
- Internal operator surfaces use durable `admin_user_roles` capabilities. Bootstrap owner access only through `pnpm admin:bootstrap-owner`, and do not record user IDs, emails, cookies, tokens, connection strings, IP/user-agent fields, or env values in docs, Linear, logs, or chat. `CATALOG_CURATOR_USER_IDS` is a deprecated legacy allowlist pattern, not the primary long-term admin model.
- Keep Cloudflare from caching app HTML if the app domain is later proxied through Cloudflare. Vercel should own app HTML/ISR behavior.

## Local Development

Local templates:

- `infra/.env.example`
- `apps/web/.env.example`
- `services/matching/.env.example`

Local storage emulator:

- MinIO endpoint: `http://localhost:9000`
- Local public base URL: `http://localhost:9000/overgarden-public`
- Local buckets should mirror production names:
  - `overgarden-quarantine`
  - `overgarden-public`

## Open Operational Items

- Codify the current Droplet Docker Compose deployment as repeatable infra if the pilot continues beyond the first controlled user, or create a separate production process-manager migration with the OVE-76 live-proof gate before replacing it.
- After `OVE-12` proves production media readback through `https://media.over.garden`, disable the public `r2.dev` development URL for `overgarden-public`.
