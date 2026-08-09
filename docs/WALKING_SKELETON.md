# Walking Skeleton

Status: implemented and locally verified on 2026-06-26. The original walking-skeleton proof used Docker Compose; OVE-73 re-proved the supported-Mac fresh-checkout web bootstrap on 2026-06-30 against Apple Container Postgres, Meilisearch, and MinIO with Docker Desktop stopped. OVE-77 closes the local cleanup proof: supported Apple Silicon/macOS 26 development no longer requires Docker Desktop for local infra, bootstrap, type checks, tests, or matching pytest. OVE-95 aligns local and CI Postgres with the production major version, currently Postgres 18. OVE-189 adds the canonical local-media recovery and restart proof: a corrupt MinIO source is mounted read-only, copied into an explicit new target, retained for later bounded retirement, and accepted only after actual upload/process/readback plus Postgres/Meilisearch/MinIO persistence. OVE-191 converts the old user-facing scaffold into an explicit loopback-only diagnostic: production and preview refuse its page and API before auth or data access, shared identities are removed from source and build output, and local authentication uses the canonical product flow. OVE-203 makes public identity a provider-independent bootstrap invariant: every Better Auth account receives one generated pseudonymous profile/current claim, and CI proves registry consistency, rename cooldown, retired-handle reservation, policy provenance, duplicate-signup safety, and cascade erasure on a fresh database. CI repeats the fresh-checkout bootstrap contract by starting Postgres 18 plus MinIO, running `pnpm local:bootstrap`, and failing if generated Kysely types drift from the committed `src/db/generated.ts`. OVE-75 documents that CI keeps Docker only because GitHub-hosted Ubuntu does not run Apple Container service containers; that CI exception does not restore Docker Desktop as a local requirement.

This is not product UI. It is the first end-to-end proof that the selected stack works together before agents start building product slices.

## What It Proves

1. **Stack baseline is committed separately.** `86d902b8 Realign stack to Kysely / Better Auth & R2` is the stack realignment baseline.
2. **Local infra works.** The original walking-skeleton proof used Docker Compose to start Postgres, Meilisearch, and MinIO. Current runtime policy is Apple Container-first for supported local Macs: `infra/container-up` starts the same service trio on the same local ports, with Postgres 18 matching the production major version and Docker Compose retained as fallback for unsupported hosts or verified feature gaps. OVE-73 proves the normal web bootstrap and test path does not require Docker Desktop on a supported Mac. `pnpm local:bootstrap` applies app SQL, creates Better Auth tables through Better Auth's migration helper, creates R2/MinIO buckets, and applies local public-read policy to the derivative bucket.
3. **Better Auth round-trip works.** The historical proof established the cookie-backed round trip. Current local diagnostics authenticate through `/garden`; they do not pre-fill, create, or advertise a shared identity. OVE-203 removes the user-entered signup name and proves supported credential/Google user creation converges on the same automatic pseudonymous profile/current-claim invariant. OVE-296 removes the former Meta social sign-in surface without changing that provider-independent provisioning boundary.
4. **Vertical journal slice works.** In an explicitly enabled loopback-only environment, `/skeleton` provides scoped SSR readback and `/api/skeleton/journal` goes through auth -> authorization -> validation -> scoped repository -> Kysely -> Postgres -> queue. Production and preview return hard `404` before those layers.
5. **Media quarantine pipeline works.** `/api/media/uploads` creates a presigned quarantine upload URL; `/api/media/process` reads the quarantine object, re-encodes a metadata-stripped WebP derivative with `sharp`, writes it to the public bucket, deletes the original, and marks the row processed.
6. **Offline queue is test-covered.** Dexie stores queued mutations with idempotency keys under IndexedDB shim.
7. **Search/worker seam works.** Public journal entries enqueue `matching` jobs; the Python worker consumes the Postgres queue with `FOR UPDATE SKIP LOCKED`; Meilisearch Cyrillic typo proof passes.

## Commands

These commands use the current Apple Container-first local runtime and were fresh-checkout verified by OVE-73. Docker Compose remains documented in `infra/README.md` only as fallback.

