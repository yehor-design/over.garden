# matching-tier

Isolated, Cyrillic-aware matching/dedup worker for OverGarden. TypeScript owns
the product app; Python owns only the libraries that are materially better in
Python: RapidFuzz, Splink, PyICU, CyrTranslit, and Meilisearch tooling.

## Layout

- `app/main.py` — FastAPI liveness, immutable release-capability, and
  dependency-readiness surface; not a typeahead API.
- `app/runtime.py` — fail-closed release identity, schema/queue preflight,
  bounded readiness classes, and worker-heartbeat contract.
- `app/job_handlers.py` — the single six-handler capability manifest shared by
  worker dispatch, readiness, CI sealing, deployment, and smoke proof.
- `app/canary.py` — explicitly approved, idempotent production proof for all
  six handlers; it mutates only derived/advisory state and restores journal
  search state after the index/unindex proof.
- `app/worker.py` — Postgres-backed worker. It claims rows from `job_queue`
  and runs matching/dedup/reindex work off the request path.
- `app/search.py` — Meilisearch helpers, catalog typeahead reindexing, public
  journal index/unindex jobs, and the Cyrillic typo-tolerance proofs.
- `app/catalog_matching.py` — deterministic PyICU/CyrTranslit/RapidFuzz
  suggestions for provisional catalog names; it never applies a merge.
- `app/catalog_aliases.py` — deterministic Ukrainian, Bulgarian, and Russian
  alias variants for global catalog identities; every candidate remains review-gated.
- `app/catalog_fuzzy_duplicates.py` — bounded RapidFuzz near-duplicate QA for
  source-backed identities; it persists advisory pairs and never mutates catalog state.

## Develop

```bash
uv python install 3.12 && uv python pin 3.12
uv sync --frozen
uv run uvicorn app.main:app --reload   # http://localhost:8000/health
uv run python -m app.worker            # needs DIRECT_URL + job_queue table
uv run python -m app.search            # needs MEILISEARCH_HOST/API key
```

PyICU compiles against system ICU. On macOS install `pkg-config` and `icu4c`; in
the Docker image this is handled by `libicu-dev`.

## Container runtime

For supported local Macs, build and smoke the matching image with Apple
Container first under `docs/CONTAINER_RUNTIME_POLICY.md`. OVE-74 proves this
path without Docker Desktop:

```bash
cd services/matching
container build -t overgarden/matching:local .
container run --detach \
  --name overgarden-matching-local \
  --publish 127.0.0.1:8000:8000 \
  overgarden/matching:local
curl -fsS http://127.0.0.1:8000/health
container stop overgarden-matching-local
container delete overgarden-matching-local
```

The Dockerfile remains a portable OCI image recipe. Use Docker only as a named
fallback when Apple Container is unavailable on the host or a verified Apple
Container feature gap blocks the local smoke. After OVE-77, a supported
Apple Silicon/macOS 26 local machine does not need Docker Desktop for the
matching image or worker/search proof path.

## Runtime

Run the FastAPI health service and the worker as separate processes from the
same image on the worker droplet. Meilisearch is a derived index; Postgres is the
source of truth. The worker keeps the long-lived Postgres connection in
autocommit mode and uses explicit transactions for claim/done/failed state
changes, so per-job read queries cannot trap status updates in an uncommitted
outer transaction. It also reclaims stale `processing` rows after
`WORKER_VT_SECONDS`; catalog matching, alias generation, and fuzzy QA use the longer bounded
`CATALOG_MATCH_WORKER_VT_SECONDS` lease because they scan larger deterministic
candidate sets. Job handlers must remain idempotent.

Production runtime is intentionally separate from the local Apple Container
smoke. On the current DigitalOcean Linux worker droplet, Docker Compose remains
the OVE-76-confirmed process manager for `matching-worker`, `matching-api`,
`meilisearch`, and `caddy` because OVE-39 live-proved restart policy, health,
and journal index/unindex recovery there. Do not replace the droplet runtime
with Apple Container. A non-Docker production replacement must be a separate
Linux process-manager migration with equivalent live restart/recovery proof and
redacted evidence.

