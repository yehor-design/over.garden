# OVE-297 Facebook Login External Cleanup Plan

Status: awaiting exact maintainer approval. This file is the immutable,
byte-exact production plan once its SHA-256 digest and implementation SHA are
approved together.

## Protected outcome

Facebook Login stays unavailable while dormant provider configuration is
retired without stranding a gardener or changing Meta Ads. The production
inventory found no Better Auth `account` row with `providerId='facebook'`, so
the database step is an idempotent zero read-back rather than a user-data
deletion.

This plan never deletes the Meta app. It preserves the app, Webhooks, consent,
Pixel, Conversions API, credential sign-in, and Google sign-in. It changes only
Facebook Login OAuth settings, the three named Vercel Login variables, and the
exact Better Auth Facebook account predicate.

## Approval-bound plan

The literal `$OVE297_IMPLEMENTATION_SHA` token avoids an impossible Git
self-reference: the exact 40-character feature SHA is supplied by the approval
envelope at execution time, while the SHA-256 approval digest covers every byte
of this tracked file. The operator must approve the file digest and the exact
feature SHA as one indivisible pair. Any file-byte, SHA, count, target, or
exclusion drift invalidates approval.

```json ove297-plan-v1
{
  "schema": "overgarden.facebook-login-external-cleanup-plan.v1",
  "issue": "OVE-297",
  "environment": "production",
  "implementationSha": "$OVE297_IMPLEMENTATION_SHA",
  "sourceDigest": "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
  "counts": {
    "facebookAccounts": 0,
    "facebookOnly": 0,
    "facebookWithCredential": 0,
    "facebookWithGoogle": 0,
    "duplicateFacebookOwners": 0
  },
  "inventoryClass": "zero_inventory_proved",
  "databaseTargetClass": "account_provider_id_facebook",
  "metaLoginTargetClass": "facebook_login_product_and_redirects",
  "metaLoginConfigClass": "configured",
  "vercelTargetNames": [
    "FACEBOOK_CLIENT_ID",
    "FACEBOOK_CLIENT_SECRET",
    "FACEBOOK_LOGIN_PUBLIC_READY"
  ],
  "vercelConfigClass": "exact_three_present",
  "targetDigest": "af3ca37f644cf8069cfe8f1a61833cd0a8f25adbba1e3585cb1eda8964f4b24a",
  "metaAdsExclusionDigest": "87df70286de1f9e20184495c35bb10cc34dda4bf616b7ca690689625c8c0daba",
  "mutationOrder": ["meta_login", "vercel_login_env", "database_accounts"]
}
```

## Read-only preflight receipt

- Environment: Vercel project `over-garden`, Production; DigitalOcean Managed
  Postgres cluster `overgarden-postgres-prod-fra1`, database `defaultdb`, schema
  `public`.
- Database inventory class: `zero_inventory_proved`; all five counts in the
  plan are zero; transaction duration `328ms`.
- Better Auth token boundary: access, refresh, and ID tokens are columns of the
  same `account` row. Zero Facebook account rows therefore proves zero stored
  Facebook provider token rows without selecting any token.
- Meta Login class: `configured`; exact Meta app identity digest
  `1cd65eb62cc5d34c979a9a9891d0a94443250540d900537e2e5a3f1cc08576b2`;
  preflight config digest
  `9e0d7a6707a389c75bdbc8578f12c723a15a717ee2d19438b388e07d491b689e`;
  valid redirect URI count `0`.
- Vercel Login class: `exact_three_present`; only names are recorded.
- Meta Ads boundary: `login_app_has_no_added_marketing_api_or_app_events`;
  provider-separation digest
  `1b9136c35921fd42f8b5e619b983e05c0f3ec8ef5dc74fc978ba82706923347d`;
  all five named Meta Ads Vercel variables are absent.
- Evidence contains counts, bounded classes, durations, digests, and target
  names only. It contains no identity, email, subject, token, cookie, callback
  value, secret, connection value, or database row.

## Canonical target digest payload

`targetDigest` is SHA-256 over the UTF-8 bytes of compact `JSON.stringify` for
this property order:

```json
{
  "schema": "overgarden.facebook-login-external-cleanup-target.v1",
  "environment": "production",
  "database": {
    "provider": "digitalocean_managed_postgres",
    "cluster": "overgarden-postgres-prod-fra1",
    "database": "defaultdb",
    "schema": "public",
    "table": "account",
    "predicate": { "providerId": "facebook" }
  },
  "meta": {
    "appTargetDigest": "1cd65eb62cc5d34c979a9a9891d0a94443250540d900537e2e5a3f1cc08576b2",
    "preflightConfigDigest": "9e0d7a6707a389c75bdbc8578f12c723a15a717ee2d19438b388e07d491b689e",
    "action": "disable_client_and_web_oauth_preserve_app_and_webhooks",
    "redirectCount": 0
  },
  "vercel": {
    "projectId": "prj_Tm5HXFEPqc46StpIfsoKjU9GtHBy",
    "environment": "production",
    "names": [
      "FACEBOOK_CLIENT_ID",
      "FACEBOOK_CLIENT_SECRET",
      "FACEBOOK_LOGIN_PUBLIC_READY"
    ]
  },
  "mutationOrder": ["meta_login", "vercel_login_env", "database_accounts"]
}
```

