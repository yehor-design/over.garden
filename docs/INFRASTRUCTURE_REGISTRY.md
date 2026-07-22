# Infrastructure Registry

Status: live operational source of truth
Last verified: 2026-07-22 for the OVE-188 protective-DNS closeout; 2026-07-18 for the OVE-204 exact-main current-session sign-out rollout, OVE-203 production public-identity rollout and release-preview auth-env repair, production matching release, sealed-owner env recovery, and OVE-191 scaffold-boundary implementation; other provider verification dates remain recorded per section
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
- On 2026-06-29 (OVE-51), production bootstrap was rerun non-destructively through the app bootstrap path after canonical-domain smoke exposed that `pilot_invite_grants` had not been applied to the live database. Post-bootstrap schema probe confirmed `pilot_invite_grants` exists with `user_id`, `cohort`, `granted_at`, `created_at`, and `updated_at`. No schema drop, bulk delete, restore-over-production, or user-data export was performed.
- OVE-69 seed-state guard: deployed catalog-source code and local proof imports do not prove that staging or production catalog rows exist. Use `docs/CATALOG_SEED_ROLLOUT_PROOF.md` and record only the final redacted evidence before claiming non-local seed availability.
- On 2026-07-01 (OVE-78), production schema bootstrap was rerun non-destructively because the source-catalog tables required by the rollout command were missing from the live database. The OVE-78 production seed proof then passed against `https://over.garden` with generated timestamp `2026-07-01T12:16:18.722Z`, command code SHA `08db4d0adf8586fb91f8c4f29bf2f55ade15473d`, stable product identity on rerun, no duplicate same-concept suggestions, real `/garden` readback status `200` for every smoke case, and leak check `passed`. Staging still has no checked-in seed proof. No database URL, CA body, source-record ID, raw payload hash, invite token, email, user identifier, or private/source-only field was recorded.
- On 2026-07-12 (OVE-179), production schema bootstrap was rerun non-destructively before the public journal-entry V2 deployment. A redacted schema probe confirmed `media_assets.alt_text`, `media_assets.caption`, and their bounded nonblank length constraints are present. No schema drop, bulk delete, row export, database URL, CA body, media key, journal text, user identifier, or precise location was read into evidence or recorded.
- On 2026-07-12 (OVE-180), production schema bootstrap was rerun non-destructively before the gardener-profile V2 live smoke. A redacted app-TLS probe confirmed all three profile relationship tables, the processed-avatar foreign key, all nine bounded profile columns, and zero forbidden location-column names across the new profile tables. No schema drop, bulk delete, row export, database URL, CA body, profile row, relationship row, user identifier, or precise location was read into evidence or recorded.
- On 2026-07-15 (OVE-162), production schema bootstrap was rerun non-destructively after the exact-SHA Vercel deployment. A booleans-only app-TLS probe confirmed `catalog_fuzzy_duplicate_suggestions` and the closed-payload `job_queue_catalog_fuzzy_duplicate_payload_check` constraint are present. No schema drop, bulk delete, row export, database URL, CA body, catalog row, suggestion row, job payload, user identifier, or private/source-only field was read into evidence or recorded.
- On 2026-07-16 (OVE-163), exact-main deployment `dpl_FR7gxmnHv9j3wEMLvrDbk5KjYPf2` reached Vercel `READY` for commit `e94148fa5a4a097422b5cdf7234e1b1ffad542e2`. A platform-env-injected, read-only production proof passed canonical runtime, matching schema and closed queue-payload constraints, safe typeahead search, entity-resolution QA, and recursive evidence leak checks with `productionDataTouched=false`. The production fuzzy report was safely empty (`0` full, `0` reviewed, `0` rendered); bounded advisory generation was proven locally without importing production data. No external infrastructure value changed, and no env file, schema mutation, database URL, CA body, secret, private/source-only row, user identifier, or precise location was printed or recorded.
- On 2026-07-18 (OVE-203), commit `1edffc351c1c3132f97608083b4b6ea6a63e9a12` was first proven by exact-SHA CI, then used from a clean detached worktree to install the additive identity schema before the same commit reached production. The aggregate-only dry-run found `64` auth users, `6` existing profiles/current claims, `58` missing profiles/current claims, and `6` legacy claims plus `6` legacy profile handles requiring policy review. Transactional rollback proof left aggregate state unchanged. The first apply provisioned `58` identities and reviewed both legacy sets; the second apply reported zero mutations. Final verification reported `64` users, `64` profiles, `64` current claims, zero retired claims, and zero missing, duplicate, mismatched, unresolved-review, or legacy-mention gaps. A bounded synthetic canonical runtime smoke then proved no-name signup, generated identity, duplicate preservation, verified sign-in, immediate rename, cooldown, current route `200`, retired route `410`/`noindex` without redirect, and current/retired mention resolution. The synthetic account was deleted immediately and a second final integrity check returned the same `64`/`64`/`64` zero-gap state. Evidence contained only counts, booleans, status classes, commit/deployment identifiers, and policy version; no email, UUID, handle, rejected term, cookie, token, content, or secret was printed or retained.

