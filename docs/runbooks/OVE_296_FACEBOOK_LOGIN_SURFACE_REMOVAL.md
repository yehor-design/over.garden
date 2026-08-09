# OVE-296 Facebook Login Surface Removal

Status: binding implementation, verification, deployment, and handoff contract.

## Outcome

OverGarden supports email/password and Google sign-in. Facebook Login is not a
hidden or dormant product option: it is absent from Better Auth registration,
guest and account-method UI, current env templates, readiness checks, current
provider smoke, and current operator guidance.

This slice does not inspect or mutate production account rows, Vercel variables,
Meta app configuration, credentials, or tokens. OVE-297 owns that independently
approved, bounded production-state inventory and cleanup after OVE-296 is live.
Dormant state cannot re-register the provider or block this code-surface closeout.

Consent-first Meta Ads Pixel/CAPI is a separate system. Its runtime files,
configuration names, consent boundary, privacy exclusions, and provider URLs
must remain unchanged.

## Enforceable boundary

`apps/web/src/app/api/auth/[...all]/route.ts` calls the single canonical retired
provider denial before Better Auth, the legacy verification bridge, password
reset admission, or any provider handler.

The denial covers:

- `GET /api/auth/callback/facebook` (including one URL-decoding pass, case, and
  an optional trailing slash);
- `POST /api/auth/sign-in/social` with `provider: "facebook"`;
- `POST /api/auth/link-social` with `provider: "facebook"`.

It returns an empty generic `404` with `Cache-Control: private, no-store`, no
`Set-Cookie`, no redirect/location, no provider authorization URL, no log, and
no account/session/cookie/provider-network effect. Malformed unrelated requests
continue to the existing handler; credential and Google routes retain their
existing behavior.

The denial is not an alternate provider implementation. Do not add provider
SDK imports, credentials, redirect hosts, client controls, readiness flags, or
account-method fields beside it.

## Static retirement receipt

Run from `apps/web`:

```bash
pnpm exec vitest run scripts/verify-facebook-login-retirement.test.ts
pnpm exec tsx scripts/verify-facebook-login-retirement.ts \
  --expected-sha <exact-40-character-implementation-sha> \
  --deployment-class <local_or_ready_exact_sha_class>
```

`FacebookSurfaceRetirementReceiptV1` contains only:

- closed `resultClass` (`removed`, `inconclusive`, or `regressed`), bounded
  `failureClass`, and `scanDurationMs`;
- `sourceDigest`;
- `runtimeReferenceCount` (must be `0` outside the canonical denial and Meta Ads
  allowlists);
- `currentDocReferenceCount` (must be `0` across current auth/config authority);
- `providerRegistrationClass`;
- `GoogleCredentialRegressionClass`;
- `MetaAdsUnchangedClass`;
- exact `sha` and bounded `deploymentClass`;
- `evidenceSafety=counts_digests_and_classes_only`.

The scan has one finite 30-second deadline, aborts on timeout, settles once, and
returns an `inconclusive` receipt with unverified/null inventory fields rather
than making a removal claim. The timeout regression renders the independent
credential/Google controls during the pending scan and proves they remain
enabled.
Do not extend that receipt with paths containing secrets, environment values,
provider subjects, account identifiers, cookies, tokens, callback parameters,
or raw request/response bodies.

## Required local verification

```bash
cd apps/web
pnpm exec vitest run \
  src/lib/auth/facebook-oauth.test.ts \
  src/lib/auth/social-oauth.test.ts \
  src/lib/auth/social-account-policy.test.ts \
  src/app/garden/garden-auth-panel.test.tsx \
  src/app/garden/account-methods-panel.test.tsx
pnpm exec vitest run scripts/verify-facebook-login-retirement.test.ts
pnpm exec playwright test tests/auth-provider-retirement.spec.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

The browser proof must cover Ukrainian, Bulgarian, and Russian guest surfaces;
credential and Google controls remain usable, while no retired provider control
or copy is rendered. It must also prove the three direct stale request classes
return the canonical no-effect denial. Focused unit tests prove the Google URL
allowlist/navigation contract; the exact-SHA production smoke proves the real
Google authorization start after deployment.

## Delivery and production proof

1. Commit on `codex/ove-296-retire-facebook-login`, push the branch, and open a
   reviewed PR. Do not push implementation directly to `main`.
2. Capture the implementation SHA once as `OVE296_IMPLEMENTATION_SHA` after the
   final implementation commit. Do not move or reuse that name for another SHA.
3. Require branch checks and a Vercel preview/build result without bypass.
4. Merge normally, fetch `origin/main`, and prove it contains the exact SHA.
5. Require the canonical Vercel production deployment for the containing main
   SHA to be `READY` and aliased to `over.garden`/`www.over.garden`.
6. Re-run the static receipt with the exact SHA and deployment class, then run
   bounded live GET/POST probes against `https://over.garden`. Retain only status,
   cache/cookie/location booleans, supported-provider UI booleans, source digest,
   exact SHA, deployment id/state/aliases, and elapsed class.
7. From a clean, fetched `main` worktree run
   `cd apps/web && pnpm mainline:closeout:check`.
8. Save the redacted receipt to Linear, read the entire issue and relations back,
   and move OVE-296 to `Done` only after all gates pass.

## Failure gates and rollback

Stop closeout if any runtime or current-doc reference count is non-zero, the
retired provider module/registration remains, any locale renders retired copy,
stale traffic reaches Better Auth, a denial sets a cookie or redirect, Google or
credential behavior regresses, Meta Ads runtime digests drift, CI/build fails,
the exact deployment is not `READY`, aliases do not point at the exact containing
main deployment, or the clean-main closeout/read-back fails.

Rollback is a reviewed forward-fix when credential/Google auth or the canonical
auth route is materially broken. Restore only the regressed supported behavior
while preserving provider removal and the no-effect retired-provider boundary;
do not revert the whole slice if that would restore executable/config/UI paths.
Environment configuration is never a rollback mechanism and must not re-register
the retired provider. Re-run the same focused/full/build/live gates on the fix
SHA and record only bounded evidence classes.
