# OVE-315 media canary recovery

> Historical, consumed recovery profile. The single authorized OVE-315 apply
> ran once and stopped before the media PUT because production
> `R2_FORCE_PATH_STYLE=false` produced a virtual-hosted presigned capability.
> Authoritative cleanup proved zero residue twice. Never rerun this profile:
> the harness now refuses its digest. OVE-316 owns the one configuration
> correction and any separately approved replacement canary; see
> `docs/runbooks/OVE_316_R2_PATH_STYLE_RECOVERY.md`.

This runbook owns one separately authorized replacement of the consumed
OVE-302 derivative-only production canary. It changes only the harness
authorization profile, task identity, replay namespace, and redacted evidence
domain. The canonical Better Auth, journal, media repository, processor,
private-quarantine, public-derivative, original-deletion, and cleanup behavior
remains unchanged.

Do not use the OVE-302 digest. Do not select a real gardener. Do not execute a
second OVE-315 apply after any uncertainty. All commands below are retained as
historical protocol evidence and are no longer executable with the active
harness profile.

## Immutable authorization

Approved normalized operation:

```text
OVE-315|production|replacement-after-OVE-302-failed-before-media-effect:7b33d31487065afdab8d7c639bdb20aec7add752d5e5b0e0d3176e29c7a1cd4b|zero-residue-cleanup:c92c103ded90a382f342c0a69943666070b6255bf12652f5acf6d81c3f441022|fix-ready-main:660ddb7290a74b43f101fb58a372cc8c377fe8ed|zero-effect-plan:a4241cb782a7657470f53a099ab7711bc30c325ae9c8f3db01df951e0f820058|create one owner-scoped disposable journal-media canary, upload one generated non-personal image into private quarantine, process one stripped WebP derivative, verify the original is absent, and erase the exact canary|one-replacement-canary|cleanup-required
```

Approved SHA-256:

```text
76643a09f3636efdb44cf03d257181d49726e168bf6ad138087b44f06e948406
```

Maintainer Yehor approved this exact plan in the active Codex task at
`2026-08-12T21:45:16Z`. Its scope is one OVE-315 production apply and cleanup
only.

## Preconditions

1. Fetch current `origin/main` and prove `OVE315_IMPLEMENTATION_SHA` is
   contained.
2. Run all local gates and require exact-head CI success.
3. Read the official Vercel deployment twice and require `READY`, target
   Production, canonical `over.garden` and `www.over.garden` aliases, and the
   exact contained SHA.
4. Require OVE-315 In Progress, OVE-302 In Progress and blocked by OVE-315, and
   saved Linear description digest
   `d9ecf434bdea78a9572187bfefe2e87bb1d64171b645ab4096e994d3ac85b7a3`.
5. Run from `apps/web`; use `NODE_OPTIONS=--conditions=react-server` for apply
   and cleanup so canonical server-only owners are reused.

## Zero-effect plan

```bash
cd apps/web
vercel env run -e production -- pnpm exec tsx scripts/recertify-final-main-media-proof.ts \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE315_IMPLEMENTATION_SHA" \
  --plan
```

Continue only when the receipt has `canaryCountBefore=0`, `applyCount=0`,
`resultClass=zero_effect_plan`, `state=code_deployed`, and the OVE-315 digest.

## One replacement apply

Run exactly once after the zero-effect plan and two exact deployment read-backs
agree:

```bash
cd apps/web
NODE_OPTIONS=--conditions=react-server vercel env run -e production -- \
  pnpm exec tsx scripts/recertify-final-main-media-proof.ts \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE315_IMPLEMENTATION_SHA" \
  --apply \
  --approval-digest 76643a09f3636efdb44cf03d257181d49726e168bf6ad138087b44f06e948406
```

Terminal success requires `applyCount=1`, one derivative on
`https://media.over.garden`, no public original/quarantine capability, no EXIF,
authoritative original absence, no another-user effect, cleanup twice,
`resultClass=verified_derivative_only`,
`cleanupClass=authoritative_absent_twice`, and `state=cleaned`.

## Wait-safe commands

Status is read-only:

```bash
vercel env run -e production -- pnpm exec tsx scripts/recertify-final-main-media-proof.ts \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE315_IMPLEMENTATION_SHA" --status
```

Cancel records only the local task-scoped cancellation fence:

```bash
vercel env run -e production -- pnpm exec tsx scripts/recertify-final-main-media-proof.ts \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE315_IMPLEMENTATION_SHA" --cancel
```

## Cleanup and stop rule

Cleanup may remove only the deterministic OVE-315 synthetic owner and its
single media row/object pair:

```bash
NODE_OPTIONS=--conditions=react-server vercel env run -e production -- \
  pnpm exec tsx scripts/recertify-final-main-media-proof.ts \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE315_IMPLEMENTATION_SHA" --cleanup
```

Timeout, identity drift, partial processing, unsafe evidence, provider
uncertainty, or cleanup uncertainty is terminal failure. Run cleanup and
authoritative read-back, but never run a second OVE-315 apply. A further effect
would require another issue, zero-effect plan, and fresh explicit approval.

## Closeout

Save only the closed receipt fields documented by the OVE-302 harness. Require
focused tests, lint, typecheck, the full test suite, build, `git diff --check`,
exact-head CI, feature-SHA containment, `pnpm mainline:closeout:check`, two
deployment read-backs, two Linear read-backs, and the saved-description digest
before either OVE-315 or OVE-302 is moved to Done.
