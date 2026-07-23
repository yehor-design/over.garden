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
