# OverGarden — Technology Stack & Decisions (Handoff)

> **Purpose.** A complete, self-contained record of every technology chosen for OverGarden, with
> the reasoning, the rejected alternatives, and the provenance for each. It exists so a new agent or
> contributor can pick up the project with the **full decision context** — not just *what* was
> chosen, but *why* — so settled decisions are not silently re-litigated or re-derived differently.
>
> **Status.** The technology stack below is **final and binding**, consolidated as of the
> **2026-06-23 finalization session**. It rests on the venture's hard requirements (server-side
> rendering for SEO, offline field capture, Cyrillic/transliteration matching, wartime location
> privacy, live feeds, marketing measurability under privacy constraints, a solo founder building
> with AI agents). Each decision is recorded in an ADR (`docs/adr/0001`–`0013`); this document is
> the consolidated surface + index.
>
> **What changed on 2026-06-23 (vs the prior version):**
> - ORM **Prisma → Drizzle** (ADR-0011, supersedes ADR-0008) — on RLS-ergonomics grounds.
> - Added **data-access topology "Variant D"** — server-tier-primary authz + narrow RLS floor (ADR-0012).
> - Added **Realtime via Broadcast-from-Database** (ADR-0013).
> - Added **Cloudflare** edge/security/DNS + **GoDaddy** registrar (ADR-0009).
> - Added the **Marketing & Analytics stack** (ADR-0010).
> - Corrected the long-tail SEO framing (thin programmatic pages are **no-indexed**; the indexed
>   surface must be UGC-dominated — §3) and the **RLS enforcement model** (app-tier-primary + narrow
>   RLS floor, not RLS-as-sole-gate — §2.6/§2.11).
>
> **What this document is NOT.** It is not the data model, not the product spec, and not the
> per-decision ADRs (those carry the full forces / alternatives / consequences). This document
> records **stack/tech decisions only**.

---

## 0. Project in one paragraph (so a new agent has the frame)

OverGarden is a **gardening journal + catalog-as-social-graph** (plant varieties are the shared
graph) for **Ukraine and Bulgaria**, at **zero-stage pre-MVP**. The near-term bet (H1) is whether
people sustain a narrative journaling habit; the growth bet (H6) is organic SEO via a large
long-tail of public, crawlable pages dominated by real first-hand UGC. A cross-user **lineage**
layer (provenance attribution, claim/confirm, @-handles, invite, lineage graph, influence, follow)
is in v0 scope as a retention/defensibility moat (not a virality engine). The builder is a **solo
founder with a basic HTML/CSS/JS(React) background, building with AI coding agents** — a constraint
that shaped many choices below (one readable primary language, mainstream conventions, managed
infrastructure).

**Hard requirements that drive the stack:**
- **SSR is non-negotiable** — AI crawlers (GPTBot, ClaudeBot, PerplexityBot) do not execute
  JavaScript; content behind a client-side shell is invisible to them. (`AI_SEO_SYNTHESIS §A1`,
  verified against the Vercel/MERJ >500M-fetch study.)
- **Cyrillic + transliteration matching** — variety names span Ukrainian/Russian/Bulgarian/Latin
  spellings; the dedup/matching engine must handle this. (`MATCHING-ENGINE_STACK_SPEC`)
- **Offline *capture*** (not offline-first) — journaling happens in the field, often without signal;
  a local write queue that syncs later. (`OverGarden_MVP_PRD`)
- **Wartime location privacy** — exact coordinates are a hard server-side-only lock; v0 stores no
  precise location at all. (`ENTRY_DATA_AND_RANKABILITY_SPEC §5`)
- **Live feeds** — v0 wants auto-updating feeds (variety-in-region aggregation, lineage
  notifications) without manual refresh. (Operator decision 2026-06-23; `LINEAGE_SOCIAL_GRAPH_SPEC`)
- **Marketing measurability under privacy constraints** — H1/H4/H6 are validated live post-launch,
  which requires product analytics; marketing/ads attribution is also required — both without
  leaking precise location or war-sensitive behavior. (`KILL_CRITERIA_PREREG_v2`, `AI_SEO_SYNTHESIS §B2`)
- **Solo founder + AI agents** — favors one primary language the founder can read end to end,
  mainstream conventions agents are strong at, managed infrastructure, and **machine-checkable
  guardrails** (typed schema, invariant tests) because agents write the code.

---

## 1. The stack at a glance

