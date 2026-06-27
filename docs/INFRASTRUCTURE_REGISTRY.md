# Infrastructure Registry

Status: live operational source of truth
Last verified: 2026-06-27
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
- Do not manually CNAME media traffic to the `r2.dev` public development URL. R2 custom domains must be attached through the R2 bucket custom-domain flow.

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
  - `https://over.garden`
  - `https://www.over.garden`
- Methods: `PUT`, `HEAD`
- Headers: `*`
- Exposed headers: `ETag`
- Max age: `3600`
- Dynamic Vercel preview deployment origins are intentionally not listed here by default. A full browser upload smoke should use an allowed app origin or an explicitly approved temporary preview origin; Node/API smoke alone does not exercise browser CORS preflight.
- If `https://over-garden.vercel.app` remains the selected public pilot URL before `over.garden` is attached, add and verify that origin in the quarantine bucket CORS dashboard before browser upload smoke. The current object-scoped R2 token can upload/read objects but cannot read or update bucket CORS configuration.

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

Status: production Managed PostgreSQL is provisioned for the pilot smoke.

Last verified: 2026-06-27 through a direct TLS database ping and schema count.

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

Database invariants:

- Do not store database passwords, full connection URLs, or CA certificate bodies in git, Linear, chat, or docs.
- Vercel runtime should prefer canonical `DATABASE_URL` and `DIRECT_URL`; do not reintroduce legacy empty `POSTGRES_*` aliases as active production configuration.
- `DATABASE_SSL_CA` may be multi-line in Vercel. The app runtime strips `sslmode` from the connection string when a CA is configured so Node `pg` uses the explicit CA with strict verification.

## Vercel

Status: project exists; production deployment is created from GitHub `main`; public Vercel access is enabled for the pilot URL.

Last verified: 2026-06-27 through the connected Vercel app.

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

- Deployment ID: `dpl_G37QZoqLHmt2dh6NUsEepKRH8ezx`
- Deployment URL: `https://over-garden-fuscx66ir-yehors-projects-01221e2b.vercel.app`
- Ready state: `READY`
- Target: `production`
- Source: GitHub integration
- GitHub commit: `9a6179bbfe2b8115e358a69e4a40cc98b5a25a36`
- GitHub commit message: `feat(garden): add pilot health readout`
- Branch alias: `over-garden-git-main-yehors-projects-01221e2b.vercel.app`

Production aliases reported by Vercel:

- `over-garden.vercel.app`
- `over-garden-yehors-projects-01221e2b.vercel.app`
- `over-garden-git-main-yehors-projects-01221e2b.vercel.app`

Domain status:

- `over.garden` and `www.over.garden` are not listed as Vercel project domains at verification time.
- The public media domain `media.over.garden` is Cloudflare R2-managed and separate from the app domain.

Public access observation:

- On 2026-06-27, fetching `https://over-garden-fuscx66ir-yehors-projects-01221e2b.vercel.app/health` returned HTTP `302` to Vercel SSO instead of OverGarden HTML.
- Response headers included `cache-control: no-store, max-age=0` and `x-robots-tag: noindex`.
- This is acceptable for protected preview inspection, but it blocks public visitor/crawler H6 smoke until a public production URL or authenticated preview-share flow is intentionally selected and documented.
- Later on 2026-06-27, `https://over-garden.vercel.app/health`, `/`, and `/privacy` returned HTTP `200` OverGarden HTML without Vercel SSO.

Deployment env observation:

- On 2026-06-27, the Vercel project had `BETTER_AUTH_SECRET` installed for production, development, and the branch preview `codex/ove-27-production-pilot-smoke`.
- On 2026-06-27, the Vercel project had the R2 runtime env family installed for production, development, and the branch preview: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_FORCE_PATH_STYLE`, `R2_QUARANTINE_BUCKET`, `R2_PUBLIC_BUCKET`, and `R2_PUBLIC_BASE_URL`.
- On 2026-06-27, the Vercel project had `DATABASE_SSL=true` installed for production, development, and the branch preview.
- On 2026-06-27, the Vercel project had `DATABASE_URL`, `DIRECT_URL`, and `DATABASE_SSL_CA` installed for production and the branch preview `codex/ove-27-production-pilot-smoke`.
- On 2026-06-27, production had `PUBLIC_SITE_URL` and `BETTER_AUTH_URL` set to the public Vercel alias `https://over-garden.vercel.app`.
- On 2026-06-27, legacy production `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, and empty `POSTGRES_*` variables were removed from Vercel after canonical runtime env was installed.
- On 2026-06-27, accidental trailing newlines were trimmed from the R2 runtime env family in production and the branch preview `codex/ove-27-production-pilot-smoke`.
- Do not infer database readiness from the presence of env var names alone. The live smoke must prove a successful server-side database ping on the deployed app.

Vercel invariants:

- Do not commit Vercel tokens, protected preview URLs with nonce/share tokens, build logs containing secrets, or environment variable values.
- Public H6 smoke must use an unauthenticated public URL that returns OverGarden SSR HTML, not Vercel SSO.
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

- Bind `over.garden` and `www.over.garden` to the Vercel project when ready for public app traffic.
- Provision the production worker/Meilisearch host and record non-secret host metadata here.
- After `OVE-12` proves production media readback through `https://media.over.garden`, disable the public `r2.dev` development URL for `overgarden-public`.
