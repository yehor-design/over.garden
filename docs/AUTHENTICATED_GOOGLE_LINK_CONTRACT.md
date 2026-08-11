# Authenticated Google Link Contract

- Status: OVE-294 production-inert decision canon
- Contract: `ove294.nativeGoogleLink.v1`
- Pinned dependency: Better Auth and `@better-auth/core` `1.6.25`
- Implementation owner: OVE-295
- Production migration and live-proof owner: OVE-298

## Decision

OverGarden uses Better Auth's native authenticated `linkSocial` redirect flow
for explicit Google account linking. The installed implementation already owns
the security protocol: session admission, cryptographically protected and
nonce-bound OAuth state, PKCE, expiry, callback parsing, and the initiating
account reference. OverGarden must not add a companion claim table, HMAC
wrapper, manually parsed state, secondary timestamp/skew protocol, or a
redundant direct-idToken hook while this pinned proof remains valid.

The decision command is:

```bash
cd apps/web
pnpm exec tsx scripts/native-google-link-contract.ts --check
# After `pnpm build`, also prove the emitted server/static artifacts:
pnpm exec tsx scripts/native-google-link-contract.ts --check --build-output
```

It returns exactly one bounded result:

- `native_google_link_supported`: every pinned source, app boundary, and
  runtime-isolation assertion passed.
- `inconclusive`: at least one source, version, semantic, deadline, or
  isolation assertion drifted. This blocks OVE-295 until a fresh decision is
  made.

The command reads local installed source only. It performs no provider call,
OAuth exchange, account mutation, cookie mutation, database mutation,
deployment, or production-state read.

## Proved Native Protocol

1. `POST /link-social` uses Better Auth `sessionMiddleware`. An unauthenticated
   caller cannot initiate a link.
2. The endpoint passes the initiating session's `{userId, email}` to
   `generateState`; caller-supplied identity is not accepted as the link owner.
3. OverGarden is stateful because Better Auth has a database. With no
   `storeStateStrategy` override, pinned `create-context.mjs` selects the
   `database` strategy.
4. That strategy stores the state payload in the verification table and binds
   the browser with a signed state cookie. The callback state must equal both
   the stored `oauthState` nonce and the signed cookie value. Successful parse
   consumes both.
5. `generateState` creates a 128-character PKCE verifier and a native expiry of
   ten minutes. Google authorization requires the verifier; the callback sends
   it to the authorization-code exchange. Expired state is rejected.
6. The callback calls `parseState` before the provider code exchange. The link
   branch reads and writes `link.userId` from that protected state.
7. If account A initiates and account B becomes the current browser session
   before callback, the provider account can only target initiating A. B may
   claim no success from the redirect: B's server-side `listUserAccounts`
   projection must independently show Google for B.
8. Ordinary Google sign-in/sign-up calls `generateState` without `link`; it is
   a distinct authority and is not converted into an explicit-link callback.
9. OverGarden configures Google with `disableIdTokenSignIn: true`. In the pinned
   Google provider this makes `verifyIdToken` return false. The direct-idToken
   branch rejects before provider user-info lookup and before account writes.
10. Facebook is not registered. The provider set is exactly Google for social
    auth, alongside ordinary email/password auth.

## Pinned Source Integrity

The checker fails closed when any critical digest changes, even if the package
version string does not. Digests are SHA-256 over the installed file bytes.