Backup and PITR posture (OVE-39, refreshed for OVE-203):

- Status: `pass` as of 2026-07-18. The provider API reported managed backups enabled and returned `8` backup rows for the production cluster.
- Latest observed backup: 2026-07-17 17:33 UTC. PITR/retention remains recorded as 7d per DigitalOcean Managed PostgreSQL documentation/provider default; the refreshed provider output showed no override.
- Operator verification (dashboard): DigitalOcean Cloud -> Databases -> `overgarden-postgres-prod-fra1` -> Backups/Settings. Confirm automatic daily backups are enabled and note the PITR/retention window and the latest backup timestamp.
- Operator verification (CLI/API, secrets omitted): `doctl databases list` to resolve the cluster id, then `doctl databases backups <cluster-id>`; or `GET https://api.digitalocean.com/v2/databases/{cluster_uuid}/backups` with a bearer token that is never recorded here.
- Recoverability validation must be non-destructive: create a fork / restore into a NEW cluster (`doctl databases fork ...`). Never restore over production. A restore-over-production drill requires explicit maintainer sign-off and is out of scope for the closed pilot.
- Record only: backup-enabled boolean, retention/PITR window, latest backup date, and the check date. Never copy database URLs, the CA certificate body, credentials, or doctl/API tokens into this file, Linear, or chat.
- Closed-pilot interpretation: backup/PITR posture is no longer a launch blocker for the closed pilot. A destructive restore drill remains out of scope without explicit maintainer sign-off.

Database invariants:

- Do not store database passwords, full connection URLs, or CA certificate bodies in git, Linear, chat, or docs.
- Vercel runtime should prefer canonical `DATABASE_URL` and `DIRECT_URL`; do not reintroduce legacy empty `POSTGRES_*` aliases as active production configuration.
- `DATABASE_SSL_CA` may be multi-line in Vercel. The app runtime strips `sslmode` from the connection string when a CA is configured so Node `pg` uses the explicit CA with strict verification.
- Vercel/serverless Postgres pool default is one connection per instance unless `DATABASE_POOL_MAX` explicitly overrides it. Do not raise this default without proving production connection-slot headroom or adding a pooled connection endpoint.

Worker and Meilisearch Droplet:

Runtime classification: this production worker/search surface is `production-linux-required` under `docs/CONTAINER_RUNTIME_POLICY.md`. Apple Container remains the preferred supported-Mac local runtime, but it is not the DigitalOcean Linux droplet process manager. OVE-76 confirms Docker Compose remains the current production process manager until a separate non-Apple Linux replacement is live-proven.

