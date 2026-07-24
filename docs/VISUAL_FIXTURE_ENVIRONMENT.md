# Deterministic Visual Fixture Environment

Status: implemented by OVE-187, extended through OVE-184, consumed by OVE-185
Manifest version: `ove187-v8`
Manifest SHA-256: `68f1e37ca4ab6566203ca5c8f38ea08a1a59453fbbf17918aafe145bd27bce91`

## Purpose

This environment gives product and design work a stable, realistic dataset on
the real OverGarden repositories and routes. It is for local development and an
explicitly designated Vercel Preview only. It is not a mock domain model and it
must never be enabled in Production.

The manifest owns exactly:

- 8 synthetic users and 8 matching profile rows, including public, private,
  removed, empty, and maximum-copy states;
- 9 deterministic profile follows, 1 active block, and 1 submitted report;
- 24 comments/replies across active, deleted, reported, removed, nested,
  long-copy, blocked-author, exact-page, and page-plus-one states;
- 16 private bookmarks, 8 direct object/topic follows, 2 comment reports,
  2 opaque notification receipts, 2 explicit notification preference rows,
  and 14 wishlist items;
- 10 spaces, including five owned by the dense mixed gardener, one empty-owner
  recovery case, and one sparse-owner case;
- 30 living objects: 18 plants, 8 animals, and 4 bee colonies;
- 19 synthetic catalog identities and 29 searchable primary/alias names with
  explicit `visual_fixture` provenance;
- 81 journal entries across public, private, archived, public-gone, direct
  object, and space-level states, plus 2 same-owner/same-space object mentions;
- 7 curated journal topics and 40 accepted, public-eligible memberships;
- 16 generated EXIF-free PNG derivatives in 1:1, 4:3, 3:4, and 16:9;
- 90 real-route scenarios covering public-feed, living-object-catalog,
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
  and owner access; plant, animal, and multi-object space context;
  short, normal, and long copy; no media, square, portrait, landscape, and
  mixed galleries with alt/caption metadata; safe and hidden regions; first
  and last chronology boundaries; and private `404`, missing `404`, and gone
  `410` lifecycle states;
- 10 machine-checkable gardener-profile V2 cases through the production public,
  owner-preview, and relationship loaders. They cover empty, typical, dense,
  mixed-object, plant, animal, no-avatar, raster-avatar,
  maximum-handle/display-name/bio, hidden/coarse-region, visible/hidden
  relationship counters, guest, authenticated non-owner, owner, private,
  removed, and blocked outcomes with exact object/journal IDs and counts;
- 9 garden-workspace states for guest, empty, sparse, typical, dense, offline,
  loading, partial-error, and full-error behavior. Eight owner states are verified through
  owner-scoped production queries with exact space/object/kind/recent-entry
  counts and ordering; the offline state adds deterministic local drafts,
  queued/failed work, and media-processing recovery without storing credentials;
- 20 journal-creation scenarios on the real first-object and next-update forms.
  Eleven first-entry and nine follow-up cases cover plant, animal, and bee
  colony creation; minimum, optional, provisional, Unknown, maximum-copy,
  media, draft, explicit-publish, backdated, privacy, offline, recoverable
  error, cancel, and idempotent duplicate-retry states at desktop and 320px;
- 21 intent-authentication scenarios covering Comment, Bookmark, Follow,
  Report profile, Block profile, Claim, Add object, Add journal entry, Save,
  and Publish across guest,
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
- 15 social return-loop scenarios covering guest-open zero/one/exact-page/
  page-plus-one/nested/moderated/blocked/closed comments, a 12-plus-one
  chronological followed feed, dense/individual/grouped/empty notifications,
  block-filtered dense/empty bookmarks, and a 12-plus-one wishlist. They bind
  ordinary, reporter, reported, blocked, moderator-safe, dense, and empty
  actors to exact routes, IDs, counts, pagination states, and reversible or
  final transitions.