| Layer | Choice | One-line reason | ADR |
|---|---|---|---|
| Frontend + app backend | **Next.js (App Router) + TypeScript** | SSR/ISR for the SEO long-tail; one language across UI + API | 0002 |
| UI components | **shadcn/ui** (Tailwind + Radix) | Accessible, ownable, agent-friendly; fixed UI mandate | 0003 |
| App backend runtime | **TypeScript** in Next route handlers / server actions | One readable language for the founder; extractable later | 0001 |
| Matching / dedup engine | **Python** isolated service (FastAPI + worker) | The Cyrillic-aware libraries live only in Python | 0001 |
| Database & platform | **PostgreSQL via Supabase** (DB + Auth + Storage + RLS) | One managed platform; durable; RLS as a floor | 0004 |
| **ORM (TS app)** | **Drizzle** | RLS policies in the TS schema, versioned + testable | **0011** (supersedes 0008) |
| **Data-access model** | **Variant D** — server-tier-primary authz + narrow RLS floor | Survives bugs/new code paths; single door | **0012** |
| **Realtime** | **Supabase Realtime — Broadcast from Database** | DB-driven, payload-controlled, scales; no raw rows to clients | **0013** |
| Search / typeahead | **Meilisearch** (self-hosted container) | Strong typo/synonym handling for Cyrillic; MIT, no lock-in | 0005 |
| Mobile | **PWA-first** (one codebase with the web) | Fits offline-capture; shadcn works; no premature native split | 0006 |
| Hosting | **Vercel + Supabase + Railway** (split-managed) | Best-in-class per tier; free to start; managed = founder ships | 0007 |
| **Edge / Security / DNS** | **Cloudflare** (Free → Pro $25/mo) | WAF/DDoS/Turnstile/HSTS at edge; allow-lists AI crawlers | **0009** |
| **Domain registrar** | **GoDaddy** (registrar only; NS delegated to Cloudflare) | Ownership stays; DNS hosted on Cloudflare | **0009** |
| **Product analytics** | **PostHog** (first-party, EU, reverse-proxied) | Measures H1/H4/H6 + session replay, first-party | **0010** |
| **Marketing / ads** | **sGTM + Meta CAPI + GA4 + Consent Mode v2** | Consent-gated, server-side, output-controlled | **0010** |
| **SEO / AI-visibility** | **GSC + Bing/IndexNow + Share-of-Model** | The actual H6 instruments (GA4 cannot be) | **0010** |
| Region vocabulary | **ISO 3166-2** subdivision codes (UA/BG) | Controlled, canonical aggregation key; not free text | — |
| Matching libraries | Meilisearch · RapidFuzz · Splink · PyICU · CyrTranslit | Permissive licences; self-hostable; proven for the task | 0005 |

**The two backend languages are deliberate** ("Variant A"): **TypeScript** for everything user- and
product-facing (frontend, app backend, the bulk of the work), and **Python** isolated to exactly the
matching pipeline where the irreplaceable libraries live. This is "modular monolith + one specialised
service," not polyglot sprawl. (Variant A is the *language-split* axis; Variant D below is the
*access-topology* axis — they are orthogonal.)

---

## 2. Each decision in full

Each entry: **the choice · the mechanism it pulls · alternatives rejected (and why) · provenance.**

### 2.1 Frontend & rendering — Next.js (App Router) + TypeScript
- **Mechanism.** **ISR/SSG** generates the long-tail aggregation pages (variety × region × season)
  as static, crawlable HTML with JSON-LD in the initial payload, revalidated as new journal entries
  land. React Server Components deliver content without a JS shell. Next can also **be** the app
  backend (route handlers / server actions), collapsing the SSR data path into one codebase.
- **Critical constraint (corrected 2026-06-23).** The long-tail pages must be **UGC-dominated**, not
  mass-generated thin stubs. Programmatic variety×region skeletons read as scaled-content and get
  algorithmically demoted (`AI_SEO_SYNTHESIS §B1`); a variety×region page is **no-indexed until it
  carries enough real first-hand UGC** (see the §3 invariant). ISR is the right rendering mechanism;
  the guardrail is what keeps it SEO-safe.
- **Rejected.** *Remix / React Router v7* — capable SSR, no built-in ISR (would need a hand-built
  CDN-cache strategy). *Astro* — best for a pure-content surface, weak for the logged-in
  offline-capable app; would force two frontends, premature at zero-stage (revisit only if SEO must
  be pushed to the absolute limit). *SvelteKit / Nuxt* — ruled out by the shadcn mandate (React-only).
- **Provenance.** `AI_SEO_SYNTHESIS §A1` (SSR hard requirement, verified) + the DRIVE2 long-tail
  thesis; ADR-0002. SEO guardrail: `AI_SEO_SYNTHESIS §B1/§A7`.

### 2.2 UI components — shadcn/ui (only)
- **Mechanism.** Copy-into-repo model = full ownership of component code; Radix gives accessibility
  (focus, ARIA) for free; Tailwind theming; the largest AI-agent familiarity of any component
  system, which directly raises code quality from the same prompt. **Fixed mandate, not a
  preference** — all UI is built exclusively from shadcn/ui via its MCP server / CLI / skills; no
  other component library is introduced alongside it, and components are not hand-rolled.
- **Cost (named honestly).** shadcn is React/DOM-only — it does **not** transfer to React Native.
  Accepted because mobile is **PWA-first** (§2.8), so the web UI *is* the mobile UI. A future native
  app, if ever built, needs a separate RN component system — a known, bounded, deferred cost.
- **Provenance.** UI mandate; ADR-0003.

### 2.3 App backend — TypeScript, isolated Python for matching ("Variant A")
- **Mechanism.** The app backend (save entry, auth, photos, feed, SSR pages) is **TypeScript**,
  co-located with Next — **one language the founder can read and debug** across frontend + backend,
  and the stack AI agents are strongest at. The Python matching stack runs as an **isolated service
  + worker** (HTTP/queue), because most matching work (variant seeding, Splink dedup, Meilisearch
  sync) is **batch, off the request path**.
