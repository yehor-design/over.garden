# OVE-316 R2 path-style recovery

OVE-316 restores the canonical Cloudflare R2 upload addressing contract after
the one OVE-315 production canary stopped before PUT. It owns one bounded Vercel
production environment correction, one exact-main deployment with fail-closed
read-back, and—only after a fresh explicit approval—one disposable
owner-scoped journal-media canary followed by authoritative cleanup twice.

Never use the consumed OVE-302 or OVE-315 authorization digests. Never select a
real gardener. Never run more than one OVE-316 apply.

## Immutable authorization plan

Normalized operation awaiting explicit maintainer approval:

```text
OVE-316|production|restore R2_FORCE_PATH_STYLE=true for the Vercel production environment, deploy one exact main SHA with a fail-closed path-style configuration read-back, create one owner-scoped disposable journal-media canary, upload one generated non-personal image into private quarantine, process one stripped WebP derivative, verify the original is absent, and erase the exact canary|prior-failed-recovery:1c6e4a6aa801e6f29729cad367e76c5bc4bc56205c1705989b0234e7ec15c591|zero-residue:b5c220675bb58bd76a828720edec8470fe3a26092664f6b1a461d28f145923de|one-config-correction|one-canary|cleanup-required
```

SHA-256:

```text
aadd6156c440c020fd435178b1631e20359c52119e6ea081663c1e495beb101d
```

The digest is an authorization boundary, not evidence of approval. Production
environment mutation, corrected production deployment, and canary apply remain
forbidden until the maintainer explicitly approves this exact digest after the
implementation PR and exact-head CI are ready.

## Code and provider preconditions

1. The implementation SHA is contained in current `origin/main`; focused and
   full repository gates and exact-head CI pass.
2. The production build guard requires the exact canonical `R2_ENDPOINT` and
   exact `R2_FORCE_PATH_STYLE=true`. Missing, `false`, `1`, whitespace, or
   endpoint drift fails the production build closed.
3. `/api/document-mutation-admission/readback` returns only the closed
   `overgarden.r2-addressing.v1` receipt with `environmentClass=production`,
   `addressingClass=path_style`, and `enforcement=verified`.
4. Official Vercel read-back proves the changed variable is scoped only to
   Production. Preview and Development values are not mutated.
5. Two official deployment read-backs agree on `READY`, Production, canonical
   aliases, and the exact contained SHA.
6. OVE-316 is In Progress and blocks OVE-315; OVE-315 blocks OVE-302. OVE-284
   remains Done.
7. The active approval digest is the OVE-316 digest above. The harness rejects
   both consumed predecessor digests before lock or effect.

## Read-only configuration proof

Run through the official production environment without changing it:

```bash
cd apps/web
vercel env run -e production -- pnpm run check:r2-addressing -- \
  --environment production \
  --confirm-environment production \
  --read-back
```

The only accepted receipt is:

```json
{
  "schemaVersion": "overgarden.r2-addressing.v1",
  "environmentClass": "production",
  "addressingClass": "path_style",
  "enforcement": "verified"
}
```

The command emits no endpoint, bucket, account identifier, access key, secret,
object key, user identifier, or cookie.

## Zero-effect canary plan

After the corrected exact-main deployment is READY, run the plan before apply:

```bash
cd apps/web
vercel env run -e production -- pnpm run ove316:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE316_IMPLEMENTATION_SHA" \
  --plan
```

Continue only when `canaryCountBefore=0`, `applyCount=0`,
`resultClass=zero_effect_plan`, `state=code_deployed`, and both digest fields
equal the OVE-316 digest.

## One apply

Run exactly once, only within the approved operation:

```bash
cd apps/web
vercel env run -e production -- pnpm run ove316:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE316_IMPLEMENTATION_SHA" \
  --apply \
  --approval-digest aadd6156c440c020fd435178b1631e20359c52119e6ea081663c1e495beb101d
```

Terminal success requires exactly one apply, one processed WebP derivative on
`https://media.over.garden`, no public original or quarantine capability, no
EXIF, authoritative provider absence of the original, no another-owner effect,
cleanup twice, `resultClass=verified_derivative_only`,
`cleanupClass=authoritative_absent_twice`, and `state=cleaned`.

## Wait-safe operations and stop rule

`--status` is read-only. `--cancel` writes only the task-local cancellation
fence. `--cleanup` can remove only the deterministic OVE-316 synthetic owner
and its single media row/object pair. Use the same command form as the plan,
replacing `--plan` with the selected mode.

Timeout, deployment or config drift, boundary drift, partial processing,
unsafe evidence, provider ambiguity, or cleanup uncertainty is terminal. Run
cleanup and authoritative read-back when safe, but never run a second apply. A
new effect requires a new issue, new replay namespace, new zero-effect plan,
and fresh explicit approval.

## Rollback and closeout

If the corrected deployment fails before any canary effect, restore only the
previous production environment value through Vercel, redeploy, and record the
closed refusal receipt. If any canary effect began, cleanup takes priority over
configuration rollback.

Close OVE-316 only after focused tests, lint, typecheck, full tests, build,
`git diff --check`, exact-head CI, exact-SHA main containment,
`pnpm mainline:closeout:check`, two deployment read-backs, the one successful
closed canary receipt, zero-residue cleanup twice, and two authenticated Linear
read-backs. Then close OVE-315 and OVE-302 in dependency order.