### Immutable release identity and readiness

OVE-190 separates process liveness from release/capability truth:

- `GET /health` is liveness only. A `200` response means the API process can
  answer; it does not prove Postgres, queue schema, Meilisearch, worker parity,
  or an exact deployed revision.
- `GET /capabilities` returns schema `ove190.matchingRuntime.v1`, service
  `overgarden-matching`, the exact 40-character commit SHA, immutable
  `sha256:` image digest, UTC build timestamp, schema compatibility class
  `ove190.matching-schema.v1`, queue `matching`, and the exact supported-handler
  list. Invalid or missing release metadata fails closed with HTTP `503` and a
  bounded `unavailable` manifest.
- `GET /ready` returns HTTP `200` only when the API, Postgres, required queue
  and heartbeat schema, Meilisearch, and a fresh worker heartbeat all match the
  same exact SHA, digest, schema class, queue, and handler list. It returns HTTP
  `503` with `status=degraded` otherwise.

Readiness exposes only bounded safe classes. Dependency states are
`available`/`unavailable`, with `schema_mismatch` for an incompatible queue
schema and `missing`/`stale`/`release_mismatch`/`capability_mismatch` for worker
parity. Queue depth is `empty`/`low`/`medium`/`high`; due-work lag is
`none`/`fresh`/`delayed`/`stale`. These endpoints must never expose hosts,
connection strings, exception text, raw counts, job payloads or identifiers,
user data, or location.

The additive `matching_worker_heartbeats` table stores one row for queue
`matching`: release SHA, image digest, schema class, the sorted handler list,
and timestamps. It stores no hostname, process id, error, payload, user data,
or connection data. The worker refreshes it at a bounded interval. Readiness
accepts only a fresh heartbeat from the same immutable API/worker release. A
dedicated connection refreshes that heartbeat while a handler waits on bounded
I/O and renews only the active job's `id` + claim-token lease. The 10-second
refresh interval keeps a three-times margin below both the 30-second default
visibility timeout and the readiness freshness limit; a stale claim token
cannot renew work reclaimed by another worker.

The canonical handler manifest is exactly:

1. `catalog_alias_suggestions_refresh`
2. `catalog_fuzzy_duplicate_qa_refresh`
3. `catalog_match_suggestions_refresh`
4. `catalog_typeahead_reindex`
5. `journal_entry_index`
6. `journal_entry_unindex`

Before claiming queue work the loop drains the OVE-242 public-projection
outbox (`app/public_projection.py`). Those intents are not `job_queue` rows:
they are written by the TypeScript app inside the same transaction as the
canonical write, claimed with a lease, applied, verified against the real index,
and settled under a generation-fenced compare-and-set. A revocation an owner or
moderator already committed must not wait behind ordinary matching work, and a
failed one is dead-lettered rather than silently forgotten. See
`docs/PUBLIC_PROJECTION_REVOCATION.md`.

Use the CLI forms inside a candidate or active image when HTTP is not the right
boundary:

```bash
python -m app.runtime capabilities
python -m app.runtime preflight
python -m app.runtime ready
```

`preflight` checks release metadata plus Postgres, the exact queue/heartbeat
schema, Meilisearch, and the canonical production `R2_PUBLIC_BASE_URL` before
service activation. This prevents a journal projection from silently omitting
an otherwise valid public cover because the matching runtime cannot construct
its public URL. `ready` additionally requires the matching worker heartbeat.

### Production release, rollback, and handler proof