- **Open seam (flagged 2026-06-23).** Canonical-form computation (ICU fold + transliteration) feeds
  the unique canonical-form index, which must be enforced **at write time**. Where canonicalization
  runs (TS at write vs. synchronous call into Python vs. eventual via the queue) is an
  implementation contract to settle in the build phase — it is not as cleanly "batch only" as a
  naive reading suggests. See open layer #3 (the TS↔Python queue contract).
- **Rejected.** *Python everywhere (Django/FastAPI) + React* — costs the founder the ability to read
  their own (especially money-path) backend code, and splits types across two ecosystems. *Reimplement
  matching in TypeScript* — no mature TS equivalents of RapidFuzz/Splink/PyICU/CyrTranslit; would
  discard the entire matching-engine evidence base.
- **Provenance.** `MATCHING-ENGINE_STACK_SPEC §7/§13`; operator sign-off; ADR-0001.

### 2.4 Matching / dedup engine — Python pipeline (isolated)
- **Mechanism.** The hard problem is matching Cyrillic/transliterated variety names and deduping
  user-added entries, plus serving the @-mention typeahead (public objects + @-handles, with a hard
  privacy filter). Libraries are purpose-built with **no equally-mature TS equivalents**:
  **Meilisearch** (typeahead), **RapidFuzz** (fuzzy matching), **Splink** (probabilistic record
  linkage / dedup), **PyICU** (Unicode collation/transliteration), **CyrTranslit** (Cyrillic↔Latin).
  A **unique canonical-form index** in Postgres is the hardware-level dedup guarantee under the fuzzy
  layer.
- **Constraint.** **Postgres locale must be UTF-8** or `pg_trgm` breaks on Cyrillic — a deployment
  invariant. (`MATCHING-ENGINE_STACK_SPEC §9`)
- **Decision is evidence-backed.** Two independent deep-research passes (project-aware + cold)
  converged on this stack, the same gaps (Bulgarian-heavy), and the same copyleft traps.
- **Rejected.** JS/Node matching libraries — none reach the maturity of the above for this
  Cyrillic-heavy task; paid cross-lingual services (Senzing) — enterprise-scale only and weaker on
  Bulgarian.
- **Provenance.** `MATCHING-ENGINE_STACK_SPEC`; ADR-0001/0005.

### 2.5 Database & platform — PostgreSQL via Supabase
- **Mechanism.** Postgres is the de-facto datastore the matching layer already requires (`pg_trgm`,
  the unique canonical-form index, Splink). **Supabase** wraps it with bundled **Auth**, **Storage**
  (photos), and **Row-Level Security** — collapsing DB + auth + blob storage + tenant isolation into
  one managed platform (high velocity for a solo founder). It is standard Postgres underneath, so
  the Python worker connects directly.
- **RLS enforcement model — see §2.11.** RLS here is a **narrow floor on sensitive tables**, not the
  sole gate; primary authorization lives in the server tier (Variant D). This corrects the prior
  framing of "RLS enforces the privacy axes at the DB layer" as the primary mechanism.
- **The deciding factor is durability, not cost.** The user's accumulated journal *is* the product's
  value, so data loss is existential. Managed backups/PITR on the existential asset beat a solo
  non-DBA hand-rolling them. The decision is reversible at the DB level (plain Postgres = dump/restore).
- **Lock-in (named honestly).** The DB is portable, but **Auth, Storage, and Supabase-managed RLS
  policies are Supabase-specific** — migrating those off is not a pure dump/restore.
- **Serverless connection rule.** Runtime client via the **Supavisor pooler (transaction mode)**;
  migrations via a **direct connection**; one client per cold-start container — or Postgres
  connections exhaust.
- **Rejected.** *Self-hosted Postgres on a VPS* — makes the solo founder the DBA/SRE on the most
  valuable asset before validation (deferred, not forever). *Neon / RDS / Cloud SQL* — fine managed
  Postgres, but auth + photo storage would be assembled separately; Supabase's bundle wins for solo
  velocity.
- **Provenance.** `MATCHING-ENGINE_STACK_SPEC` + `DB_SEED_AND_DATA-MODEL_SPEC`; `ENTRY_DATA_AND_RANKABILITY_SPEC §5`; ADR-0004.

### 2.6 ORM (TypeScript app) — Drizzle — *(REVISED 2026-06-23 from Prisma; supersedes ADR-0008)*
- **Mechanism.** The TS app needs end-to-end type safety **and** RLS that actually holds on the
  safety-critical privacy surface. **Drizzle** provides first-class Postgres/Supabase RLS ergonomics:
  policies declared in the **TypeScript schema** (`pgPolicy()`) — versioned in git, code-reviewed,
  applied via migrations — and a documented Supabase RLS integration that wraps queries under the
  `authenticated` role with the JWT context.
