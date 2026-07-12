# Deterministic Visual Fixture Environment

Status: implemented by OVE-187, extended by OVE-179
Manifest version: `ove187-v3`
Manifest SHA-256: `2fda2016027549d316bbea1aad2e8d76f6ae56684973d82537b2747854d295e8`

## Purpose

This environment gives product and design work a stable, realistic dataset on
the real OverGarden repositories and routes. It is for local development and an
explicitly designated Vercel Preview only. It is not a mock domain model and it
must never be enabled in Production.

The manifest owns exactly:

- 4 synthetic users and 4 matching public profiles;
- 5 spaces;
- 30 living objects: 18 plants, 8 animals, and 4 bee colonies;
- 19 synthetic catalog identities and 29 searchable primary/alias names with
  explicit `visual_fixture` provenance;
- 81 journal entries across public, private, archived, public-gone, direct
  object, and space-level states, plus 2 same-owner/same-space object mentions;
- 7 curated journal topics and 40 accepted, public-eligible memberships;
- 16 generated EXIF-free PNG derivatives in 1:1, 4:3, 3:4, and 16:9;
- 67 real-route scenarios covering public-feed, living-object-catalog,
  public-journal-directory, and knowledge-hub empty, sparse, typical, dense,
  loading, recoverable error, threshold pagination, unavailable, aliases, long
  Cyrillic copy, and deep evidence states alongside the existing object/journal
  HTTP 404 and 410 states;
- 11 machine-checkable journal-directory queries with stable URLs, expected
  counts, ordered entry IDs, and ordered public slugs across pagination and
  filter boundaries;
- 3 synthetic guides, 3 synthetic answers, 4 explicit topic evidence states,
  and 10 machine-checkable knowledge rules with exact entry/object IDs across
  zero, one, typical, dense, catalog-linked, long-answer, and derivative-media
  boundaries;
- 14 machine-checkable living-object passport cases that exercise the public
  and owner production loaders across plants, animals, bee colonies,
  confirmed/provisional/unknown identities, no-media/cover/gallery states,
  empty/typical/dense chronology, long-name wrapping, archived history
  suppression, hard `404`, and hard `410` lifecycle boundaries;
- 17 machine-checkable journal-entry V2 cases through the production public
  read model and owner-control query. They cover guest, authenticated-reader,
  and owner access; plant, animal, bee-colony, and multi-object space context;
  short, normal, and long copy; no media, square, portrait, landscape, and
  mixed galleries with alt/caption metadata; safe and hidden regions; first
  and last chronology boundaries; and private `404`, missing `404`, and gone
  `410` lifecycle states;
- 19 intent-authentication scenarios covering Comment, Bookmark, Follow,
  Claim, Add object, Add journal entry, Save, and Publish across guest,
  authenticated, cancel, expired, invalid, deleted, unavailable,
  insufficient-permission, preserved-filter/cursor, profile-target, and
  retained-draft states. The retained-draft starts write realistic synthetic
  first-entry and follow-up payloads to IndexedDB before authentication instead
  of representing retention with a query string alone. The first-entry draft
  resumes to an accessible owner workspace, while the synthetic-owner follow-up
  explicitly expects the permission-changed `404` boundary. The Claim start
  signs a short-lived invite for deterministic pending-identity and provenance
  rows, then traverses the real fragment handoff, encrypted HttpOnly cookie,
  clean claim route, and intent-aware sign-in boundary.

All IDs, timestamps, public slugs, mutation IDs, media keys, content, and the
manifest hash are deterministic. Test copy is natural Ukrainian, Bulgarian,
and Russian, with short, normal, seasonal, multiline, and long records rather
than one repeated filler template. Every raster is bound to a semantically
matching public plant, animal, or bee-colony entry. The feed includes exact
no-media and one-media examples plus one bounded three-image gallery. The
trusted fixture seed can attach that gallery while an application guard and a
partial database unique index still enforce one-photo behavior for every
non-fixture upload. The committed raster sources are documented in
`apps/web/test/visual-fixtures/media/README.md`.

The version also includes one deterministic 2026-07-10 current-day record and
one exact input-boundary record with a 140-character title and 2,000-character
body. The fixture index exposes a machine-readable state-coverage inventory for
empty space/object, today, owner-only, archived, maximum-copy, no-media,
one-media, gallery, feed empty/typical/dense/loading/error/pagination/exhausted,
and context-empty states. Owner-only and archived coverage is reported as safe
aggregate metadata with no public route, title, or body serialization.

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
- any non-loopback S3 endpoint or public media origin for a `local` target;
- the canonical `https://media.over.garden` production media origin;
- a Preview target without both `VERCEL_ENV=preview` and
  `VISUAL_FIXTURES_ALLOW_PREVIEW=true`.

No browser query parameter, cookie, header, API mutation, or production fallback
can enable the fixture environment. Inside an already enabled, isolated fixture
environment, the `__visualFeed`, `__visualObjects`, `__visualJournals`, and
`__visualKnowledge` query parameters may select read-only rendering states or
the isolated journal/knowledge corpus for screenshot evidence; the same
parameters are ignored everywhere else.
Proxy evaluates the pure environment contract and returns a hard HTTP `404`
before App Router whenever the contract fails; the fixture index repeats the
guard before dynamic database/storage imports as defense in depth. The enabled
index is `noindex` and is excluded from the product shell.