- 4 thematic community archetypes, 9 active rules, 14 memberships, 4 moderator
  assignments, 24 canonical journal references, 1 submitted report, and 1
  append-only moderation audit event. Eighteen machine-checkable community
  scenarios cover empty, typical, page-plus-one dense, plant/animal/mixed,
  long-copy, cover/no-cover, guest, non-member, member, moderator, blocked,
  banned, pending-report, removed-content, archived read-only evidence with an
  allowed member leave action, closed-discussion, closed-participation,
  no-results, loading, error, and hard `404` behavior.

## OVE-185 Responsive And Accessibility Matrix

OVE-185 consumes this unchanged v8 manifest as a release gate; it does not add
fixture records, substitute screenshot-only content, or apply scenario-specific
styles. `CORE_JOURNEY_SCENARIOS` maps 171 stable IDs across thirteen core
archetypes to identical records at every viewport. Every scenario runs at
320px and 1440px, while high-risk dense, long-copy, loading, error, pagination,
composer, social, and moderation states also run at 360px, 390px, 640px, 768px,
1024px, and 1280px. The 640px check represents the CSS viewport produced by a
1280px page at 200% reflow; a separate browser interaction applies 200% root
text scaling.

The 642 route/viewport checks fail on horizontal document overflow, visible
controls outside the viewport, missing or duplicated page semantics, unexpected
HTTP behavior, uncaught page errors, and critical/serious Axe violations on
representative core screens. Additional interactions prove skip navigation,
mobile Sheet focus trap and focus return, reduced motion, large-text creation,
320px mobile-shell and analytics-consent text scaling, auth-intent
reachability, and mobile report/block controls.

Run the gate against a seeded local environment and built or development server:

```bash
cd apps/web
pnpm exec playwright install chromium firefox webkit
TYPOGRAPHY_BASE_URL=http://127.0.0.1:3000 pnpm typography:browser
ACCESSIBILITY_BASE_URL=http://127.0.0.1:3000 pnpm test:a11y
```

OVE-208's focused typography gate uses the same loopback fixture and built
origin to verify Google Sans computed style, font loading, same-origin requests,
glyph coverage, and real italics across `uk`, `bg`, `ru`, raw lifecycle owners,
and the global error fallback in Chromium, Firefox, and WebKit. It extends, and
does not replace, the full 171-scenario/642-route-viewport Chromium matrix.

The browser install is a one-time local prerequisite; CI installs the same
pinned three runtimes for focused typography evidence while the complete
responsive/accessibility matrix remains Chromium-owned. Set
`ACCESSIBILITY_EVIDENCE_DIR` to write the four deterministic review images.
The runner refuses canonical OverGarden Production origins. Any non-loopback
Preview requires `ACCESSIBILITY_ALLOW_PREVIEW=true` in addition to the existing
isolated Preview fixture controls. Evidence routes are tested to exclude tokens,
precise coordinates, quarantine keys, and email-like identities.

Font evidence is limited to bounded same-origin paths, bytes, cache behavior,
and computed results. It must not include or vary on locale cookies, identity,
private content, referrers, or precise location.

All IDs, timestamps, public slugs, mutation IDs, media keys, content, and the
manifest hash are deterministic. Test copy is natural Ukrainian, Bulgarian,
and Russian, with short, normal, seasonal, multiline, and long records rather
than one repeated filler template. Every raster is bound to a semantically
matching public plant or animal entry. The feed includes exact
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

