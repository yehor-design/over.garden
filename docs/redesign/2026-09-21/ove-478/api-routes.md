# Route handlers (`route.ts`) by family — purpose and caller

> **Snapshot, 2026-09-24,** taken while OVE-478's changes were still uncommitted in the working tree; "untracked" and "uncommitted" below describe that moment. What OVE-478 changed in answer to it is `../OVE-478-PROOF.md`.

47 handlers: 32 under `apps/web/src/app/api/`, 15 elsewhere under `apps/web/src/app/`. Paths are relative to `apps/web/src/app/`. "Caller" is the in-repo code that requests the route (grep of `apps/web/src`, `apps/web/cloudflare`, `apps/web/scripts`, `apps/web/vercel.json`); "no in-app caller" means none was found. Every `/api/**` response is `no-store` from the proxy except `/api/public/catalog/**` (src/proxy.ts:362-398). Not an audit: one line each.

## Auth and action intent

| Handler | Methods | Purpose | Caller |
|---|---|---|---|
| `api/auth/[...all]/route.ts` | GET, POST, PATCH, PUT, DELETE | Better Auth (sessions, e-mail sign-in/up, reset, verification, account mutations); refuses retired social providers and bridges legacy verification links | auth Server Actions (`(default)/auth/auth-actions.ts`), `server/auth/password-reset-request.ts`, `lib/auth/google-oauth.ts`; the reset e-mail links `/api/auth/reset-password/{token}` (`server/auth/auth-email-outbox.ts:72-74`) |
| `(default)/auth/intent/start/route.ts` | POST | Signs a held action (like, follow, comment, write…) into an intent token; relative 303 to `/auth/intent` | the `<form action="/auth/intent/start">` in `components/auth/auth-intent-trigger.tsx:84` |
| `(default)/auth/intent/resume/route.ts` | GET | Consumes the token after sign-in and returns to the exact control (relative 303) | `(default)/auth/intent/page.tsx:85`, `lib/navigation/sign-in-href.ts`, `(default)/auth/cancel-href.ts:8` |

## Garden workspace (session-authorized at the moment of the write)

| Handler | Methods | Purpose | Caller |
|---|---|---|---|
| `api/garden/entries/route.ts` | POST | Atomic publish of a new entry with its staged photos (idempotent intent) | `lib/garden/use-local-journal-composer.ts:348` |
| `api/garden/entries/[entryId]/route.ts` | PATCH | Atomic edit of a published entry | `lib/garden/use-local-journal-composer.ts:485` |
| `api/garden/destinations/route.ts` | GET | Owned-destination search (spaces/objects) for the picker, settled with a 4.5 s deadline | `components/garden/owned-destination-picker.tsx`, `components/garden/entry-composer.tsx` |
| `api/garden/spaces/route.ts` | POST | Create one empty space (OVE-484) | `components/garden/space-setup-flow.tsx` |
| `api/garden/objects/route.ts` | POST | Create one plant or animal (OVE-485) | `components/garden/object-setup-flow.tsx` |
| `api/garden/mentions/typeahead/route.ts` | GET | Mention suggestions while writing | `(default)/garden/first-entry-composer.tsx:247` |
| `api/garden/value-pulse/route.ts` | POST | "Was this useful" feedback on a follow-up | `(default)/garden/objects/[objectId]/follow-up-value-pulse.tsx` |
| `api/garden/catalog/typeahead/route.ts` | GET | 308 to `/api/public/catalog/typeahead`, kept "for one release so a stale client bundle keeps working, then goes" (its own comment) | **no in-app caller**; still called by `scripts/smoke-garden-catalog-ux.ts:400,492`, `scripts/smoke-garden-bg-official-varieties.ts:529`, `scripts/smoke-garden-eu-oj-common-catalogue.ts:441` — overdue for removal |

## Media

| Handler | Methods | Purpose | Caller |
|---|---|---|---|
| `api/media/staging/sessions/route.ts` | POST | Issue or renew the composer's staging capability for the Cloudflare Worker | `lib/media/ephemeral-staging-client.ts:21` |
| `api/media/staging/commit-status/route.ts` | POST | Signed read of a staging commit's status | the Cloudflare staging Worker (`apps/web/cloudflare/media-staging/src/index.ts`, `staging-session.ts`) |
| `api/media/[mediaAssetId]/focal/route.ts` | PATCH | The owner sets a photograph's focal point | `components/media/owner-media-focal-panel.tsx:61` |

## Activity

| Handler | Methods | Purpose | Caller |
|---|---|---|---|
| `api/notifications/receipts/route.ts` | POST (form) | Read / unread / dismiss one row's events; 303 back with `?receipt=&event=` | the Activity page form, `[locale]/notifications/page.tsx:631` |
| `api/notifications/preferences/route.ts` | POST (form) | Save Activity preferences; back to `/notifications/settings?saved=1\|failed` | `[locale]/notifications/settings/page.tsx:173` |

## Public reads (no cookie, no session)

