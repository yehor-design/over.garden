# OVE-310 launch-time worker restart recovery proof

This runbook classifies the production Linux exception, restarts exactly the active Docker Compose `matching-worker` container once, waits for the matching API to prove a fresh same-release worker heartbeat, then exercises the canonical journal index and unindex path with one disposable owner-scoped canary. The harness cleans only that canary and proves authoritative absence twice. It changes no product behavior, schema, worker release, provider configuration, or real-user state.

Canonical behavior remains owned by:

- `infra/production-worker/docker-compose.release.yml`
- `docs/CONTAINER_RUNTIME_POLICY.md`
- `apps/web/scripts/recertify-final-main-journal-worker.ts`
- `apps/web/src/server/journal-repository.ts`
- `apps/web/src/server/queue.ts`
- `services/matching/app/worker.py`
- `services/matching/app/search.py`
- `apps/web/src/server/search/public-projection-outbox.ts`

The OVE-310 harness owns only the single-use orchestration and closed receipt. It reuses the OVE-306 journal proof implementation through a separate deterministic synthetic owner, state prefix, advisory lock, attempt fence, recovery file, and replay namespace. OVE-306 state can neither authorize nor satisfy OVE-310.

## Immutable authorization

Approved normalized operation:

```text
OVE-310|production|classify the production Linux runtime, restart exactly the matching-worker container once, wait for healthy heartbeat, publish and archive one owner-scoped disposable journal canary, verify safe index and unindex convergence, then erase the exact canary|baseline:c45ddb639bc1fdff15ca124eda736f2cd9af7ce7|one-canary|cleanup-required
```

Approved SHA-256:

```text
c356930237369dc81e5937965a43a0979b5270cc17ad5f1bff163315a75e4bf3
```

The baseline embedded in the authorization is immutable provenance, not permission to deploy stale code. The implementation must first be contained in current `origin/main`, and the canonical Vercel Production deployment must be READY at that exact main SHA.

The authorization permits exactly one apply. A local task fence is written before the provider step, and the production host atomically creates a mode-0600 digest-specific attempt marker immediately before the restart. That provider marker is never removed, including by cleanup; it prevents a later host or checkout from replaying the same authorization. After that invocation, never run a second apply under this digest, including after timeout, provider uncertainty, partial success, clean failure, or process interruption. Only read-only status, cancellation fencing, and exact task-scoped cleanup remain legal.

The complete operation has a 180-second deadline. Each direct provider command has a 30-second deadline; the Compose restart itself is bounded to 20 seconds. A timeout after the provider request is uncertainty, not permission to retry.

## Safety boundary

The read-only runtime plan requires exactly four active Compose services in the `overgarden` project: `caddy`, `matching-api`, `matching-worker`, and the active versioned `meilisearch-next` service. The immutable release Compose file must separately contain exactly `matching-api` and `matching-worker`; Caddy and active Meilisearch are owned by their dedicated production Compose files. Each running container must carry the exact project/service ownership labels and the `unless-stopped` restart policy. Required API/worker health checks must be healthy; Caddy and Meilisearch must be running. The digest-specific provider attempt marker must be absent; presence means this authorization is exhausted and plan fails closed.

The sole provider mutation is the active release command equivalent to:

```bash
flock -n /opt/overgarden/release-state/matching-release.lock \
  timeout 20s docker compose \
  --project-name overgarden \
  --env-file /opt/overgarden/release-state/active.env \
  --file /opt/overgarden/docker-compose.release.yml \
  restart --no-deps matching-worker
```

The harness captures container identity and start time only inside the remote process. It admits the result only when the worker keeps the same container identity with a new start time, every peer keeps the same identity and start time, all four roles remain running, and the worker becomes healthy. Raw identities and timestamps are never returned or saved.

After restart, the exact immutable release and six-handler manifest must be proved, along with a fresh worker heartbeat. Historical note: this runbook was executed against `https://matching.over.garden/capabilities` and `/ready`, which OVE-357 retired on 2026-09-03. The equivalent proof today is `pnpm smoke:matching-runtime-capabilities`, which reads the same classes from the heartbeat row. The canary begins only after that proof.

The disposable journal path then requires:

- one synthetic Better Auth owner with hidden location and no personal content;
- one private journal created through the canonical mutation route;
- one publication through the scoped journal repository;
- one identifiers-only `journal_entry_index` job reaching `done`;
- exact public-safe Meilisearch parity with no location or private field;
- one archive transition;
- one identifiers-only `journal_entry_unindex` job reaching `done`;
- canonical eligibility and Meilisearch absence;
- a generic content-free `410` with `noindex, nofollow`;
- zero another-owner effect;
- task database, queue, projection, route, search, account, and recovery absence twice.

Receipts contain only `version, environment, implementationSha, planDigest, authorizationDigest, canaryCountBefore, applyCount, resultClass, cleanupClass, durationMs, state, evidenceDigest`. They never contain credentials, cookies, tokens, user identity, journal identifiers or content, raw URLs, precise location, provider payloads, container identities, timestamps, hosts, or object keys.

## Preconditions

1. Fetch current `origin/main`, prove the implementation commit is contained, and use a clean exact-main checkout.
2. Run `cd apps/web && pnpm mainline:closeout:check`.
3. Read the canonical Vercel Production deployment twice and require READY, ref `main`, the exact SHA, and canonical apex/www aliases.
4. Read `/api/document-mutation-admission/readback` twice and require the exact SHA with enforcement enabled.
5. Read matching `/capabilities` and `/ready`; require the exact release, six handlers, fresh heartbeat, and every dependency available.
6. Read Meilisearch health and require `available`.
7. Require the OVE-310 Linear description digest and relations to match their authenticated read-back.
8. Run commands from `apps/web`; the package command supplies the `react-server` condition needed by cleanup and canary mutation.

## Read-only plan

```bash
cd apps/web
vercel env run -e production -- pnpm run ove310:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE310_EXACT_MAIN_SHA" \
  --plan
```

Require `resultClass=zero_effect_plan`, `canaryCountBefore=0`, `applyCount=0`, `state=code_deployed`, the exact approval digest, exact deployment SHA, exact runtime class, four roles, `unless-stopped`, healthy runtime, and `ready_exact_handlers`. Any difference stops before mutation.

Do not run plan after apply. The attempt fence deliberately makes it fail closed.

## One approved apply

Run exactly once after two provider read-backs and the zero-effect plan agree:

```bash
cd apps/web
vercel env run -e production -- pnpm run ove310:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE310_EXACT_MAIN_SHA" \
  --apply \
  --approval-digest c356930237369dc81e5937965a43a0979b5270cc17ad5f1bff163315a75e4bf3
```

Terminal pass requires `applyCount=1`, `resultClass=verified_worker_restart_recovery`, `cleanupClass=authoritative_absent_twice`, and `state=cleaned`. The receipt digest attests the exact one-restart, fresh-heartbeat, journal verification, privacy, and cleanup predicates; a command exit code or HTTP success alone is insufficient.

## Wait-safe controls

Status is read-only and remains independent of the apply lock:

```bash
vercel env run -e production -- pnpm run ove310:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE310_EXACT_MAIN_SHA" --status
```

Cancellation writes only the task-local fence. It cannot undo a provider request already sent:

```bash
vercel env run -e production -- pnpm run ove310:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE310_EXACT_MAIN_SHA" --cancel
```

## Recovery and cleanup

After timeout, provider uncertainty, partial success, unsafe evidence, or failed verification, do not repeat apply. Run only deterministic task cleanup:

```bash
vercel env run -e production -- pnpm run ove310:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE310_EXACT_MAIN_SHA" --cleanup
```

Cleanup may archive and erase only the deterministic OVE-310 synthetic owner and its one journal. It converges only that journal projection, deletes only its exact queue rows and derived search document, and proves authoritative absence twice. The recovery file is removed only after those two reads. The attempt fence remains permanently, so cleanup can never reopen apply.

## Closeout

Run the focused OVE-310 and adjacent OVE-306 tests, matching release and worker tests, lint, typecheck, the full suite, build, `git diff --check`, exact-head CI, current-main containment, mainline closeout, exact-main deployment/runtime read-backs, the single approved apply, explicit cleanup/status read-backs, and two matching authenticated Linear read-backs before Done.
