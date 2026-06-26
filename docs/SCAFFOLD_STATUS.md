# Runtime Scaffold — Status & Verification

Current status: the 2026-06-26 walking skeleton is implemented and locally verified. SDD Slice 1 / Issue 1 adds the first real product path: authenticated space -> plant object -> journal entry -> object readback. SDD Slice 1 / Issue 2 adds one-photo entry upload -> quarantine -> stripped derivative processing -> original deletion -> derivative-only readback. SDD Slice 1 / Issue 3 adds offline first-entry capture with photo intent -> local queue -> manual retry -> canonical server create -> authenticated readback without duplicate entries. SDD Slice 1 / Issue 4 adds explicit entry publication -> first-publication disclosure logging -> SSR public readback -> `noindex` metadata -> derivative-only media -> public-safe search document conversion. SDD Slice 1 / Issue 5 adds recoverable entry archive/public-gone state -> authenticated archive UI -> public `410 Gone` tombstone -> search-document exclusion guard. SDD Slice 1 / Issue 6 adds object revisit -> second dated entry on the same object -> first-party H1-safe event rows with privacy payload tests. SDD Slice 2 / OVE-13 adds minimal seeded catalog tables -> signed-in catalog typeahead API -> first-entry selected/unknown catalog state -> object readback/offline payload/event enum tests. SDD Slice 2 / OVE-14 adds explicit missing-name capture -> provisional user-added catalog item -> curation queue job contract -> first-entry user_added state without treating raw text as canonical. SDD Slice 2 / OVE-15 adds a Meilisearch-derived catalog typeahead index contract -> Cyrillic-tolerant catalog search path -> Postgres fallback -> matching-worker reindex job path without leaking provisional/user-owned rows. SDD Slice 2 / OVE-16 adds revisit-time catalog resolution for Unknown/user-added objects -> selected catalog identity -> unchanged journal history -> public SSR revalidation for already-public entries. SDD Slice 2 / OVE-17 adds an internal catalog curation scaffold -> pending provisional list -> confirm/merge/reject decisions -> affected object identity updates -> typeahead reindex job enqueue. SDD Slice 3 / OVE-18 adds the first public variety aggregation surface: safe global catalog slug -> SSR `/variety/[slug]` -> active public entry aggregation -> derivative-only media -> source entry links, while staying `noindex`. SDD Slice 3 / OVE-19 adds conservative thinness promotion: `/variety/[slug]` remains `noindex` until safe public proof passes, promoted pages enter `/sitemap.xml`, JSON-LD is emitted only for promoted pages, and archive/public-gone removal de-promotes through the same server read model. SDD Slice 3 / OVE-21 adds a narrow founder seed proof path: internal curator -> one hand-authored proof block per seeded/confirmed catalog item -> draft/published state -> public variety render beside UGC without becoming a CMS or bypassing thinness promotion. SDD Slice 3 / OVE-22 adds the first public visitor activation loop: public variety CTA -> safe catalog slug carryover -> authenticated `/garden` first-entry composer with server-validated preselection -> canonical create/readback path -> enum-only activation attribution. See `docs/WALKING_SKELETON.md` and `docs/SDD_VERTICAL_SLICE_ROADMAP.md` for verification commands and slice rules.

## Proven Locally

