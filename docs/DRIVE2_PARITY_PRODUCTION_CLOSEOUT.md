# Drive2-Parity Production Closeout

Status: binding OVE-186 release gate
Last updated: 2026-07-14

OVE-186 closes Slice 18 only when the deterministic visual proof and the real
canonical-production proof both pass for the same tested `main` commit. Neither
evidence class can substitute for the other.

## Evidence classes

### Local deterministic fixtures

The OVE-187 v8 manifest owns synthetic density and edge-state evidence. It is
allowed only on loopback or an explicitly isolated preview. It proves:

- the full guest and authenticated route/state matrix;
- plant, animal, and bee-colony creation and journal continuity;
- empty, typical, dense, long-text, no-media, gallery, pagination, loading,
  recoverable-error, offline, privacy, moderation, `404`, and `410` states;
- 320px and 1440px parity for every core archetype plus the wider OVE-185
  responsive matrix;
- seed idempotency, namespace-bounded reset, unrelated database/media sentinel
  survival, canonical repository behavior, and media reachability.

The committed contract is checked with:

```bash
cd apps/web
pnpm drive2:closeout:check
pnpm drive2:closeout:report -- \
  --environment-class local-fixture \
  --output /tmp/ove-186-route-state-coverage.json \
  --summary
```

The JSON report contains the exact fixture version/hash, current commit SHA,
stable scenario IDs/paths, route states, viewports, expected statuses, object
kinds, mutation intents, the 13-archetype desktop/mobile screenshot contract,
and zero-gap arrays. It must report zero missing values.

From a clean local stack, run the data and browser gates:

```bash
./infra/container-up
cd apps/web
pnpm local:bootstrap
pnpm visual:fixtures:verify > /tmp/ove-186-fixture-verification.json
pnpm visual:fixtures:journal-create -- reset all > /tmp/ove-186-creation-reset.json
pnpm visual:fixtures:journal-create -- run all > /tmp/ove-186-creation-run.json
pnpm visual:fixtures:journal-create -- verify all > /tmp/ove-186-creation-verification.json
pnpm visual:fixtures:journal-create -- reset all > /tmp/ove-186-creation-cleanup.json
pnpm visual:fixtures:verify > /tmp/ove-186-fixture-verification.json
pnpm build
```

The second creation reset is mandatory: publish scenarios deliberately mutate
manifest-backed objects, so the final fixture verification must prove that the
browser matrix starts from the unchanged OVE-187 baseline.

This gate has already caught integration defects that narrower surface tests did
not expose: concurrent deterministic follow-up writes could race on the journal
primary key, encoded root profile handles could miss the localized rewrite, and
the corrected profile route exposed hydration plus unnamed-thumbnail
accessibility defects. Journal mutations now serialize by owner and client
mutation before inserting, encoded profile routes normalize to one canonical
contract, and CI executes the creation/reset sequence before the browser matrix.

Start the built app with the fail-closed local fixture environment, then run:

```bash
ACCESSIBILITY_BASE_URL=http://127.0.0.1:3000 \
ACCESSIBILITY_EVIDENCE_DIR=/tmp/ove-186-screenshots \
pnpm test:a11y > /tmp/ove-186-browser-matrix.json
```

The final Linear evidence uses only redacted outputs and screenshots. It never
contains fixture credentials, raw tokens, database values, private text,
precise location, quarantine keys, or unrelated local records.

### Canonical production

Production smoke uses real public-safe behavior and must never seed fixtures.
After the final commit is pushed, its GitHub CI run passes, and Vercel reports
the exact deployment `READY`, resolve the deployed commit SHA from Vercel and
run:

```bash
cd apps/web
pnpm smoke:drive2-production -- \
  --base-url https://over.garden \
  --expected-commit "$(git rev-parse HEAD)" \
  --deployed-commit "$DEPLOYED_COMMIT_SHA" \
  --profile-path '/bg/@public_profile_handle' \
  > /tmp/ove-186-production-smoke.json
```

The profile argument must name an already public profile and is used only for a
read check. The output does not record the handle, discovered journal slug,
object ID, content, or auth-intent token.

The root report remains the OVE-186 canonical-production evidence contract.
Its nested `productionSkeletonBoundary` section separately carries the OVE-191
proof: signed-out `GET /skeleton`, `GET /api/skeleton/journal`, and
`POST /api/skeleton/journal` must each return exact `404`. The smoke does not
read or record those response bodies, does not send credentials or cookies,
and does not create or authenticate an account. The existing canonical
`POST /api/garden/entries` probe remains the signed-out JSON `401` auth-intent
proof for the real product journal path.

The smoke fails unless:

- feed, objects, journals, knowledge, communities, privacy, and garden routes
  remain readable without an auth redirect;
- a public object passport, journal entry, and gardener profile render their
  canonical V2 contracts;
- guest comment, follow, bookmark, and create attempts enter the shared auth
  intent boundary without mutating data;
- the production walking-skeleton page plus both read and write methods of its
  journal API return exact `404`, with only fixed status fields and the
  response-body redaction boolean recorded;
- fixture routes return `404`, and fixture/private markers are absent from
  public HTML and the sitemap;
- HTML remains private/no-store and Bulgarian route/document locale foundations
  remain intact;
- the deployed SHA exactly equals the tested current `main` SHA.

Run the canonical authenticated create/publish/readback/search/archive smoke
from `docs/PRODUCTION_PILOT_SMOKE.md` against that same deployment. Its redacted
result supplies real auth, processed-media, first/next journal, public readback,
search add/remove, `410`, and sitemap-removal proof.

## Screenshot gate

Attach the following to OVE-186 from the unchanged manifest and matched
viewports:

- Drive2 reference and OverGarden before-state evidence already attached to the
  superseded/completed Slice 18 cards;
- final desktop and 320px implementations for shell/feed, catalog, journal
  directory, knowledge, passport, journal entry, profile, workspace, creation,
  auth intent, social, and community archetypes;
- side-by-side comparisons for the core guest-to-journal sequence;
- the machine-readable route/state report and concise fixture/browser command
  summaries.

Screenshots from isolated mocks, manually edited rows, private founder content,
or Production fixtures are invalid.

## Closure gate

Before moving OVE-186 to `Done`, all of the following must be true:

1. Focused tests, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and
   the Python matching suite pass.
2. Fixture verify, creation verify, the 171-scenario browser matrix, and the
   zero-gap report pass on the tested commit.
3. GitHub CI and Vercel `READY` refer to that exact commit; canonical production
   smoke and the authenticated launch smoke pass after deployment.
4. `pnpm mainline:closeout:check` passes on clean `main` aligned with
   `origin/main`.
5. `pnpm smoke:protective-dns` exits `0`, and a fresh normal A1 browser reaches
   canonical HTTPS. OVE-188 remains a hard blocker while Cisco Umbrella or A1
   returns a sinkhole.
6. Linear contains only redacted evidence. OVE-166 through OVE-170 may proceed
   independently while OVE-188 remains open, and OVE-171 is blocked only by
   those five localization slices. If any localization commit lands before
   OVE-186 closes, rerun every exact-SHA, deployment, production-smoke, and
   protective-DNS gate against the new final `main` commit.