| Handler | Methods | Purpose | Caller |
|---|---|---|---|
| `api/public/catalog/typeahead/route.ts` | GET | The picker's catalogue read; the one public-cache exception (ADR-0026 D7) | `lib/garden/catalog-typeahead-contract.ts:8` (`CATALOG_TYPEAHEAD_PUBLIC_PATH`) |
| `api/public/search/palette/route.ts` | GET | Command-palette search groups | `components/ui/command-palette-dialog.tsx` |
| `api/public/objects/suggestions/route.ts` | GET | Living-object catalogue suggestions (`q`, `kind`, `identity`) | **no in-app caller** (only its `route.test.ts`) — orphaned |
| `api/public/sources/eppo/suggestions/route.ts` | GET | EPPO archive suggestions; JSON 404 while the archive is dark | **no in-app caller** (only its `route.test.ts`) — orphaned |

## Interface language and analytics

| Handler | Methods | Purpose | Caller |
|---|---|---|---|
| `api/interface/context/route.ts` | GET | `{ market, locale }` for a surface outside the layout | `app/global-error.tsx:65` (`INTERFACE_CONTEXT_ENDPOINT`) |
| `api/interface/locale/route.ts` | POST (GET → 405) | Language choice from the hand-written 404/410 lifecycle documents, answered by a redirect back | forms emitted by `lib/public-lifecycle-document.ts` (`INTERFACE_LOCALE_PREFERENCE_ENDPOINT`) |
| `api/meta/conversions/route.ts` | POST | Server-side relay of consented Meta conversion events | `lib/meta-marketing/client.ts` |

## Scheduled jobs (Vercel Cron, `Authorization: Bearer $CRON_SECRET`; schedule in `apps/web/vercel.json`)

| Handler | Schedule (UTC) | Purpose |
|---|---|---|
| `api/cron/media-lifecycle/route.ts` | daily 03:00 | Media retention workflow for deleted entries |
| `api/cron/catalog-search-weight/route.ts` | daily 03:30 | Recompute the picker's ranking inputs |
| `api/cron/catalog-card-revalidate/route.ts` | daily 03:50 | Drain organism-card intents and expire their cache tags |
| `api/cron/auth-email-outbox/route.ts` | daily 04:00 | Send queued auth e-mails |
| `api/cron/catalog-pick-events-purge/route.ts` | daily 04:10 | Purge pick events past 90 days |
| `api/cron/learning-attribution/route.ts` | daily 04:15 | Drain the learning-attribution outbox |
| `api/cron/media-orphans/route.ts` | Mondays 05:00 | Delete public derivatives no `media_assets` row names |
| `api/cron/catalog-digest/route.ts` | Mondays 06:00 | Enqueue the owner's weekly curation digest |

Each also answers a manual POST. Callers: Vercel Cron only.

## Health, diagnostics and the API fallback

| Handler | Methods | Purpose | Caller |
|---|---|---|---|
| `api/health/route.ts` | GET | Liveness for the external monitor (ADR-0027). Its comment still refers to the owner-only `/health` page ADR-0027 retired | external monitor |
| `api/skeleton/journal/route.ts` | GET, POST (POST → 410) | Walking-skeleton readback; local loopback runtime only, proxy hard 404 elsewhere (src/proxy.ts:816-835) | none (manual local diagnostic) |
| `api/[...notFound]/route.ts` | all | JSON 404 for any unknown `/api/*`, so no HTML shell streams | — |

## Addresses served by handlers outside `/api`

| Handler | Methods | Purpose | Caller / proof |
|---|---|---|---|
| `(default)/id/[uuid]/route.ts`, `[locale]/id/[uuid]/route.ts` | GET | Organism permalink → 308 to the canonical card in the request's locale, or a 404 document (`app/catalog-alias-route.ts:22-58`) | JSON-LD `@id` and sitemap consumers; tests/catalog-addresses.spec.ts:173-184 (308, incl. `/bg/id/…`), :228 (`/id/not-a-uuid` → 404) |
| `(default)/eppo/[code]/route.ts`, `[locale]/eppo/[code]/route.ts` | GET | EPPO code alias → 308 or 404 | tests/catalog-addresses.spec.ts:190-199 (308), :220 (404) |
| `(default)/wikidata/[qid]/route.ts`, `[locale]/wikidata/[qid]/route.ts` | GET | Wikidata QID alias → 308 or 404 | tests/catalog-addresses.spec.ts:222-226 (`/ru/wikidata/…` 404 only) |
| `(default)/col/[id]/route.ts`, `[locale]/col/[id]/route.ts` | GET | Catalogue of Life id alias → 308 or 404 | **no browser or unit proof** |
| `(default)/gbif/[key]/route.ts`, `[locale]/gbif/[key]/route.ts` | GET | GBIF key alias → 308 or 404 | **no browser or unit proof** |
| `(default)/garden/lineage/invitations/claim/handoff/route.ts` | POST | Moves an invitation token from the URL fragment into an `httpOnly` cookie; tells `expired` from `invalid` | `lib/lineage/claim-handoff.ts:4` (claim page script) |
| `sitemap.xml/route.ts` | GET | Sitemap index, one chunk per family | crawlers (`robots.ts`) |
| `sitemaps/[chunk]/route.ts` | GET | One chunk's `urlset`; 404 for an unknown chunk | the sitemap index |

The five alias pairs are the only `[locale]` route handlers; `[locale]/…/route.ts` refuses a non-public locale with an empty 404.