- Next.js App Router + TypeScript builds successfully.
- shadcn/ui renders inside SSR pages.
- Better Auth route is mounted at `/api/auth/[...all]`; live sign-up returns a session cookie.
- Kysely + `pg` connect to local Docker Postgres.
- Better Auth tables are created through Better Auth's migration helper during `pnpm local:bootstrap`.
- SQL app schema creates `health`, `spaces`, `catalog_items`, `catalog_item_names`, `plant_objects`, `journal_entries`, `analytics_events`, `media_assets`, and `job_queue`.
- `kysely-codegen` generated `src/db/generated.ts` from 13 live tables.
- `/skeleton` and `/api/skeleton/journal` prove auth -> scoped repository -> Postgres -> queue -> SSR readback.
- `/garden` and `/garden/objects/[objectId]` prove the first product path outside `/skeleton`: authenticated create/readback for one space, one plant object, and one title/body entry.
- `/garden` first-entry flow can select a seeded catalog item or explicitly keep the object Unknown; selected objects store server-validated `catalog_item_id`, `variety_state = selected`, and canonical catalog display text on the plant object.
- `/garden` first-entry flow can explicitly add a missing catalog name; the server stores it as a provisional `catalog_items` row owned by the user scope, attaches it to the plant object with `variety_state = user_added`, and enqueues an idempotent `catalog_curation` job.
- `/api/garden/catalog/typeahead` provides a signed-in, bounded catalog suggestion path. It tries the derived Meilisearch `catalog_typeahead` index first and falls back to the Postgres seeded/confirmed query when search is unavailable.
- Catalog typeahead Meili documents contain only catalog item ID, display/canonical names, normalized alias text, locale hints, status/source, and ranking fields. They exclude owner IDs, private journal text, precise location, media metadata, analytics payloads, email, IP, and user agent.
- Provisional user-added catalog rows remain out of the global typeahead index until a later curation path promotes safe public identity.
- `/garden/objects/[objectId]` lets a signed-in owner resolve an existing Unknown or user-added object to a seeded/confirmed catalog item via the same app API typeahead, without moving, duplicating, or rewriting existing journal entries.
- Catalog resolution is object-level only: the server validates the selected catalog item, scopes the object update to the current owner, permits only Unknown/user-added -> selected transitions, revalidates affected public SSR entry paths, and leaves public entries `noindex`.
- `/garden/catalog/curation` provides a minimal internal scaffold for provisional catalog names. It shows only candidate display name, locale/status/source, created date, and aggregate object count; it does not show journal title/body, precise location, media metadata, email, IP, user agent, or private media URLs.
- Catalog curation can confirm a provisional row into a global `confirmed` catalog item, merge it into an existing seeded/confirmed item while moving affected objects to `selected`, or reject it without making it canonical. Confirm/merge enqueue the existing catalog typeahead reindex job.
- Seeded and confirmed global catalog rows can have a stable ASCII `public_slug`. Seeded rows are assigned deterministic seed slugs; confirmed user-added rows receive a server-generated slug only when curation clears owner scope. Provisional/user-owned rows do not become public variety identities.
- `/garden` first-entry flow can attach one processed photo asset and `/garden/objects/[objectId]` renders only the stripped public derivative.
- `/garden` first-entry flow can queue title/body/date/object/photo intent while offline, show queued/syncing/failed/synced local states, retry through `/api/garden/entries`, and read back exactly one authenticated server entry.
- `/garden/objects/[objectId]` can publish an existing entry through a signed-in server action after explicit disclosure, and `/journal/[slug]` renders a public SSR page that stays `noindex`.
- `/journal/[slug]` links to `/variety/[slug]` only when the entry's object has selected seeded/confirmed global catalog identity with a public slug.
- `/variety/[slug]` renders an SSR public aggregation page for a seeded/confirmed catalog item only when at least one safe public entry exists. It aggregates only active `visibility = public`, non-gone entries whose object is `selected`, whose catalog row is not owner-scoped, and whose media is already processed derivative media.
- `/variety/[slug]` now computes a server-side indexability state from the same safe public aggregation read model. The first conservative threshold is at least 3 active public entries and at least 600 aggregate journal body characters. Thin pages stay `noindex, nofollow`; threshold-passing pages become `index, follow`.
- `/sitemap.xml` includes only threshold-passing public variety pages. The sitemap query repeats the same public-safe filters and excludes archived, public-gone, private, provisional, owner-scoped, unknown, and below-threshold rows.
- Public variety JSON-LD is emitted only for threshold-passing pages and is limited to CollectionPage/WebSite/Thing plus entry headline/date/public URL. It does not include body text, precise location, owner fields, media storage keys, quarantine keys, or raw analytics fields.
- `/garden/catalog/curation` can create or update one plain-text founder seed proof block for a seeded/confirmed public catalog item. Published proof blocks render on that item's `/variety/[slug]` page beside safe UGC; draft proof blocks do not render publicly.
- Seed proof blocks are intentionally not a CMS: one block per catalog item, no rich HTML, no media library, no bulk creation, and no automatic page spawning. Server validation rejects provisional/user-owned catalog rows, unsafe raw HTML, and obvious precise-location/private field keys.
- `/variety/[slug]` has a direct activation CTA into `/garden` that carries only the public catalog slug plus an enum source. `/garden` resolves that slug server-side to a seeded/confirmed global catalog item before passing a preselected catalog match to the first-entry composer.
- Signed-out visitors keep the same activation URL through the local Better Auth panel. After sign-up/sign-in, the existing `/garden` first-entry flow opens with the catalog item preselected; signed-in visitors land directly in that state. Users can still clear the selection, choose another catalog item, add a missing name, or keep Unknown.
- `/garden/objects/[objectId]` can archive a published entry privately; the old `/journal/[slug]` public URL returns HTTP `410 Gone` and search document conversion refuses archived/public-gone rows.
- `/garden/objects/[objectId]` can emit an owner-scoped revisit event, show prior entries, and append another dated title/body entry to the same plant object.
- `/garden` and `/garden/objects/[objectId]` now use a controlled coarse-region contract for UA/BG ISO 3166-2 subdivision codes. Default visibility remains `hidden`; public `/journal/[slug]` renders a region label only when the object is explicitly `region` visible.
- Product writes emit first-party event rows for activation, photo attachment, offline sync, progress readback, and same-object return loops without title/body text, precise location, raw media metadata, email, public URL/referrer/query, user agent, or IP-derived location in event properties.
- Public-variety activation attribution is intentionally enum-only: `activation_source = public_variety` and `source_surface_kind = variety`. It never stores the public URL, catalog query string, referrer, selected display text, or journal title/body.
- Catalog selection event properties remain enum-only through `variety_state`; raw catalog query text and selected display strings are not analytics properties.
- Catalog repository contract tests prove typeahead reads only safe catalog tables, selectable IDs and public activation slugs are limited to seeded/confirmed global rows, Meili hits are deduped and filtered, reindex rows exclude owner-scoped catalog items, provisional candidates are upserted by owner/normalized name/locale, and curation/reindex job payloads exclude journal title/body content.
- Journal repository contract tests prove catalog resolution is owner-scoped, limited to Unknown/user-added states, does not update `journal_entries`, and revalidates only active public slugs without selecting private entry fields.
- Catalog curation repository tests prove pending lists expose aggregate-safe metadata only, confirm clears owner scope and makes the item index-eligible, merge updates affected objects without moving entries, reject keeps candidates non-canonical, and public revalidation queries avoid private entry fields.
- Public variety repository tests prove aggregation is limited to global seeded/confirmed catalog rows, selected objects, active public non-gone entries, owner-consistent entry/object/space joins, and derivative-only media selection without quarantine keys, raw media metadata, precise location, or owner-private fields in the read model.
- Public variety indexing tests prove thin pages remain out of index/sitemap until both the entry-count and aggregate-text thresholds pass, and metadata tests prove JSON-LD stays bounded to public-safe fields.
- Variety seed proof tests prove proof blocks attach only to global seeded/confirmed catalog rows with public slugs, public readback selects only published proof fields, sitemap/indexability does not depend on seed proofs, and validation rejects raw HTML plus obvious precise-location/private keys.
- Repository contract tests prove owner-scoped object readback and idempotent entry creation through `(owner_user_id, client_mutation_id)`.
- Analytics event tests prove event payload allowlists, enum-only public-variety activation attribution, rejection of raw URL/referrer/query/user-agent fields, owner/session/object linkage, same-session revisit follow-up marking, and non-blocking event failure logging.
- Repository contract tests prove owner-scoped publication, first-publication disclosure lookup, public slug readback, and derivative-only public media selection.
- Repository contract tests prove owner-scoped archive, public-gone tombstone lookup, active-only public readback, and active-only derivative media selection.
- R2 quarantine upload and public derivative processing work against the configured Cloudflare R2 buckets and `media.over.garden`.
- Media processor tests prove the quarantine original is deleted before the public derivative is written.
- `sharp` derivative tests prove WebP output without EXIF metadata.
- Dexie offline queue is test-covered with IndexedDB shim.
- Search document privacy tests prove private/unpublished entries are not indexed and public documents exclude owner-private fields, quarantine keys, precise location, and rows without public slugs.
- Catalog search document tests prove the `catalog_typeahead` document shape excludes provisional/user-owned rows and rejects unsafe Meili hits before they can appear in the picker.
- Coarse-region contract tests prove supported UA/BG subdivision codes normalize predictably, free-form/precise-location strings are rejected, and the SQL schema does not add exact-location columns.
- Python worker consumes the Postgres-backed queue and marks jobs `done`.
- Meilisearch Cyrillic typo proof passes against local Docker Meilisearch, and `app.search` includes a catalog-specific Cyrillic typo proof for the `catalog_typeahead` index.

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