The committed production Linux runbook is
`infra/production-worker/README.md`. `.github/workflows/matching-image.yml`
accepts only an exact full SHA already contained in `main`; before publishing,
it compiles every Python module, runs frozen Ruff, and runs the full frozen
test suite. It publishes no `latest` tag. Each build receives a unique
`sha-<full-sha>-run-<run-id>-<attempt>` tag and immutable registry digest, then
seals that exact image as a checksummed Actions artifact with its safe release
and capability manifests.

The production host installs two distinct, same-SHA release artifacts so a
real immediately-prior-digest rollback does not reintroduce the old
capability-blind runtime. The supported sequence is:

```bash
sudo /opt/overgarden/matching-release install /path/to/release-a
sudo /opt/overgarden/matching-release install /path/to/release-b
sudo /opt/overgarden/matching-release migrate <release-a-key>
sudo /opt/overgarden/matching-release deploy <release-a-key>
sudo /opt/overgarden/matching-release deploy <release-b-key>
sudo /opt/overgarden/matching-release rollback
sudo /opt/overgarden/matching-release forward
sudo /opt/overgarden/matching-release status
```

Installation verifies the archive checksum, portable archive-config digest,
OCI labels, exact SHA, registry digest, schema class, unique run tag, and sealed
six-handler manifest. It then records the receiving Docker daemon's loaded image
ID and requires both active containers to use that same host-local ID.
Deployment runs the additive heartbeat migration and dependency preflight,
activates API and worker from the same image, and records release pointers only
after readiness passes. `rollback` can target only the immediately prior
digest; `forward` can target only the release saved by that rollback. A failed
activation restores the previous active release.

After activation, run the public safe capability/readiness proof from
`apps/web` with the expected release identity:

```bash
pnpm smoke:matching-runtime-capabilities -- \
  --base-url https://matching.over.garden \
  --expected-commit <40-character-main-sha> \
  --expected-digest sha256:<64-hex-digest>
```

The six-handler queue canary is a production mutation and therefore requires
the operator's explicit approval immediately before execution. Without the
exact approval environment value it refuses to run:

```bash
docker compose \
  --project-name overgarden \
  --env-file /opt/overgarden/release-state/active.env \
  --file /opt/overgarden/docker-compose.release.yml \
  exec -T \
  -e OVERGARDEN_MATCHING_CANARY_APPROVED=true \
  matching-worker python -m app.canary
```

The canary reuses eligible records, records only handler terminal classes and
privacy-safe boundaries, and changes no canonical catalog decision or user
content. It proves journal index, unindex, and restoration; catalog handlers
touch only derived/advisory outputs. Queue `failed` is retryable in this worker,
so the canary waits through `failed` -> `pending` -> `processing` until `done`
or its overall bounded timeout. Never record its row ids, payloads,
journal/catalog content, URLs, connection data, or raw errors.

Meilisearch HTTP calls use a 10-second transport timeout. Task polling uses a
120-second overall bound with a 250 ms interval and accepts only the explicit
`succeeded` task class; a returned failed/canceled task never becomes a
`job_queue.done` result.

The catalog typeahead rebuild job uses payload `{ "kind":
"catalog_typeahead_reindex" }` on the `matching` queue. The worker rebuilds the
`catalog_typeahead` index only from `seeded`/`confirmed` catalog rows with no
`created_by_user_id`, so provisional user-added names stay out of global search
until a later curation slice promotes them. The shared OVE-159 curation
enqueuer revives a completed or failed idempotent rebuild as `pending`; an
already processing rebuild keeps its claim and receives `rerun_requested`, so
completion schedules one fresh pass rather than swallowing the approved
catalog mutation.

