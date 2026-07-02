# Production Pilot Smoke

Status: live smoke contract for OVE-27 plus OVE-36 worker/search proof plus OVE-37 current-main public-pilot closure plus OVE-38 iOS Safari offline entry + photo field proof plus OVE-39 backup/PITR + worker recovery durability proof plus OVE-41 closed-cohort invite loop plus OVE-48 closed-pilot auth recovery plus OVE-51 canonical `over.garden` pilot origin plus OVE-54 founder-only pilot rehearsal separation plus OVE-91 app-layer HTML no-store guardrail
Last updated: 2026-07-01

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
- Deployment env now has `BETTER_AUTH_SECRET`, R2 runtime env, `DATABASE_SSL=true`, `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_CA`, `PILOT_INVITE_SIGNING_SECRET`, and canonical production `PUBLIC_SITE_URL=https://over.garden` / `BETTER_AUTH_URL=https://over.garden` installed in Vercel. Runtime auth fails closed in production-like environments when `BETTER_AUTH_SECRET` is missing, placeholder-like, equal to the local development fallback, or when Vercel production points auth/public origin at the legacy `.vercel.app` alias. Internal operator surfaces use durable `admin_user_roles` capabilities and owner bootstrap through `pnpm admin:bootstrap-owner`; `CATALOG_CURATOR_USER_IDS` is no longer the primary long-term admin model.
- Production managed Postgres is provisioned in DigitalOcean `FRA1`, reachable through public TLS with the configured CA, and bootstrapped with the app schema plus Better Auth tables. OVE-51 reran the non-destructive app bootstrap and confirmed the closed-pilot `pilot_invite_grants` table exists before the canonical invited-gardener smoke.
- OVE-27 branch preview `codex/ove-27-production-pilot-smoke` was redeployed after setting branch-specific `PUBLIC_SITE_URL` / `BETTER_AUTH_URL` to the branch alias and adding that alias to the R2 quarantine CORS origins.
- On 2026-06-27, that branch preview passed the browser pilot smoke through homepage first-entry with photo, derivative-only authenticated readback, same-object follow-up, public SSR journal readback, public variety CTA back to `/garden`, archive to `410 Gone`, and authenticated `/garden/pilot-health` aggregate readout.
- On 2026-06-28, OVE-36 provisioned the production worker/Meilisearch runtime at `matching.over.garden` and `meili.over.garden`, installed the production Vercel worker/search env names, and passed a redacted live journal index/unindex smoke against production Postgres and Meilisearch.

Implication: the OVE-27 preview proved the internal live-path contract against managed Postgres and R2; OVE-37 moved that proof to current `main` on the public Vercel production alias; OVE-51 makes `https://over.garden` the selected pilot origin. A protected preview is acceptable for internal deployment inspection, but it does not replace public visitor/crawler validation for H6 on the canonical domain.

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
- Status: `pass` as of 2026-06-29. `doctl databases list` verified the production cluster online in `fra1`; `doctl databases backups <cluster-id>` returned managed backup rows, with the latest observed backup on 2026-06-28 17:33 UTC and a small backup size class (<0.1 GiB). The PITR/retention window is recorded as 7d per DigitalOcean Managed PostgreSQL docs/provider default; the provider output did not show a different window.
- Closed-pilot interpretation: backup/PITR posture is no longer a launch blocker for the closed pilot. A destructive restore-over-production drill remains out of scope and still requires explicit maintainer sign-off.
- Operator verification (redacted):
  1. Dashboard: DigitalOcean Cloud -> Databases -> `overgarden-postgres-prod-fra1` -> Backups/Settings. Confirm automatic daily backups are enabled; note the PITR/retention window and the latest backup timestamp.
  2. CLI/API (secrets omitted): `doctl databases list` to resolve the cluster id, then `doctl databases backups <cluster-id>`; or `GET https://api.digitalocean.com/v2/databases/{cluster_uuid}/backups` with a bearer token that is never recorded.
  3. To validate recoverability, fork/restore into a NEW cluster (`doctl databases fork ...`). Never restore over production.
- Allowed evidence: backup-enabled boolean, retention/PITR window, latest backup date, check date. Forbidden: database URLs, the CA body, credentials, doctl/API tokens.

