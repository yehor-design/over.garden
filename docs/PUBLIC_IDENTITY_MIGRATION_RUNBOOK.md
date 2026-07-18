# OVE-203 Public Identity Migration Runbook

This runbook backfills and proves the public-identity invariant without
exposing identity data in operator evidence. The command output contains only
aggregate counts, booleans, the policy version, and the evidence schema. It
never prints email addresses, user ids, handles, display names, rejected terms,
or raw profile rows.

## Contract

- Every Better Auth user has exactly one `user_public_profiles` row and one
  matching current `user_handle_registry` claim.
- Existing profiles, custom handles, visibility, biography, region, languages,
  avatar, lifecycle, and relationship settings are preserved.
- Apply calls the canonical
  `overgarden_provision_user_public_profile(uuid)` function only for users
  missing a profile or current claim.
- Existing handle and non-null display-name values are reviewed in-process by
  the versioned identity policy. Passing rows receive only policy-version
  metadata. Rejected values remain pending and are represented by aggregate
  counts only; the migration never renames or reveals them.
- A second apply has zero provision/reconciliation and review mutations.
- Verify fails closed until missing identities, duplicate/mismatched current
  claims, pending policy reviews, and ambiguous legacy person-mention labels
  are all zero. Exact former app mentions are migrated only when both their
  bounded label and SHA-256-backed `client_mutation_id` signature match;
  text-only lookalikes remain pending for private operator review.
- Rollback proof creates a synthetic user inside a transaction, observes the
  trigger-created profile/current claim, deliberately rolls the transaction
  back, and proves the before/after aggregate state is identical.

## Local sequence

Bootstrap the current SQL first, then run:

```sh
cd apps/web
pnpm identity:dry-run
pnpm identity:apply --confirm-apply
pnpm identity:apply --confirm-apply
pnpm identity:verify
pnpm identity:rollback-proof
```

The second apply must report all four mutation counters as zero. `verify` must
return exit code 0 and `ready: true`. Rollback proof must report both
`transactionalMutationObserved: true` and `aggregateStateUnchanged: true`.

## Fresh-bootstrap and managed-restore compatibility

CI runs `pnpm smoke:public-identity` immediately after bootstrapping an empty
Postgres 18 database. The smoke is loopback-only, creates disposable synthetic
accounts, and removes them before exit. It fails unless the recovered schema
and behavior include all of the following:

- the handle registry plus the canonical provisioning and claim functions;
- the Better Auth user provisioning trigger and both deferred
  profile/registry consistency triggers;
- exactly one matching profile/current claim per account and authoritative
  current/retired uniqueness;
- preserved `generated`/`custom` claim provenance and
  `ove203-identity-v1` policy version on current and retired claims;
- a persisted future `next_rename_at` after the first custom claim, an
  unavailable retired handle, and a non-bypassable 30-day cooldown;
- rejection of profile-only handle mutation and cascade cleanup with zero
  remaining current or retired claims.

This fresh-bootstrap smoke is the deterministic recovery contract required by
OVE-203; it is not evidence that DigitalOcean restored a production backup.
OVE-201 still owns the real managed restore into a newly created disposable
cluster, predeclared RPO/RTO, restored-data aggregate checks, derived-index
rebuild, and separately approved exact-target teardown. On that disposable
fork, run the same identity assertions through OVE-201's guarded
`smoke:restore-readiness` flow. Never point `smoke:public-identity` at
production: it intentionally refuses non-loopback database URLs and performs
synthetic writes even though it cleans them up.

## Production sequence

Production starts with an explicit additive schema-install step. The identity
migration commands cannot be used as evidence before the live database has the
registry, functions, triggers, and constraints from the exact code SHA.

1. Confirm the target commit is current `main`, its CI is green, the same SHA is
   `READY` and canonical in Vercel, and the managed backup/PITR state has been
   checked for the maintenance window. Stop if any identity differs.
2. Use a clean deployment-linked working directory. Place the production
   database environment and CA in separately permission-restricted temporary
   files; do not create or load `.env.local` in that directory.
3. Install the exact-SHA app SQL and Better Auth schema through the repository's
   idempotent bootstrap, with bounded lock/statement timeouts so contention
   fails closed instead of waiting indefinitely:

   ```sh
   cd apps/web
   OVE203_ENV_FILE=/private/tmp/overgarden-ove203-prod.env
   OVE203_CA_FILE=/private/tmp/overgarden-ove203-prod-ca.crt
   PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s' \
     pnpm db:bootstrap -- \
       --env-file "$OVE203_ENV_FILE" \
       --ca-file "$OVE203_CA_FILE"
   ```

   This command must complete once before migration dry-run. It is the
   non-destructive, additive schema path already used for managed production;
   do not substitute hand-written DDL or an interactive SQL paste. Abort and
   investigate on a timeout, constraint failure, or unexpected migration.

4. Run `identity:dry-run` and retain only its aggregate redacted JSON output.
5. Run `identity:rollback-proof` before apply. It must observe its synthetic
   transactional mutation and prove the aggregate state is unchanged after
   rollback.
6. Run `identity:apply --confirm-apply` once.
7. Run it a second time and require all mutation counters to be zero.
8. Run `identity:verify`; do not close OVE-203 unless it exits successfully with
   `ready: true` and every gap/review counter at zero.
9. Repeat the exact-SHA authenticated and public-profile production smoke,
   including current-handle readback, retired-route `410`/`noindex`, duplicate
   signup invariants, and private/removed/blocked exclusions.

Use the same explicit files for every migration command, for example:

```sh
pnpm identity:dry-run -- \
  --env-file "$OVE203_ENV_FILE" --ca-file "$OVE203_CA_FILE"
pnpm identity:rollback-proof -- \
  --env-file "$OVE203_ENV_FILE" --ca-file "$OVE203_CA_FILE"
pnpm identity:apply -- --confirm-apply \
  --env-file "$OVE203_ENV_FILE" --ca-file "$OVE203_CA_FILE"
pnpm identity:apply -- --confirm-apply \
  --env-file "$OVE203_ENV_FILE" --ca-file "$OVE203_CA_FILE"
pnpm identity:verify -- \
  --env-file "$OVE203_ENV_FILE" --ca-file "$OVE203_CA_FILE"
```

Use `--env-file <path>` for an explicit environment file and `--ca-file
<path>` when the managed Postgres connection requires a CA certificate. Never
paste connection strings or environment values into issue comments or CI logs.
Remove the temporary secret files through the approved operator secret-cleanup
workflow immediately after proof; retain only aggregate JSON evidence.

If verify reports pending reviews, inspect the affected rows only through an
authorized private database session. Do not copy their values into Linear,
logs, screenshots, or migration output. Resolve the product-policy decision
before changing any existing public identity.
