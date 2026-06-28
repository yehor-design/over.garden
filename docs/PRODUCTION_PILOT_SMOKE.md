# Production Pilot Smoke

Status: live smoke contract for OVE-27 plus OVE-36 worker/search proof
Last updated: 2026-06-28

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
- Deployment env now has `BETTER_AUTH_SECRET`, R2 runtime env, `DATABASE_SSL=true`, `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_CA`, and production `PUBLIC_SITE_URL` / `BETTER_AUTH_URL` installed in Vercel.
- Production managed Postgres is provisioned in DigitalOcean `FRA1`, reachable through public TLS with the configured CA, and bootstrapped with the app schema plus Better Auth tables.
- OVE-27 branch preview `codex/ove-27-production-pilot-smoke` was redeployed after setting branch-specific `PUBLIC_SITE_URL` / `BETTER_AUTH_URL` to the branch alias and adding that alias to the R2 quarantine CORS origins.
- On 2026-06-27, that branch preview passed the browser pilot smoke through homepage first-entry with photo, derivative-only authenticated readback, same-object follow-up, public SSR journal readback, public variety CTA back to `/garden`, archive to `410 Gone`, and authenticated `/garden/pilot-health` aggregate readout.
- On 2026-06-28, OVE-36 provisioned the production worker/Meilisearch runtime at `matching.over.garden` and `meili.over.garden`, installed the production Vercel worker/search env names, and passed a redacted live journal index/unindex smoke against production Postgres and Meilisearch.

Implication: the OVE-27 preview now proves the internal live-path contract against managed Postgres and R2. The remaining production closeout is to merge the deployed app version with the CA-aware database runtime and verify the same smoke on the public production alias selected for the pilot. A protected preview is acceptable for internal deployment inspection, but it does not replace public visitor/crawler validation for H6.

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
2. Open `/garden/pilot-smoke` as an operator.
3. Treat any `fail` check as a blocker for live pilot.
4. Treat `warn` checks as explicit degraded state that must be named in the Linear/GitHub handoff.
5. Confirm Cloudflare is not caching app HTML if the app domain is routed through Cloudflare.

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

## Done Gate

Do not mark OVE-27 Done if any of the following are true:

- The selected live URL only works locally or only behind Vercel SSO when the goal is public pilot validation.
- Sign-up/sign-in fails on the deployed URL.
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

Python worker compile gate:

```bash
cd services/matching
uv run python -m py_compile app/__init__.py app/main.py app/search.py app/worker.py
```
