# Production Pilot Smoke

Status: live smoke contract for OVE-27 plus OVE-36 worker/search proof plus OVE-37 current-main public-pilot closure plus OVE-38 iOS Safari offline entry + photo field proof plus OVE-39 backup/PITR + worker recovery durability proof
Last updated: 2026-06-29

This document defines the production or preview pilot smoke that must pass before OverGarden can treat the live environment as ready for a first real pilot user. It is intentionally narrow: it proves one deployed first-user path end to end, not every future production concern.

The smoke is a product-learning gate, not only a deployment check. If public visitors or crawlers see Vercel SSO, broken auth, missing media derivatives, cached HTML, or unprocessed public/search jobs, H1/H4/H6 data becomes deployment noise rather than product evidence.

## Current Live Deployment Snapshot

Verified through the connected Vercel app on 2026-06-27.

- Vercel team: `yehor's projects` / `team_vs3oQAk6OT4vVVvcL7Mf5m8t`
- Vercel project: `over-garden` / `prj_Tm5HXFEPqc46StpIfsoKjU9GtHBy`
- Latest production deployment: `dpl_G37QZoqLHmt2dh6NUsEepKRH8ezx`
- Latest production URL: `https://over-garden-fuscx66ir-yehors-projects-01221e2b.vercel.app`
- Latest deployed commit: `9a6179bbfe2b8115e358a69e4a40cc98b5a25a36`
- Reported aliases: `over-garden.vercel.app`, `over-garden-yehors-projects-01221e2b.vercel.app`, `over-garden-git-main-yehors-projects-01221e2b.vercel.app`
- Canonical app domains `over.garden` and `www.over.garden` are not yet attached to the Vercel project.
- Earlier on 2026-06-27, fetching `/health` on the production deployment returned HTTP `302` to Vercel SSO, not OverGarden HTML.
- Later on 2026-06-27, `https://over-garden.vercel.app/health`, `/`, and `/privacy` returned HTTP `200` OverGarden HTML without Vercel SSO.
- Deployment env now has `BETTER_AUTH_SECRET`, R2 runtime env, `DATABASE_SSL=true`, `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_CA`, and production `PUBLIC_SITE_URL` / `BETTER_AUTH_URL` installed in Vercel. Internal operator surfaces additionally require `CATALOG_CURATOR_USER_IDS`; missing or empty values fail closed and block operator smoke access.
- Production managed Postgres is provisioned in DigitalOcean `FRA1`, reachable through public TLS with the configured CA, and bootstrapped with the app schema plus Better Auth tables.
- OVE-27 branch preview `codex/ove-27-production-pilot-smoke` was redeployed after setting branch-specific `PUBLIC_SITE_URL` / `BETTER_AUTH_URL` to the branch alias and adding that alias to the R2 quarantine CORS origins.
- On 2026-06-27, that branch preview passed the browser pilot smoke through homepage first-entry with photo, derivative-only authenticated readback, same-object follow-up, public SSR journal readback, public variety CTA back to `/garden`, archive to `410 Gone`, and authenticated `/garden/pilot-health` aggregate readout.
- On 2026-06-28, OVE-36 provisioned the production worker/Meilisearch runtime at `matching.over.garden` and `meili.over.garden`, installed the production Vercel worker/search env names, and passed a redacted live journal index/unindex smoke against production Postgres and Meilisearch.

Implication: the OVE-27 preview now proves the internal live-path contract against managed Postgres and R2. The remaining production closeout is to merge the deployed app version with the CA-aware database runtime and verify the same smoke on the public production alias selected for the pilot. A protected preview is acceptable for internal deployment inspection, but it does not replace public visitor/crawler validation for H6.

## OVE-37 Current-Main Public Pilot Closure

Verified on 2026-06-28 against current `main`.

- Selected public pilot URL: `https://over-garden.vercel.app`. Canonical `over.garden` / `www.over.garden` remain unattached to the Vercel project and are deferred to a follow-up domain-attach issue; the `.vercel.app` production alias is the pilot URL for this closure.
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

- Canonical `over.garden` domain attach is deferred to a later issue; the pilot URL is the `.vercel.app` production alias.
- The OS file-picker upload click was not agent-driven; the photo derivative guarantee is proven via the authenticated media API plus a live CORS-preflight check for the pilot origin, not a browser file-picker run.
- Worker/search index/unindex execution relies on the standing OVE-36 live proof rather than a fresh run for this closure.

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
pilot_url_class: over-garden.vercel.app (OVE-37 pilot alias)
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
- Status: `UNVERIFIED-NEEDS-OPERATOR` as of 2026-06-29. The repo/sandbox holds no DigitalOcean credentials, so backup/PITR state was not machine-verified. This is recorded honestly as needs-operator, not as a pass.
- Closed-pilot interpretation: an unconfirmed backup/PITR posture is a launch blocker for inviting real users. Once confirmed, record pass/degraded with the date in `docs/INFRASTRUCTURE_REGISTRY.md`.
- Operator verification (redacted):
  1. Dashboard: DigitalOcean Cloud -> Databases -> `overgarden-postgres-prod-fra1` -> Backups/Settings. Confirm automatic daily backups are enabled; note the PITR/retention window and the latest backup timestamp.
  2. CLI/API (secrets omitted): `doctl databases list` to resolve the cluster id, then `doctl databases backups list <cluster-id>`; or `GET https://api.digitalocean.com/v2/databases/{cluster_uuid}/backups` with a bearer token that is never recorded.
  3. To validate recoverability, fork/restore into a NEW cluster (`doctl databases fork ...`). Never restore over production.
