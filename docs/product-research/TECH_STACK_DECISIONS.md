# OverGarden — Technology Stack & Decisions

> **Purpose.** A definitive record of the technologies OverGarden is built on, with the reasoning
> behind each choice. It exists so any contributor or AI agent can build against a **settled stack
> with full context** — what is used, and why. The stack below is **final and binding**: it rests
> on the venture's hard requirements (server-side rendering for SEO, offline field capture,
> Cyrillic/transliteration matching, wartime location privacy, media-heavy uploads, a solo founder
> building with AI agents), so it is decided — build against it.
>
> **Scope.** This document records **stack/technology decisions only** — not the data model, the
> product spec, or implementation detail. Those live in their own specs.

**Last updated:** 2026-06-26
**Changelog:** 2026-06-26 — Agentic-build amendments: database access changed from raw-`pg` only to
**Kysely + generated DB types** for the TypeScript app (**no ORM**, SQL migrations remain the
schema source of truth, raw SQL remains an escape hatch); media pipeline hardened to **private R2
quarantine -> worker re-encode/strip -> public derivative only**; offline capture fixed to
**Dexie/IndexedDB + idempotent sync**; Python clarified as **worker-first/off-request-path**;
Meilisearch writes restricted to a **single indexer**; walking-skeleton + CI + scoped-query
guardrails added for AI-agent development.

---

## 0. Project frame

OverGarden is a **gardening journal + catalog-as-social-graph** (plant varieties are the shared
graph) for **Ukraine and Bulgaria**, at **zero-stage pre-MVP**. The near-term bet (H1) is whether
people sustain a journaling habit; the growth bet (H6) is organic SEO via a large long-tail of
public, crawlable, **image-rich** pages. The builder is a **solo founder with a basic
HTML/CSS/JS(React) background, building with AI coding agents** — a constraint that shaped many
choices below (one readable language, mainstream conventions, managed infrastructure).

**Hard requirements that drive the stack:**
- **SSR is non-negotiable** — AI crawlers (GPTBot, ClaudeBot, PerplexityBot) do not execute
  JavaScript; content behind a client-side shell is invisible to them.
- **Cyrillic + transliteration matching** — variety names span Ukrainian/Russian/Bulgarian/Latin
  spellings; the dedup/matching engine must handle this, and it is **PostgreSQL-bound** (`pg_trgm`,
  the canonical-form unique index, and Splink all live on Postgres).
- **Media-heavy user uploads (photos)** — journaling produces a large, growing volume of user
  photos served on public pages. The cost driver for media is **egress (bandwidth out)**, not
  storage — which dictates object storage with zero/cheap egress behind a CDN, with the database
  holding only keys.
- **Offline capture** (not offline-first) — journaling happens in the field, often without signal;
  a local write queue that syncs later.
- **Wartime location privacy** — exact coordinates are a hard server-side-only lock; the audience
  includes UA under military risk.
- **Solo founder + AI agents** — favors one language the founder can read end to end, mainstream
  conventions agents are strong at, and managed infrastructure over self-run servers.

---

## 1. The stack at a glance

| Layer | Choice | One-line reason |
|---|---|---|
| Frontend + app backend | **Next.js (App Router) + TypeScript** | SSR/ISR for the SEO long-tail; one language across UI + API |
| UI components | **shadcn/ui** (Tailwind + Radix) | Accessible, ownable, agent-friendly; the fixed UI mandate |
| App backend runtime | **TypeScript** in Next route handlers / server actions | One readable language for the founder |
| Matching / dedup engine | **Python** worker-first pipeline (FastAPI optional/internal) | The Cyrillic-aware libraries live only in Python; dedup is off the request path |
| Database | **DigitalOcean Managed PostgreSQL** | Managed backups/PITR on the existential asset; co-located with matching; standard Postgres = portable |
| Database access | **Kysely + generated DB types**; raw SQL escape hatch | Type-safe app queries for AI agents; SQL remains portable and reviewable |
| Authentication | **Better Auth** (TypeScript) | Sessions/users in our own Postgres; TS-native; no vendor lock |
| Object storage + media | **Cloudflare R2 + CDN** | Zero egress at any volume; S3-compatible; advances H6 |
| Search / typeahead | **Meilisearch** (self-hosted container) | Strong typo/synonym handling for Cyrillic; MIT |
| Mobile | **PWA-first** (one codebase with the web) | Fits offline-capture; shadcn works; no premature native split |
| Hosting | **Vercel + DigitalOcean + Cloudflare** (split-managed) | Best-fit per tier; managed = founder ships; zero-egress media |
| Region vocabulary | **ISO 3166-2** subdivision codes (UA/BG) | Controlled, canonical aggregation key; not free text |
| Matching libraries | Meilisearch · RapidFuzz · Splink · PyICU · CyrTranslit | Permissive licences; self-hostable; proven for the task |
| Agentic build guardrails | Walking skeleton · scoped repositories · CI gates · privacy tests | Reduces human review load and prevents agents from bypassing safety rules |

