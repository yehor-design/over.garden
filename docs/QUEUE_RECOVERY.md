# Current Queue Recovery (OVE-194)

Status: active
Owner issue: OVE-194

## Policy

Postgres `job_queue` remains the sole queue. Matching workers claim
`pending`/`failed` and stale `processing` rows. Terminal status `dead` is never
claimable.

| Class | Outcome |
| --- | --- |
| Unsupported kind / invalid payload | `dead` on first claim (`unsupported_kind` / `invalid_payload`) |
| Transient handler/dependency error | `failed` with exponential backoff until `maxAttempts` (8) |
| Exhausted attempts | `dead` (`max_attempts_exceeded`) |
| `engagement`-style or erasure outbox | See `apps/web/src/server/job-queue-manifest.ts` |

Structured journal cover/document/publication changes enqueue only allowlisted
`journal_entry_index` / `journal_entry_unindex` payloads (IDs only). Replay
re-reads current DB state and cannot resurrect an obsolete cover from a payload.

## Operator surfaces

- Matching `/ready` exposes redacted `queueRecovery` classes (no payloads, IDs,
  or raw counts).
- Local report: `pnpm smoke:matching-queue-health -- --environment local --confirm-environment local`
- Production: same smoke against `/ready` with exact commit/digest flags.
- Authorized replay of one `dead` matching job requires `operator:mutate` and the
  request-specific phrase from `expectedQueueReplayApprovalText`.

## Production poison rows

Do not bulk-delete. After the OVE-194 worker deploy, unsupported or exhausted
rows terminalize on next claim. Pre/post reports must show
`unsupportedRetryingClass=none`.

## OVE-194 live evidence (redacted)

- Behavior source: `4e5385d55ac4ecda8c0c78d9493c5271a4d0a576` on `main`.
- Vercel web: `dpl_5xPJcpyvhkq6L43HzbcLUBA1aooC` READY for that SHA.
- Matching API/worker digest:
  `sha256:85134c4e551e544034935c399e9aec8dfe5d0dd387eb308cd5c80ae3bd3cafb2`
  (budget-freeze offline seal `releaseRun=19400000001.1`; matching-image
  Actions remain blocked, so the host sealed from exact main source).
- Additive SQL `0003_job_queue_dead_letter.sql` applied before activation.
- Production `/ready` reports `ove194.matchingRuntime.v1` with
  `queueRecovery.unsupportedRetryingClass=none` and empty terminal class.
- Dead-letter canary outcomes: supportedSuccess, unsupportedTerminalized,
  unsupportedNotReclaimed, authorizedReplay — all passed; leakCheck passed.
- No payloads, user IDs, journal text, media keys, or secrets in evidence.
