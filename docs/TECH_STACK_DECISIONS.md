# OverGarden — Technology Stack & Decisions

> **Current status:** consolidated by ADR-0014, superseded for connectivity and browser-local journal persistence by ADR-0017, for the MVP refusal, media, indexability, and operator-surface posture by ADR-0018, for atomic local journal authoring and client-final media publication by ADR-0019, for the journal deletion-retention lifecycle by ADR-0021, and on 2026-09-02 by **ADR-0022 (owner MVP reset)** for the location-text firewall, media parameters, indexability, public HTML caching, sessions, admin, and process. Where a row below still describes a pre-ADR-0022 rule, ADR-0022 wins; rows are updated by the tasks OVE-362 through OVE-373 as each area ships.

## Product frame

OverGarden is a gardening journal plus catalog-as-social-graph for Ukraine and Bulgaria. The near-term H1 bet is whether users sustain a narrative growing journal habit. The H6 growth bet is public, crawlable, UGC-rich variety/region pages. The build process is agentic: AI agents execute Linear SDD tasks, so the stack must bias toward clear boundaries, type feedback, repeatable patterns, and tests that catch mistakes without requiring the founder to manually inspect every line.

## Current stack

| Layer                   | Decision                                                                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web/app runtime         | Next.js App Router + TypeScript on Vercel                                                                                                                                                                                                                                                             |
| UI                      | shadcn/ui only                                                                                                                                                                                                                                                                                        |
| Typography              | Google Sans (text) and Geist Mono (code) via `next/font/google`: fetched at build time, self-hosted under `/_next/static`, preloaded, `display: swap`, `Arial` fallback by hand. Wired once in `apps/web/src/app/fonts.ts` and `globals.css`; no contract, verifier, or matrix (ADR-0022 D7).         |
| Journal authoring       | Lexical 0.49.0 native node-tree editor behind one shared client-only composer; `JournalDocumentV1` v1 is the sole persistence/API/read contract; public and owner-read routes load no authoring engine. Under ADR-0019, unpublished composer state is local-only and non-durable before Publish.               |
| Auth                    | Better Auth                                                                                                                                                                                                                                                                                           |
| Database                | DigitalOcean Managed Postgres in production; Apple Container-first local Postgres on supported Macs, with Docker only as fallback; local/CI default to the production major version, currently Postgres 18                                                                                            |
| Type-safe data access   | Kysely typed SQL builder; SQL migrations are schema source of truth                                                                                                                                                                                                                                   |
| Data-access posture     | Scoped repository functions remain canonical. Sessions are server-authoritative (ADR-0022, D6): the cookie-cached session decides, every mutation carries the rendered owner id, and a mismatch is refused with 401/409. No client gate, no admission protocol.                                       |
| Object storage          | Cloudflare R2; ADR-0019 uses private ephemeral staging for direct browser upload of final WebPs and immutable public storage after atomic publication. OVE-349 removed the application-owned private-original quarantine path, and OVE-350 deleted its exact empty legacy provider resource.              |
| Media processing        | The browser-generated WebP is the sole final artifact: its exact bytes are previewed, staged, promoted, stored, and served without Vercel byte ingress or server re-encoding. There is no app-owned Sharp, source-original, admission, quality-gate, or process-route runtime.                      |
| Search/typeahead        | Meilisearch as a derived public index                                                                                                                                                                                                                                                                 |
| Matching/dedup          | Python worker using RapidFuzz, PyICU, CyrTranslit; off request path                                                                                                                                                                                                                           |
| Queue                   | Plain Postgres `job_queue` table, consumed with `FOR UPDATE SKIP LOCKED`                                                                                                                                                                                                                              |
| Connectivity and saves  | Online-only, network-required atomic Publish under ADR-0017/ADR-0019. Unpublished state is tab-memory only; no durable browser state, server draft, local mutation queue, PWA shell/installability promise, or connectivity-hint success claim is allowed.                                               |
| MVP posture             | ADR-0022: online-only atomic Publish, browser-only WebP conversion, every live public page indexable, server-authoritative sessions, in-product admin under `AdminUserRole`; OVE-362 through OVE-373 own the runtime reset.                                                                           |
| Realtime                | Deferred; canonical server fetch path first                                                                                                                                                                                                                                                           |
| Edge/DNS                | Cloudflare in front of Vercel; do not cache HTML at Cloudflare                                                                                                                                                                                                                                        |
| Analytics               | PostHog / first-party analytics later, after privacy event review                                                                                                                                                                                                                                     |
| Build method            | Walking skeleton first, then vertical SDD slices from `docs/SDD_VERTICAL_SLICE_ROADMAP.md`; no layer-ticket batches                                                                                                                                                                                   |
| Local container runtime | Apple Container-first for local Postgres, Meilisearch, MinIO, and matching-image smoke on supported Apple Silicon/macOS 26; Docker Desktop is not required after OVE-77, except as a fallback for unsupported hosts or verified Apple Container feature gaps. See `docs/CONTAINER_RUNTIME_POLICY.md`. |