Fixture rows are identified by exact manifest IDs. Reset removes media, topic
memberships, topics, entries, claimable lineage edges and pending identities,
objects, catalog names, catalog identities, spaces, profiles, and actors in
reverse foreign-key order and deletes
only the manifest's storage keys under
`visual-fixtures/ove187-v3/`. It does not use wildcard or prefix database
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
R2_ENDPOINT=http://127.0.0.1:9000
R2_FORCE_PATH_STYLE=true
R2_PUBLIC_BASE_URL=http://127.0.0.1:9000/overgarden-public
```

Use the matching local MinIO bucket names and credentials from `infra/.env`;
do not point a local fixture command at Cloudflare R2. Successful command output
reports both `databaseHostClass: loopback` and
`objectStoreHostClass: loopback` without exposing endpoints or credentials.

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
with object-store HEAD requests, executes all 11 journal-directory count/order
contracts, all 10 knowledge entry/object contracts, and all 14 public/owner
passport contracts against canonical Postgres loaders, and removes both
sentinels. It also executes all 17 journal-entry V2 contracts against the
production public lookup and separately scoped owner-control query. Proof is
explicitly scoped to manifest IDs because reset
deliberately preserves unrelated local rows. The three fixture CLI commands
run with the React Server condition because these proofs deliberately reuse
production `server-only` queries. JSON output is limited to the version, hash,
environment class, aggregate counts, and boolean/count proof fields.

The expected final counts are:

```json
{
  "actors": 4,
  "profiles": 4,
  "spaces": 5,
  "catalogItems": 19,
  "catalogNames": 29,
  "objects": 30,
  "lineagePendingIdentities": 1,
  "lineageEdges": 1,
  "entries": 81,
  "objectMentions": 2,
  "topics": 7,
  "topicSignals": 40,
  "media": 16
}
```

The fixture index links every public-feed state. The normal topic routes use
real rows and repository filters:

```text
/?topic=quiet-evidence
/?topic=seasonal-care
/?topic=care-checks
```

The gated rendering routes cover loading, recoverable error, page two, final
page, and an empty route-owned context rail:

```text
/?__visualFeed=loading
/?__visualFeed=error
/?__visualFeed=page-2
/?__visualFeed=exhausted
/?__visualFeed=context-empty
```

The catalog scenarios exercise real SQL-backed taxonomy groups, URL-owned
filters, aliases, and the six-card pagination boundary:

```text
/objects?kind=plant&identity=provisional
/objects?kind=animal&identity=breed
/objects?kind=plant&identity=species
/objects?kind=plant&identity=species&page=2
/objects?kind=bee_colony&identity=unavailable
/objects?q=visual-fixture-no-match
/bg/objects?kind=bee_colony&identity=species&q=Apis
/bg/objects?__visualObjects=loading
/ru/objects?__visualObjects=error
```

The journal-directory scenarios exercise the canonical SQL-backed search and
filter path. `__visualJournals=corpus` is accepted only after the full fixture
environment gate succeeds and preserves unrelated local records outside the
deterministic corpus:

```text
/journals?__visualJournals=corpus
/journals?page=2&__visualJournals=corpus
/journals?topic=watering-and-moisture&__visualJournals=corpus
/journals?topic=stress-and-recovery&__visualJournals=corpus
/journals?topic=season-preparation&__visualJournals=corpus
/ru/journals?kind=bee_colony&season=summer&region=BG-23&__visualJournals=corpus
/journals?q=visual-fixture-no-match&__visualJournals=corpus
/bg/journals?__visualJournals=loading
/ru/journals?__visualJournals=error
```

The knowledge scenarios use the same public evidence repository and restrict
all matches to fixture entry IDs. Synthetic authored copy is explicitly marked
as non-expert visual data, remains `noindex`, and is unavailable when the full
fixture environment gate is absent:

```text
/knowledge?__visualKnowledge=corpus
/bg/knowledge?type=answer&kind=plant&__visualKnowledge=corpus
/ru/knowledge?q=visual-fixture-no-match&__visualKnowledge=corpus
/bg/knowledge?__visualKnowledge=loading
/ru/knowledge?__visualKnowledge=error
/guides/visual-seasonal-observation?__visualKnowledge=corpus
/bg/guides/visual-honest-empty-evidence?__visualKnowledge=corpus
/ru/answers/visual-long-recovery-answer?__visualKnowledge=corpus
/answers/visual-unavailable-answer?__visualKnowledge=unavailable
/topics/quiet-evidence?__visualKnowledge=corpus
/bg/topics/single-observation?__visualKnowledge=corpus
/ru/topics/care-checks?__visualKnowledge=corpus
```

The missing-journal/gone-journal and unpublished-object/gone-object scenarios
return real HTTP `404`/`410` responses with localized `noindex` tombstones.
The public object proxy classifies lifecycle from public anchors only and does
not select or disclose private content. The unavailable-knowledge scenario
still exercises the shared App Router not-found UI; because the root shell has
a streaming `loading.tsx` boundary, Next.js returns HTTP `200` plus injected
`noindex` metadata for that streamed response. The fixture index labels only
that case `Not-found UI · 200` instead of claiming a hard 404.

The fixture index also links the complete journal-entry V2 evidence corpus,
including localized readback and multi-object space context. Representative
routes are:

```text
/journal/visual-fixture-living-object-001
/journal/visual-fixture-living-object-006
/journal/visual-fixture-space-multi-object-round
/bg/journal/visual-fixture-private-entry
/ru/journal/visual-fixtures-missing-journal-v2
```

The intent section starts each authentication handoff through a gated route
that exposes only its stable opaque scenario ID:

```text
/__visual-fixtures/intent/ove174-i001
```

That server route looks up the allowlisted action and target inside the
manifest, issues the same encrypted fifteen-minute token as the product flow,
and redirects to `/auth/intent`. Expired and modified-token scenarios are
generated server-side. The index also links the expected resumed route with
only the bounded `authIntent` focus enum; it never renders token bytes, target
fields, draft content, actor credentials, invitation material, private entry
content, or location data. These scenarios add no database rows and do not
change the exact fixture reset namespace.

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
