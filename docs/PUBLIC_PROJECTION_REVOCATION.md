# Transactional public-projection revocation (OVE-242)

Status: active engineering and operator contract
Policy version: `ove242.publicProjectionOutbox.v1`
Parity policy raised to: `ove242.publicIndexParity.v3` (supersedes
`ove227.publicIndexParity.v2`)

This document is the canonical owner of how a public journal projection is
revoked or rewritten. `docs/PUBLIC_JOURNAL_INDEX_PARITY.md` remains the owner of
how the resulting corpus is compared.

## ADR-0018 successor posture

ADR-0018 supersedes refusal-first handling of unresolved or stale derived state.
OVE-331 will admit the row with an explicit quality class and serve it rather
than silently dropping it; OVE-335 will apply the shared measured indexability
threshold. Positively resolved canonical erasure or non-public state still owns
the target projection state. The mechanics below describe the current
transitional OVE-242 implementation and remain useful provenance, but they are
not the posture new work should restate.

## The failure this closes

Every declassification event used to be "commit, then enqueue":

- Archive committed in `journal-repository.ts`, and only afterwards the action
  enqueued an unindex job on the global connection.
- A public edit committed, and the route enqueued afterwards, swallowed the
  failure, and skipped the enqueue entirely on an idempotent replay.
- A location change only revalidated Next paths, so the previously public
  coarse region stayed in the index until someone repaired it by hand.
- Erasure could be marked handled while removal was merely queued.

Any crash, queue error, or replay between the commit and the enqueue left the
previous document searchable with nothing durable recording that it had to go.
For users under wartime risk, that window is a safety defect, not a latency
detail.

## The contract

`public_projection_intents` holds exactly one row per projected entity:

| Column                                | Meaning                                                  |
| ------------------------------------- | -------------------------------------------------------- |
| `entity_kind`, `entity_id`            | Primary key. Today `journal_entry` only.                 |
| `desired_state`                       | `present` or `absent`.                                   |
| `desired_generation`                  | `nextval('public_projection_generation_seq')` per write. |
| `desired_reason`                      | Which declassification event produced this state.        |
| `privacy_reducing`                    | Claimed first; sticky while unconverged.                 |
| `applied_state`, `applied_generation` | What an applier verified, and for which generation.      |
| `status`, `attempts`, `available_at`  | `pending`/`processing`/`applied`/`failed`/`dead`.        |
| `lease_owner`, `lease_expires_at`     | One applier at a time; an expired lease is reclaimable.  |
| `verified_at`                         | When Meilisearch was actually read back.                 |

Four invariants are enforced by the database, not by prose:

1. `applied_generation <= desired_generation` — an applier can never record
   progress beyond the generation it claimed.
2. `status = 'applied'` requires `applied_generation = desired_generation`,
   `applied_state = desired_state`, and a non-null `verified_at`. "Job queued"
   can never be stored as deletion proof.
3. `desired_generation > 0` — every generation comes from the shared sequence.
4. The claim index only covers `applied_generation < desired_generation`, so
   claim cost is proportional to unconverged work.

### Write path

Every canonical write that can change a public projection records its intent in
the same transaction:

| Event                       | Owner                                                               | State                        |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------- |
| publish, skeleton publish   | `journal-repository.ts` `publishJournalEntry`, `createJournalEntry` | `present`                    |
| edit                        | `journal-repository.ts` `updateJournalEntryAggregate`               | `present`                    |
| archive                     | `journal-repository.ts` `archiveJournalEntry`                       | `absent`                     |
| location visibility/region  | `journal-repository.ts` `updatePlantObjectLocation`                 | `present` (privacy-reducing) |
| catalog identity            | `journal-repository.ts` `resolvePlantObjectCatalog`                 | `present`                    |
| cover/focal presentation    | `media/media-repository.ts` `updateMediaAssetFocalForOwner`         | `present`                    |
| profile visibility          | `owner-profile-repository.ts` `updateOwnerPublicProfile`            | `present`/`absent`           |
| erasure, moderation removal | `erasure-execution.ts`, moderation write path                       | `absent`                     |

A replayed mutation calls `ensurePublicProjectionIntent`, which repairs a
missing row without minting a new generation for state it did not change.

### Apply path

Two appliers share one state machine:

- `apps/web/src/server/search/public-projection-outbox.ts` — used inline right
  after the request's commit.
- `services/matching/app/public_projection.py` — drained by the worker loop
  before ordinary matching work.

Both do the same four steps: claim with a lease (`for update skip locked`,
privacy-reducing first, then oldest generation) → apply → **verify by reading
the real index** → settle with a compare-and-set on `desired_generation` and
`lease_owner`. If a newer canonical write landed meanwhile, the CAS matches zero
rows, the applier reports `superseded`, and the newer generation stays owed. An
older applier can therefore never overwrite or bless newer state.

Failures are retried with exponential backoff up to 5 attempts, then
dead-lettered. The prior rule made dead-lettered rows fail the parity gate
closed; ADR-0018 supersedes that refusal instruction, and OVE-331 owns the
quality-class admission successor.

### Terminal success

A product surface may report removal only from verified convergence:

- The owner's object page shows `archivedGonePending` until
  `loadPublicProjectionConvergence` says the entry converged; only then does it
  claim the entry is out of public search.
- `executeApprovedErasureRequest` stays `cleanup_pending` — it does not become
  `completed` — until every erasure intent it owes has converged to `absent`.

### Gate

`classifyPublicJournalIndexParity` reads the outbox as well as the index.
`zeroGap` now also requires `projection_overdue = 0` and `projection_dead = 0`.
Recently recorded, still-converging intents count as in-flight, exactly like
`pending` queue work.

## Observability and evidence

Reports and logs carry counts, class names, state names and SHA-256 digests
only. Entity ids appear only in owner-scoped product reads. Journal text,
slugs, media URLs, coordinates, email and stable user identity never appear in
evidence.

## Commands

```bash
cd apps/web
pnpm smoke:public-projection-revocation
pnpm smoke:public-index-parity-adversarial -- --environment local --confirm-environment local
pnpm exec vitest run src/server/search/public-projection-outbox.test.ts src/server/search/public-journal-parity.test.ts
```

```bash
cd services/matching
.venv/bin/python -m pytest tests/test_public_projection.py -q
```

## Migration and rollout

- `apps/web/sql/0011_ove242_public_projection_outbox.sql` is additive and
  idempotent; the same DDL is folded into `sql/0001_walking_skeleton.sql` so a
  fresh bootstrap matches production.
- Entries published before the outbox existed have no intent row.
  `backfillMissingPublicProjectionIntents` records `repair` intents for the
  currently eligible corpus in bounded batches; it is a backfill, not part of
  normal operation.
- Rollback: stopping the appliers only delays convergence — intents stay
  durable and the historical gate refused completion. ADR-0018 supersedes that
  refusal posture for unresolved derived state. Dropping the table would restore the
  pre-OVE-242 silent-loss window and must never be done to "clear" a backlog.
