# OVE-306 final-main journal worker proof

This runbook operates exactly one fresh disposable, non-personal Amendment 2 production journal canary after the original and Amendment 1 digests were each exhausted by one failed-clean attempt, authoritative cleanup was proved twice for both, the timezone-invariant calendar-date implementation commit is contained in current `origin/main`, and the canonical Vercel Production deployment is `READY` at that exact SHA. It proves that publication reaches the live matching worker through one identifiers-only `journal_entry_index` job and that archive reaches the same worker through one identifiers-only `journal_entry_unindex` job. It changes no product behavior, schema, indexing policy, worker release, provider configuration, or real-user state.

Canonical behavior remains owned by:

- `apps/web/src/server/journal-repository.ts`
- `apps/web/src/server/queue.ts`
- `apps/web/src/server/job-queue-manifest.ts`
- `services/matching/app/job_handlers.py`
- `services/matching/app/worker.py`
- `services/matching/app/search.py`
- `apps/web/src/server/search/public-projection-outbox.ts`
- `apps/web/src/lib/public-journal-entry-lifecycle.ts`
- `docs/PUBLIC_PROJECTION_REVOCATION.md`

The harness creates one official Better Auth synthetic owner through the deployed mutation route, publishes through the scoped repository, enqueues one canonical index job, waits for the live worker to mark it `done`, verifies the exact public-safe Meilisearch document and projection generation, archives the same entry, enqueues one canonical unindex job, waits for `done`, verifies authoritative search absence and projection convergence, then erases only task-owned state.

Receipts contain only closed state classes, counts, duration, exact SHA, and digests. They never contain credentials, cookies, owner identity, entry ID, job ID, journal content, slug, raw HTML, precise location, request metadata, provider payloads, or object keys.

## Immutable authorization

The original digest is exhausted and can never be applied again:

```text
2863b7e1b10d04e574e5cd53daf604dbe8dc4d121b1bbe1bd1114ab2a81f1c49
```

Its one terminal apply returned `failed` with `applyCount=1`, `durationMs=20381`, and `cleanupClass=authoritative_absent_twice`. Explicit status, cleanup, and status replays confirmed the same closed receipt.

Amendment 1 is also exhausted and can never be applied again:

```text
601472f9690bad019e4e3a066ed98b653d77662fb65adf5087133b1625ee0346
```

Its one terminal apply returned `failed` with `applyCount=1`, `durationMs=92939`, and `cleanupClass=authoritative_absent_twice`. The worker and Meilisearch add/delete tasks succeeded; exact parity failed only because the TypeScript proof process serialized the PostgreSQL calendar date through local midnight while the Python worker serialized the same date at UTC midnight. Explicit status, cleanup, and status replays confirmed evidence digest `04718f576925d9c59a8a31cde774f58cc98787a48a7fc1e4dddb787640846397`. Only status and task-scoped cleanup remain legal for both exhausted digests.

Approved Amendment 2 normalized operation:

```text
OVE-306-amendment-2|production|after the exhausted clean Amendment 1 failure and exact-main timezone-invariant calendar-date normalization, create and publish one fresh owner-scoped disposable journal canary, observe one identifiers-only index job reach done and one public-only exact document appear, archive it, observe one identifiers-only unindex job reach done and authoritative absence, then erase the exact canary|baseline:8e02159c8934dc0ddd1846c11349e23a050d49c5|one-fresh-canary|cleanup-required|supersedes:601472f9690bad019e4e3a066ed98b653d77662fb65adf5087133b1625ee0346
```

Approved SHA-256:

```text
4576ffd409d0ed8411ff18326b39d37c98c475a9d8b69e72fd6d6f6cbeef21cd
```

Amendment 2 normalizes calendar dates from their calendar parts to UTC midnight, independent of the proof-process timezone. Real timestamps such as `createdAt` remain unchanged instants. This authorization permits one fresh single-use apply. The harness writes a mode-0600 task-local attempt fence before the first canary effect. Environment, implementation SHA, deployment SHA, plan digest, production database target, task-canary count, matching capability manifest, recovered identity, or provider drift invalidates the operation before mutation.

After the Amendment 2 apply invocation, never run a second apply under this digest. Only `--status`, `--cancel`, and task-scoped `--cleanup` remain allowed. Never invoke apply under either exhausted digest.

The complete proof has a 180-second monotonic deadline. Each live worker-job, projection-generation, Meilisearch task, and task-job cleanup wait is independently bounded to 60 seconds. These are finite waits, not retries of the canary effect; the canonical worker itself remains idempotent and finite-retry.

## Preconditions