```bash
infra/container-up
infra/container-status

cd apps/web
pnpm install
cp .env.example .env.local
pnpm mainline:closeout:check
pnpm local:bootstrap
pnpm db:types
pnpm db:types:check
pnpm lint
pnpm typecheck
pnpm test
BETTER_AUTH_SECRET="$(openssl rand -base64 32)" pnpm build
pnpm walking-skeleton:boundary:check
pnpm dev
```

`pnpm dev` deliberately binds Next.js to `127.0.0.1`. The diagnostic is not
supported under bare `next dev`, which defaults to an all-interface listener,
or another all-interface bind.

When `.env.local` contains any remote database or R2 value, use the loopback wrapper instead of the unwrapped bootstrap command:

```bash
../../infra/run-with-local-infra-env pnpm local:bootstrap
```

The OVE-189 media/restart procedure is documented in `docs/LOCAL_MEDIA_RUNTIME_RECOVERY.md`.

Python worker and Meili proof:

```bash
cd services/matching
uv sync --frozen
DIRECT_URL='postgresql://overgarden:overgarden@localhost:5432/overgarden' \
  QUEUE_NAME='matching' \
  uv run python -m app.worker

MEILISEARCH_HOST='http://localhost:7700' \
  MEILISEARCH_API_KEY='local_dev_meili_master_key_change_me_1234567890' \
  uv run python -m app.search
```

## Smoke Paths

- `GET /skeleton` renders scoped SSR diagnostic readback only when both the
  walking-skeleton and complete local visual-fixture environment gates pass and
  both the framework URL host and raw HTTP `Host` header are loopback. The
  canonical development listener is also bound to `127.0.0.1`.
- Local developers authenticate through `/garden`; the diagnostic contains no
  signup/sign-in client and no shared account values.
- `POST /api/skeleton/journal` creates a local diagnostic journal entry and
  enqueues a public index job only after the local gate, authentication,
  write-eligibility, and strict payload validation pass.
- `GET /api/skeleton/journal` reads scoped entries for the current local user.
- Production, Vercel Preview, disabled environments, and non-loopback hosts
  receive a null-body `404` for the page and API before auth, body parsing,
  repository, or queue access.
- Local API failures use fixed opaque classes: signed-out `401`, authenticated
  but ineligible `403`, malformed payload `400`, and unexpected failure `500`.

Enablement is deliberately two-key and local-only:

```dotenv
WALKING_SKELETON_ENABLED="true"
VISUAL_FIXTURES_ENABLED="true"
VISUAL_FIXTURES_TARGET="local"
```

The remaining database, public/auth origin, and object-storage values must all
resolve to the matching loopback visual-fixture contract. Never set this gate
in Vercel or another deployed runtime.

- `POST /api/media/uploads` returns a presigned quarantine upload URL.
- `POST /api/media/process` converts the quarantine original to a public stripped derivative and deletes the original.

## Guardrail Tests

- `src/server/media/derivatives.test.ts` proves derivatives are WebP and do not retain EXIF.
- `src/lib/offline/queue.test.ts` proves offline mutations are stored with idempotency keys.
- `src/server/search/documents.test.ts` proves private entries are not turned into Meilisearch documents.

## Next SDD Rule

From here, product implementation must be vertical. `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md` is the binding construction contract, and `docs/SDD_VERTICAL_SLICE_ROADMAP.md` is the living repository mirror rather than a full or primary queue.

A valid product execution task names the end-to-end user behavior and touches the necessary layers together: SQL/types -> scoped repository -> route/action/API -> UI -> background job/search/media/offline/event boundary when relevant -> tests -> docs. Remediation, operator, decision, canon-correction, and coordination-container items use the standard's explicit bounded contracts. Do not build all database schema, all UI, all media, all analytics, all public pages, or all worker logic as isolated horizontal phases.

Before creating or accepting a Linear issue, run the common `SDD Slice Test` and the applicable issue-kind test in `docs/SDD_VERTICAL_SLICE_ROADMAP.md`. Rewrite isolated product-layer work; a localized remediation may retain one enforceable boundary only when its kind-specific contract proves the complete affected journey.
