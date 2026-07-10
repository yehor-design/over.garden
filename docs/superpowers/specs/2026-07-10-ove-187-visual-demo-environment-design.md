# OVE-187 Visual Demo Environment Design

Status: approved by the founder through the OVE-187 execution request
Date: 2026-07-10
Owner: founder

## Problem

Drive2-parity UI cannot be evaluated from empty routes or one ideal record. The founder needs stable, realistic content density on real OverGarden routes, including long Cyrillic text, mixed living-object classes, media aspect ratios, pagination thresholds, private/public boundaries, and 404/410 states.

## Decision

Implement one deterministic, resettable visual-fixture namespace over the existing product schema. Do not add a production `is_demo` column and do not create a parallel mock domain model. Stable manifest IDs are the namespace and the only rows reset may delete.

The fixture system has five bounded units:

1. `environment.ts` fails closed before database or storage writes and is reused
   by Proxy for a pre-App-Router hard 404.
2. `manifest.ts` is the versioned source of truth for actors, spaces, objects, entries, media, scenarios, and expected counts.
3. `repository.ts` idempotently upserts and namespace-resets real Kysely rows and reports database status.
4. `media-store.ts` uploads/deletes only pre-stripped fixture derivatives under the manifest key prefix.
5. `/__visual-fixtures` is a development/designated-preview index over real routes; it is unavailable in Production.

## Environment Safety

The runner and route require all of the following:

- `VISUAL_FIXTURES_ENABLED=true`.
- `VISUAL_FIXTURES_TARGET=local` or `preview`.
- `VISUAL_FIXTURES_DATABASE` exactly matches the database name parsed from the resolved connection string.
- `local` targets use only loopback database hosts.
- `preview` targets require `VERCEL_ENV=preview` and `VISUAL_FIXTURES_ALLOW_PREVIEW=true`.
- `VERCEL_ENV=production`, the canonical production app origin, missing connection data, or any mismatch fails before writes.

The browser cannot enable fixtures with a query parameter, cookie, header, or public mutation endpoint.

## Deterministic Data

The manifest contains four synthetic Better Auth users with reserved `.invalid` email addresses and public-safe handles, five spaces, 30 living objects, 80 journal entries, and 16 media assets. It uses stable UUIDs, slugs, mutation IDs, timestamps, and route URLs. Content is natural Ukrainian, Bulgarian, and Russian test prose, not Lorem Ipsum.

The object mix is 18 plants, 8 animals, and 4 bee colonies. Existing internal catalog rows may be referenced, but fixtures do not create catalog evidence. Unsupported future product states are declared in manifest coverage rather than creating premature schema. The current one-media-per-entry schema is preserved; the fixture index exposes the full 16-image media set for crop/aspect comparison, while real entry galleries remain owned by their future product slice.

The dense public object uses a five-record production preview plus one complete
five-record next page. The passport renders the first page and a localized
native disclosure for the next page, including long text, while the last two
fixture records on that object remain owner-only. This proves both the
page-size-plus-one trigger and full-next-page density without inventing a
parallel journal directory before OVE-176.

## Media

Fixture photos are generated raster assets committed under `apps/web/test/visual-fixtures/media/`. They contain real plant, animal, and apiary subjects, cover 1:1, 4:3, 3:4, and 16:9, and contain no metadata relied on by the product.

The seed command uploads these already stripped test derivatives to the configured public test bucket under `visual-fixtures/ove187-v1/`. It does not simulate user upload and cannot weaken quarantine processing. Reset deletes only those exact manifest keys.

## Seed And Reset Flow

`pnpm visual:fixtures:seed`:

1. Load `.env.local` without overriding process env.
2. Evaluate the environment guard.
3. Validate the manifest and local asset digests.
4. Upload fixture derivatives.
5. Transactionally upsert users, profiles, spaces, objects, entries, and media rows.
6. Query expected counts and print only version/hash/counts.

`pnpm visual:fixtures:reset`:

1. Evaluate the same guard.
2. Transactionally delete only manifest media, entries, objects, spaces, profiles, and users in dependency order.
3. Delete only manifest media keys from test storage.
4. Print only version/hash/deleted counts.

Running seed twice produces the same IDs, logical values, counts, and manifest hash.

## Fixture Index

`/__visual-fixtures` is an operational page outside the product shell. It shows seed status, scenario groups, expected counts, stable public routes, hard journal 404/410 targets, the streamed noindex object-empty state, actor handles without credentials, and the media aspect gallery. Scenario links always target real product routes; command instructions live in `docs/VISUAL_FIXTURE_ENVIRONMENT.md`.

The page calls a scoped status query by manifest IDs. It never serializes email, owner IDs, database URLs, storage keys, tokens, or private entry bodies.

## Verification

- TDD unit tests for production refusal, local/preview acceptance, database mismatch, manifest cardinality, language/content diversity, stable hash, namespace-only SQL, and safe public status serialization.
- Real local Postgres/MinIO proof for seed, repeated seed, reset, sentinel survival, media availability, and reseed.
- Browser QA at desktop and 320px through the fixture index and representative real journal/object/profile routes.
- Full lint, typecheck, test, build, mainline closeout, GitHub CI, and Vercel Production refusal proof before Linear Done.

## Rejected Alternatives

- Per-page hard-coded mock arrays: fast initially, but they bypass repositories and drift between slices.
- Production `is_demo` columns: persistent product complexity for development-only behavior.
- Random remote placeholder services: unstable crops, licensing uncertainty, and non-reproducible screenshots.
- Seeding fake production activity: corrupts trust, analytics, search, and launch evidence.