- **Why the reversal from Prisma.** Prisma connects as a **superuser by default and bypasses every
  RLS policy**; making RLS work through Prisma requires per-query transaction-wrapped context-setting
  via a client extension (discouraged by practitioner consensus as too-coupling; the raw-SQL
  workaround opens injection risk). CVE-2025-48757 found ~10% of "AI-builder + Supabase" apps shipped
  with RLS bypassed — this stack's exact profile. The privacy invariants (INV1–4, wartime location)
  are safety-critical, so the RLS axis outweighs Prisma's (real) agent-corpus advantage.
- **Cost (named honestly).** Drizzle has a **smaller agent-training corpus** than Prisma — agents
  write it less reliably, and a mistake in an RLS wrapper is a leak. **Mitigations (required):** CI
  invariant tests that prove cross-user isolation (§2.11); a single repository/data-access layer
  agents copy a working pattern from; mandatory review of security-sensitive queries. Tooling:
  Drizzle Studio (comparable to Prisma Studio); migration tooling less mature than Prisma's.
- **Rejected.** *Keep Prisma + client-extension RLS* (per-query tax + forget-the-wrapper leak risk).
  *Prisma + RLS-as-backstop only* (leaves RLS ergonomics poor where needed, keeps dashboard-policy
  drift). *Raw SQL* (loses schema-driven types).
- **Provenance.** Pressure-test 2026-06-23; ADR-0011 (supersedes ADR-0008). *This reversal is
  intentional — do not re-revert to Prisma without re-weighing the RLS axis against agent-corpus.*

### 2.7 Search / typeahead — Meilisearch (self-hosted container)
- **Mechanism.** The catalog front door + @-mention typeahead need fast, typo- and synonym-tolerant
  search over Cyrillic/transliterated names. Meilisearch handles this well, is **MIT + self-hostable**
  (no licence cost, no lock-in), and is already the search component of the matching stack. Postgres
  stays the source of truth; Meilisearch is a **derived index** kept in sync by a worker-owned batch
  job.
- **Privacy boundary (flagged 2026-06-23).** The index for the @-mention typeahead must contain
  **only public** objects/handles — index-sync correctness is a **privacy property**, not just
  freshness; a naive "reindex everything" job must not leak private rows. Covered by a test (§3).
- **Rejected.** *Postgres-only (`pg_trgm` + FTS)* — `pg_trgm` stays as the in-DB fuzzy gate, but is
  weaker than Meilisearch for the Cyrillic-heavy typeahead surface. *Algolia / Typesense Cloud /
  Meilisearch Cloud* — ongoing cost + lock-in; Meilisearch Cloud remains a drop-in escape hatch
  (same engine).
- **Provenance.** `MATCHING-ENGINE_STACK_SPEC`; ADR-0005.

### 2.8 Mobile — PWA-first
- **Mechanism.** The requirement is offline **capture** (not offline-first): a **local write queue**
  (service worker + IndexedDB) that syncs on reconnect — not CRDT merge. A PWA delivers this in one
  codebase with the web, so shadcn works unchanged and the founder isn't split across web + native
  before H1 is validated.
- **Risk (sharpened 2026-06-23) — data loss, not just reliability.** Unsynced entries live in iOS
  Safari IndexedDB, which iOS can **evict** (≈7 days of disuse for non-installed PWAs; under storage
  pressure otherwise). Since the journal is existential, offline-captured-but-unsynced data is a
  **data-loss surface**: sync ASAP, warn on unsynced, do not rely on long-lived local storage. Also:
  **iOS web push requires 16.4+ and home-screen install** — lineage "your seeds bloomed"
  notifications may be undeliverable to part of the audience.
- **Asymmetry.** Downside is bounded — if iOS bites, wrap the same codebase in **Capacitor**, or add
  an Expo/native app later (reusing the API + TS types). Keep the API and data model client-agnostic
  so native is additive, not a rewrite.
- **Rejected.** *React Native (Expo)* — separate codebase, no shadcn, premature pre-validation.
  *Capacitor now* — the designated fallback, not the start. *Flutter* — a third language; rejected.
- **Open de-risking task.** Spike offline capture (entry + photo queue, sync) on iOS Safari early —
  frame it as a data-loss test.
- **Provenance.** `OverGarden_MVP_PRD`; ADR-0006.

### 2.9 Hosting — split-managed (Vercel + Supabase + Railway)
- **Mechanism.** **Vercel** (Next.js app + app backend — Next-native ISR/SSG, preview deploys),
  **Supabase** (Postgres + Auth + Storage + RLS), **Railway** (the Meilisearch container + the Python
  matching service/worker). Starts entirely on **free tiers**; ~$45–65/mo at modest production. For a
  solo founder, **time is the scarcest resource** — managed platforms let them ship.
- **The "self-host / $0 licence" constraint is satisfied** — it means *self-hostable tools, no licence
  fees, you own and can move the data*, not "run your own iron." Everything here is OSS; managed
  platforms running OSS satisfy it, and EU regions are available for data residency (UA/BG).
  **Co-locate all three in the same EU region** to avoid cross-region latency on the request path
  (especially @-mention typeahead → Railway-hosted Meilisearch).
- **Operational weak point (named).** The Python service + Meilisearch on Railway is the piece most
  likely to need babysitting; the escape hatches (Meilisearch Cloud; consolidate later) are recorded.