| Source class                         | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| Better Auth package manifest         | `ff4fdd5dec97214dcdccca86cfc77ff7afbf9ec1a88ebdc348a2dd4c9aefcd0f` |
| `@better-auth/core` package manifest | `d2a4464bdf7f6f6632b54bde765f2cc815c0e69443151882efffdfb2d90d845f` |
| App lockfile                         | `e3e2bba7d986e34d2028b1f86c80a1ff5cc5ff514025d36d4a7728f0568c16fa` |
| `linkSocial` route                   | `cc51373d3419e06aadfc2a69345f87342c969e28458c920d743e26e4dac6610b` |
| OAuth state construction             | `f2e9046f4df819c7923407cd56eca9a4a0765298a4b561436d36c57305530509` |
| Generic state protection             | `66c5447cf34b9a9f0ba69be8834c8a5f44a52ac2fad7ae2d53e9a43f80e988d5` |
| OAuth callback route                 | `b5aa48bb54ac67479fbd4a4008574a691d2e38d70f4be9e4af527f930b7273f3` |
| Ordinary social sign-in route        | `f46306c831e87e4fd185e47f97925c72e8484b75bcd9535f19046595ff9604eb` |
| Better Auth context selection        | `f0b2703838a4f5a190932936ecea080abdd76d393a669d851bb75ea48e9e4b41` |
| Google provider                      | `400593d0033bbcc6f175e37b9af130f9caa13cf1d05211f2c48d380e16fb6c49` |
| Native account schema                | `3feb6a54d6fc71515eb0cd657bad0c28e3126a6a926b1d623b0fd29bd3c9f5fb` |

These digests are evidence identifiers, not secret-derived values. The receipt
contains no credential, token, cookie, callback parameter, raw user identity,
private content, request metadata, or precise location.

## Deliberate Native Gap and OVE-295 Handoff

Better Auth's native account schema indexes `userId` but declares no compound
uniqueness for either semantic identity boundary. Application enablement is
therefore incomplete until OVE-295 owns all of the following in one
transactional, tested slice:

1. A SELECT-only aggregate preflight for duplicate Google
   `("providerId", "accountId")` groups and duplicate Google
   `("userId", "providerId")` groups. Evidence is counts/classes only; raw
   provider subjects and user identifiers are forbidden.
2. An additive unique index ensuring one Google provider subject belongs to at
   most one OverGarden user:
   `("providerId", "accountId") WHERE "providerId" = 'google'`.
3. An additive unique index ensuring one OverGarden user has at most one Google
   account:
   `("userId", "providerId") WHERE "providerId" = 'google'`.
4. Real-PostgreSQL contention proof, including 32 concurrent attempts, that
   produces one canonical row or one existing-row outcome and no identity
   merge.
5. Authoritative post-callback account-method read-back for the current
   authenticated session. Redirect query state is never success evidence.
6. Generic, localized conflict/recovery behavior that never discloses which
   account already owns a Google subject.

OVE-298 then owns the approved production preflight, migration, exact-SHA
deployment, live two-account proof, replay, rollback evidence, and cleanup.

## Concurrency and Session-Switch Model

The protected-state owner is immutable for one callback. The browser's current
session may change while the provider is open, but that does not relabel the
database write. The UI decision is separate:

- initiating owner still current + authoritative methods include Google:
  success may be rendered;
- a different owner is current: no success claim, even if callback redirected
  normally;
- authoritative methods do not include Google: recoverable failure, regardless
  of query parameters;
- uniqueness conflict: generic conflict class, zero merge, zero second row.

This makes provider redirect state a transport signal, not an identity or
success authority.

## Runtime Isolation and Recovery

The decision artifact lives only under `apps/web/scripts/` and this document.
The checker scans runtime source roots and requires zero imports or references
from app routes, pages, components, server modules, proxy, or service-worker
code. With `--build-output`, it additionally scans the emitted Next.js server
and static artifacts and fails closed if the build is absent or contains the
decision artifact. It also requires zero task-specific custom-claim protocol
markers.

Source traversal is bounded to 30 seconds. Timeout or cancellation settles once
as `inconclusive`; a late source read cannot replace that result. Recovery is a
fresh command run after the dependency or filesystem fault is resolved.

## Reopen Conditions

Reopen this decision before implementation or after an upgrade when any of the
following changes:

- Better Auth or `@better-auth/core` version, lock resolution, or critical
  source digest;
- state storage strategy or the app's stateful database configuration;
- session middleware, state protection/nonce/expiry, PKCE, callback ordering,
  or `link.userId` write semantics;
- Google direct-idToken behavior;
- ordinary sign-in state generation;
- provider set or Facebook retirement;
- account schema semantics;
- runtime reachability or appearance of a custom Google-link claim protocol.

Until then, the native protocol is the single authority and OVE-295 must solve
only the proved application-owned gaps.
