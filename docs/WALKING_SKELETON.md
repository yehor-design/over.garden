# Walking Skeleton

Status: implemented and locally verified on 2026-06-26, with the current
connectivity/media contract reconciled by OVE-323 and OVE-349. The original
Docker, offline-capture, source-original quarantine, and server-conversion
proofs are historical provenance only. Current local policy is Apple
Container-first, Postgres 18, loopback diagnostics, atomic online-only journal
publication, and browser-final WebP staging under ADR-0017/ADR-0019.

This is not product UI. It is the first end-to-end proof that the selected stack works together before agents start building product slices.

## What It Proves

1. **Stack baseline is committed separately.** `86d902b8 Realign stack to Kysely / Better Auth & R2` is the stack realignment baseline.
2. **Local infra works.** The original walking-skeleton proof used Docker Compose to start Postgres, Meilisearch, and MinIO. Current runtime policy is Apple Container-first for supported local Macs: `infra/container-up` starts the same service trio on the same local ports, with Postgres 18 matching the production major version and Docker Compose retained as fallback for unsupported hosts or verified feature gaps. OVE-73 proves the normal web bootstrap and test path does not require Docker Desktop on a supported Mac. `pnpm local:bootstrap` applies app SQL, creates Better Auth tables through Better Auth's migration helper, creates R2/MinIO buckets, and applies local public-read policy to the derivative bucket.
3. **Better Auth round-trip works.** The historical proof established the cookie-backed round trip. Current local diagnostics authenticate through `/garden`; they do not pre-fill, create, or advertise a shared identity. OVE-203 removes the user-entered signup name and proves supported credential/Google user creation converges on the same automatic pseudonymous profile/current-claim invariant. OVE-296 removes the former Meta social sign-in surface without changing that provider-independent provisioning boundary.
4. **Vertical journal slice works.** In an explicitly enabled loopback-only environment, `/skeleton` provides scoped SSR readback and `/api/skeleton/journal` goes through auth -> authorization -> validation -> scoped repository -> Kysely -> Postgres -> queue. Production and preview return hard `404` before those layers.
5. **Atomic final-media pipeline works.** The browser creates the sole final
   WebP, uploads it directly to short-lived edge staging, and atomic journal
   publication commits final identity/order/cover plus a recoverable finalize
   job. No image bytes enter a Vercel Function.
6. **Historical local-queue proof is recorded, not shipped.** The 2026-06-26
   skeleton proved Dexie/IndexedDB queued-mutation behavior. ADR-0017
   superseded that decision, and OVE-323 removed its complete active runtime,
   package, PWA, fixture, and build-output surface.
7. **Search/worker seam works.** Public journal entries enqueue `matching` jobs; the Python worker consumes the Postgres queue with `FOR UPDATE SKIP LOCKED`; Meilisearch Cyrillic typo proof passes.

## Commands

These commands use the current Apple Container-first local runtime and were fresh-checkout verified by OVE-73. Docker Compose remains documented in `infra/README.md` only as fallback.

```bash
infra/container-up
infra/container-status

cd apps/web
pnpm install
cp .env.example .env.local

pnpm local:bootstrap
pnpm db:types
pnpm db:types:check
pnpm lint
pnpm typecheck
pnpm test
BETTER_AUTH_SECRET="$(openssl rand -base64 32)" pnpm build

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

Enablement is deliberately local-only:

```dotenv
WALKING_SKELETON_ENABLED="true"
```

The database, public/auth origin, and object-storage values must all resolve
to loopback origins on a development or test Node runtime. Never set this gate
in Vercel or another deployed runtime.

- The retired draft/upload/process endpoints are absent and cannot write.
- Current codec, staging, atomic create/edit, final public readback, archive,
  and erasure proofs are owned by the commands below.

## Guardrail Tests

- `src/lib/media/browser-journal-image-encoder.test.ts` proves the browser
  produces the bounded final WebP without a server fallback.
- `cloudflare/media-staging/` tests prove direct upload, claim, finalize,
  abandonment, alarm recovery, and exact capability scoping.
- `scripts/verify-retired-journal-media-runtime.test.ts` proves the former
  server-draft/process/schema/package owners stay absent.
- **Both of these are gone (OVE-365, ADR-0022):** `src/lib/retirement/` and
  `tests/offline-runtime-absence.spec.ts` were deleted with the last offline
  residue, because nothing writes browser storage any more and there is no
  boundary left to prove. Do not try to run them.
- `src/server/search/documents.test.ts` proves entries that are not public are
  not turned into Meilisearch documents. (There are no private entries to
  exclude — every published entry is public; the test guards lifecycle states
  such as a deleted entry inside its seven-day tombstone.)

## Next SDD Rule

From here, product implementation must be vertical. `AGENTS.md` holds the task template, and `docs/SDD_VERTICAL_SLICE_ROADMAP.md` is a historical receipt; active work is read from Linear.

A valid product execution task names the end-to-end user behavior and touches the necessary layers together: SQL/types -> scoped repository -> route/action/API -> UI -> background job/search/media/local-retirement/event boundary when relevant -> tests -> docs. Remediation, operator, decision, canon-correction, and coordination-container items use the standard's explicit bounded contracts. Do not build all database schema, all UI, all media, all analytics, all public pages, or all worker logic as isolated horizontal phases.

Before creating or accepting a Linear issue, run the common `SDD Slice Test` and the applicable issue-kind test in `docs/SDD_VERTICAL_SLICE_ROADMAP.md`. Rewrite isolated product-layer work; a localized remediation may retain one enforceable boundary only when its kind-specific contract proves the complete affected journey.
