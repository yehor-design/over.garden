# Deterministic Matching Rollout Proof

Status: implemented by OVE-163

Binding command: `cd apps/web && pnpm smoke:catalog-matching-rollout`

## Purpose

OVE-163 is the closeout gate for OVE-158 through OVE-162. It proves one
deterministic, explainable, human-approved catalog matching system rather than
five isolated implementation slices:

1. A provisional catalog identity produces bounded canonical suggestions.
2. Approval is an explicit curator transaction; rejection and stale evidence
   cannot mutate catalog, object, journal, or search state.
3. Ukrainian, Bulgarian, and Russian aliases remain detached until approval;
   collision, rejected, and stale variants stay outside typeahead.
4. Approved canonical identities and aliases resolve through real gardener
   typeahead, first-entry save, existing-object resolution, and readback.
5. Fuzzy duplicate evidence remains advisory and cannot merge identities or
   publish aliases.
6. Matching jobs recover after stale claims, preserve rerun requests, and are
   safe under at-least-once execution.

The proof does not claim that current pilot thresholds are empirically final.
Real UA/BG name-quality benchmarking remains necessary before any future
automation proposal.

## Local Behavioral Proof

Prerequisites:

- Run the Apple Container-first local Postgres and Meilisearch services with
  `infra/container-up` or verify them with `infra/container-status`.
- Keep `apps/web/.env.local` pointed only at the loopback local services.
- Port `3000` may be free or already serve the same local checkout. The proof
  starts and stops its own Next.js runtime when no healthy app is present.

Run:

```bash
cd apps/web
pnpm smoke:catalog-matching-rollout -- \
  --environment local \
  --confirm-environment local \
  --base-url http://127.0.0.1:3000
```

The command refuses a non-loopback database, runs only bounded disposable
fixtures, and performs final cleanup. It orchestrates the existing binding
smokes instead of reproducing their business rules:

- canonical suggestion generation plus deterministic rejection replay;
- atomic canonical approve/reject/stale/history/reindex behavior;
- generated alias review, collision hold, approve/reject, and replay;
- real Better Auth + HTTP gardener typeahead/save/readback with Meilisearch and
  Postgres fallback;
- bounded RapidFuzz duplicate QA;
- the complete Python handler, algorithm, recovery, retry, and idempotency test
  suite.

Successful output is one
`ove163.deterministicMatchingRolloutProof.v1` JSON object. The full fuzzy pair
count includes the temporary fixture while the proof runs; cleanup removes that
fixture and refreshes the advisory table before exit.

## Non-Local Read-Only Proof

The selected non-local closeout target is canonical production
`https://over.garden`, using the production values registered in
`docs/INFRASTRUCTURE_REGISTRY.md`.

Inject the trusted production environment directly from the platform secret
store into the proof process. Do not write an env file, paste values, or print
the process environment.

```bash
vercel env run --environment production -- \
  pnpm --dir apps/web run smoke:catalog-matching-rollout -- \
  --environment production \
  --confirm-environment production \
  --base-url https://over.garden
```

Non-local mode has no mutation flag and no write path. It verifies only:

- canonical `/health` availability;
- presence of match, alias, fuzzy, and queue tables;
- exact database constraints for all three matching refresh payloads;
- a safe canonical result in the existing `catalog_typeahead` index;
- rejection of unsafe Meilisearch document shapes by the shared parser;
- the redacted `ove162.catalogEntityResolutionQa.v2` report and bounded counts.

All approve/reject, fixture, recovery, and idempotency claims come from the
exact-commit local behavioral proof. Production evidence is readiness and
deployment proof only; it never creates test users, catalog identities, aliases,
objects, journals, suggestions, jobs, or search documents.

## Worker Recovery Matrix

| Job kind                             | Closed payload                | Recovery proof                                                          | Mutation boundary                       |
| ------------------------------------ | ----------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| `catalog_match_suggestions_refresh`  | provisional catalog UUID only | long lease, stale reclaim, rerun preservation, deterministic replay     | suggestions only                        |
| `catalog_alias_suggestions_refresh`  | ownerless catalog UUID only   | long lease, stale reclaim, rerun preservation, accepted/rejected replay | projections only until curator approval |
| `catalog_fuzzy_duplicate_qa_refresh` | kind only                     | long lease, stale reclaim, rerun preservation, atomic advisory refresh  | fuzzy advisory pairs only               |
| `catalog_typeahead_reindex`          | kind only                     | stale reclaim and idempotent derived-index rebuild                      | public-safe derived index only          |

An old claim token cannot complete a newer rerun. A refresh requested during
processing returns the row to `pending` after the current claim finishes.

## Evidence Contract

Allowed evidence is limited to environment class, public base URL, commit/ref,
clean/dirty state, bounded counts, fixture labels, job-kind enums, status enums,
and pass/fail booleans.

The recursive evidence guard rejects secret-bearing or private fields and
values, including database URLs, credentials, tokens, cookies, session or user
identifiers, emails, IPs, raw/source-only payloads and keys, journal text, media
keys, request metadata, and precise location. Typeahead safety is additionally
enforced by the shared catalog document parser.

## Non-Goals

- No LLM, embedding, or probabilistic auto-approval layer.
- No broad source import or production fixture mutation.
- No automatic canonical merge or alias publication.
- No destructive fuzzy duplicate resolution.
- No public indexing promotion for thin variety or UGC pages.

## Closeout Record

Local behavioral proof passed on 2026-07-16 against loopback Postgres,
Meilisearch, and the real Next.js HTTP/auth path on exact clean-main commit
`e94148fa5a4a097422b5cdf7234e1b1ffad542e2`. The same commit passed
[GitHub CI run 29477408972](https://github.com/yehor-design/over.garden/actions/runs/29477408972),
including the responsive/accessibility matrix, and reached Vercel production as
READY deployment `dpl_FR7gxmnHv9j3wEMLvrDbk5KjYPf2`.

The redacted production proof generated at `2026-07-16T06:50:29.851Z` passed
runtime, schema, safe typeahead search, entity-resolution QA, and recursive leak
checks with `productionDataTouched=false`. Production had zero materialized
fuzzy QA rows (`fullPersisted=0`, `boundedReviewed=0`, `rendered=0`); this is an
honest readiness result, not evidence of fuzzy behavior. The bounded advisory
generation, worker recovery, and cleanup claims come from the exact-commit
local fixture proof as required by this contract.