## Canonical Meta Ads exclusion digest payload

`metaAdsExclusionDigest` is SHA-256 over the UTF-8 bytes of compact
`JSON.stringify` for this property order:

```json
{
  "schema": "overgarden.facebook-login-meta-ads-exclusion.v1",
  "sourceDigest": "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
  "sourceClass": "unchanged_from_ove296_baseline",
  "providerSeparationDigest": "1b9136c35921fd42f8b5e619b983e05c0f3ec8ef5dc74fc978ba82706923347d",
  "providerSeparationClass": "login_app_has_no_added_marketing_api_or_app_events",
  "vercelProductionNamesAbsent": [
    "NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED",
    "NEXT_PUBLIC_META_PIXEL_ID",
    "META_CONVERSIONS_API_ACCESS_TOKEN",
    "META_CONVERSIONS_API_TEST_EVENT_CODE",
    "META_CONVERSIONS_API_GRAPH_VERSION"
  ],
  "preservedClasses": [
    "meta_app",
    "webhooks",
    "consent",
    "pixel",
    "conversions_api"
  ]
}
```

## Approved mutation sequence

Execute once, in this exact order, with settle-once read-back after every step:

1. **Meta Login.** In the existing `over.garden` Meta app, change Client OAuth
   Login and Web OAuth Login from enabled to disabled. Keep the app and Webhooks
   intact. Valid OAuth redirect URI count is already zero; if it changes, stop
   and require a new plan. Read back both OAuth controls disabled and redirect
   count zero before continuing.
2. **Vercel Login env.** Remove exactly `FACEBOOK_CLIENT_ID`,
   `FACEBOOK_CLIENT_SECRET`, and `FACEBOOK_LOGIN_PUBLIC_READY` from Production.
   Do not remove, add, or edit any other variable. Read back exact absence, then
   require a new READY production deployment for the containing main SHA.
3. **Database account boundary.** Run the repository operator in
   `apply-database` mode with the exact plan, approval receipt, target digest,
   exclusion digest, environment, and implementation SHA. The expected effect
   is `already_zero`; any nonzero or drifted aggregate stops and rolls back.

No step retries automatically. Partial external success is
`failed_verification`, never `completed`; Facebook stays unavailable and a new
approved recovery plan owns any follow-up.

## Prepared verification commands

Run from `apps/web`. Never paste a provider credential into a command, file,
receipt, issue, or chat.

```bash
pnpm exec tsx scripts/verify-facebook-login-retirement.ts \
  --expected-sha "$OVE297_IMPLEMENTATION_SHA" \
  --deployment-class ready_exact_sha

pnpm facebook-login:external-cleanup \
  --mode inventory \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE297_IMPLEMENTATION_SHA" \
  --source-digest d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152

pnpm facebook-login:external-cleanup \
  --mode apply-database \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE297_IMPLEMENTATION_SHA" \
  --source-digest d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152 \
  --plan-file ../../docs/runbooks/OVE_297_FACEBOOK_LOGIN_EXTERNAL_CLEANUP_PLAN.md \
  --approval-file "$OVE297_APPROVAL_FILE" \
  --current-target-digest af3ca37f644cf8069cfe8f1a61833cd0a8f25adbba1e3585cb1eda8964f4b24a \
  --current-meta-ads-exclusion-digest 87df70286de1f9e20184495c35bb10cc34dda4bf616b7ca690689625c8c0daba

pnpm facebook-login:external-cleanup \
  --mode verify \
  --environment production \
  --confirm-environment production \
  --implementation-sha "$OVE297_IMPLEMENTATION_SHA" \
  --source-digest d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152
```

## Approval receipt shape

Approval is valid only when the maintainer explicitly approves the exact plan
SHA-256, exact 40-character implementation SHA, Production environment, all five
counts, target digest, and Meta Ads exclusion digest. The prepared local file
must contain exactly these fields and no secret or free-form approval text:

```json
{
  "status": "approved",
  "planDigest": "<exact-plan-sha256>",
  "implementationSha": "<exact-feature-sha>",
  "environment": "production",
  "counts": {
    "facebookAccounts": 0,
    "facebookOnly": 0,
    "facebookWithCredential": 0,
    "facebookWithGoogle": 0,
    "duplicateFacebookOwners": 0
  },
  "targetDigest": "af3ca37f644cf8069cfe8f1a61833cd0a8f25adbba1e3585cb1eda8964f4b24a",
  "metaAdsExclusionDigest": "87df70286de1f9e20184495c35bb10cc34dda4bf616b7ca690689625c8c0daba"
}
```

## Stop, rollback, and cleanup

Stop before the first mutation on missing approval, byte drift, SHA drift,
environment drift, any nonzero Facebook-only count, duplicate ambiguity,
identity-bearing evidence, or inability to prove Meta Ads separation. Stop after
any partial provider effect without retrying or claiming cleanup.

Rollback is forward-fix only. Keep Facebook unavailable. Do not re-enable OAuth
or restore Vercel Login secrets automatically. Credential and Google regressions
are repaired through a new reviewed change; any external recovery uses a newly
approved exact plan.

After verified completion, delete only ephemeral local approval/session files,
retain the redacted tracked receipt, prove exact-main containment and READY
deployment, run `pnpm mainline:closeout:check`, and complete authenticated Linear
read-back before `Done`.
