# Runtime Scaffold — Status & Verification

Current status: the 2026-06-26 walking skeleton is implemented and locally verified. SDD Slice 1 / Issue 1 adds the first real product path: authenticated space -> plant object -> journal entry -> object readback. SDD Slice 1 / Issue 2 adds one-photo entry upload -> quarantine -> stripped derivative processing -> original deletion -> derivative-only readback. SDD Slice 1 / Issue 3 adds offline first-entry capture with photo intent -> local queue -> manual retry -> canonical server create -> authenticated readback without duplicate entries. SDD Slice 1 / Issue 4 adds explicit entry publication -> first-publication disclosure logging -> SSR public readback -> `noindex` metadata -> derivative-only media -> public-safe search document conversion. SDD Slice 1 / Issue 5 adds recoverable entry archive/public-gone state -> authenticated archive UI -> public `410 Gone` tombstone -> search-document exclusion guard. SDD Slice 1 / Issue 6 adds object revisit -> second dated entry on the same object -> first-party H1-safe event rows with privacy payload tests. See `docs/WALKING_SKELETON.md` and `docs/SDD_VERTICAL_SLICE_ROADMAP.md` for verification commands and slice rules.

## Proven Locally

- Next.js App Router + TypeScript builds successfully.
- shadcn/ui renders inside SSR pages.
- Better Auth route is mounted at `/api/auth/[...all]`; live sign-up returns a session cookie.
- Kysely + `pg` connect to local Docker Postgres.
- Better Auth tables are created through Better Auth's migration helper during `pnpm local:bootstrap`.
- SQL app schema creates `health`, `spaces`, `plant_objects`, `journal_entries`, `analytics_events`, `media_assets`, and `job_queue`.
- `kysely-codegen` generated `src/db/generated.ts` from 11 live tables.
- `/skeleton` and `/api/skeleton/journal` prove auth -> scoped repository -> Postgres -> queue -> SSR readback.
- `/garden` and `/garden/objects/[objectId]` prove the first product path outside `/skeleton`: authenticated create/readback for one space, one plant object, and one title/body entry.
- `/garden` first-entry flow can attach one processed photo asset and `/garden/objects/[objectId]` renders only the stripped public derivative.
- `/garden` first-entry flow can queue title/body/date/object/photo intent while offline, show queued/syncing/failed/synced local states, retry through `/api/garden/entries`, and read back exactly one authenticated server entry.
- `/garden/objects/[objectId]` can publish an existing entry through a signed-in server action after explicit disclosure, and `/journal/[slug]` renders a public SSR page that stays `noindex`.
- `/garden/objects/[objectId]` can archive a published entry privately; the old `/journal/[slug]` public URL returns HTTP `410 Gone` and search document conversion refuses archived/public-gone rows.
- `/garden/objects/[objectId]` can emit an owner-scoped revisit event, show prior entries, and append another dated title/body entry to the same plant object.
- Product writes emit first-party event rows for activation, photo attachment, offline sync, progress readback, and same-object return loops without title/body text, precise location, raw media metadata, email, or IP-derived location in event properties.
- Repository contract tests prove owner-scoped object readback and idempotent entry creation through `(owner_user_id, client_mutation_id)`.
- Analytics event tests prove event payload allowlists, owner/session/object linkage, same-session revisit follow-up marking, and non-blocking event failure logging.
- Repository contract tests prove owner-scoped publication, first-publication disclosure lookup, public slug readback, and derivative-only public media selection.
- Repository contract tests prove owner-scoped archive, public-gone tombstone lookup, active-only public readback, and active-only derivative media selection.
- R2 quarantine upload and public derivative processing work against the configured Cloudflare R2 buckets and `media.over.garden`.
- Media processor tests prove the quarantine original is deleted before the public derivative is written.
- `sharp` derivative tests prove WebP output without EXIF metadata.
- Dexie offline queue is test-covered with IndexedDB shim.
- Search document privacy tests prove private/unpublished entries are not indexed and public documents exclude owner-private fields, quarantine keys, precise location, and rows without public slugs.
- Python worker consumes the Postgres-backed queue and marks jobs `done`.
- Meilisearch Cyrillic typo proof passes against local Docker Meilisearch.

## External Infra Provisioned

- Cloudflare zone `over.garden` is active under account `cb03b15042adc74edfe2d8201636300a`.
- R2 buckets `overgarden-quarantine` and `overgarden-public` exist.
- R2 custom domain `media.over.garden` is attached to `overgarden-public` with ownership and SSL active.
- Live non-secret infrastructure values are recorded in `docs/INFRASTRUCTURE_REGISTRY.md`.

## Product Research Imported

- The original Startups research folder is duplicated into `docs/product-research/`.
- `docs/product-research/README.md` defines the Product Thinking Gate and routes agents to relevant research by task type.

## H1-Safe Event Instrumentation

- Event rows are first-party provisional measurement scaffolding, not final PostHog integration, dashboards, or validated targets.
- Event targets and thresholds remain provisional until live pilot calibration. Current numbers in the research corpus are pilot calibrators or desk thresholds, not confirmed OverGarden success criteria.
- `own_record_revisited` is diagnostic until followed by a later `entry_logged` on the same object in the same session. The linkage is stored through event relation/state, not by adding raw entry content to properties.
- Event properties are limited to booleans and enums such as `entry_scope`, `has_photo`, `is_backdated`, `location_visibility_level`, `sync_status`, `variety_state`, and `followed_by_action`.
- Do not add title, body, exact location, EXIF, raw media metadata, email, IP, user agent, or address fields to analytics properties.

## Verification Commands

```bash
cd infra && docker compose up -d
cd ../apps/web
pnpm local:bootstrap
pnpm db:types
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cd ../../services/matching
uv run python -m py_compile app/main.py app/search.py app/worker.py
MEILISEARCH_HOST='http://localhost:7700' MEILISEARCH_API_KEY='local_dev_meili_master_key_change_me_1234567890' uv run python -m app.search
```

## Still Deferred

- Production DigitalOcean Managed Postgres provisioning and backups/PITR checks.
- Production R2 S3 access key installation in deployment env.
- Production worker process manager/health checks on the DigitalOcean droplet.
- Production auth UX, email delivery, password reset, OAuth decisions.
- Full privacy invariant suite for every cross-user access path beyond the first product repository contracts.
- iOS Safari offline capture spike on a real device.
- PostHog integration, analytics dashboards, and full cohort reporting.

## Next Build Step

Continue `Execution Batch 1` in `docs/SDD_VERTICAL_SLICE_ROADMAP.md` with the next vertical slice after reviewing the return-loop/event implementation.

Every future Linear issue must be a vertical SDD slice, not a layer ticket. It must start from a user behavior and integrate the needed surfaces together: SQL/types -> scoped repository -> route/action/API -> UI -> background job/search/media/offline/event boundary when relevant -> tests -> docs. Do not create standalone tasks for "schema", "UI", "media", "analytics", "search", or "public pages" unless that work is inside the same issue as the user-visible path.

The completed return-loop slice must not be split into standalone analytics/event, UI, or repository follow-ups unless a later user-visible path requires them.

Before implementing the next issue, run the Product Thinking Gate in `docs/product-research/README.md` and include the selected research files in the Linear context.