- Droplet name: `overgarden-worker-prod-fra1`
- Region: Frankfurt, Datacenter 1, `FRA1`
- Current size: Basic 1 vCPU, 1 GB RAM
- Runtime: Docker Compose under `/opt/overgarden`
- Public matching health URL: `https://matching.over.garden/health`
- Public matching capability URL: `https://matching.over.garden/capabilities`
- Public matching readiness URL: `https://matching.over.garden/ready`
- Public Meilisearch URL: `https://meili.over.garden`
- Reverse proxy/TLS: Caddy on the Droplet
- Containers: `meilisearch`, `matching-api`, `matching-worker`, `caddy`
- Matching API health returned status `ok` with ICU present on 2026-06-29.
- Meilisearch health returned status `available` on 2026-06-29.

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
  machine contract: required keys `body`, `createdAt`, `entryDate`,
  `entryScope`, `id`, `kind`, `locationVisibility`, `noindex`, `publicPath`,
  `publicSlug`, and `title`, plus optional `coarseRegionCode` only when
  `locationVisibility = region`. Earlier OVE-36/OVE-39 evidence predates the
  additive `entryScope` field and remains a historical exact-shape record.
- No owner/user IDs, space IDs, plant object IDs, precise location, raw coarse-location columns, media keys, quarantine/original keys, signed URLs, request metadata, IPs, user agents, referrers, invite data, or private journal state may enter Meilisearch documents.

Process management and recovery (OVE-39):

- Process manager: Docker Compose under `/opt/overgarden` on `overgarden-worker-prod-fra1`, containers `meilisearch`, `matching-api`, `matching-worker`, `caddy` (Caddy terminates TLS).
- Restart policy: live-confirmed on 2026-06-29 as `unless-stopped` for `matching-worker`, `matching-api`, `meilisearch`, and `caddy`, so the worker, API, and Meilisearch return automatically after a process crash or droplet reboot.
- Health endpoints: matching `https://matching.over.garden/health` (status `ok`, ICU present) and Meilisearch `https://meili.over.garden/health` (status `available`) passed on 2026-06-29.
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
  `cd apps/web && pnpm smoke:matching-runtime-capabilities -- --base-url https://matching.over.garden --expected-commit <full-main-sha> --expected-digest sha256:<digest>`.
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

## Vercel

Status: project exists; production deployment is created from GitHub `main`; public Vercel access is enabled for the pilot URL.

Last verified: 2026-07-18 for OVE-204 exact-main production deployment and
canonical sign-out proof, plus branch-scoped release Preview build repair.

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

- Deployment ID: `dpl_3Qu9hvUGn6KdCqbxgEZbZf7nDqaJ`
- Canonical URL: `https://over.garden`
- Ready state: `READY`
- Target: `production`
- Source: GitHub-integrated production deployment for OVE-204 current-session sign-out
- GitHub ref: `main`
- GitHub commit: `31954a11f8405a9b125e3ea67963bb0ce963b5f3`
- GitHub commit message: `feat(auth): add safe current-session sign-out`
- GitHub commit verification: `verified`
- Canonical alias equality: passed for `https://over.garden`
- OVE-204 (2026-07-18): exact-SHA bounded smoke proved two independent sessions, exactly-current-session revocation, denial of old garden/profile/admin/mutation access, other-session and server-record continuity, successful reauthentication, and zero synthetic residue. A real credential owner browser session proved profile/operator controls, localized hard redirect, cross-tab convergence, and protected-route guest state. Google and Facebook authorization starts reached their real provider consent boundaries and returned the intentional existing-account collision fallback without linking the credential-only owner. Evidence contained only bounded counts, booleans, status classes, commit/deployment identifiers, and public route classes.

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
- On 2026-07-02 (OVE-112), production deployment `dpl_49ThewAMcDKZKxRPJDv3NuoViScg` for main commit `e5496c3e2454c5c2dcf7c39a785f51697b81f33e` was `READY` and aliased to `https://over.garden`. Redacted OAuth smoke confirmed production Vercel env has non-placeholder `FACEBOOK_CLIENT_ID` and `FACEBOOK_CLIENT_SECRET`, `/api/auth/sign-in/social` returned a Facebook authorization URL, the generated redirect URI was exactly `https://over.garden/api/auth/callback/facebook`, and Meta did not return `redirect_uri_mismatch`, `INVALID_ORIGIN`, or `origin_mismatch` on authorization start. Evidence excluded app id, app secret, state, cookies, OAuth tokens, app/user access tokens, and callback query parameters.
- On 2026-07-12 (OVE-180), production deployment `dpl_EGsxUqACCpKpxJ83t7784u333VkY` for main commit `dac896e896d315b621b6903b597f74a634d43b1b` was `READY`, verified, and aliased to `https://over.garden`. Redacted canonical-host smoke proved the active profile route class returns `200`, Bulgarian content language, `private, no-store`, profile V2 markup, and `noindex`; a valid missing profile returns the generic Bulgarian hard `404` with `noindex, nofollow`; and guest follow returns a `303` opaque intent, sign-in dialog, and exact localized return path without mutation. Google Public DNS and Cloudflare DNS-over-HTTPS both returned Vercel's public `76.76.21.21`, where canonical SNI/Host smoke passed. This workstation's LAN resolver returned a different unreachable address, so a direct local-browser canonical request timed out; exact READY-deployment browser smoke and canonical smoke through the public authoritative answer both passed. Evidence excluded live handles, profile content, relationship rows, emails, cookies, tokens, media keys, raw request metadata, and precise location.
- On 2026-07-18 (OVE-204), production deployment `dpl_3Qu9hvUGn6KdCqbxgEZbZf7nDqaJ` for exact main commit `31954a11f8405a9b125e3ea67963bb0ce963b5f3` was `READY`, verified by filtered deployment metadata, and aliased to `https://over.garden` and `https://www.over.garden`. Canonical traffic returned `200` and resolved to the Bulgarian market root. Bounded two-session and real-browser proof covered current-session-only revocation, cross-tab/private-tree convergence, protected-route denial, continuity, provider-link preservation, and zero synthetic residue without recording identities, credentials, cookies, tokens, OAuth parameters, or private content.

