# OVE-302 final-main derivative-only media proof

This runbook operates one disposable, non-personal production canary after its
implementation commit is contained in current `origin/main` and the canonical
Vercel deployment is `READY` at that exact SHA. It proves the existing media
path; it does not create a second product implementation.

Canonical behavior remains owned by:

- `apps/web/scripts/prove-r2-media-lifecycle-provider.ts`
- `apps/web/src/server/media/media-repository.ts`
- `apps/web/src/server/media/processor.ts`
- `docs/MEDIA_LIFECYCLE.md`

The harness creates an official Better Auth synthetic session without sending
email, calls the deployed journal and media routes, uploads one generated JPEG
with non-location EXIF, and requires one stripped WebP derivative. It records
only the closed OVE-302 receipt; synthetic credentials, cookies, identities,
content, URLs, provider payloads, object keys, and request metadata are never
printed or retained in the receipt.

## Immutable authorization

Approved normalized operation:

```text
OVE-302|production|create one owner-scoped disposable journal-media canary, upload one generated non-personal image into private quarantine, process one stripped WebP derivative, verify the original is absent, and erase the exact canary|baseline:c45ddb639bc1fdff15ca124eda736f2cd9af7ce7|one-canary|cleanup-required
```

Approved SHA-256:

```text
4d08b06ed2ba3de1c5de0152245d4e245d96f3d0ba7b39eeda982daed0517c42
```

This approval permits one apply only. Environment, implementation SHA,
deployment SHA, plan digest, production database target, task-canary count, or
provider drift invalidates it before mutation.

## Consumed authorization receipt

The one approved OVE-302 apply was executed against contained main SHA
`1618e828d77e11dc6150a04991ecf461f667a4e6`. It failed closed before any media
route or media effect because the recovery drill selected an insecure local
Better Auth cookie name while the canonical authority was HTTPS. The redacted
failed receipt has evidence digest
`7b33d31487065afdab8d7c639bdb20aec7add752d5e5b0e0d3176e29c7a1cd4b`.

Separate cleanup proved authoritative database and object absence twice; its
evidence digest is
`c92c103ded90a382f342c0a69943666070b6255bf12652f5acf6d81c3f441022`.
The authentication correction is contained in main SHA
`660ddb7290a74b43f101fb58a372cc8c377fe8ed`, whose zero-effect plan has
evidence digest
`a4241cb782a7657470f53a099ab7711bc30c325ae9c8f3db01df951e0f820058`.

The OVE-302 authorization is permanently consumed. Never run its apply command
again. OVE-315 and `docs/runbooks/OVE_315_MEDIA_CANARY_RECOVERY.md` own the one
separately approved replacement attempt.

## Preconditions

1. Fetch `origin/main` and record the contained OVE-302 implementation SHA.
2. Prove that SHA is an ancestor of `origin/main`.
3. Read the official Vercel deployment twice and require `READY`, Production,
   the canonical `over.garden` aliases, and the same SHA.
4. Use `vercel env run -e production`; never copy production secrets to a
   receipt, log, Linear, or chat.
5. Run from `apps/web`. Apply and cleanup require
   `NODE_OPTIONS=--conditions=react-server` so the harness reuses canonical
   server-only cleanup code.

## Read-only plan

The plan performs no canary or provider mutation. It must return
`resultClass=zero_effect_plan`, `canaryCountBefore=0`, `applyCount=0`,
`state=code_deployed`, and the approved digest.

```bash
cd apps/web
vercel env run -e production -- pnpm exec tsx scripts/recertify-final-main-media-proof.ts \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE302_IMPLEMENTATION_SHA" \
  --plan
```

Stop if the receipt is not an exact zero-effect plan. Resolve residue only with
the task-scoped cleanup command, then obtain a fresh read-only plan. Do not
broaden selectors or inspect a real gardener record.

## One approved apply

Run this command exactly once after the plan and exact deployment read-back
agree. The database advisory lock admits one contender; a concurrent loser is
bounded and performs no effect.

```bash
cd apps/web
NODE_OPTIONS=--conditions=react-server vercel env run -e production -- \
  pnpm exec tsx scripts/recertify-final-main-media-proof.ts \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE302_IMPLEMENTATION_SHA" \
  --apply \
  --approval-digest 4d08b06ed2ba3de1c5de0152245d4e245d96f3d0ba7b39eeda982daed0517c42
```

Terminal pass requires all of the following in the same bounded run:

- one official-session owner-scoped private journal-media canary;
- one private-quarantine source upload;
- one processed derivative on `https://media.over.garden`;
- public original and public quarantine paths both non-2xx;
- public WebP with no EXIF;
- authoritative quarantine original absence;
- no another-owner effect;
- cleanup twice with zero database and object residue;
- `resultClass=verified_derivative_only`,
  `cleanupClass=authoritative_absent_twice`, and `state=cleaned`.

## Wait-safe controls

The status command is read-only and remains independent of the apply lock:

```bash
vercel env run -e production -- pnpm exec tsx scripts/recertify-final-main-media-proof.ts \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE302_IMPLEMENTATION_SHA" --status
```

The cancel command records only a local task-scoped cancellation fence. It
does not delete or mutate a provider object:

```bash
vercel env run -e production -- pnpm exec tsx scripts/recertify-final-main-media-proof.ts \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE302_IMPLEMENTATION_SHA" --cancel
```

## Recovery and cleanup

Timeout, provider uncertainty, partial processing, unsafe evidence, or cleanup
uncertainty is terminal failure. Recovery may remove only the deterministic
OVE-302 synthetic owner and its one media row/object pair. It must cleanup twice
and prove absence twice:

```bash
NODE_OPTIONS=--conditions=react-server vercel env run -e production -- \
  pnpm exec tsx scripts/recertify-final-main-media-proof.ts \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE302_IMPLEMENTATION_SHA" --cleanup
```

After an uncertain or partial apply, never run a second apply under the current
approval. Save the failed redacted receipt, run cleanup, obtain a fresh
zero-effect plan, and require a new explicit authorization before any new
canary effect. A clean replay of an already completed tuple returns
`already_cleaned` without another effect.

## Closeout receipt

The only allowed terminal fields are:

```text
version, environment, implementationSha, planDigest, authorizationDigest,
canaryCountBefore, applyCount, resultClass, cleanupClass, durationMs, state,
evidenceDigest
```

Before Linear `Done`, run focused tests, lint, typecheck, the full test suite,
build, `git diff --check`, CI, main containment, and
`pnpm mainline:closeout:check`. Save the exact receipt and its digest, compare
the saved Linear description SHA-256, and read status, relations, and the
terminal comment back twice.
