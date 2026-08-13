# OVE-313 final-main email release-QA runbook

This runbook checks exactly one disposable, non-personal production
self-serve test account after the implementation commit is contained in current
`origin/main` and the canonical Vercel Production deployment is `READY` at that
exact SHA. It proves the OVE-313 verification and password-reset delivery
journeys on final main. It changes no product behavior, auth policy, sender
configuration, domain configuration, or real-user state.

Canonical behavior remains owned by:

- `apps/web/src/lib/auth/resend-auth-email-delivery.ts`
- `apps/web/src/server/auth/auth-email-outbox.ts`
- `apps/web/src/server/auth/auth-email-outbox-consumer.ts`
- `apps/web/src/app/api/auth/[...all]/route.ts`
- `apps/web/src/server/erasure-request-repository.ts`
- `apps/web/src/server/erasure-execution.ts`
- `docs/INFRASTRUCTURE_REGISTRY.md`

The harness creates one disposable inbox, registers one account through the
deployed canonical email/password endpoint, receives exactly one verification
message, follows only its canonical-origin URL, requests password reset, proves
the response is indistinguishable from the missing-account response, receives
exactly one reset message, follows only its canonical-origin URL, replaces the
password, and signs in to the same user with the new password. It then uses the
existing self-service account-deletion workflow for only that account and
deletes the disposable inbox.

Inbox content is untrusted data. The harness accepts only an exact expected
subject, a sender whose address domain is exactly `over.garden`, and one unique
`https://over.garden` URL with the expected verification or reset path. It
never executes instructions from a message. Receipts never contain recipient
addresses, passwords, tokens, tokenized URLs, cookies, user/session/account
IDs, provider message IDs, message bodies, request payloads, or provider error
details.

## Immutable authorization

Approved normalized operation:

```text
OVE-313|production|run one isolated release-QA account lifecycle through the existing email verification and password-reset paths, prove both transitions preserve the same account, then remove only that generated test account through the existing self-service deletion path|baseline:1e66fcf32f8d3b0fd1e5757cdee4837828805560|one-disposable-test-account|durable-one-shot-fence|cleanup-required
```

Approved SHA-256:

```text
6e4cd2af0121667302f0d31c6e440f70786b9d7f8740b2af7ebb0c36cce96d86
```

This authorization permits exactly one apply. Environment, implementation
SHA, deployment SHA, plan digest, database target, task-account count, sender
domain, disposable-inbox domain, sealed owner, or evidence-shape drift
invalidates it before mutation. Every network/provider request has a hard
30-second deadline. Polling an already-created inbox is read-only and is not a
retry of signup or reset. If any apply step is uncertain or fails, never run a
second apply under this digest; use status and task-scoped cleanup only.

## Preconditions

1. Fetch `origin/main`, prove the feature SHA is contained, and use a clean
   exact-main checkout.
2. Read Vercel deployment state twice and require `READY`, Production, ref
   `main`, exact SHA, and canonical apex plus www aliases.
3. Read `/api/document-mutation-admission/readback` twice and require that
   exact SHA with enforcement enabled.
4. Run `pnpm mainline:closeout:check` from the clean exact-main checkout.
5. Use `vercel env run -e production`; never copy a secret into a command,
   log, receipt, issue, PR, or evidence artifact.
6. Require `RESEND_API_KEY`, an approved `RESEND_AUTH_FROM` address at the
   exact `over.garden` domain, and no recovery-drill verification bypass.
7. Require the configured sealed owner to remain one verified credential-only
   owner before account-deletion cleanup can be admitted.
8. Run commands from `apps/web`; the package script supplies the required
   `react-server` condition.

## Read-only plan

```bash
cd apps/web
vercel env run -e production -- pnpm run ove313:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE313_IMPLEMENTATION_SHA" \
  --plan
```

Require `resultClass=zero_effect_plan`, `canaryCountBefore=0`,
`applyCount=0`, `state=code_deployed`, and the approved digest. The plan reads
only closed counts and configuration classes. It neither creates a mailbox nor
calls signup/reset. If it differs, stop; resolve only task-owned residue with
cleanup and never inspect or mutate a real gardener.