- Allowed evidence: backup-enabled boolean, retention/PITR window, latest backup date, check date. Forbidden: database URLs, the CA body, credentials, doctl/API tokens.

### Worker and Meilisearch process management

- Process manager: Docker Compose under `/opt/overgarden` on `overgarden-worker-prod-fra1` with containers `meilisearch`, `matching-api`, `matching-worker`, `caddy`.
- Restart policy: containers run with a Docker restart policy (`unless-stopped`/`always`) so the worker, API, and Meilisearch return after a crash or droplet reboot. Operator confirms live via `docker compose ps` and a restart-policy inspect.
- Health endpoints: matching `https://matching.over.garden/health` (`ok`, ICU present) and Meilisearch `https://meili.over.garden/health` (`available`).
- Stale-job reclaim: the worker claims `job_queue` rows with `FOR UPDATE SKIP LOCKED` and reclaims `processing` rows once `locked_at` is older than `WORKER_VT_SECONDS` (default 30s). Handlers are idempotent (Meili upsert by primary key / delete by id), so a restart mid-job re-delivers the work at-least-once without duplicating or corrupting the public index. Failed jobs back off and retry; unknown kinds fail with `last_error` rather than being marked done.

### Deterministic local recovery proof

`services/matching/tests/test_worker_recovery.py` proves, with no live services, that:

- a `processing` row is reclaimed only after the visibility timeout (and a freshly locked row is not), so a restarted worker recovers in-flight jobs;
- after a simulated restart/crash, `journal_entry_index` and `journal_entry_unindex` still reach `done`;
- the indexed document keeps exactly the public-safe OVE-36 contract (`body`, `createdAt`, `entryDate`, `id`, `kind`, `locationVisibility`, `noindex`, `publicPath`, `publicSlug`, `title`) with no owner/user IDs, media keys, precise location, IPs, or user agents;
- at-least-once re-delivery is idempotent (no duplicate document, identical safe shape);
- a transient Meilisearch outage marks the job `failed` with a future retry and a later run recovers it to `done`.

Run it with:

```bash
cd services/matching
uv run --frozen pytest tests/test_worker_recovery.py
```

### Live worker restart/recovery smoke (operator, redacted)

This is the live counterpart that requires the droplet; the local harness de-risks it but does not replace it.

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

### OVE-39 Done gate

Do not treat the durability slice as complete (and do not invite pilot users on durability grounds) if any of the following are true:

- Backup/PITR status for `overgarden-postgres-prod-fra1` is unknown and not even recorded as `UNVERIFIED-NEEDS-OPERATOR` with a date.
- Worker restart behavior is undocumented or unproven (no restart policy confirmed and no recovery proof).
- Search jobs only reach `done` before a restart but not after recovery, or a recovered job drops the public-safe document contract.
- Stale `processing` reclaim is neither proven by the local harness nor by a live canary.
- Any evidence leaks secrets or private data: database URLs, CA body, credentials, doctl/API tokens, Meilisearch keys, worker env files, journal text, precise location, IPs, user agents, or user-tied row IDs.

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
- Enum attribution classes: `homepage`, `public_variety`, `direct_garden`.

Forbidden evidence:

- Raw journal title/body text.
- Email addresses, signed cookies, session tokens, API keys, database URLs, Vercel SSO nonce/share URLs, or protected preview tokens.
- Quarantine keys, signed upload URLs, original object keys, EXIF data, precise location, IP address, user agent, referrer, or raw query string.
- Full private URLs from authenticated pages.

## Preflight

1. Pick one smoke URL:
   - Production public URL once deployment protection is disabled for the pilot audience.
   - Protected preview only when the goal is internal deployment inspection, not public H6 validation.
2. Confirm `CATALOG_CURATOR_USER_IDS` is set to the intended Better Auth operator user ID in the selected environment. Do not copy the value into evidence.
3. Open `/garden/pilot-smoke` as an allowlisted operator.
4. Treat any `fail` check as a blocker for live pilot.
5. Treat `warn` checks as explicit degraded state that must be named in the Linear/GitHub handoff.
6. Confirm Cloudflare is not caching app HTML if the app domain is routed through Cloudflare.

Header probes:

```bash
curl -I "$SMOKE_BASE_URL/health"
curl -I "$SMOKE_BASE_URL/"
curl -I "$SMOKE_BASE_URL/privacy"
```

Public visitor/crawler prerequisite:

- These routes must return OverGarden HTML or route-appropriate redirects, not Vercel SSO.
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
  - Meilisearch document existed with keys `body`, `createdAt`, `entryDate`, `id`, `kind`, `locationVisibility`, `noindex`, `publicPath`, `publicSlug`, and `title`,
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
- `CATALOG_CURATOR_USER_IDS` is missing or empty for the selected environment, leaving operator surfaces inaccessible by design.
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