## Catalog Curation Scaffold

- `CATALOG_CURATOR_USER_IDS` may contain a comma-separated Better Auth user-id allowlist for `/garden/catalog/curation`.
- Until a real admin/role model exists, an empty allowlist falls back to the existing authenticated-user boundary. This is a temporary MVP scaffold, not production-grade role management.
- The curation surface is intentionally narrow: pending provisional names, aggregate affected-object counts, confirm, merge, and reject. It is not a public moderation product.

## Conservative Region Decision

- Current implementation uses a conservative controlled vocabulary: ISO 3166-2 subdivision codes for Ukraine and Bulgaria only, exposed through `coarse_region_code`.
- `hidden` is still the default. When the current create/edit forms submit `hidden`, the server stores `coarse_region_code = null` instead of retaining a private region value. This minimizes stored location data for v0.
- Revisit before public variety-region pages or launch localization: whether hidden objects should retain a private coarse region for later toggles, whether labels should be localized, and whether any climate-zone grouping should sit beside the ISO code rather than replace it.

## Legal Placeholder Decision

- GDPR/privacy, erasure-request, and first-publication disclosure copy may remain placeholder copy during MVP scaffolding. Before public release, replace these placeholders with reviewed legal text and update the disclosure version if user-facing wording changes materially.
- Placeholder routes exist at `/privacy`, `/erasure`, and `/first-publication-disclosure`; they are `noindex` until real reviewed copy replaces them.

