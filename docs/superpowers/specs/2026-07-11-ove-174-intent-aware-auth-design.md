# OVE-174 Intent-Aware Authentication Design

Status: approved by the founder through the OVE-174 execution request and the Linear specification
Date: 2026-07-11
Owner: founder

## Problem

OverGarden currently keeps public reading open, but guest mutations use several
unrelated authentication paths. Comment and bookmark POSTs expose unsigned
target and return parameters on `/garden`; the public shell hides create entry
points from guests; lineage follow controls disappear entirely; and social
OAuth does not consistently honor the same post-auth destination as email
sign-in. A guest can therefore lose the exact action that caused authentication,
while malformed return values and raw identifier bundles have too much room to
cross the auth boundary.

## Decision

Implement one typed, short-lived, authenticated-encryption contract for every
guest mutation intent. The browser-visible token is opaque. Its decrypted
payload contains only an allowlisted action, one validated internal return
location, an optional bounded public target, issued/expiry timestamps, and a
version. It never contains form drafts, journal text, email, invite material,
location, credentials, private object data, or analytics metadata.

The flow has four bounded units:

1. `auth-intent-contract.ts` owns action/target enums, route and anchor
   allowlists, length limits, and deterministic resume destinations.
2. `auth-intent-token.ts` encrypts and authenticates the contract with
   AES-256-GCM using a domain-separated key derived from the existing Better
   Auth secret. No new deploy secret is introduced.
3. `/auth/intent` renders the responsive sign-in surface and
   `/auth/intent/resume` validates the token and authenticated session before
   redirecting to the precise safe control.
4. Shared intent triggers connect public engagement, lineage follow, claim,
   shell create-object/create-entry, save, and publish entry points to that
   boundary while mutation handlers continue to authenticate and authorize
   independently.

## Intent Contract

Supported actions are `comment`, `bookmark`, `follow`, `claim`,
`create_object`, `create_entry`, `save`, and `publish`.

Supported target kinds are `journal`, `object`, `profile`, and `collection`.
Each target carries one public slug, handle, or UUID-shaped identifier with an
explicit maximum length. A target is optional for create entry points and is
required when the interrupted control belongs to a public resource.

Return locations are same-origin relative URLs only. The path must match a
known public or workspace route. Query keys are filtered through a small
allowlist for public filters, tabs, cursors, engagement state, and fixture-only
scenario selection; values are bounded and control characters are rejected.
Anchors are action-specific (`comments`, `engagement-bookmark`,
`lineage-follow`, `lineage-claim`, `first-entry-composer`, or `entry-publish`).
Absolute URLs, protocol-relative URLs, credentials, backslashes, encoded path
confusion, unknown routes, unknown query keys, and oversized values fail
closed.

Tokens use a versioned `v1.iv.ciphertext.tag` format, a fifteen-minute lifetime,
and authenticated encryption. Expired, malformed, or modified tokens never
reach a mutation or arbitrary redirect.

## Interaction Model

Reading and navigation never open authentication. A guest explicitly invokes
a mutation control first. Desktop uses a compact dialog-like dedicated auth
surface inside the shared shell; mobile uses the same route as a bottom-sheet
composition so back navigation, cancel, OAuth callbacks, and accessibility are
predictable without introducing a second modal state machine.

The surface names the interrupted action, explains that the current public
page remains available, provides email and configured social providers, and
offers a clear cancel link back to the validated route. Existing-account and
provider-linking recovery remain delegated to the current Better Auth and
account-link policy.

After successful auth, `/auth/intent/resume` validates both token and session.
It does not mutate from GET. Instead it returns to the exact route, adds only a
safe resumed-action enum, and focuses the intended control. The user confirms
the mutation with the normal POST or Server Action, preserving CSRF,
authorization, write-eligibility, ownership, disclosure, and idempotency
checks. This is intentionally safer than replaying a bookmark, follow, claim,
save, or publish as a callback side effect.

Cancel returns to the original readable page. Failed auth stays on the auth
surface with the same opaque token. Expired or invalid intents render a bounded
recovery state with links to the original safe destination when it can still be
derived, otherwise the public feed. There is no redirect loop. A target that is
later deleted, gone, private, or no longer permitted is handled by the target
route or mutation authorization rather than leaking existence through the
generic auth layer.

## Entry-Point Coverage

- Comment and bookmark forms redirect signed-out visitors through the shared
  encrypted intent instead of unsigned `/garden` parameters.
- Public lineage objects show a follow intent to guests and preserve the exact
  lineage control; signed-in write-eligible users keep the canonical Server
  Action.
- The guest shell exposes create-object and create-entry intent actions without
  blocking any public route.
- Invitation claim receives the signed invite in a client-only URL fragment,
  validates it through a same-origin handoff, and keeps it in an encrypted
  HttpOnly cookie. The auth intent and cancel route carry only the clean claim
  path, while claim forms read the token server-side instead of rendering it.
- Save and publish controls receive stable focus markers and intent start
  helpers for the supported workspace routes; their canonical mutations retain
  existing server authorization.

## Fixtures And Evidence

OVE-187 gains an intent evidence section rather than fake users or credentials.
It links stable scenario starts and safe resumed destinations for every action
class and records only an opaque fixture scenario ID. Coverage includes guest,
already-authenticated, cancel, expired/modified, deleted 410, now-private,
insufficient-permission, filters/cursors/anchors, profile targeting, and real
IndexedDB draft-retention states. Synthetic actors remain credential-free.

The visual gate uses the captured Drive2 journal action region, an OverGarden
before state, matched desktop and 320px after states, and one side-by-side
comparison. Browser proof exercises Comment, Bookmark, Follow, both create
entry points, cancel, invalid/expired recovery, keyboard focus, back navigation,
and zero horizontal overflow or console errors.

## Security And Privacy Invariants

- The auth token is opaque, authenticated, expiring, and derived from the
  existing production-required Better Auth secret.
- Mutation endpoints never trust an intent as authorization and never mutate
  on resume GET.
- Public read routes remain available without session creation.
- Auth URLs, screenshots, fixture output, analytics, logs, and Linear evidence
  contain no draft body, private object data, email, invite token, precise
  location, media key, credentials, or raw identifier bundle.
- No production fixture capability, shared test credential, database schema, or
  new secret is added.

## Rejected Alternatives

- Unsigned `returnTo` and target query parameters: easy to implement, but they
  preserve the current open-redirect and tampering surface.
- A server database table for pending intents: unnecessary persistence,
  retention, cleanup, and privacy burden for a fifteen-minute handoff.
- Automatic mutation from the OAuth callback: turns a GET into a side effect
  and weakens independent authorization and user confirmation.
- One modal per feature: duplicates auth/error/back-navigation logic and drifts
  across desktop and mobile.
- Storing composer drafts in the intent: directly violates the bounded auth
  contract; local draft persistence remains the composer responsibility.
