# OVE-305 final-main public-variety activation proof

This runbook operates exactly one disposable, non-personal production canary
after its implementation is contained in current `origin/main` and the
canonical Vercel Production deployment is `READY` at that exact SHA. It proves
that the canonical `gardenFirstEntryPreselectionPath` carries only one safe
globally selectable catalog slug into the prepared owner garden, the live
first-entry route saves the matching catalog identity with the `public_variety`
enum, and task-owned state is erased. It does not claim that a live-rendered
`/variety/{slug}` CTA exists while the public production corpus has no eligible
variety page.
It changes no product behavior, schema, provider configuration, real-gardener
record, or public catalog row.

Canonical behavior remains owned by:

- `apps/web/src/app/catalog-evidence-route.tsx`
- `apps/web/src/lib/garden/public-paths.ts`
- `apps/web/src/app/garden/page.tsx`
- `apps/web/src/lib/garden/activation.ts`
- `apps/web/src/server/catalog-repository.ts`
- `apps/web/src/app/api/garden/entries/route.ts`
- `apps/web/src/server/journal-repository.ts`
- `apps/web/src/server/analytics-events.ts`

The harness selects one existing global `plant_variety` with a safe public
slug, verifies its canonical preselection path, creates one official Better
Auth synthetic owner preclassified as excluded `production_smoke`, opens the
live garden preselection, saves one private hidden-location first entry through
the canonical API, reads back the exact catalog identity and allowlisted
attribution, then erases only the deterministic task owner. Receipts contain
only counts, booleans, closed classes, duration, exact SHA, and digests. They
never contain credentials, cookies, owner identity, catalog slug, content, raw
URL or referrer, precise location, request metadata, or provider payloads.

## Immutable authorization

Approved normalized operation:

```text
OVE-305|production|resolve one globally selectable safe plant-variety slug through the canonical gardenFirstEntryPreselectionPath, open that exact public_variety preselection in the prepared owner garden, save one disposable first-entry canary with only the safe slug and public_variety enum, read it back, then erase the exact canary|baseline:8ce1dec637234af06c8b5ca2c5c4837f0aec3f2c|one-canary|cleanup-required
```

Approved SHA-256:

```text
1faedba60ec4716626ad764a97d11452ea27845ddf5d87fc8cd779587e03bb23
```

This authorization permits exactly one apply. The baseline token above is the
immutable authorization provenance; the runtime plan additionally binds the
current exact-main deployment SHA. Environment, target, implementation or
deployment SHA, digest, task-canary count, canonical preselection path,
database target, recovered identity, or provider drift invalidates
authorization before an effect. After any apply attempt, never run a second
apply under this digest; only `--status`, `--cancel`, and task-scoped
`--cleanup` remain allowed.

## Preconditions

1. Fetch `origin/main` and prove the feature SHA is contained.
2. Read the Vercel deployment twice and require Production `READY`, ref `main`,
   exact SHA, and canonical apex plus www aliases.
3. Read `/api/document-mutation-admission/readback` twice and require the same
   SHA with enforcement enabled.
4. Run `pnpm mainline:closeout:check` from the clean exact-main checkout.
5. Use `vercel env run -e production`; do not copy production secrets into
   evidence.
6. Run commands from `apps/web`; the package script supplies `react-server`.

## Read-only plan

```bash
cd apps/web
vercel env run -e production -- pnpm run ove305:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE305_IMPLEMENTATION_SHA" \
  --plan
```

Require `resultClass=zero_effect_plan`, `canaryCountBefore=0`, `applyCount=0`,
`state=code_deployed`, and the approved digest. The plan must also classify one
eligible globally selectable plant-variety and its exact canonical
`public_variety` preselection path without exposing the selected slug. Any
drift stops before mutation.

## One approved apply

Run exactly once after all read-backs and the zero-effect plan agree:

```bash
cd apps/web
vercel env run -e production -- pnpm run ove305:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE305_IMPLEMENTATION_SHA" \
  --apply \
  --approval-digest 1faedba60ec4716626ad764a97d11452ea27845ddf5d87fc8cd779587e03bb23
```

Terminal pass requires one canonical safe-slug preselection path; one
authenticated garden preselection; one owner-scoped object and entry linked to
that exact global catalog item; private active state with hidden location and no
coarse region;
the unique activation enum `public_variety`; excluded `production_smoke`
learning class; zero raw URL, referrer, content, identity, or precise-location
evidence; zero another-owner effects; and cleanup twice with no database,
attribution, durable-intent, or recovery-file residue. The receipt must be
`resultClass=verified_variety_activation`,
`cleanupClass=authoritative_absent_twice`, and `state=cleaned`.

## Wait-safe controls

Read-only status remains independent of apply execution:

```bash
vercel env run -e production -- pnpm run ove305:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE305_IMPLEMENTATION_SHA" --status
```

Cancel writes only the task-local cancellation fence:

```bash
vercel env run -e production -- pnpm run ove305:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE305_IMPLEMENTATION_SHA" --cancel
```

## Recovery and cleanup

Timeout, partial success, provider uncertainty, unsafe attribution, or cleanup
uncertainty is terminal failure. Cleanup may erase only the deterministic
OVE-305 synthetic owner and its one object/entry:

```bash
vercel env run -e production -- pnpm run ove305:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE305_IMPLEMENTATION_SHA" --cleanup
```

The harness stores at most one entry UUID and one plant-object UUID in a
mode-0600 task-local recovery file. It stores no owner identity, catalog slug,
content, credential, or request data. Cleanup resolves only the deterministic
task owner, removes its learning outbox and attribution, analytics, journal,
object, space, session/account, profile/handle cascades, and owner row, then
proves cleanup twice. The recovery file is removed only after two matching
authoritative absence read-backs. A clean replay returns `already_cleaned`
without another effect.

After any uncertain or partial apply, never run a second apply under this
digest. Save the closed receipt, run status and cleanup only, and require a
separately approved task-local digest before any replacement canary.

## Closeout

Allowed terminal fields are exactly:

```text
version, environment, implementationSha, planDigest, authorizationDigest,
canaryCountBefore, applyCount, resultClass, cleanupClass, durationMs, state,
evidenceDigest
```

Before Linear `Done`, require focused and adjacent tests, lint, typecheck, full
tests, build, `git diff --check`, exact-head CI, main containment,
`pnpm mainline:closeout:check`, exact-main deployment/runtime read-backs, the
single approved apply, explicit cleanup/status/read-only-plan receipts, and two
matching authenticated Linear read-backs.