## Typography

Typography is wired once and never re-verified (ADR-0022, D7):

- `apps/web/src/app/fonts.ts` declares Google Sans (normal and italic; `latin`, `latin-ext`, `cyrillic`, `cyrillic-ext`) and Geist Mono through `next/font/google`. Next fetches the subsets at build time, self-hosts the hashed files under `/_next/static`, preloads them, and fails the build if a font cannot be fetched.
- `layout.tsx` puts the two variables (`--font-google-sans`, `--font-geist-mono`) on `<html>`; `globals.css` maps them to `--font-overgarden-sans` and `--font-overgarden-mono` with an `Arial, sans-serif` fallback, because Next has no metric table for Google Sans.
- Raw lifecycle documents served by the proxy (404/410 pages) use the system font stack and never load web fonts.
- There is no typography contract, verifier, browser matrix, or CWV budget. To change a face, edit `fonts.ts` and `globals.css` only.

## Binding invariants

1. **User/product precise location stays locked in v0.** Store only region-level or hidden location for OverGarden users, journal entries, media, analytics, public/search documents, operator evidence, and product UI. External catalog/source ingestion may preserve legally reusable occurrence/distribution coordinates only in isolated raw/source snapshot tables with provenance, license, and usage flags; those fields are not canonical product location data and must not enter payloads, URLs, logs, analytics, image metadata, Meilisearch/public projections, or UI unless a later explicit ADR and SDD slice promote a safe aggregate projection.
2. **Client-final media is atomic with publication.** Under ADR-0019, the browser-generated WebP is the sole final artifact. The browser previews and directly stages those exact bytes; publication promotes and binds them atomically, and image bytes never traverse a Vercel Function.
3. **Encoder behavior is not a separate admission promise.** Metadata omission may occur during client conversion. A failed conversion remains failed/removable and never falls back to server conversion or source-original retention.
4. **No broad browser database access.** The browser talks to app APIs/server actions. It may receive only a short-lived, single-purpose Cloudflare staging capability bound to one owner/session/media generation and exact final-byte claims.
5. **Kysely is allowed; ORMs are not.** Do not reintroduce Prisma/Drizzle/TypeORM. Kysely is the typed SQL builder for app queries; raw parameterized SQL is allowed for escape hatches.
6. **Scoped repositories remain the data-access owner; sessions are server-authoritative.** Positively known scope uses repository predicates. A mutation is admitted only by the cookie-cached server session and refused with `401 session_required` or `409 session_account_changed`; there is no client gate (ADR-0022, D6 supersedes ADR-0018's serve-unresolved posture).
7. **Meilisearch remains a derived public projection.** OVE-331 replaces silent uncertainty drops with an admitted row and explicit quality class; positively non-public canonical state still does not become a public candidate.
8. **Network-required publication must be honest.** ADR-0017/ADR-0019 forbid durable browser journal writes, server drafts, offline queues, PWA shell/installability promises, and `navigator.onLine` as a success oracle. Only the acknowledged atomic Publish response establishes durable journal state; unavailable requests use `network_unavailable_save_refused`.
9. **Python is a worker, not a product dependency.** Typeahead uses Meilisearch. Dedup/matching can lag; SEO canonicalization must prevent thin duplicate public pages from being indexed before merge.
10. **Every live public page is indexable (ADR-0022, D3).** `evaluatePublicSurfaceIndexability` refuses only non-candidates (workspace, auth, operator routes, gone records), empty listings, loads that did not resolve, and canonical paths outside the locale. There is no word, staleness, or quality threshold and no metadata deadline. The sitemap is `/sitemap.xml` (index) plus `/sitemaps/<chunk>.xml`, read live from the database.
11. **One Linear issue, one branch, one vertical change.** Start from a concrete user or operator outcome and change every layer it needs (SQL/types -> repository -> route/action -> UI -> tests -> docs) in the same PR. Tasks use the half-page template in `AGENTS.md`; there is no separate task standard or validator.
12. **CI gates are part of the stack.** Typecheck, lint, focused tests, privacy tests, SSR tests, media derivative tests, and search-index privacy tests should be added before expanding product surface area.
13. **Live infra values are centralized.** Non-secret provider IDs, bucket names, public domains, env contracts, and operational links live in `docs/INFRASTRUCTURE_REGISTRY.md`. Agents must not rediscover or guess those values in each task.
14. **Product research is repo-local.** ICP, JTBD, positioning, IA, SEO/content, growth, trust/privacy, and business-model context lives in `docs/product-research/`. User-facing implementation must run the Product Thinking Gate in `docs/product-research/README.md` before Linear task creation or execution.
15. **Apple Container is the preferred local container runtime.** Future local runtime work should use Apple Container before Docker. Keep Docker only for explicitly documented gaps such as GitHub Actions Ubuntu service containers, Linux production process management, mature Compose restart policy behavior, or unsupported developer machines. OVE-75 confirms GitHub Actions Docker usage as a CI runner exception only; it must not be treated as a local Docker Desktop requirement. OVE-76 confirms the DigitalOcean Linux worker/search droplet as a production Docker Compose boundary until a separate non-Apple Linux process-manager migration is live-proven. OVE-77 confirms Docker Desktop can be removed locally on supported Macs after the Apple Container closeout proof passes. `docs/CONTAINER_RUNTIME_POLICY.md` is the fallback matrix for these gaps.

## Launch topology

- **Vercel:** Next.js app, app backend, SSR/ISR, preview deploys.
- **DigitalOcean Managed Postgres:** primary durable data store.
- **DigitalOcean Droplet:** Python worker + Meilisearch container at launch. Add memory limits, swap, health checks, and make Meili indexes rebuildable.
- **Cloudflare:** DNS, WAF/bot controls, R2 object storage, CDN for public derivatives. Cloudflare must not cache HTML.
- **Infrastructure registry:** `docs/INFRASTRUCTURE_REGISTRY.md` records the non-secret production values and dashboard links. Keep it updated with every external-provider change.
- **Product research corpus:** `docs/product-research/` is the repo-local product-thinking source. It informs what should be built and why; current root stack docs remain the implementation authority.

## Local topology

- Apple Container-first local Postgres 18 for database development on supported Macs, started by `infra/container-up`.
- Apple Container-first Meilisearch for search proof and index integration on supported Macs, started by `infra/container-up`.
- Apple Container-first MinIO as local S3/R2 emulator on supported Macs, started by `infra/container-up`.
- Docker remains an allowed fallback only when Apple Container cannot run or does not support the required local behavior. Fallback docs must name the gap instead of treating Docker Desktop as the default. Supported Apple Silicon/macOS 26 machines do not need Docker Desktop for the OVE-77-proven local path.
- `apps/web/.env.example` and `infra/.env.example` are the canonical local env templates.
- `docs/INFRASTRUCTURE_REGISTRY.md` records production-equivalent non-secret values; env files remain the only place for local secrets.

## CI runtime boundary

GitHub Actions currently runs on `ubuntu-latest`. Its Postgres 18 service container and MinIO `docker run` path are a `ci-required` Docker exception because Apple Container is not an Ubuntu service-container runtime. This keeps bootstrap, generated-type drift, lint, typecheck, test, and build coverage aligned with the production Postgres major version without reintroducing Docker Desktop as a supported-Mac local prerequisite.

Do not migrate CI to Apple Container unless the replacement change documents runner support, runner cost/availability/concurrency, complete service-contract proof commands, and fallback behavior in `docs/CONTAINER_RUNTIME_POLICY.md`.

## Production runtime boundary

The DigitalOcean Linux worker/search droplet currently uses Docker Compose under `/opt/overgarden` for `matching-worker`, `matching-api`, `meilisearch`, and `caddy`. OVE-76 keeps that production process manager because OVE-39 live-proved restart policy, service health, and journal publish/index plus archive/unindex recovery there. Apple Container remains a supported-Mac local runtime, not the production Linux process manager. Any non-Docker production replacement must be a separate live-proven Linux migration with the restart, health, public-safe search-document, and redacted-evidence gates in `docs/CONTAINER_RUNTIME_POLICY.md`.

## ADR index

- ADR-0001 — TypeScript app + isolated Python matching tier. Still valid.
- ADR-0002 — Next.js App Router + SSR/ISR. Still valid.
- ADR-0003 — shadcn/ui. Still valid.
- ADR-0004 — Supabase platform. Superseded by ADR-0014.
- ADR-0005 — Meilisearch. Still valid.
- ADR-0006 — PWA-first. Superseded by ADR-0017.
- ADR-0007 — Vercel + Supabase + Railway hosting. Superseded by ADR-0014.
- ADR-0008 — Prisma. Superseded historically.
- ADR-0009 — Cloudflare edge/DNS. Still valid; R2 is now accepted, not deferred.
- ADR-0010 — Marketing/analytics. Mostly valid; implementation requires event privacy review.
- ADR-0011 — Drizzle. Superseded by ADR-0014.
- ADR-0012 — Supabase RLS topology. Superseded by ADR-0014; scoped repositories + tests remain.
- ADR-0013 — Supabase Broadcast. Superseded/deferred by ADR-0014.
- ADR-0014 — Current stack realignment. Binding.
- ADR-0015 — Lexical structured-journal editor. Binding for authenticated
  authoring; preserves `JournalDocumentV1` v1 and authoring-bundle isolation.
- ADR-0016 — Stable Registry. Binding for observed-source isolation, immutable
  releases, stable identities, and independent product-eligibility gates.
- ADR-0017 — Online-only product. Binding for network-required success and the
  ban on durable browser journal storage; its future server-draft target is
  superseded by ADR-0019.
- ADR-0018 — MVP posture. Binding for serve-under-uncertainty, measured public
  indexability, format-conversion-only media, and in-product admin boundaries.
- ADR-0019 — Atomic local journal authoring and client-final WebP publication.
  Binding for transient pre-Publish state, exact browser-final bytes, bounded
  Cloudflare staging, and atomic create/edit publication.
- ADR-0020 — Stable Registry migration allocation amendment. Binding for the
  future allocation of `0027` to OVE-328 and `0028` to OVE-258.
  OVE-327 and OVE-259 have no SQL migration.
- ADR-0021 — Journal deletion is a seven-day retention-only lifecycle. Binding.
- ADR-0022 — Owner MVP reset (2026-09-02). Binding for: no location-text
  firewall, WebP variants from a native-first browser codec, every live public
  page indexable, cached public HTML with tags, server-only session checks,
  admin inside the product, and the engineering-minimum process. Supersedes
  the clauses it lists in ADR-0017, ADR-0018, ADR-0019, and the earlier
  `AGENTS.md`.
