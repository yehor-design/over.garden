# Deterministic Visual Fixture Environment

Status: implemented by OVE-187
Manifest version: `ove187-v1`
Manifest SHA-256: `32c378378d0cd4d9098a826076f5b9f2aaf9b440006cabbd24fa2d5e19279e25`

## Purpose

This environment gives product and design work a stable, realistic dataset on
the real OverGarden repositories and routes. It is for local development and an
explicitly designated Vercel Preview only. It is not a mock domain model and it
must never be enabled in Production.

The manifest owns exactly:

- 4 synthetic users and 4 matching public profiles;
- 5 spaces;
- 30 living objects: 18 plants, 8 animals, and 4 bee colonies;
- 80 journal entries across public, private, archived, and public-gone states;
- 16 generated EXIF-free PNG derivatives in 1:1, 4:3, 3:4, and 16:9;
- 9 real-route scenarios covering dense, typical, empty, HTTP 404, and HTTP
  410 states.

All IDs, timestamps, public slugs, mutation IDs, media keys, content, and the
manifest hash are deterministic. Test copy is natural Ukrainian, Bulgarian,
and Russian, with short, normal, seasonal, multiline, and long records rather
than one repeated filler template. Every raster is bound to one unique public
entry on a semantically matching plant, animal, or bee-colony object. The
committed raster sources are documented in
`apps/web/test/visual-fixtures/media/README.md`.

The version also includes one deterministic 2026-07-10 current-day record and
one exact input-boundary record with a 140-character title and 2,000-character
body. The fixture index exposes a machine-readable state-coverage inventory for
empty space/object, today, owner-only, archived, maximum-copy, no-media,
one-media, and gallery states. Owner-only and archived coverage is reported as
safe aggregate metadata with no public route, title, or body serialization.

The four public identities are `@demo_olena` (established gardener),
`@demo_mariya` (apartment plant keeper), `@demo_danylo` (animal keeper), and
`@demo_nikolay` (beekeeper). They are synthetic readback identities and have no
seeded password or social-provider credential. Do not create or document shared
credentials for them; use a normal local test account when an authenticated
interaction itself is under test.

The dense object has exactly ten active public records against a production
preview page size of five. Its passport initially renders five and exposes the
full next page, including a long-text record, through the localized native
"show more" disclosure. The remaining two records on that object are owner-only
fixtures, so opening the disclosure completes the public list rather than
presenting a false partial history.

## Safety Boundary

Every command and the `/__visual-fixtures` route fail closed unless all required
environment checks pass. The guard refuses:

- `VERCEL_ENV=production` unconditionally;
- `over.garden` and `www.over.garden` as either public or auth origin;
- disabled or malformed fixture configuration;
- a database name that differs from `VISUAL_FIXTURES_DATABASE`;
- any non-loopback Postgres host for a `local` target;
- a Preview target without both `VERCEL_ENV=preview` and
  `VISUAL_FIXTURES_ALLOW_PREVIEW=true`.

There is no browser query parameter, cookie, header, API mutation, or production
fallback that can enable the fixture environment. Proxy evaluates the same pure
environment contract and returns a hard HTTP `404` before App Router whenever
the contract fails; the page repeats the guard before dynamic database/storage
imports as defense in depth. The enabled route is `noindex` and is excluded
from the product shell.

Fixture rows are identified by exact manifest IDs. Reset issues exact-ID deletes
in reverse foreign-key order and deletes only the manifest's storage keys under
`visual-fixtures/ove187-v1/`. It does not use wildcard or prefix database
deletes. It does not write analytics, notifications, jobs, or search documents.
The content contains no precise coordinates; spaces and objects use only the
existing hidden or coarse-region privacy states.

## Local Use

From `apps/web`, bootstrap the Apple Container-first local services and schema:

```bash
pnpm local:bootstrap
```

Keep the defaults in `.env.local` pointed at loopback Postgres and local MinIO,
then explicitly enable only this session or local file:

```bash
VISUAL_FIXTURES_ENABLED=true
VISUAL_FIXTURES_TARGET=local
VISUAL_FIXTURES_DATABASE=overgarden
VISUAL_FIXTURES_ALLOW_PREVIEW=false
```

Seed or idempotently repair the dataset:

```bash
pnpm visual:fixtures:seed
```

Open the operational index at:

```text
http://localhost:3000/__visual-fixtures
```

Reset only the OVE-187 namespace:

```bash
pnpm visual:fixtures:reset
```

Run the complete destructive local verification cycle and restore the final
seeded state:

```bash
pnpm visual:fixtures:verify
```

`verify` performs seed twice, compares counts, creates one non-fixture database
sentinel and one non-fixture public media sentinel, resets the exact fixture
namespace, proves both survived, reseeds, checks all 16 fixture media objects
with object-store HEAD requests, and removes both sentinels. Its JSON output is
intentionally limited to the version, hash, environment class, aggregate
counts, and boolean/count proof fields.

The expected final counts are:

```json
{
  "actors": 4,
  "profiles": 4,
  "spaces": 5,
  "objects": 30,
  "entries": 80,
  "media": 16
}
```

The missing-journal and gone-journal scenarios return real HTTP `404` and
`410` responses. The object-without-public-history scenario exercises the
shared App Router not-found UI. Because the root shell intentionally has a
streaming `loading.tsx` boundary, Next.js returns HTTP `200` plus injected
`noindex` metadata for that streamed not-found response. The fixture index
labels this case `Not-found UI · 200` instead of claiming a hard 404. This is
the framework's documented streamed-response contract, not a fixture seed
failure.

## Preview Use

Preview use is opt-in and must target an isolated Preview database and buckets.
Set `VISUAL_FIXTURES_TARGET=preview`, the exact Preview database name,
`VERCEL_ENV=preview`, and `VISUAL_FIXTURES_ALLOW_PREVIEW=true`. Do not reuse
Production storage or database credentials. Run seed/reset commands from a
trusted operator environment; the product exposes no write endpoint.

## Troubleshooting

- `Visual fixtures are disabled`: set `VISUAL_FIXTURES_ENABLED=true` explicitly.
- `resolved database name does not match`: fix `VISUAL_FIXTURES_DATABASE`; do
  not weaken or bypass the check.
- `Local visual fixtures require a loopback Postgres connection`: point the
  local target at `localhost`, `127.0.0.1`, or another accepted loopback form.
- `media digest mismatch`: restore the committed asset or deliberately version
  the manifest and update its tested digest; do not silently accept changed
  bytes.
- incomplete counts on the index: rerun `pnpm visual:fixtures:seed`, then
  `pnpm visual:fixtures:verify` if the mismatch persists.

When the schema changes, update the manifest/repository/tests together and
version the fixture contract when its stable visual output changes.