- **Background jobs.** Prefer a **Postgres-backed queue** at zero-stage to avoid standing up Redis.
  Cross-language note: **pgmq or a plain table** (language-agnostic), **not Procrastinate**
  (Python-only) — because the TS app enqueues and the Python worker consumes (open layer #3).
- **Rejected.** *One platform for everything (Railway/Render)* — loses Vercel's Next ergonomics
  (a clean consolidation option later). *Self-host everything on one VPS* — makes the founder the SRE
  pre-validation; deferred.
- **Provenance.** `MATCHING-ENGINE_STACK_SPEC §2`; ADR-0007. Edge layer in front: ADR-0009 (§2.13).

### 2.10 Region vocabulary — ISO 3166-2 (UA/BG subdivision codes)
- **Mechanism.** `coarse_region` is the **aggregation key** for the variety×region public pages. As
  free text, "Київська обл." / "Київська область" / "Kyiv Oblast" would fragment one page into many
  and dilute SEO. So it is a **controlled, canonical code** — ISO 3166-2 for UA (27 units) and BG
  (28), validated at the app layer, with localized display names via a lookup. This granularity
  (oblast/province) is **both** privacy-coarse (appropriate for the wartime lock) **and** a useful
  SEO key.
- **Open data nuance.** Handling of occupied/contested territories in a wartime-sensitive product is
  a data/product decision (not a stack choice) — flag at seed time.
- **Rejected.** *Free-text region* (fragments aggregation). *Custom taxonomy* (reinvents a standard).
- **Provenance.** `ENTRY_DATA_MODEL_SPEC v1.0`; `ENTRY_DATA_AND_RANKABILITY_SPEC §3`.

### 2.11 Data-access topology & RLS enforcement — "Variant D" — *(NEW 2026-06-23)*
- **Mechanism.** Supabase's default "browser → PostgREST → Postgres" makes RLS the *only* barrier —
  the CVE-2025-48757 failure mode. This stack has a **trusted server tier**, so we invert it:
  1. **Access-topology invariant.** All data access flows through the server tier (Next + Python).
     The browser gets **no anon-key-wide direct access** to tables — no raw table reads, no Realtime
     on raw tables, no broad Storage. **Controlled exceptions:** signed upload URLs (one
     server-authorized object); Broadcast-from-Database realtime channels (§2.12).
  2. **Primary authz** lives in **one server-tier data-access/repository layer** every query passes
     through, always scoped by user + visibility. INV1–4 are primary here — structurally impossible
     to "forget," because the path *is* the gate.
  3. **RLS is a real floor on sensitive tables only** (location-bearing data, private objects,
     `proposed` lineage edges), via a **least-privilege DB role** (never superuser/service-role).
     Because the server tier already scopes by user, the full per-query `SET LOCAL` dance is not
     needed broadly. Policies declared in the Drizzle schema (§2.6) + Broadcast-authorization
     policies on `realtime.messages` (§2.12).
  4. **Location lock via data minimization first.** v0 stores **no precise coordinates**; EXIF-GPS
     stripped in the worker (sharp); RLS on location fields is tertiary. "Don't store" + "don't serve
     in photos" beats "policy hides a present column."
  5. **Invariant tests (REQUIRED).** A CI suite **proves** INV1–4 across every access path — runs on
     every commit. This is the structural mitigation for the Drizzle agent-corpus risk.
- **Rejected.** *RLS-primary on all ~30 tables* — complexity + leak surface on every table, per-row
  cost on joins, authz in SQL; only required if clients subscribe to raw tables, which §2.12 avoids.
  *App-layer authz only, no RLS* — no DB backstop on the safety-critical surface.
- **Lock-in (named).** The "browser never gets direct DB access" invariant must hold **from day 1** —
  retrofitting after features assume browser-direct access is expensive.
- **Provenance.** Pressure-test 2026-06-23; `ENTRY_DATA_AND_RANKABILITY_SPEC §5`,
  `CROSS_USER_TRUST_AND_PRIVACY_SPEC`; ADR-0012.

### 2.12 Realtime delivery — Supabase Broadcast from Database — *(NEW 2026-06-23)*
- **Mechanism.** v0 wants live feeds. Of Supabase Realtime's mechanisms, **Broadcast from Database**
  (DB triggers calling `realtime.broadcast_changes()` / `realtime.send()`) wins: a trigger fires on
  every WAL write (**DB is the single source of truth — no dual-write, can't forget to emit**), the
  trigger/server **chooses which columns** go in the payload (**sensitive raw rows never stream** —
  preserves the location lock + server-controls-output model), and it **scales** far better than
  Postgres Changes (Supabase's recommended method for scalability + security). Clients subscribe to
  **private channels** with Broadcast authorization (RLS on `realtime.messages`), **not raw tables** —
  consistent with Variant D (no RLS-primary forced).
- **Cross-cutting caveat (mandatory).** Realtime **does not guarantee delivery** — a client offline
  during a change loses it (no queue; Broadcast Replay is limited + alpha). **Therefore every
  realtime-updated surface MUST have a server fetch path that is the canonical state.** Realtime is an
  **enhancement layer** (live deltas), never the feed itself.
- **Rejected.** *Client-to-client Broadcast* — dual-write / forgotten-emission risk; no
  DB-source-of-truth. *Raw Postgres Changes* — streams raw rows to clients (footgun: a future
  sensitive column leaks by default); single-threaded scaling cliff (per-subscriber-per-change RLS
  check); DELETE not RLS-filtered.
- **Cost (named).** More setup than Postgres Changes; triggers run on the write path (keep them
  lightweight; `realtime.send` catches exceptions via `pg_notify` so a trigger failure doesn't break
  the write).
- **Provenance.** Mechanism comparison 2026-06-23 (verified against Supabase Realtime docs);
  `LINEAGE_SOCIAL_GRAPH_SPEC`; ADR-0013.

### 2.13 Edge, Security & DNS — Cloudflare + GoDaddy registrar — *(NEW 2026-06-23)*
- **Mechanism.** **Cloudflare** sits as the edge/security + authoritative-DNS layer in front of the
  stack. **GoDaddy remains the registrar**; nameservers are delegated to Cloudflare (full setup).
  - **Free at launch:** DNS, Universal SSL, L3/4/7 DDoS, **Turnstile** (privacy-respecting CAPTCHA),
    HSTS management + preload submission. Genuinely free.
  - **Pro ($25/mo per zone) when needed:** OWASP Core Ruleset + custom WAF rules. (Free gives only a
    basic managed ruleset + crude Bot Fight Mode + 1 IP-only rate-limit rule — enough to launch, not
    to tune.)
- **Configuration invariants:** SSL mode **Full (Strict)**; **Cloudflare does NOT cache HTML**
  (Vercel owns the ISR/HTML cache — no "Cache Everything" on HTML or ISR revalidation breaks);
  WAF/bot rules **allow-list verified search/retrieval crawlers** (OAI-SearchBot, PerplexityBot,
  Googlebot — SEO depends on crawlability; rate-limiting verified bots can hurt SEO).
- **Scope — NOT now.** *Cloudflare as host (Pages/Workers)* — ISR support risk; *R2 for storage* —
  revisit at scale; *Cloudflare Images for EXIF stripping* — security boundary stays explicit in the
  worker (sharp); Cloudflare may deliver/resize the already-stripped derivative only.
- **Cost (named honestly).** The *useful* WAF is **$25/mo**, not free. Edge rate-limit is **blunt**
  (per-IP, thin) — **real per-user/per-action anti-abuse stays in the app tier**. Two CDNs in series
  (Cloudflare → Vercel) is a place bugs hide (ISR cache interaction).
- **DNS cutover runbook.** (1) Disable DNSSEC at GoDaddy before changing NS (stale DS → SERVFAIL);
  re-enable via Cloudflare's DS after. (2) Recreate **all** records manually (auto-import incomplete)
  — especially **email SPF/DKIM/DMARC + MX** (coupled to the email provider, open layer #7).
  (3) Lower TTL 24–48h before cutover. (4) Change NS at GoDaddy; propagation up to 24–48h.
  (5) Verify resolution, Vercel binding, email deliverability.
- **Provenance.** `AI_SEO_SYNTHESIS §A1/§A2/§B2`; `TECH_STACK_DECISIONS §4` (domain facts); ADR-0009.

### 2.14 Marketing & Analytics — two-axis stack — *(NEW 2026-06-23)*
- **Mechanism.** Two axes separated by trust boundary, because product analytics and marketing
  analytics have different purposes, trust boundaries, and GDPR profiles.
  - **Axis A — first-party, privacy-safe (priority; this is the kill-criteria instrument):**
    **PostHog** (self-host or EU Cloud, reverse-proxied) for **H1 `p_journal`, H4 publish-rate,
    lineage metrics** + session replay; **cookieless web analytics** (Cloudflare Web Analytics or
    Plausible) for traffic/SEO **without a consent banner**.
  - **Axis B — third-party marketing/ads (consent-gated + server-side):** a **CMP/consent gate loads
    first** (no tag before opt-in); **GTM client + server-side GTM (sGTM)** so the server controls
    egress (strip location, hash PII); **Meta Conversions API (server-side)** over raw Pixel;
    **Google Ads + GA4** via sGTM + Consent Mode v2 + Enhanced Conversions. **GA4 = marketing tool
    only, NOT a kill-criteria or H6 instrument** (it is blind to AI crawlers — `AI_SEO_SYNTHESIS §B2`).
  - **SEO / AI-visibility instruments (these measure the actual H6 thesis):** **Google Search
    Console** (free, must-have); **Bing Webmaster Tools + IndexNow** (ChatGPT-via-Bing path);
    **Share-of-Model / AI-visibility monitoring** (Otterly/Profound or own 60–100 prompt runs —
    `AI_SEO_SYNTHESIS §A5`) — the real H6 instrument; **first-party UTM attribution** into PostHog;
    **Pinterest** (organic + ads) for the visual gardening niche.
- **Superseded.** **Microsoft Clarity dropped** in favor of PostHog session replay (avoids adding
  Microsoft as another processor over a war-sensitive audience).
- **Hard dependency.** Consent is **mandatory for the EU** (Bulgaria) and gates Axis B entirely —
  DPAs with Google/Microsoft/Meta, privacy policy with disclosure, EU-US DPF status verification
  (DPF is legally contested — verify at launch). **Meta for UA-under-war-risk is the most aggressive
  item** — a deliberate operator decision, with CAPI + data-minimization as de-risk. Tag bloat hurts
  SSR Core Web Vitals (sGTM + consent-gate + cookieless-first mitigate).
- **Rejected.** *GA4/Firebase Analytics as the product-analytics tool* (client-side, sampled, leaks
  war-sensitive behavior to Google, blind to AI citations). *Cloudflare Web Analytics as product
  analytics* (page-view only, not product events).
- **Provenance.** Operator mandate 2026-06-23 + privacy/legal constraints (`ENTRY §5`, PRD CHANGE-SET
  2026-06-22, `DB_SEED §13`); `AI_SEO_SYNTHESIS §B2/§A5`; ADR-0010.

---

## 3. Cross-cutting invariants the stack must always honor

Non-negotiable, cutting across all choices above:

- **SSR for every public surface.** No public content behind a client-only JS shell (AI crawlers
  don't render JS). Public pages render HTML + JSON-LD server-side. (`AI_SEO_SYNTHESIS §A1`)
- **No-index thin programmatic pages; index only UGC-dense pages.** *(added 2026-06-23)* Mass
  variety×region stubs read as scaled-content and get demoted; a variety×region page is no-indexed
  until it carries enough real first-hand UGC. (`AI_SEO_SYNTHESIS §B1`)
- **Location privacy lock.** Exact coordinates are **server-side only** — never in client payloads,
  URLs, query strings, or analytics events. **v0 stores no precise location at all**; `coarse_region`
  (ISO 3166-2) is the only location granularity. (`ENTRY_DATA_AND_RANKABILITY_SPEC §5`)
- **EXIF-GPS stripping.** Before any photo is served publicly, its GPS is stripped server-side (in
  the worker, sharp) and the image re-encoded; the GPS-bearing original stays server-side only. A
  public photo renders **iff** its stripped derivative exists — never fall back to the original.
- **Single-door data access.** *(added 2026-06-23)* All data access flows through the server tier;
  the browser gets no anon-key-wide direct Supabase access. Exceptions: signed upload URLs (one
  server-authorized object); Broadcast-from-Database realtime channels. (§2.11 / ADR-0012)
- **Privacy policies are code, versioned, and tested.** *(added 2026-06-23)* INV1–4 policies live in
  the Drizzle schema under version control and are covered by **CI invariant tests** proving
  cross-user isolation across every access path. (§2.6 / §2.11)
- **Meilisearch index correctness is a privacy boundary.** *(added 2026-06-23)* Only public
  objects/handles are indexed; a "reindex everything" job must not leak private rows. Covered by a
  test. (§2.7)
- **Realtime is an enhancement layer, not the feed.** *(added 2026-06-23)* Every live surface has a
  canonical server fetch path; Realtime delivers deltas only and does not guarantee delivery. (§2.12)
- **Cloudflare does not cache HTML; Vercel owns the ISR/HTML cache.** *(added 2026-06-23)* SSL mode
  Full (Strict); WAF/bot rules allow-list verified search/retrieval crawlers. (§2.13)
- **UTF-8 database locale.** Mandatory, or Cyrillic `pg_trgm` matching breaks.
  (`MATCHING-ENGINE_STACK_SPEC §9`)
- **RLS as a real floor (defence-in-depth) on sensitive tables.** *(refined 2026-06-23)* Enforced at
  the DB layer via a least-privilege role behind the server tier's primary authz — `USING` for reads
  + `WITH CHECK` for writes. Not the sole gate (that is the server tier). (§2.11)
- **No secrets in git.** Credentials/keys live in env vars / the platform secret store; `.env*` is
  always git-ignored.
- **Serverless connection discipline.** Runtime DB access via the Supavisor pooler (transaction
  mode); migrations via a direct connection; one client per cold-start container.

---

## 4. Domain & version reference (facts a new agent will need)

- **Domain:** `over.garden` — a `.garden` gTLD. **Not** a Google-registry TLD, so **not**
  HSTS-preloaded at the TLD level; HTTPS is not auto-enforced — set the HSTS header explicitly and
  submit to the preload list. **DNS + HSTS are now owned by Cloudflare** (§2.13). Transactional email
  from `@over.garden` needs SPF/DKIM/DMARC (records in Cloudflare DNS) via a reputable provider
  (Resend/Postmark/SES — open layer #7).
- **Registrar:** GoDaddy (ownership); nameservers delegated to Cloudflare.
- **Version-sensitive facts (verify before relying — these move):**
  - **Drizzle:** RLS via `pgPolicy()` in the schema + the Supabase RLS integration (query under the
    `authenticated` role with JWT context). *Verify the current helper API/limits.*
  - **Supabase Realtime:** Broadcast from Database via `realtime.broadcast_changes()` /
    `realtime.send()` in triggers, private channels + Broadcast Authorization (RLS on
    `realtime.messages`). *Verify the current authorization model + Postgres version constraints for
    trigger use.*
  - **Supabase:** Supavisor pooler (transaction mode for runtime, direct/session for migrations).
  - **Cloudflare:** Free vs Pro WAF/rate-limit/bot specifics; Cloudflare-in-front-of-Vercel config.
  - **Next.js:** App Router with React Server Components; ISR/SSG for the long-tail.
  - **Meilisearch:** MIT, self-hosted container.
  - **Matching libs (Python):** RapidFuzz, Splink, PyICU, CyrTranslit, Meilisearch client.
- **A new agent must re-verify any of the above against the installed versions** rather than trust
  this snapshot.

---

## 5. ADR index

- **ADR-0001** — Backend split "Variant A" (TS app + isolated Python matching)
- **ADR-0002** — Frontend & rendering: Next.js (App Router) + TypeScript
- **ADR-0003** — UI: shadcn/ui (only)
- **ADR-0004** — Database & platform: PostgreSQL via Supabase
- **ADR-0005** — Search + matching libraries: Meilisearch / RapidFuzz / Splink / PyICU / CyrTranslit
- **ADR-0006** — Mobile: PWA-first
- **ADR-0007** — Hosting: Vercel + Supabase + Railway
- **ADR-0008** — ORM: Prisma — **SUPERSEDED by ADR-0011**
- **ADR-0009** — Edge & DNS: Cloudflare + GoDaddy *(2026-06-23)*
- **ADR-0010** — Marketing & Analytics stack *(2026-06-23)*
- **ADR-0011** — ORM: Drizzle (supersedes ADR-0008) *(2026-06-23)*
- **ADR-0012** — Data-access topology & RLS (Variant D) *(2026-06-23)*
- **ADR-0013** — Realtime: Broadcast from Database *(2026-06-23)*

*(ADRs 0001–0008 were being re-authored against updated source specs at the time of writing; the
decisions carry forward unchanged. When re-authoring 0008, mark it `Status: Superseded by ADR-0011`
— do not delete it.)*

---

## 6. What is decided vs. still open

**Decided & binding (this document + ADRs 0001–0013):** the full technology stack in §1–§2 and the
cross-cutting invariants in §3.

**Hard dependency:** the **legal review** (consent / DPA / EU-US DPF) gates the Axis-B third-party
marketing tags (§2.14). Axis-A first-party analytics proceeds in parallel under the same DPA/
privacy-policy work.

**Still open — implementation layers (next phase; mostly "tool decided, needs the build," not
"undecided"):**
1. **Product-analytics instrumentation** — tool decided (PostHog); needs the **event spec** for
   H1 `p_journal` / H4 publish-rate / lineage metrics, under the no-precise-location invariant.
2. **Ops observability** — error tracking still **unchosen** (Sentry-class). Decide.
3. **TS↔Python queue contract** — Postgres-backed; **pgmq or a plain table** (not Procrastinate).
   Specify producer (TS) / consumer (Python) + the write-path canonicalization seam (§2.3).
4. **EXIF-strip executor** — approach confirmed (sharp, in the worker); needs the build + test.
5. **CI/CD + test stack** — **unchosen** (e.g. Vitest + Playwright); must run Drizzle migrations,
   typecheck, lint, and the **INV1–4 invariant tests** (§2.11).
6. **Auth specifics** — Supabase Auth methods (email/OTP/OAuth?) + SSR session handling
   (`@supabase/ssr` cookies + Next middleware).
7. **Transactional email provider** — **unchosen** (Resend/Postmark/SES); coupled to the DNS cutover
   (SPF/DKIM/DMARC in Cloudflare). Required for non-user invites (S18).
8. **i18n** — **unchosen** (e.g. next-intl); UA/BG (+RU spellings); localized region-name lookup.

**Anything product- or data-model-level** (entry schema, flows, metrics taxonomy) — not in scope
here; consult the relevant spec and treat it as potentially-in-rewrite until confirmed.

**Direction to the next agent:** build against the stack in §1–§3 as settled fact. Do **not** re-open
or re-derive these technology choices (especially: **Drizzle** not Prisma, **Variant D** access
topology, **Broadcast-from-Database** realtime, **PWA** not React Native, **Variant A** TS-app +
Python-matching, **Supabase**-managed, **Cloudflare** edge). For product and data-model decisions,
read the current specs and flag any conflict rather than guessing.

---

## 7. Verification owed (version-sensitive — confirm at implementation; does NOT block the decisions)

- **Drizzle** Supabase-RLS helper API/limits, against live docs (ADR-0011).
- **Supabase Realtime** Authorization model + `realtime.broadcast_changes()`/`realtime.send()` API +
  Postgres version constraints for trigger use (ADR-0012, ADR-0013).
- **Cloudflare** Free vs Pro feature/limit specifics + Cloudflare-in-front-of-Vercel config (ADR-0009).
- **(Optional)** Cloudflare Registrar `.garden` TLD support + ICANN 60-day transfer lock (ADR-0009).
- **Legal:** Art. 6 basis + EU-US DPF status before any Axis-B marketing tag goes live (ADR-0010).

*End of `TECH_STACK_DECISIONS.md` (consolidated 2026-06-23).*