1. Fetch `origin/main`, prove the feature SHA is contained, and use a clean exact-main checkout.
2. Read the Vercel deployment twice and require `READY`, Production, ref `main`, exact SHA, and canonical apex plus www aliases.
3. Read `/api/document-mutation-admission/readback` twice and require the exact SHA with enforcement enabled.
4. Require the immutable runtime shape, the exact six-handler manifest, `journal_entry_index`, `journal_entry_unindex`, and every dependency available. Historical note: this step read `https://matching.over.garden/capabilities` and `/ready`, retired by OVE-357 on 2026-09-03; `pnpm smoke:matching-runtime-capabilities` returns the same classes from the heartbeat row.
5. Read `https://meili.over.garden/health` and require `available`.
6. Run `pnpm mainline:closeout:check` from the clean exact-main checkout.
7. Use `vercel env run -e production`; never copy production secrets into evidence.
8. Run commands from `apps/web`. The package script supplies the required `react-server` condition.

## Read-only plan

```bash
cd apps/web
vercel env run -e production -- pnpm run ove306:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE306_IMPLEMENTATION_SHA" \
  --plan
```

Require `resultClass=zero_effect_plan`, `canaryCountBefore=0`, `applyCount=0`, `state=code_deployed`, the approved digest, and the matching runtime class `ready_exact_handlers`. If any field differs, stop. Resolve only task-owned residue with cleanup; never broaden a selector or inspect a real gardener.

Do not run `--plan` after apply. The attempt fence makes later plans fail closed.

## One approved apply

Run exactly once after the two provider read-backs and zero-effect plan agree:

```bash
cd apps/web
vercel env run -e production -- pnpm run ove306:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE306_IMPLEMENTATION_SHA" \
  --apply \
  --approval-digest 4576ffd409d0ed8411ff18326b39d37c98c475a9d8b69e72fd6d6f6cbeef21cd
```

Terminal pass requires:

- one official-session owner-scoped synthetic journal with hidden location;
- exactly one matching-queue `journal_entry_index` row for the task entry;
- an exact payload key set `kind,journalEntryId,userId`, with no content or metadata;
- the index job reaches `done` within the bounded wait;
- the observed Meilisearch document exactly matches canonical database eligibility and the public-safe document contract;
- the document has hidden location, `noindex=true`, no coarse region, no precise-location text, and no forbidden field;
- one archive transition for the same entry;
- exactly one matching-queue `journal_entry_unindex` row with the same identifiers-only shape;
- the unindex job reaches `done`;
- the direct Meilisearch read-back is authoritative absence;
- the transactional projection intent reaches applied `absent` at the current generation;
- the canonical route is a generic content-free 410 through at most one approved one-hop locale redirect;
- zero another-owner effects;
- cleanup twice with zero database, queue, projection, route, search, or recovery-file residue;
- `resultClass=verified_journal_worker`, `cleanupClass=authoritative_absent_twice`, and `state=cleaned`.

The canonical unprefixed public path may return one same-origin `307` to the exact `/bg` or `/ru` path for the same slug. Any other redirect, query, fragment, path change, origin change, or second hop fails closed. This is the only approved one-hop locale redirect.

## Wait-safe controls

Read-only status is independent of the apply lock:

```bash
vercel env run -e production -- pnpm run ove306:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE306_IMPLEMENTATION_SHA" --status
```

Cancel writes only the task-local cancellation fence:

```bash
vercel env run -e production -- pnpm run ove306:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE306_IMPLEMENTATION_SHA" --cancel
```

## Recovery and cleanup

Timeout, partial success, provider uncertainty, unsafe document evidence, job failure, or cleanup uncertainty is terminal failure. Cleanup may archive and erase only the deterministic OVE-306 synthetic owner and its one journal:

```bash
vercel env run -e production -- pnpm run ove306:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE306_IMPLEMENTATION_SHA" --cleanup
```

The recovery file stores at most one synthetic entry UUID and its matching public path, mode 0600. It stores no owner identity, content, job payload, or credential. Cleanup rehydrates only that exact identity, converges the archive/outbox boundary, removes only the two exact task queue rows and exact derived Meilisearch document when necessary, then proves database, queue, projection, route, and search absence twice. The recovery file is removed only after two clean read-backs. The attempt fence remains so apply cannot repeat.

The official production missing-document shape is authoritative only when the Meilisearch SDK reports `document_not_found` with the compatible 404 class. Authentication, network, 5xx, and unknown errors remain uncertainty.

After any uncertain or partial Amendment 2 apply, save the redacted receipt, run cleanup, and never run a second apply under this digest. `--status` reads the persisted terminal receipt; clean status may report `already_cleaned` without an effect.

## Closeout

Allowed terminal fields are exactly:

```text
version, environment, implementationSha, planDigest, authorizationDigest,
canaryCountBefore, applyCount, resultClass, cleanupClass, durationMs, state,
evidenceDigest
```

Before Linear `Done`, run focused and adjacent tests, Python worker recovery tests, lint, typecheck, full tests, build, `git diff --check`, exact-head CI, main containment, `pnpm mainline:closeout:check`, exact-main deployment/runtime read-backs, one approved Amendment 2 apply, explicit cleanup and status receipts, and two matching authenticated Linear read-backs.