Saving a provisional user-added catalog name also enqueues `{ "kind":
"catalog_match_suggestions_refresh", "sourceCatalogItemId": "..." }`. The
worker compares only that still-provisional row with ownerless
`seeded`/`confirmed` names of the same catalog kind, then writes pending scored
evidence or an explicit no-safe-match row to `catalog_match_suggestions`. The
candidate query is deterministically ordered and fails closed above 100,000
rows; it never persists a partial ranking. The payload has a database-enforced
exact shape and contains no user id, journal text, media data, or location.
Evidence schema `ove158.catalogMatchEvidence.v2` omits the raw gardener source
name and is checked against the relational score, reason, locale/script, target,
kind, count, and threshold columns. The curation surface still reads provisional
`catalog_items` directly, so worker downtime does not block a gardener save or
hide the candidate. Operators can enqueue a bounded per-candidate refresh from
`/garden/catalog/curation`.

OVE-159 keeps operator rejection durable across idempotent refreshes. The
worker leaves a rejected source/target suggestion and its decision audit intact
when the matching evidence is unchanged; a changed aggregate affected-object
count or an `updated_at`-only importer touch is not a reason to reopen it.
Opaque source/target semantic fingerprints bind the decision to the exact
scored alias without persisting additional private source text. Material
source/target matching input changes may reopen the same deterministic key as
`pending`, and the upsert then
clears the previous review fields so the new evidence requires a fresh human
decision. Python still never applies the catalog merge: approval remains a
locked TypeScript/Postgres curator transaction that preserves journal rows.

OVE-160 also consumes `{ "kind": "catalog_alias_suggestions_refresh",
"catalogItemId": "..." }` with an exact database-checked payload. It reads only
ownerless seeded/confirmed identities and their primary or already accepted
non-generated names, creates bounded CyrTranslit/orthographic candidates for
supported locales, and holds cross-concept normalized collisions for review.
Generated rows never enter `catalog_item_names` or typeahead. A separate locked
TypeScript curator transaction rechecks the semantic fingerprint and collision,
then either projects one approved alias and queues reindex atomically or records
a bounded rejection without search mutation. See
`docs/CATALOG_ALIAS_SUGGESTION_REVIEW.md`.

OVE-162 consumes the closed payload `{ "kind":
"catalog_fuzzy_duplicate_qa_refresh" }`. The worker reads only safe source-backed
catalog identity columns, selects candidate pairs through bounded rare-trigram
blocking, then applies RapidFuzz. Exact normalized duplicates stay in the OVE-89
exact group. Same-locale near matches are advisory merge-review candidates;
cross-locale pairs require a higher score and are held for locale/provenance
review. An atomic refresh replaces only `catalog_fuzzy_duplicate_suggestions`.
Current labels and source families are joined by the redacted v2 report, and
stale timestamp snapshots fail closed to `hold`. Splink remains available for a
future calibrated clustering expansion but is not needed for this bounded pair
graph; no black-box model or automatic merge is introduced.

An idempotent rescan does not reset an actively processing row. It marks
`rerun_requested`, preserves the current lock, and lets the claim-token-scoped
completion return the job to `pending`. This prevents a concurrent refresh from
being overwritten by an older worker completion.

If non-local environments contain historical `catalog_curation` rows, inspect
them non-destructively first:

```sql
select queue_name, status, count(*)
from job_queue
group by 1, 2
order by 1, 2;
```

Do not bulk-delete orphan queue rows without maintainer approval. The safe
cleanup plan is: record counts by status, confirm no worker claims
`catalog_curation`, confirm provisional rows are visible through
`/garden/catalog/curation`, then run an approved one-off maintenance cleanup.
That historical job kind is unrelated to the consumed
`catalog_match_suggestions_refresh` contract.

Public journal publishing uses `{ "kind": "journal_entry_index",
"journalEntryId": "...", "userId": "..." }` and archiving uses `{ "kind":
"journal_entry_unindex", "journalEntryId": "...", "userId": "..." }`. The
worker scopes both jobs to the payload owner, indexes only active public non-gone
rows into `journal_entries`, writes a public-safe document shape, and deletes any
stale document when the source row is no longer indexable. Unknown job kinds fail
with `last_error`; they must not be marked done silently.

## Restart / recovery