### Worker and Meilisearch process management

Runtime classification: this section is `production-linux-required` under `docs/CONTAINER_RUNTIME_POLICY.md`. OVE-74 proves the matching image build and local health/worker/search smoke on Apple Container for supported Macs, but Apple Container is not the DigitalOcean Linux droplet process manager. OVE-76 confirms Docker Compose remains the current production process manager until a separate non-Apple Linux replacement is live-proven.

- Process manager: Docker Compose under `/opt/overgarden` on `overgarden-worker-prod-fra1` with containers `meilisearch`, `matching-api`, `matching-worker`, `caddy`.
- Restart policy: live-confirmed on 2026-06-29 as `unless-stopped` for `meilisearch`, `matching-api`, `matching-worker`, and `caddy`, so the worker, API, and Meilisearch return after a crash or droplet reboot.
- Health endpoints: live-confirmed on 2026-06-29: matching `https://matching.over.garden/health` returned `ok` with ICU present, and Meilisearch `https://meili.over.garden/health` returned `available`.
- Stale-job reclaim: the worker claims `job_queue` rows with `FOR UPDATE SKIP LOCKED` and reclaims `processing` rows once `locked_at` is older than `WORKER_VT_SECONDS` (default 30s). Handlers are idempotent (Meili upsert by primary key / delete by id), so a restart mid-job re-delivers the work at-least-once without duplicating or corrupting the public index. Failed jobs back off and retry; unknown kinds fail with `last_error` rather than being marked done.

Do not remove or rewrite these production Docker Compose instructions for Apple Container. A non-Docker production path is a separate production migration, not a local Apple Container follow-up. Acceptable replacement candidates include systemd units, managed Meilisearch plus a separately managed worker, or another Linux runtime, but only after live redacted proof shows equivalent process restart/reboot recovery, matching and Meilisearch health, `journal_entry_index`/`journal_entry_unindex` completion, and the same public-safe Meilisearch document contract proven by OVE-39.

### Deterministic local recovery proof

`services/matching/tests/test_worker_recovery.py` proves, with no live services, that:

- a `processing` row is reclaimed only after the visibility timeout (and a freshly locked row is not), so a restarted worker recovers in-flight jobs;
- after a simulated restart/crash, `journal_entry_index` and `journal_entry_unindex` still reach `done`;
- the indexed document keeps the public-safe contract enforced by `contracts/search/public-journal-entry-search-document.json` and written by `services/matching/app/search.py`: required keys `body`, `createdAt`, `entryDate`, `id`, `kind`, `locationVisibility`, `noindex`, `publicPath`, `publicSlug`, `title`, with optional `coarseRegionCode` only for region-visible entries, and no owner/user IDs, media keys, precise location, raw coarse-location columns, request metadata, IPs, user agents, referrers, invite data, or private journal state;
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

- A `noindex` invite landing page at `/join` with calm, non-technical copy. Its only forward action carries the enum source into `/garden?source=invited-cohort` (`gardenFirstEntryInvitePath`). The page is excluded from `sitemap.ts` (which lists indexable public variety pages only).
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
- Write paths (`/api/garden/entries`, follow-up actions, skeleton write routes) require `requireWriteEligibleRequestScope()`: authenticated plus invited grant or valid eligibility cookie that materializes the grant on first write.
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

## OVE-48 Closed-Pilot Auth Recovery

Goal: an invited pilot gardener who loses access or forgets how to sign in can recover through a documented operator-assisted path and return to the same `/garden` workspace with prior plant objects and entries intact. This is retention/support for a tiny closed pilot, not a full auth product expansion.

### What landed

- `/garden` auth panel accepts real email/password sign-in and sign-up instead of a hardcoded local-only account. Duplicate sign-up attempts map to calm recovery copy that steers the gardener back to sign-in on the existing account rather than creating a second garden.
- Better Auth password reset is wired with `sendResetPassword`, but the closed pilot does not send email automatically. Operator CLI mode captures the one-time reset URL for private handoff.
- `/auth/help` (`noindex`) explains the closed-pilot sign-in support flow and remaining limitations.
- `/auth/reset-password` (`noindex`) lets a gardener set a new password from the operator-provided one-time link and return to `/garden`.
- Founders generate reset URLs from `apps/web` with `pnpm pilot:reset-password -- --email <address>` after confirming the gardener already registered that email.

