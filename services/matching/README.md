# matching-tier

Isolated, Cyrillic-aware matching/dedup worker for OverGarden. TypeScript owns
the product app; Python owns only the libraries that are materially better in
Python: RapidFuzz, Splink, PyICU, CyrTranslit, and Meilisearch tooling.

## Layout

- `app/main.py` — optional internal FastAPI health service; not a typeahead API.
- `app/worker.py` — Postgres-backed worker. It claims rows from `job_queue`
  and runs matching/dedup/reindex work off the request path.
- `app/search.py` — Meilisearch helpers, catalog typeahead reindexing, public
  journal index/unindex jobs, and the Cyrillic typo-tolerance proofs.
- `app/catalog_matching.py` — deterministic PyICU/CyrTranslit/RapidFuzz
  suggestions for provisional catalog names; it never applies a merge.

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
`WORKER_VT_SECONDS`; catalog matching uses the longer bounded
`CATALOG_MATCH_WORKER_VT_SECONDS` lease because it scores a larger deterministic
candidate set. Job handlers must remain idempotent.

Production runtime is intentionally separate from the local Apple Container
smoke. On the current DigitalOcean Linux worker droplet, Docker Compose remains
the OVE-76-confirmed process manager for `matching-worker`, `matching-api`,
`meilisearch`, and `caddy` because OVE-39 live-proved restart policy, health,
and journal index/unindex recovery there. Do not replace the droplet runtime
with Apple Container. A non-Docker production replacement must be a separate
Linux process-manager migration with equivalent live restart/recovery proof and
redacted evidence.

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
visibility timeout, that catalog matching receives its longer bounded lease,
that an in-flight catalog rescan is not swallowed, that
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

## Local Apple Container smoke

With `infra/container-up` running the local Postgres and Meilisearch services,
the matching-tier regression smoke is:

```bash
cd services/matching
container build -t overgarden/matching:local .
uv run python -m py_compile app/catalog_matching.py app/main.py app/search.py app/worker.py
uv run --frozen pytest
uv run --env-file ../../apps/web/.env.local \
  python -m scripts.smoke_catalog_match_rejection_replay
MEILISEARCH_HOST='http://localhost:7700' \
  MEILISEARCH_API_KEY='local_dev_meili_master_key_change_me_1234567890' \
  uv run python -m app.search
```

The Meilisearch proof indexes only tracer and catalog typeahead proof documents.
Catalog typeahead document ids are Meilisearch-safe ASCII keys derived from the
catalog item id plus a hash of the alias locale and normalized alias; the
searchable Cyrillic alias stays in `displayName`, `canonicalName`, and
`normalizedName`.