The **two languages** are deliberate: **TypeScript** for everything user- and product-facing
(frontend, app backend, auth, the bulk of the work), and **Python** isolated to exactly the
matching pipeline where the irreplaceable libraries live. This is "modular monolith + one
specialised worker tier."

---

## 2. Each decision in full

Each entry: **the decision · the reasoning · provenance.**

### 2.1 Frontend & rendering — Next.js (App Router) + TypeScript
**ISR/SSG** generates the large, growing set of long-tail aggregation pages (variety × region ×
season) as static, crawlable HTML with JSON-LD in the initial payload, revalidated as new journal
entries land — the cheapest way to serve the long-tail SEO thesis. React Server Components deliver
content without a JS shell. Next also serves as the app backend (route handlers / server actions),
collapsing the SSR data path into one codebase.
*Provenance:* `AI_SEO_SYNTHESIS §A1` (SSR hard requirement) + the long-tail growth thesis.

### 2.2 UI components — shadcn/ui
Copy-into-repo model = full ownership of component code; Radix gives accessibility (focus, ARIA)
for free; Tailwind theming; the largest AI-agent familiarity of any component system, which
directly raises code quality from the same prompt. **This is a fixed mandate** — all UI is built
exclusively from shadcn/ui via its MCP server / CLI / skills; components are not hand-rolled.
shadcn is React/DOM-only, which is acceptable because mobile is **PWA-first** (§2.8), so the web UI
*is* the mobile UI.
*Provenance:* UI mandate.

### 2.3 App backend — TypeScript (Python worker-first for matching)
The app backend (save entry, auth, photos, feed, SSR pages) is **TypeScript**, co-located with
Next — one language the founder can read and debug across frontend + backend, and the stack AI
agents are strongest at. The Python matching stack runs as an **isolated worker-first pipeline**,
because most matching work (variant seeding, Splink dedup, Meilisearch sync/reindexing) is
**batch, off the request path**. Typeahead reads from Meilisearch; it must not call a synchronous
Python endpoint on every keystroke. FastAPI is allowed only as an internal/admin/health surface if
it genuinely simplifies operations; it is not the live typeahead path. The Python tier connects
directly to Postgres over a standard wire connection, co-located on the same provider/region for
low round-trip latency on batch dedup.
*Provenance:* `MATCHING-ENGINE_STACK_SPEC`; operator sign-off (solo founder, JS background,
AI-agent-driven build).

### 2.4 Matching / dedup engine — Python pipeline
The hard problem is matching Cyrillic/transliterated variety names and deduping user-added
entries. The chosen libraries are purpose-built: **Meilisearch** (typeahead), **RapidFuzz** (fuzzy
string matching), **Splink** (probabilistic record linkage / dedup), **PyICU** (Unicode-correct
collation/transliteration), **CyrTranslit** (Cyrillic↔Latin). A **unique canonical-form index** in
Postgres is the hard, schema-level dedup guarantee under the fuzzy layer. This pipeline is **why
the database must be PostgreSQL** (§2.5) and why the **Postgres locale must be UTF-8** — otherwise
`pg_trgm` breaks on Cyrillic.
*Provenance:* `MATCHING-ENGINE_STACK_SPEC`.

### 2.5 Database — DigitalOcean Managed PostgreSQL
Postgres is the datastore the matching layer **requires** (`pg_trgm`, the canonical-form unique
index, Splink — see §2.4). **DigitalOcean Managed PostgreSQL** provides it as a managed service
with **automated daily backups and point-in-time restore**, patching, and a built-in connection
pool — so the solo non-DBA does not hand-roll durability on the most valuable asset.