`tests/test_worker_recovery.py` is the durability proof for the pilot journal
search path (OVE-39). It runs with `uv run --frozen pytest` and needs no live
services. It proves that a `processing` row is reclaimed only after the
visibility timeout, that catalog matching and alias generation receive their longer bounded lease,
that the active claim lease is refreshed during bounded external I/O without a
stale token touching reclaimed work, that an in-flight catalog rescan is not swallowed, that
`journal_entry_index`/`journal_entry_unindex` reach
`done` after a simulated worker restart, that the public-safe document contract
holds, that at-least-once re-delivery is idempotent, and that a transient
Meilisearch outage fails-then-recovers. Run the worker droplet containers with a
Docker Compose restart policy so the process returns automatically after a crash
or reboot. This production instruction is not a local Docker Desktop
prerequisite.

`tests/test_catalog_matching.py` separately proves deterministic exact,
transliteration, fuzzy, no-safe-match, stale-evidence, idempotent-upsert, and
privacy-safe evidence behavior without changing canonical catalog or garden
records. Thresholds are provisional pilot guardrails documented in
`docs/CATALOG_MATCH_SUGGESTION_QUEUE.md`, not validated automation thresholds.
`tests/test_catalog_aliases.py` proves supported-locale generation,
mixed/unsupported fail-closed behavior, collision holding, existing-alias
suppression, privacy-bounded queries, and durable accepted/rejected replay.
`tests/test_catalog_fuzzy_duplicates.py` proves same-locale scoring,
cross-locale holding, exact/kind separation, deterministic ordering, closed
evidence, live psycopg UUID handling, bounded failure, and atomic advisory refresh.

## Local Apple Container smoke

With `infra/container-up` running the local Postgres and Meilisearch services,
the matching-tier regression smoke is:

```bash
cd services/matching
container build -t overgarden/matching:local .
find app tests -type f -name '*.py' -print0 | sort -z | xargs -0 uv run --frozen python -m py_compile
uv run --frozen ruff check .
uv run --frozen pytest
uv run --env-file ../../apps/web/.env.local \
  python -m scripts.smoke_catalog_match_rejection_replay
cd ../../apps/web && pnpm smoke:catalog-alias-approval
pnpm smoke:catalog-fuzzy-duplicate-qa
MEILISEARCH_HOST='http://localhost:7700' \
  MEILISEARCH_API_KEY='local_dev_meili_master_key_change_me_1234567890' \
  uv run python -m app.search
```

The Meilisearch proof indexes only tracer and catalog typeahead proof documents.
Catalog typeahead document ids are Meilisearch-safe ASCII keys derived from the
catalog item id plus a hash of the alias locale and normalized alias; the
searchable Cyrillic alias stays in `displayName`, `canonicalName`, and
`normalizedName`.

## Combined deterministic matching closeout

OVE-163 binds the OVE-158 through OVE-162 smokes into one fail-closed local
behavioral proof:

```bash
cd apps/web
pnpm smoke:catalog-matching-rollout -- \
  --environment local \
  --confirm-environment local \
  --base-url http://127.0.0.1:3000
```

The harness starts the local Next.js runtime when needed, runs real
canonical-match and alias decisions, executes gardener HTTP typeahead/save
readback against Meilisearch plus Postgres fallback, proves bounded fuzzy QA,
and runs the complete Python suite. Recovery coverage now includes the longer
bounded lease and `rerun_requested` claim-token behavior for canonical match,
alias, and fuzzy refresh jobs. The matching implementations remain idempotent;
only explicit TypeScript curator transactions can apply canonical or alias
decisions.

The same harness has a read-only non-local mode for schema, runtime, QA-report,
and safe-index readiness. It has no non-local mutation flag and cannot replace
the local behavioral proof. See
`docs/DETERMINISTIC_MATCHING_ROLLOUT_PROOF.md` for the binding procedure and
evidence contract.
