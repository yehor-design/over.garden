# OVE-297 Facebook Login External Cleanup Receipt

Status: `completed`.

This is the single docs-only completion of the predeclared receipt after the
approved provider operation. It keeps the originally captured
`OVE297_IMPLEMENTATION_SHA`, did not repeat a provider mutation, and contains
only counts, durations, bounded classes, digests, exact SHA/deployment
identities, and cleanup classes.

## Preflight

- Implementation SHA: `08a012d5f3fa08bcbe0f26f5c3ccea478370ba55`.
- Source digest:
  `d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152`.
- Production aggregate class: `zero_inventory_proved`.
- Production counts: `facebookAccounts=0`, `facebookOnly=0`,
  `facebookWithCredential=0`, `facebookWithGoogle=0`,
  `duplicateFacebookOwners=0`.
- Aggregate read-back duration: `328ms`.
- Meta Login preflight class: `configured`; redirect count `0`; target identity
  and config are retained as SHA-256 digests only in the immutable plan.
- Vercel Login preflight class: `exact_three_present`; no values retained.
- Meta Ads exclusion class:
  `login_app_has_no_added_marketing_api_or_app_events`; five named Meta Ads
  Vercel variables absent; OVE-296 source class unchanged.
- Target digest:
  `af3ca37f644cf8069cfe8f1a61833cd0a8f25adbba1e3585cb1eda8964f4b24a`.
- Meta Ads exclusion digest:
  `87df70286de1f9e20184495c35bb10cc34dda4bf616b7ca690689625c8c0daba`.
- Approval: exact plan SHA-256, implementation SHA, Production environment,
  five zero counts, target digest, and Meta Ads exclusion digest approved
  together by the maintainer.

## Terminal receipt

- Exact plan SHA-256:
  `3645cd4550005320bd2807fb0adcd32e89b8b870551deda6fd4d60380822c21a`.
- Maintainer approval class: `exact_tuple_approved`.
- Meta Login post-apply class:
  `client_oauth_disabled_web_oauth_disabled_redirect_count_zero`; the Meta app
  and Webhooks remain present, while Marketing API and App Events remain not
  added.
- Meta Login authoritative read-back duration class: `under_30000ms`.
- Vercel Login post-apply class: `exact_three_absent`; the five named Meta Ads
  variables also remain absent.
- Vercel name-only authoritative read-back duration: `1185ms`.
- Database effect class: `already_zero`.
- Database post-apply verification class: `zero_inventory_proved`; independent
  verify duration `332ms`, independent inventory duration `335ms`.
- Database post-apply counts: `facebookAccounts=0`, `facebookOnly=0`,
  `facebookWithCredential=0`, `facebookWithGoogle=0`,
  `duplicateFacebookOwners=0`.
- Meta Ads preservation class: `unchanged_from_ove296_baseline`; exclusion
  digest:
  `87df70286de1f9e20184495c35bb10cc34dda4bf616b7ca690689625c8c0daba`.
- Credential/Google regression class: `credential_and_google_preserved`;
  production read-back showed email and password controls, the Google control,
  and HTTPS authorization at the bounded `accounts.google.com` host, with no
  Facebook control or copy.
- Retired-route live class: callback, sign-in, and link probes each returned an
  empty `404` with `private, no-store`, no cookie, and no redirect.
- Containing main SHA:
  `b90ea4189f7c42e4359c9549acb28140f8a98d9d`; it contains implementation SHA
  `08a012d5f3fa08bcbe0f26f5c3ccea478370ba55`.
- Vercel deployment id: `dpl_5Esek568nRsmrq2dpCnzZBbaumqP`; exact deployed
  Git SHA `b90ea4189f7c42e4359c9549acb28140f8a98d9d`; target `production`; state
  `READY`; canonical alias class `apex_and_www_present`.
- Main CI run: `31346239246`; class `terminal_success`.
- Clean-main closeout class: `passed` on the containing main SHA.
- Linear saved-description SHA-256:
  `4a940d9c99bb98858c1adf2630116ffb1a231f7be0f7349ab09bd0369ef596f2`;
  relation read-back class `parent_OVE_284_blockedBy_OVE_296_blocks_OVE_292`.
- Cleanup class:
  `ephemeral_approval_deleted_and_browser_session_finalized`.

The tracked receipt is delivered by a docs-only follow-up. Its final merge,
current-main containment, CI/deployment state, and Linear `Done` read-back are
recorded in Linear after that merge so this artifact does not claim a
self-referential commit identity.

The completed receipt must never include an account row, user identifier, email,
provider subject, token, cookie, callback value, secret, connection value,
precise location, request body, or raw provider response.
