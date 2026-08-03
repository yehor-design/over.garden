# Pl@ntNet species identification

OVE-269 adds one private, server-only use of the Pl@ntNet single-species API.
It is a suggestion flow, never catalog authority: a gardener must explicitly
confirm one existing OverGarden species after an exact one-to-one canonical-name
match. Ambiguous, unmapped, failed, disabled and non-plant outcomes retain
manual catalog search and Unknown.

## Privacy boundary

- The browser calls only the OverGarden route. `PLANTNET_API_KEY` is server-only
  and must never be named `NEXT_PUBLIC_*`, rendered, logged or placed in a
  client bundle.
- The route accepts only current-owner media rows that are `processed`,
  `public_ready`, have a derivative key, and have authoritative original
  absence. It server-fetches the derivative, decodes and re-encodes it as a
  fresh JPEG before the provider call.
- Outbound multipart data contains regenerated JPEG bytes, static part name
  `plant.jpg`, and one permitted organ label per image. It never contains the
  original, quarantine key, public URL, EXIF, GPS, filename, journal/object/user
  identifiers, private text or raw provider response.
- Request/candidate/decision rows store only owner scope, hashes/asset UUIDs,
  bounded state/error/quota/model metadata and normalized scientific evidence.
  They are neither public nor search-projected.

## Provider contract pinned on 2026-08-03

- Route: `POST https://my-api.plantnet.org/v2/identify/all` with server-side
  `api-key`, `no-reject=false`, `include-related-images=false`, `nb-results=5`,
  and `detailed=false`.
- One to five JPEG or PNG images of the same individual; request aggregate is
  limited to 50 MB. OverGarden transmits regenerated JPEG only.
- Allowed organs: `auto`, `leaf`, `flower`, `fruit`, `bark`.
- The free plan documents 500 identifications per day and quota reset at 00:00
  UTC. Treat the live account quota, terms and billing class as mandatory
  read-back before any production key provisioning.
- `PLANTNET_SPECIES_IDENTIFICATION_ENABLED=false` is the default. It must stay
  false until the exact implementation SHA is deployed `READY` and the current
  approval plan permits one controlled, rights-clean canary.

Official sources: [identify endpoint](https://my.plantnet.org/doc/api/identify),
[quota](https://my.plantnet.org/doc/api/quota),
[pricing](https://my.plantnet.org/pricing), and
[terms](https://my.plantnet.org/terms_of_use).

## Verification and rollback

Run the local adapter proof with:

```bash
cd apps/web
pnpm exec vitest run src/server/plantnet-species-adapter.test.ts
```

Run the owner, replay, global-four-slot and account-erasure
protocol against the local Postgres schema with:

```bash
cd apps/web
pnpm test:plantnet:integration
```

This command creates only synthetic `*.invalid` local Better Auth users and
removes them through the ordinary account-delete cascade in its `afterEach`.
It never calls Pl@ntNet or R2.

Rollback is one server-side change: set
`PLANTNET_SPECIES_IDENTIFICATION_ENABLED=false`, redeploy, and verify no route
can make a provider call. This preserves media, local catalog selection,
Unknown, requests, decisions and existing object identities.