### Founder recovery workflow (no secrets in git or Linear)

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
- Self-serve password reset promises automated email delivery during the closed pilot.

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

## Preflight

1. Pick one smoke URL:
   - Production public URL once deployment protection is disabled for the pilot audience.
   - Protected preview only when the goal is internal deployment inspection, not public H6 validation.
2. Bootstrap the owner role only through `pnpm admin:bootstrap-owner`; do not copy the user id into evidence.
3. Open `/garden/pilot-smoke` as an owner/admin/moderator/viewer role with `operator:read`.
4. Treat any `fail` check as a blocker for live pilot.
5. Treat `warn` checks as explicit degraded state that must be named in the Linear/GitHub handoff.
6. Confirm Cloudflare is not caching app HTML if the app domain is routed through Cloudflare.
7. Open `/admin` signed out and confirm it shows the auth boundary rather than admin links.
8. Open `/admin` as a normal signed-in user and confirm it shows `Access denied.` before dashboard links.
9. Open `/admin` as the owner and confirm it renders `Role: Owner`, admin links, role-required hints, and no raw journal text, user emails, cookies, tokens, IP/user-agent fields, media keys, precise coordinates, or env values.
10. Open `/admin/users` as the owner and confirm role assignments plus recent audit rows render with bounded role/action/reason labels only.
11. Open `/admin/users` as a normal signed-in user and as a non-owner admin role; both must show `Access denied.` before assignments or audit rows.

Header probes:

```bash
curl -I "$SMOKE_BASE_URL/health"
curl -I "$SMOKE_BASE_URL/"
curl -I "$SMOKE_BASE_URL/join"
curl -I "$SMOKE_BASE_URL/privacy"
```

Public visitor/crawler prerequisite:

- These routes must return OverGarden HTML or route-appropriate redirects, not Vercel SSO.
- Matched app routes must send `Cache-Control: private, no-store, max-age=0, s-maxage=0, must-revalidate` during the closed pilot.
- Public HTML must not have Cloudflare `cf-cache-status: HIT`.
- Public marketing/legal/supporting routes should remain `noindex` unless explicitly promoted.

## Smoke Sequence

1. Open `/` and follow the primary CTA into `/garden?source=homepage`.
2. Sign up or sign in as the pilot smoke user.
3. Create one first plant entry with:
   - one space,
   - one plant object,
   - title/body entered by the operator but not copied into evidence,
   - `hidden` or safe region-level location only,
   - catalog selected, user-added, or Unknown.
4. Attach one photo:
   - create the presigned quarantine upload through the app,
   - upload the image,
   - process it server-side,
   - confirm authenticated readback displays only the public derivative.
5. Open the object page and add a follow-up entry to the same object.
6. Publish the first entry after accepting first-publication disclosure.
7. Open the public `/journal/[slug]` URL:
   - status `200`,
   - SSR HTML visible without client JS dependency,
   - robots `noindex, nofollow`,
   - no precise location,
   - no quarantine/original media key,
   - derivative-only media if a photo was attached.
8. From the public entry, open `/variety/[slug]` when linked:
   - page renders only if there is safe public entry depth for that catalog item,
   - thin pages stay noindex,
   - CTA carries only a public catalog slug into `/garden`.
9. Use the public variety CTA, sign in if needed, and save another first-entry path with public-variety activation attribution.
10. Archive the published entry from the authenticated object page.
11. Reopen the old public journal URL and confirm status `410`, robots `noindex, nofollow`, and no private content in the tombstone.
12. Open `/garden/pilot-health` and confirm aggregate H1/H4/H6 metrics update without raw journal text, email, precise location, media keys, referrers, IPs, or user agents.

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
- The selected owner/admin user has not been bootstrapped into `admin_user_roles`, leaving operator surfaces inaccessible by design.
- `/admin/users` lets a non-owner role grant/revoke admin roles or remove the last owner.
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
uv run python -m py_compile app/__init__.py app/main.py app/search.py app/worker.py
uv run --frozen pytest
```