- **Durability is the deciding factor.** The user's accumulated journal *is* the product's value,
  so data loss is existential; managed backups/PITR on that asset are the priority. The choice is
  reversible — it is standard Postgres, so a later migration is a dump/restore, not a rewrite.
- **Co-located with the matching tier.** Database and the Meilisearch + Python matching worker live
  on the **same provider and region** (DigitalOcean), so batch dedup — which makes many DB
  round-trips — runs over private/low-latency networking.
- **Auth and media are not media-coupled.** Authentication tables live in this same Postgres
  (Better Auth, §2.12); user **media never lives in the database** — it lives in object storage
  (R2, §2.11), and the database holds only derivative keys and safe metadata.
- **Serverless connection rule.** The Vercel runtime accesses the database through the managed
  **connection pool (transaction mode)**; migrations run through a **direct connection**.
*Provenance:* `MATCHING-ENGINE_STACK_SPEC` + `DB_SEED_AND_DATA-MODEL_SPEC` (Postgres requirement);
`ENTRY_DATA_AND_RANKABILITY_SPEC §5` (location lock).

### 2.6 Database access — Kysely + generated types (no ORM)
The TypeScript app talks to Postgres through **Kysely** with generated database types
(`kysely-codegen` or equivalent). This explicitly supersedes the old literal rule "no
query-builder": Kysely **is** a query-builder, and it is allowed because it does not own the schema,
does not introduce entity lifecycle magic, does not run a separate engine, and emits ordinary SQL
against ordinary Postgres. The architectural intent remains: keep the database portable,
reviewable, and directly accessible from Python.

- **No ORM.** Do not introduce Prisma, TypeORM, ActiveRecord-style models, implicit lazy loading,
  ORM-owned migrations, or a runtime engine that becomes the real data-access layer.
- **SQL migrations are the schema source of truth.** Schema changes are forward-only, ordered,
  reviewable `.sql` migrations applied by one lightweight runner (prefer `dbmate` unless the repo
  standardizes otherwise). Generated TypeScript DB types derive from those migrations/the live DB.
- **Kysely is the default for app queries.** It gives AI agents column/table autocomplete and
  compile-time checks for the dynamic filters this product needs (visibility scope, feeds, facets,
  variety x region x season, user-owned surfaces).
- **Raw parameterized SQL remains an escape hatch.** Use it for complex Postgres features,
  performance-critical reviewed queries, migrations, and Python jobs. Bound parameters are still
  mandatory; string-interpolated SQL is banned.
- **Scoped repository/query functions are mandatory.** Kysely prevents many shape/type mistakes,
  but it does **not** prevent a forgotten `user_id`, `tenant`, `visibility`, or public/privacy
  predicate. App code calls repository functions that bake those predicates in; tests assert the
  privacy invariants.
*Provenance:* agentic tech-stack review, 2026-06-26; supersedes the 2026-06-25 raw-`pg`-only rule.

### 2.7 Search / typeahead — Meilisearch (self-hosted container)
The catalog front door needs fast, typo- and synonym-tolerant typeahead over
Cyrillic/transliterated names. Meilisearch handles this well and is **MIT + self-hostable** (no
licence cost, no lock-in). Postgres stays the source of truth; Meilisearch is a **derived index**
kept in sync by a **single worker-owned indexer**, so app features never write to Meili directly.
The live UI reads Meilisearch for typeahead/search, including multi-type results where required
(catalog items, public objects, @-handles), but Postgres remains the authority for permissions,
state, and canonical records. It runs as a container on the DigitalOcean droplet alongside the
Python matching worker (§2.9) — co-located with the worker and near the database.
*Provenance:* `MATCHING-ENGINE_STACK_SPEC`.

### 2.8 Mobile — PWA-first
The requirement is offline **capture** (not offline-first): a **local write queue** using
Dexie/IndexedDB + a service worker where available, then idempotent sync on reconnect — not CRDT
merge. A PWA delivers this in **one codebase with the web**, so shadcn works unchanged, there is no
app-store friction, and the founder is not split across web + native before H1 is validated. A
gardening journal is not time-critical, so the real PWA weakness (iOS background-sync reliability)
is handled honestly: background sync is a nice-to-have, not a promise. "Uploads next time you open
with signal" is acceptable. Queued entries/photos keep local pending state until the server confirms
the idempotency key and media derivative.