Deployment env observation:

- On 2026-06-27, the Vercel project had `BETTER_AUTH_SECRET` installed for production, development, and the branch preview `codex/ove-27-production-pilot-smoke`.
- Runtime auth is fail-closed for production-like environments when `BETTER_AUTH_SECRET` is missing, placeholder-like, or equal to the local development fallback. Do not rely on local/test fallback behavior for any deployed production or preview app.
- On 2026-07-18, the automatic Vercel Preview for release ref `codex/ove-203-release` and commit `1edffc351c1c3132f97608083b4b6ea6a63e9a12` failed during page-data collection because that branch had no Preview `BETTER_AUTH_SECRET`. A newly generated Sensitive secret was added only to that exact Preview branch; no value was printed, stored in git, or copied from production. Redeploy `dpl_9kg2jMn9QNem6NiKEpAuaLxYjNSJ` reached `READY`, compiled all `61` static pages, and replaced the branch alias without an auth-secret, page-collection, or terminal build error. Its public `noindex` health route reports auth configured and database unavailable by design: this release Preview has no production database, R2, email-provider, or other production credentials and is build-only evidence, not authenticated/data runtime proof. Canonical production remained `READY` on `dpl_5xQ7jAduBePLg77Z173ni2jyzKNM` throughout the repair.
- On 2026-07-22, the OVE-188 closeout Preview for ref `codex/ove-188-closeout` and commit `15493e1ed00adda7216b7564a50725a7dcd04a25` failed closed during page-data collection because that branch had no Preview `BETTER_AUTH_SECRET`. A newly generated Sensitive secret was added only to that exact Preview branch; its value was not printed, stored in git, or copied from Production. Cache-free redeploy `dpl_AqByS7RdfFJQyL9beDAr6kC4dsXS` reached `READY`, generated all `61` static pages, passed the walking-skeleton postbuild boundary, and updated the GitHub Vercel check to success. The Preview remains build-only evidence with no production database or other production credentials; canonical Production was not promoted or mutated by this repair.
- On 2026-06-27, the Vercel project had the R2 runtime env family installed for production, development, and the branch preview: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_FORCE_PATH_STYLE`, `R2_QUARANTINE_BUCKET`, `R2_PUBLIC_BUCKET`, and `R2_PUBLIC_BASE_URL`.
- On 2026-06-27, the Vercel project had `DATABASE_SSL=true` installed for production, development, and the branch preview.
- On 2026-06-27, the Vercel project had `DATABASE_URL`, `DIRECT_URL`, and `DATABASE_SSL_CA` installed for production and the branch preview `codex/ove-27-production-pilot-smoke`.
- On 2026-06-29 (OVE-51), production `PUBLIC_SITE_URL` and `BETTER_AUTH_URL` were updated to the canonical origin `https://over.garden`. Future production readiness checks fail if Vercel production uses the legacy `.vercel.app` alias for either value.
- On 2026-06-29 (OVE-51), production `PILOT_INVITE_SIGNING_SECRET` was installed in Vercel env store after canonical smoke showed invited writes could not be proven without it. The value is intentionally not recorded. Authenticated CLI `vercel env run -e production` confirmed only boolean presence, and invite links/tokens remain private evidence.
- OVE-111 Google OAuth uses a Google Cloud Web application client. Required authorized redirect URIs are `http://localhost:3000/api/auth/callback/google` for local testing and `https://over.garden/api/auth/callback/google` for production. On 2026-07-02, production Vercel env gained `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; authenticated CLI `vercel env run -e production` confirmed only boolean configured/not-placeholder state. Values are secrets or provider credentials and must not be recorded here.
- OVE-112 Facebook Login uses a Meta app with the Better Auth `facebook` provider. Required Valid OAuth Redirect URIs are `http://localhost:3000/api/auth/callback/facebook` for local testing and `https://over.garden/api/auth/callback/facebook` for production. The Meta app domain must include `over.garden`, the public site origin is `https://over.garden`, and requested permissions stay limited to basic sign-in (`email`, `public_profile`). Development mode is valid only for app role/test users; production gardener login requires the Meta app mode/configuration to allow non-role users. On 2026-07-02, production Vercel env gained `FACEBOOK_CLIENT_ID` and `FACEBOOK_CLIENT_SECRET`; authenticated CLI `vercel env run -e production` confirmed only boolean configured/not-placeholder state. Values are secrets or provider credentials and must not be recorded here. OVE-142 adds `FACEBOOK_LOGIN_PUBLIC_READY` as a non-secret production exposure gate: unless it is explicitly `true`/`1`/`yes`, Vercel production must not register or render Facebook Login even if the credentials are present. Set it only after redacted real non-role-user proof.
- OVE-113 admin auth policy: Google and Facebook are gardener sign-in providers only. `/admin` and `/admin/users` accept a dedicated owner with a verified email and exactly one password-bearing `credential` account. The admin gate denies unverified, passwordless, duplicate-credential, or social-linked accounts even when an internal role row exists. This is an app authorization boundary; it does not require new provider env values.
- On 2026-07-18, production `OVERGARDEN_ADMIN_OWNER_USER_ID` was force-replaced as a Vercel Sensitive environment variable from a private, redacted production-DB identity proof and the existing `main` artifact was redeployed as `dpl_HGtt9xVyo4ZGvqMTFhAVn9hx8onx`, which reached `READY` and was aliased to `over.garden`. No user id, email, password hash, session, database credential, or env value was printed or recorded. Sensitive values cannot be read back through normal CLI env execution, so do not interpret an unreadable value as blank; prove changes through the controlled write result, a new deployment, database invariants, and authenticated runtime behavior.
- OVE-127 self-serve auth email uses Resend for transactional Better Auth email verification and password recovery only. Runtime env names are `RESEND_API_KEY` (secret), `RESEND_AUTH_FROM` (sender, for example `OverGarden <auth@over.garden>`), and optional `RESEND_AUTH_REPLY_TO`; production auth email links must use the canonical origin `https://over.garden`. Readiness/smoke evidence may record provider class, sender domain class, delivery success/failure class, and canonical origin class only. Never record Resend API keys, provider message IDs, recipient email addresses, reset/verification tokens, tokenized URLs, provider payloads, or marketing campaign data. Resend sender/domain verification and live delivery still require redacted operator smoke before launch claims.
- On 2026-07-05, Google Analytics 4 page measurement was installed through a consent-first Google tag with public measurement id `G-71LP7XZ5NE`. On 2026-07-05, that loader was moved behind the consent-first Google Tag Manager container `GTM-W979KSX3`. The consent banner appears only on authored public, legal, and support pages; the external Google Tag Manager container must not load until the visitor accepts analytics. The tag is intentionally scoped away from private garden, admin/operator, auth, join/invite, erasure, journal, lineage, API, and callback routes. The GTM account must publish a GA4 tag that sends to `G-71LP7XZ5NE`; app code only loads the container after consent.
- OVE-144 consent-first Meta Ads attribution is separate from Facebook Login. Runtime env names are `NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED` (single public kill switch), `NEXT_PUBLIC_META_PIXEL_ID` (public Pixel/Data Source id), `META_CONVERSIONS_API_ACCESS_TOKEN` (secret), optional `META_CONVERSIONS_API_TEST_EVENT_CODE`, and optional `META_CONVERSIONS_API_GRAPH_VERSION` (default implementation version `v23.0`, re-check Meta before enabling live if the dashboard recommends a newer version). The public flag must stay absent/false unless Meta Pixel/Data Source, CAPI token, Test Events proof, and privacy smoke are ready. App code never loads Meta Pixel before explicit marketing consent, never loads it on private garden/admin/auth/journal/API/callback routes, and never sends Meta journal text, private plant/object/catalog names, precise location, media keys/URLs, auth payloads, account identifiers, IP/user-agent evidence, provider cookies, or raw URLs/referrers. Implementation source checks on 2026-07-05 used Meta Pixel consent controls (`https://developers.facebook.com/docs/meta-pixel/implementation/gdpr`), Pixel+CAPI deduplication (`https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events`), and CAPI customer information parameter docs (`https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters/`).
- OVE-157 consent-first Microsoft Clarity is an optional UX observation layer for authored public, legal, and support pages only. Runtime env names are `NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED` (single public kill switch) and `NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID` (public Clarity project id). Keep `NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED` absent/false in production until the operator creates the Clarity project, verifies project settings and under-18 targeting constraints, and passes the privacy smoke. App code uses the NPM package `@microsoft/clarity`, never the raw GTM Custom HTML snippet, never loads Clarity before explicit analytics consent, calls Clarity consent v2 with ad storage denied and analytics storage granted, revokes Clarity analytics storage when the visitor moves to a disallowed route, never calls `Clarity.identify`, and never initializes Clarity on private garden/admin/auth/journal/lineage/join/invite/API/callback/erasure routes. If Clarity is disabled, the consent flow and app must continue to work with Google Tag Manager only.
- OVE-112 provider source gate was checked on 2026-07-02 against Better Auth Facebook docs (`https://better-auth.com/docs/authentication/facebook`) and Meta developer docs for Facebook Login Web, App Modes, and Test Users (`https://developers.facebook.com/docs/facebook-login/web`, `https://developers.facebook.com/docs/development/build-and-test/app-modes`, `https://developers.facebook.com/docs/development/build-and-test/test-users`). This evidence records setup requirements only, not provider secrets or tokens.
- On 2026-06-27, the branch preview `codex/ove-27-production-pilot-smoke` had branch-specific `PUBLIC_SITE_URL` and `BETTER_AUTH_URL` set to `https://over-garden-git-codex-ove-27-pr-a698a5-yehors-projects-01221e2b.vercel.app`, then was redeployed so Better Auth accepted that preview origin during browser smoke.
- On 2026-06-27, legacy production `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, and empty `POSTGRES_*` variables were removed from Vercel after canonical runtime env was installed.
- On 2026-06-27, accidental trailing newlines were trimmed from the R2 runtime env family in production and the branch preview `codex/ove-27-production-pilot-smoke`.
- On 2026-06-28, production Vercel env gained `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MATCHING_SERVICE_URL`, and `MATCHING_SERVICE_TOKEN` for the deployed worker/Meilisearch runtime. Values are intentionally not recorded here.
- Closed-pilot invite links (OVE-42) require `PILOT_INVITE_SIGNING_SECRET` in every environment that shares production invite URLs. Generate links from `apps/web` with `pnpm pilot:invite` after setting the secret in `.env.local` or Vercel. Never commit the secret or printed invite URLs.
- Closed-pilot auth recovery (OVE-48) uses operator-assisted Better Auth password reset. Generate one-time reset URLs from `apps/web` with `pnpm pilot:reset-password -- --email <address>` against the target environment database. Share printed links privately; never commit reset URLs, tokens, or passwords.
- Do not infer database readiness from the presence of env var names alone. The live smoke must prove a successful server-side database ping on the deployed app.
- Do not infer invite readiness from `PILOT_INVITE_SIGNING_SECRET` presence alone. The live smoke must also prove `/join?invite=` sets an eligibility cookie, first authenticated write materializes `pilot_invite_grants`, and the user reaches the write composer.

Vercel invariants:

- OVE-191 walking-skeleton surfaces are never enabled in Vercel. Production and
  Preview must return a null-body `404` for the page and API before auth/data
  access. `WALKING_SKELETON_ENABLED` is a local-only two-key diagnostic gate;
  do not install it as true in any deployed environment. Exact-production proof
  belongs to the credential-free `smoke:drive2-production` result, which records
  only status classes and redaction booleans.
- Do not commit Vercel tokens, protected preview URLs with nonce/share tokens, build logs containing secrets, or environment variable values.
- Do not document or paste auth secret values. Evidence may say `BETTER_AUTH_SECRET` is present, missing, placeholder-like, or local-fallback only.
- Do not document or paste Google OAuth client secrets, OAuth tokens, callback query parameters, provider token responses, or signed cookies. Evidence may say only whether `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are present and whether the exact redirect URI is authorized.
- Google Analytics / Google Tag Manager evidence may record only the public measurement id, public GTM container id, consent-banner presence, public-route script presence/absence after consent, route class, and HTTP status class. Do not record Google cookies, client IDs, session IDs, IP/user-agent values, referrers, private route paths, auth callback params, or Google Analytics report rows containing user-level data.
- Microsoft Clarity evidence may record only env presence/disabled/enabled class, public project id presence class, analytics consent state class, public-route Clarity script/request presence/absence after consent, route class, and HTTP status class. Do not record Clarity cookies, Clarity session IDs, recordings, heatmap screenshots, user identifiers, raw URLs/referrers, private route paths, auth callback params, invite/reset/verification tokens, journal text, media keys/URLs, precise location, IP/user-agent values, or Clarity report rows containing user-level data.
- Do not document or paste Facebook App Secret values, OAuth tokens, callback query parameters, provider token responses, app access tokens, user access tokens, or signed cookies. Evidence may say only whether `FACEBOOK_CLIENT_ID`/`FACEBOOK_CLIENT_SECRET` are present, whether `FACEBOOK_LOGIN_PUBLIC_READY` is false/true by class, whether the exact Valid OAuth Redirect URI is authorized, and whether the Meta app mode is development/test-user or production-ready.
- Meta Ads attribution evidence may record only env presence/disabled/enabled class, public Pixel id presence class, marketing consent banner presence, public-route Pixel script presence/absence after consent, safe event class delivery in Test Events, and CAPI success/failure class. Do not record CAPI access tokens, test-event codes, Meta cookies, client ids, user ids, emails, IP/user-agent values, raw URLs/referrers, callback params, private route paths, event payloads containing private garden data, or Meta report rows containing user-level data.
- Public H6 smoke must use an unauthenticated public URL that returns OverGarden SSR HTML, not Vercel SSO.
- Internal operator surfaces use durable `admin_user_roles` capabilities. Bootstrap owner access only through `pnpm admin:bootstrap-owner` for a verified account with exactly one password-bearing credential and no linked provider, and do not record user IDs, emails, cookies, tokens, connection strings, IP/user-agent fields, or env values in docs, Linear, logs, or chat. Google/Facebook accounts must stay normal gardener accounts and must not become admin-capable. `CATALOG_CURATOR_USER_IDS` is a deprecated legacy allowlist pattern, not the primary long-term admin model.
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