The four content-rich public identities are `@demo_olena` (established mixed
gardener),
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
environment, the `__visualFeed`, `__visualObjects`, `__visualJournals`,
`__visualKnowledge`, `visualWorkspace`, `visualSocial`, and `visualCommunity`
query parameters may select rendering states or the isolated fixture corpus for
screenshot evidence. `visualSocial` and `visualCommunity` may also bind a
manifest-owned synthetic actor to a mutation only inside the already enabled
local/Preview fixture environment;
guest scenarios, mismatched surfaces/IDs, conflicting fields, canonical
origins, and Production all fail closed. The parameters are ignored everywhere
else.
Proxy evaluates the pure environment contract and returns a hard HTTP `404`
before App Router whenever the contract fails; the fixture index repeats the
guard before dynamic database/storage imports as defense in depth. The enabled
index is `noindex` and is excluded from the product shell.

Fixture rows are identified by exact manifest IDs. Community mutation cleanup
is additionally bounded to the intersection of manifest-owned community and
actor IDs, so random IDs created by real join, contribute, report, block, and
moderation actions are repaired without touching unrelated rows. Reset removes
media, topic memberships, topics, entries, claimable lineage edges and pending
identities, objects, catalog names, catalog identities, spaces, profiles, and
actors in reverse foreign-key order and deletes only the manifest's storage
keys under `visual-fixtures/ove187-v8/` plus the exact retired v5, v6, and v7 filenames during
migration cleanup. It does not use wildcard or prefix database
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
extended by all 10 profile contracts against public, owner-preview, and
relationship production loaders, plus all 8 owner workspace contracts against
the scoped inventory, space, object, and recent-continuity queries. All 15
social return-loop contracts run through the canonical engagement, followed
feed, notification, bookmark, and wishlist repositories; they fail on hidden
item leakage, pagination drift, unsafe media, copied private payload text, or a
non-grouping grouped state. All 18 community contracts run through the
production public directory/detail, membership, block, moderation, and
readiness queries, including the database-backed archived read-only lifecycle.
Proof is explicitly scoped to manifest IDs and bounded manifest
actor/community pairs because reset deliberately preserves unrelated local
rows. The three fixture CLI commands
run with the React Server condition because these proofs deliberately reuse
production `server-only` queries. JSON output is limited to the version, hash,
environment class, aggregate counts, and boolean/count proof fields.

Run all twenty OVE-182 creation contracts through the canonical journal
repositories, then verify the persisted readback without creating anything
again:

```bash
pnpm visual:fixtures:journal-create -- run all
pnpm visual:fixtures:journal-create -- verify all
```

Use a manifest scenario ID instead of `all` for one case, or remove only the
exact scenario-owned rows and derivative key:

```bash
pnpm visual:fixtures:journal-create -- reset ove182-c005
```

`run` resets each selected scenario before applying it. Server-write cases use
the production first-entry/follow-up repositories, deterministic internal IDs,
the real publication repository where specified, and two concurrent canonical
calls for duplicate-retry cases. Draft, offline, recoverable-error, and cancel
cases intentionally leave server tables unchanged; submitting their real form
creates the owner-scoped Dexie draft or mutation state on that browser.

The expected final counts are:

```json
{
  "actors": 8,
  "profiles": 8,
  "profileFollows": 9,
  "profileBlocks": 1,
  "profileReports": 1,
  "engagementComments": 24,
  "engagementBookmarks": 16,
  "engagementFollows": 8,
  "engagementCommentReports": 2,
  "notificationReceipts": 2,
  "notificationPreferences": 2,
  "wishlistItems": 14,
  "spaces": 10,
  "catalogItems": 19,
  "catalogNames": 29,
  "objects": 30,
  "lineagePendingIdentities": 1,
  "lineageEdges": 1,
  "entries": 81,
  "objectMentions": 2,
  "topics": 7,
  "topicSignals": 40,
  "media": 16,
  "communities": 4,
  "communityRules": 9,
  "communityMemberships": 14,
  "communityModerators": 4,
  "communityContributions": 24,
  "communityReports": 1,
  "communityAuditEvents": 1
}
```

The social evidence routes bind exact guest or synthetic-actor states without
creating shared credentials. Representative routes are:

```text
/journal/{fixture-slug}?visualSocial=comments-page-plus-one
/journal/{fixture-slug}?visualSocial=comments-blocked
/feed?visualSocial=feed-dense
/notifications?visualSocial=notifications-grouped&view=grouped
/bookmarks?visualSocial=bookmarks-dense
/wishlist?visualSocial=wishlist-dense
```

Use `/__visual-fixtures` for the exact manifest-owned journal slugs and all 15
links. The social verifier executes the same repositories as these pages, not
mock projections.

The community evidence routes bind exact guest/member/moderator actors only
inside the fail-closed fixture environment and continue to reference canonical
public journals rather than copied posts. Representative routes are:

```text
/communities/visual-new-community?visualCommunity=ove184-community-empty
/communities/visual-observation-and-care?visualCommunity=ove184-community-typical
/communities/visual-care-across-every-living-object?visualCommunity=ove184-community-dense
/communities/visual-observation-and-care?visualCommunity=ove184-community-moderator
/communities/visual-observation-and-care?visualCommunity=ove184-community-pending-report
/communities/visual-community-unavailable?visualCommunity=ove184-community-unavailable
```

The unavailable scenario returns an actual HTTP `404` from the public lifecycle
boundary before App Router streaming. All community detail responses remain
`noindex, nofollow`; the 17-case verifier checks exact visible/hidden canonical
contribution IDs, actor membership, block suppression, pagination, and
moderation-state outcomes.

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
/objects?kind=animal&identity=unavailable
/objects?q=visual-fixture-no-match
/bg/objects?kind=animal&identity=species&q=Apis
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
/ru/journals?kind=animal&season=summer&region=BG-23&__visualJournals=corpus
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

The garden-workspace scenarios execute the production owner workspace against
deterministic empty, sparse, typical, and dense owners. State overrides are accepted
only after the complete environment gate succeeds; they do not create a
production fallback or expose synthetic credentials:

```text
/garden?visualWorkspace=guest
/garden?visualWorkspace=empty
/garden?visualWorkspace=sparse
/garden?visualWorkspace=typical
/garden?visualWorkspace=dense
/garden?visualWorkspace=offline
/garden?visualWorkspace=loading
/garden?visualWorkspace=partial-error
/garden?visualWorkspace=error
```

The dense state proves five spaces and twelve mixed plant/animal/bee objects,
crossing both the four-space and ten-object paginated disclosure thresholds,
plus recent continuity, a local draft threshold, and one processing derivative.
The offline state reuses that owner while exposing two browser-local drafts,
one queued mutation, one failed mutation, and one failed media item with
explicit local/server distinction.

The journal-creation scenarios resolve only after the complete fixture
environment gate succeeds. They render the same first-object and follow-up
forms as normal owner routes with deterministic safe field values. Submitting
a server-write case calls the local/Preview-only evidence endpoint, executes
the canonical repository path, and returns to the real owner readback. Draft,
offline, error, and cancel submissions use the normal owner-scoped IndexedDB
boundaries and do not create server rows:

```text
/garden?visualCreate=ove182-c001#first-entry-composer
/garden?visualCreate=ove182-c011#first-entry-composer
/garden/objects/18700003-0000-4000-8000-000000000001?visualCreate=ove182-c012#follow-up-composer
/garden/objects/18700003-0000-4000-8000-000000000001?visualCreate=ove182-c020#follow-up-composer
```

The fixture index lists all twenty cases with exact payload class,
preconditions, expected IDs, post-save route, and Reset/Run/Verify controls.
Normal `/garden` and owner-object routes remain fully writable; scenario
actions can touch only their manifest-owned IDs and deterministic derivative
keys.

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
trusted operator environment. The journal-creation endpoint exists only after
the same full fixture guard succeeds and accepts requests only on the exact
configured Preview host; it hard-404s on Production, canonical OverGarden
origins, arbitrary hosts, or incomplete fixture configuration.

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