- **Contingency.** If iOS background-sync proves unreliable, the same codebase wraps in
  **Capacitor** — additive, not a rewrite. Keep the API and data model client-agnostic so this
  stays cheap.
- **De-risking task.** Spike offline capture (entry + photo queue, sync to R2 quarantine and
  derivative completion) on iOS Safari in the first sprint — it is the one thing that could force a
  native shell.
*Provenance:* `OverGarden_MVP_PRD` (offline-capture, not offline-first).

### 2.9 Hosting — split-managed (Vercel + DigitalOcean + Cloudflare)
Each runtime piece on the platform that fits best:
- **Vercel** — the Next.js app + app backend (Next-native ISR/SSG, preview deploys).
- **DigitalOcean** — **Managed PostgreSQL** (the database) **and a droplet** running the
  Meilisearch container + the Python matching/indexing workers. Database and matching compute on one
  provider/region = private, low-latency networking between them.
- **Cloudflare** — **R2** (object storage for media) + **CDN** (global media delivery at zero
  egress).

For a solo founder, **time is the scarcest resource** — managed platforms let them ship instead of
running servers; the only self-run piece is the single droplet hosting Meili + the worker processes,
right-sized now that Postgres is managed and the app is on Vercel. Do **not** add Hetzner or another
provider just to save a few dollars on Meili; the operational seam costs more than the savings until
real memory/latency metrics prove otherwise.