## Conservative Public Variety Decision

- Public variety pages remain `noindex` by default unless they pass the centralized OVE-19 threshold: at least 3 active public entries and at least 600 aggregate journal body characters.
- This is intentionally conservative and likely too simple for the long term. Revisit after pilot data: minimum photo diversity, region distribution, localized slug/transliteration strategy, and whether variety-region pages need stricter k-anonymity-like gates.
- Photo count is not part of the first promotion threshold. Reason: early entries may be useful without enough media coverage, and media quality/diversity should be calibrated from real UGC rather than guessed before OVE-21's richer seeded SEO surface exists.
- Founder seed proof is not part of the first promotion threshold and cannot make a page indexable by itself. Reason: seed proof is a cold-start quality aid, not proof of UGC density; using it as a promotion shortcut would recreate thin editorial doorway-page risk.
- If a catalog slug has zero safe public entries, `/variety/[slug]` returns 404 instead of an empty indexable shell.

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
- Production-grade admin roles and audit UI beyond the minimal catalog curation scaffold.
- iOS Safari offline capture spike on a real device.
- PostHog integration, analytics dashboards, and full cohort reporting.

## Next Build Step

Continue the current SDD Slice 3 execution batch from Linear. Pick the next vertical issue that closes a concrete user behavior across public proof, authenticated journal action, privacy-safe events, and docs/tests.

Every future Linear issue must be a vertical SDD slice, not a layer ticket. It must start from a user behavior and integrate the needed surfaces together: SQL/types -> scoped repository -> route/action/API -> UI -> background job/search/media/offline/event boundary when relevant -> tests -> docs. Do not create standalone tasks for "schema", "UI", "media", "analytics", "search", or "public pages" unless that work is inside the same issue as the user-visible path.

The completed catalog-select and user-added fallback slices must not be split into standalone schema, typeahead UI, search, or repository follow-ups unless a later user-visible path requires them.

Before implementing the next issue, run the Product Thinking Gate in `docs/product-research/README.md` and include the selected research files in the Linear context.