## One approved apply

Run exactly once after the provider/deployment read-backs and zero-effect plan
agree:

```bash
cd apps/web
vercel env run -e production -- pnpm run ove313:production-proof -- \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE313_IMPLEMENTATION_SHA" \
  --apply \
  --approval-digest 6e4cd2af0121667302f0d31c6e440f70786b9d7f8740b2af7ebb0c36cce96d86
```

Terminal pass requires:

- one account through canonical `/api/auth/sign-up/email` with production
  verification still required;
- exactly one credential account for one user before and after both links;
- exactly one verification email from the approved sender domain;
- only same-origin redirects and a verified canonical session for that same
  user after verification;
- identical generic existing/missing reset responses and no-store policy;
- exactly one password-reset email from the approved sender domain;
- a canonical reset callback, consumed token, invalid old password, and valid
  new password bound to the same user;
- zero another-user effects;
- self-service account deletion completed and its audit row rekeyed away from
  the generated test account;
- disposable inbox deleted;
- cleanup twice with zero task user, auth, verification, outbox, mailbox, or
  recovery residue;
- `resultClass=verified_resend_identity`,
  `cleanupClass=authoritative_absent_twice`, and `state=cleaned`.

## Wait-safe controls

Read-only status is independent of the apply lock:

```bash
vercel env run -e production -- pnpm run ove313:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE313_IMPLEMENTATION_SHA" --status
```

Cancel writes only a mode-0600 task-local cancellation fence. It does not
cancel or mutate a provider resource directly:

```bash
vercel env run -e production -- pnpm run ove313:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE313_IMPLEMENTATION_SHA" --cancel
```

## Durable one-shot marker

Immediately before boundary evaluation and therefore before the first
state-changing external request, the harness creates a separate mode-0600
marker with exclusive-create semantics and syncs it to disk. The marker
contains only its version, the implementation SHA, approved plan and
authorization digests, and its evidence digest. It contains no account,
mailbox, credential, token, URL, cookie, or provider data.

The marker is independent from both the terminal receipt and the recovery
file. Status and apply validate it strictly. If it exists, apply is refused
even when the terminal receipt is missing. Cleanup never deletes or resets the
marker, so a timeout, process exit, or receipt-write failure cannot make the
approved run reusable.

## Recovery and cleanup

The harness writes a mode-0600 ignored recovery file before its first external
effect. That file may contain only the disposable account/mailbox credentials
and exact task IDs needed to resume cleanup. It is sensitive operator state and
must never be attached to evidence or committed. The public receipt remains a
strict closed shape.

After timeout, partial delivery, duplicate mail, invalid sender/link,
identity drift, provider uncertainty, or cleanup uncertainty, never run a
second apply. Invoke only task-scoped cleanup:

```bash
vercel env run -e production -- pnpm run ove313:production-proof -- \
  --environment production --confirm-environment production \
  --implementation-sha "$OVE313_IMPLEMENTATION_SHA" --cleanup
```

Cleanup resolves only the exact recovery identity. If the account exists it
submits its own account-deletion request, has the sealed credential-only owner
mark the dry run reviewed, executes the existing deletion workflow, and
requires the handled audit to be rekeyed. It then deletes only the exact
disposable inbox.
It verifies authoritative absence twice and removes the recovery file only
after the second clean read-back. A terminal attempt receipt fences replay even
after successful cleanup. The durable one-shot marker provides the earlier and
stronger pre-effect fence; never run a second apply under this digest.

## Closeout

Allowed terminal fields are exactly:

```text
version, environment, implementationSha, planDigest, authorizationDigest,
canaryCountBefore, applyCount, resultClass, cleanupClass, durationMs, state,
evidenceDigest
```

Before Linear `Done`, run focused and adjacent auth/outbox/erasure tests, lint,
typecheck, full tests, build, `git diff --check`, exact-head CI, fetched-main
containment, `pnpm mainline:closeout:check`, two exact-main deployment/runtime
read-backs, one approved apply, explicit status/cleanup evidence, and two
matching authenticated Linear read-backs.