- **Cost breakdown (runtime infrastructure, modest production).** Starts largely on free tiers;
  media bandwidth is free regardless of traffic.

  | Component | $/mo | Notes |
  |---|---|---|
  | DO Managed PostgreSQL | **$15** | single node, 1 GB RAM, daily backups + 7-day PITR; **no HA** at this tier |
  | DO droplet (Meili + Python workers) | **$12–24** | 2 GB ($12) → 4 GB ($24); the only self-run box |
  | Vercel | **$0–20** | Hobby free for prototyping; Pro ~$20 for commercial launch |
  | Cloudflare R2 | **$0–~3** | free 10 GB, then ~$0.015/GB-month; **egress always free** |
  | Cloudflare CDN | **$0** | free, unlimited bandwidth |
  | **Total** | **~$27–62** | low end = free Vercel + 2 GB box; high end = Vercel Pro + 4 GB box |

  Not included: domain (`.garden` ~$30–40/**year**), transactional email (Resend/Postmark free
  tier ~$0 early). This is **infrastructure only** — not the cost of the venture (founder time,
  paid tools, legal review for GDPR/BG).

- **Droplet sizing note.** Because the droplet holds only Meilisearch + the Python matching worker
  (not Postgres, not the app), a 2–4 GB box suffices early; lean to 4 GB once Splink dedup runs
  grow, as PyICU/Splink are the memory-hungry pieces.

- **Caveats that move the bill (read before relying on the range).**
  - **Database HA.** The $15 tier is **single-node** — if it fails, you restore from backup
    (downtime + minimal data loss via PITR). Acceptable for MVP; HA (a standby node) roughly
    **doubles the DB cost to ~$60/mo** and removes downtime — a later upgrade, not now.
  - **R2 read operations, not storage, are the variable to watch.** Storage is trivially cheap and
    egress is free, but **Class B (read) operations** are metered (see §2.11); at high read volume
    they — not bandwidth — become the cost driver. The **CDN absorbs this**: cached reads are served
    from the edge and do not hit R2, keeping read-ops low.
  - **Vercel Hobby vs Pro.** Hobby is formally non-commercial; the honest baseline for a commercial
    launch is **Pro (~$20/mo)**, which puts the realistic launch range nearer **$45–62/mo**.

- **The "self-host / $0 licence" constraint is satisfied.** It means *self-hostable tools, no
  licence fees, you own and can move the data* — not "run your own iron." Everything here is OSS
  (Postgres, Meilisearch, a Node app, Python workers) or S3-compatible (R2); managed platforms
  running OSS satisfy the constraint, and EU regions are available for data residency (UA/BG).

- **Background jobs.** Prefer a **Postgres-backed queue/cron** (e.g. Procrastinate/pgmq) at
  zero-stage to avoid standing up Redis early. Use it for media derivative processing, Meilisearch
  indexing, catalog normalization, and Python dedup jobs. Hourly small jobs and nightly heavy Splink
  runs are acceptable; laptop-local jobs and GitHub Actions are not production orchestration.
- **Operational seams.** Keep the provider split, but make it boring: one documented env/secret
  policy, local Docker Compose for Postgres + Meili + MinIO-as-R2-emulator, and a Vercel region
  chosen near the DO database region.
*Provenance:* `MATCHING-ENGINE_STACK_SPEC §2` (self-host/$0-licence, reinterpreted).

### 2.10 Region vocabulary — ISO 3166-2 (UA/BG subdivision codes)
`coarse_region` is the **aggregation key** for the variety×region public pages (the long-tail SEO
thesis). As free text, the same region written several ways would fragment one page into many and
dilute SEO — so it is a **controlled, canonical code**: **ISO 3166-2** subdivision codes for UA (27
units) and BG (28), validated at the app layer, with localized display names via a lookup. This
granularity (oblast/province) is **both** privacy-coarse (appropriate for the wartime lock) **and**
a useful SEO key, and expands cleanly to more countries.
*Provenance:* `ENTRY_DATA_MODEL_SPEC v1.0`; tied to `ENTRY_DATA_AND_RANKABILITY_SPEC §3`.

### 2.11 Object storage & media delivery — Cloudflare R2 + CDN
User media (photos) is **unstructured blob data** and belongs in **object storage**, never in the
database. **Cloudflare R2** stores upload originals only in a private quarantine area and public
derivatives in a public/CDN-facing area; the **database holds only the derivative key + safe
metadata**. R2 is **S3-compatible** (movable to any S3 provider) and charges **zero egress at any
volume** — the single most important property here, because the cost driver for media is bandwidth
out.

- **Advances H6, not just cost.** The growth thesis is public, crawler- and user-traversed,
  **image-rich** long-tail pages. R2 + CDN delivers exactly that — fast global delivery of
  image-heavy pages — at **zero bandwidth cost**, so crawler and user traffic on media-dense pages
  does not scale the bill.
- **Cost model — watch read operations, not storage.** R2 bills storage ($0.015/GB-month beyond a
  free 10 GB), two operation classes, and **zero egress**. Storage is trivially cheap (~30,000
  web-optimized ~300 KB photos fit the free 10 GB; ~1M photos ≈ ~$4–5/mo). The variable to watch is
  **Class B (read) operations** ($0.36/M beyond a free 10M/mo): at high read volume these, not
  bandwidth, drive the bill. The **CDN in front mitigates this** — cached reads never hit R2 as
  Class B ops. The lever you control is **derivative size** (set in the EXIF/resize step):
  optimized ~300 KB derivatives vs raw ~3 MB originals is a ~10× difference in capacity and cost.
- **Direct-upload + quarantine pipeline (binds to §3).**
  1. The client may resize/compress/strip locally first to save mobile bandwidth, but client-side
     stripping is only the first line, not the guarantee.
  2. Next issues a presigned upload URL only for a **private quarantine** R2 key. The app server
     does not proxy image bytes.
  3. A background worker reads the quarantine object, may extract **only the capture date** as a
     smart default, re-encodes/resizes via `sharp` (or equivalent), and writes a stripped,
     web-optimized derivative to the public/CDN-facing R2 area.
  4. The database stores only the derivative key and safe metadata. GPS/precise location is never
     stored, logged, sent to analytics, exposed in object URLs, or used as a public fallback.
  5. The quarantine original is **never public, never CDN-fronted, never listable**, and the worker
     deletes it immediately after successful derivative creation. Lifecycle expiry is only an
     emergency backstop for stuck objects.
  6. A public photo renders **iff** its stripped derivative exists — never fall back to any original.
     Location is set only via the coarse-region selector (ISO 3166-2).
*Provenance:* media-heavy UGC requirement + the H6 image-rich long-tail thesis.

### 2.12 Authentication — Better Auth
**Better Auth** is a **TypeScript-native** auth library: it stores users and sessions in **our own
PostgreSQL** (the same DO Managed instance), integrates with **Next.js**, and keeps auth in the one
language the founder reads end to end — with **no auth vendor and no lock-in** (the founder owns the
auth data).

- **Tenant isolation** and the public/private visibility axes are enforced primarily in the
  **application / query layer** (every query scoped by the authenticated session's user id).
  Postgres RLS remains available as **optional DB-layer hardening** (driven by a per-request
  Postgres session variable), recommended once the app stabilizes — but the app layer is the
  primary line at MVP (see §3).
*Provenance:* authentication decision, 2026-06-24.

### 2.13 Video — out of scope for the MVP
The two load-bearing hypotheses — **H1** (sustained journaling habit) and **H6** (SEO via
image-rich public pages) — are both served by **photos**. Video adds a heavy, separate subsystem
(large files, transcoding to web formats and multiple resolutions, adaptive streaming, CDN
delivery, moderation surface) that does not test either hypothesis and would consume scarce
solo-founder time pre-validation. **Video is excluded from the MVP.** If ever added
post-validation, use a **managed video pipeline** — never self-rolled transcoding on the droplet,
which would peg CPU and starve the matching/search workload.
*Provenance:* product scope decision (smallest thing that tests the largest open question);
operator sign-off 2026-06-25.

### 2.14 Agentic build guardrails — walking skeleton, then vertical SDD slices
This project will be built primarily by AI coding agents from Linear tasks written as
specification/documentation. The stack therefore needs guardrails that catch mistakes without
requiring the founder to personally read every generated line.

- **Walking skeleton first.** Before broad feature work, ship one trivial end-to-end path through
  the real stack: Better Auth session -> scoped Kysely repository -> Postgres write -> optional
  media quarantine/derivative -> SSR public page -> CI green. This prevents each feature slice from
  inventing its own foundation.
- **Then vertical SDD slices.** Slice work by user-visible outcomes across all layers, not by
  horizontal layers. Example: "create offline entry with photo -> sync -> derivative -> SSR public
  page -> 410 on delete" is one slice; "build all DB tables" is not a shippable product slice.
- **CI gates before merge.** Minimum gates: typecheck, lint, unit tests for scoped repositories,
  privacy/visibility tests, media derivative/EXIF tests, and SSR/public-page tests for indexed
  surfaces.
- **Canonical repo instructions.** The repository-level agent instructions must repeat the hard
  invariants from §3: no ORM, Kysely allowed, scoped repositories, no public originals, no direct
  Meili writes, no sync Python typeahead path.
*Provenance:* agentic-build review, 2026-06-26.

---

## 3. Cross-cutting invariants the stack must always honor

Non-negotiable, cutting across the choices above:

- **SSR for every public surface.** No public content may live behind a client-only JS shell. Public
  pages render HTML + JSON-LD server-side.
- **Database is PostgreSQL, UTF-8 locale.** Mandatory — the Cyrillic matching layer (`pg_trgm`,
  canonical-form index, Splink) is Postgres-bound and UTF-8-dependent.
- **No ORM; Kysely is allowed.** TypeScript app queries use Kysely + generated DB types by default;
  raw SQL is an escape hatch and must use bound parameters. String-interpolated SQL is banned.
- **Scoped query layer is mandatory.** User/tenant/visibility/privacy predicates live in repository
  functions, not in ad hoc call sites. Kysely is a type-safety tool, not a privacy boundary.
- **Privacy tests are release gates.** Public/private visibility, tenant isolation, EXIF stripping,
  deletion/410, and SSR public rendering get automated tests before the related surface ships.
- **Media never in the database.** User media lives in object storage (R2); the database stores only
  derivative keys and safe metadata.
- **Location privacy lock.** Exact coordinates are **server-side only** — never in client payloads,
  URLs, query strings, analytics events, or object URLs. **v0 stores no precise location at all**
  (`coarse_region` / ISO 3166-2 is the only granularity), so the lock is upheld by the data model
  itself.
- **EXIF date-only + quarantine -> stripped derivative.** The server/worker may read only the photo
  capture date from EXIF as a smart default. GPS/precise location is stripped server-side and **not
  stored**; only the stripped derivative is written to the public/CDN-facing R2 area. A public photo
  renders **iff** its stripped derivative exists — never fall back to the original. The quarantine
  original is private and deleted immediately after successful processing. Location is set only via
  `coarse_region` / ISO 3166-2.
- **Media served only via CDN from R2.** Public images are delivered through the CDN from R2; the
  database and the app server never serve blobs. This also bounds R2 Class B (read) operation costs.
- **Meilisearch is derived and single-writer.** Postgres is the source of truth; only the
  worker-owned indexer writes Meilisearch indexes. App code reads Meili for search/typeahead and
  writes Postgres.
- **Python is worker-first.** Matching, dedup, variant seeding, and reindexing happen off the
  request path. Synchronous Python calls are not part of keystroke/typeahead UX.
- **Auth data is ours.** Users/sessions live in our own Postgres (Better Auth); no auth vendor holds
  the identity data.
- **Tenant isolation in the app/query layer.** Visibility and tenant axes are enforced primarily in
  application code (every query scoped by the authenticated session). Postgres RLS may be added
  later as DB-layer defence-in-depth via a per-request session variable.
- **No secrets in git.** Credentials/keys (DB, R2, auth) live in env vars / the platform secret
  store; `.env*` is always git-ignored.
- **Serverless connection discipline.** Runtime DB access goes through the DO Managed Postgres
  connection pool (transaction mode); migrations through a direct connection; shared database access
  is centralized in one server-side module.
- **Walking skeleton before feature slices.** Before broad vertical SDD slices, build the thin
  end-to-end path: auth session -> scoped DB query -> one entry -> one media derivative -> one SSR
  public page -> CI green. Then slice features vertically.

---

## 4. Operational & version reference

- **Domain:** `over.garden` — a `.garden` gTLD. It is **not** HSTS-preloaded at the TLD level, so
  HTTPS is not auto-enforced — set the HSTS header explicitly and submit to the preload list once
  always-HTTPS is confirmed. Transactional email from `@over.garden` needs SPF/DKIM/DMARC via a
  reputable provider (Resend/Postmark/SES).
- **Version-sensitive facts (verify against installed versions before relying):**
  - **Next.js:** App Router with React Server Components; ISR/SSG for the long-tail.
  - **DigitalOcean Managed PostgreSQL:** connection pool (transaction mode for runtime,
    direct/session for migrations); automated daily backups + point-in-time restore; confirm
    `pg_trgm` and custom-index support are enabled at provisioning.
  - **Database access:** Kysely + generated DB types for TypeScript app queries; raw parameterized
    SQL as an escape hatch; `dbmate` or one equivalent lightweight runner for versioned `.sql`
    migrations.
  - **Cloudflare R2:** S3-compatible; **zero egress at any volume**; storage billed per GB beyond
    the free 10 GB; private quarantine area + public derivative area for the media pipeline;
    presigned direct upload only to quarantine.
  - **Cloudflare CDN:** fronts R2 for global media delivery and caches reads.
  - **Better Auth:** TypeScript-native; users/sessions in our Postgres; integrates with Next.js.
  - **Meilisearch:** MIT, self-hosted container (on the DO droplet).
  - **Matching libs (Python):** RapidFuzz, Splink, PyICU, CyrTranslit, Meilisearch client.
  - **Offline capture:** Dexie/IndexedDB local queue, idempotency keys, visible pending/synced/error
    states, iOS Safari spike before depending on background sync.

---

## 5. Decided vs. open

**Decided & binding (this document):** the full technology stack in §1–§2 and the cross-cutting
invariants in §3.

**Direction to any contributor or agent — build against §1–§3 as settled; do not re-open these
choices.** In particular:
- **PostgreSQL on DigitalOcean Managed** for the database (managed durability; Postgres is required
  by the matching engine).
- **Kysely + generated DB types for app queries; no ORM; raw parameterized SQL remains an escape
  hatch.** Do not reintroduce the old "no query-builder" wording.
- **Scoped repositories/query functions are mandatory** for tenant, visibility, and privacy
  predicates.
- **Cloudflare R2 + CDN** for all media; private quarantine upload -> worker-stripped derivative ->
  public CDN. **Media never in the database** (derivative keys only).
- **Better Auth** for authentication, data in our own Postgres.
- **PWA, not native**; **TypeScript app with isolated Python workers** for matching/indexing.
- **Meilisearch stays** as the search/typeahead engine; Postgres remains source of truth; only the
  worker-owned indexer writes Meili.
- **Video is out of MVP scope** — do not build it.

**In flux (not settled here):** the source specifications and the data model are being re-authored
against updated sources; for product- and data-model-level decisions (entry schema, flows, metrics
taxonomy), consult the relevant spec and flag any conflict rather than guessing.
