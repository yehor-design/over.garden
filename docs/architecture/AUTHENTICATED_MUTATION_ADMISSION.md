# Authenticated Mutation Admission

Status: OVE-285 registry, OVE-290 high-risk enforcement, OVE-286 bounded browser rollout, and OVE-291 remainder enforcement remain active. OVE-323 retired OVE-289 foreground autosync and every browser-journal storage producer.
Baseline: `b53157a559c3a1087e8c53c142028ba0d9bcd5c2`
Prerequisite: OVE-296 receipt `d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152`

## Decision

Every authenticated mutation surface is represented by one byte-exact,
machine-checked registry before downstream admission work changes runtime
behavior. The registry closes the path from production source node to logical
entrypoint, admission boundary, true effect boundary, branch, predecessor, and
execution owner. It is the handoff contract for OVE-293 through OVE-295; it is
not itself an admission implementation.

OVE-285 itself is report-only. It changes no application runtime, database schema,
provider state, production data, authentication behavior, cookie, browser-storage
record, search document, media object, analytics event, or deployment setting.
The test-only effect oracle is unreachable from production modules, and the
runtime-import check fails closed if source or a built Next.js chunk imports its
sentinel.

## Ready receipt

The checked artifact is
`contracts/auth/authenticated-mutation-registry.v3.json`, schema
`overgarden.authenticated-mutation-registry.v3`.

| Field                           |                                                      Checked value |
| ------------------------------- | -----------------------------------------------------------------: |
| Production source files         |                                                                593 |
| Source nodes                    |                                                              2,190 |
| Logical entrypoints             |                                                                217 |
| Effect boundaries               |                                                                167 |
| Consumer edges                  |                                                                506 |
| Excluded entrypoints            |                                                                 72 |
| Retired-provider entrypoints    |                                                                  1 |
| Unresolved nodes or entrypoints |                                                                  0 |
| Registry digest                 | `a147908910898445fddeeead325748446c3004361f529b97eecafcee21377f29` |
| Source-evidence digest          | `0dc5d0e017eecf9510959d0111d4e7c3440e748c892736f8420e35978b451ee5` |
| Receipt digest                  | `cfe781930f04279dc082583b5ffff48e056594034f16ea228ea901c86737e80e` |
| Artifact file SHA-256           | `35fa0472b6afe7cfb52950db81d15b1fc10cf7b039a7770d086ca1ed0aa78157` |

The independently pinned Better Auth semantic adapter produced:

- manifest digest `7967e4374a6d24441ffee5d738dcfd9cf0ab18340c1f039fe411e32783491c56`;
- semantic source-evidence digest `0eed120517f46162f449ac0d9de7117f9040ebcf0a5f086306fff2497c9fa880`;
- semantic receipt digest `43c14d0b3e0eb764b9057498516d968ccd4f403b429de1ee11f4668b6a45df94`.

The receipt binds the exact baseline, TypeScript and Better Auth toolchain,
OVE-296 prerequisite receipt, normalized production-source evidence, and
canonical registry bytes. A change to any bound input changes the receipt. The
values above must be regenerated with the checked artifacts whenever the
production graph changes. OVE-323 removed the OVE-289 expansion; the original
OVE-285, OVE-290, OVE-291, and OVE-289 terminal receipts remain historical in
their Linear closeouts and the execution roadmap.

## OVE-290 runtime enforcement

`DocumentMutationGenerationV1` binds a rendered authenticated document to an
opaque owner generation, session generation, random document nonce, issue and
expiry times, and a versioned HMAC. Its canonical golden vectors are committed
at `contracts/auth/document-mutation-generation-v1.golden.json` (SHA-256
`045fdbbd61e11a34133c794683a7c4c8a538314e97f6088ad3b1def76f9850f2`).
The transport is not authorization: every guarded request still performs one
no-cache Better Auth read and passes the resulting `RequestScope` to the
existing scoped repository.

The server admits only an exact owner/session match. Closed client results are
`DOCUMENT_OWNER_CHANGED`, `DOCUMENT_SESSION_REFRESH_REQUIRED`,
`DOCUMENT_PROTOCOL_REFRESH_REQUIRED`, `AUTHENTICATION_REQUIRED`, and
`MUTATION_ADMISSION_UNAVAILABLE`; responses are private and `no-store` and
contain no identity or generation material. The 3,000-millisecond admission
deadline settles once and fences late results. Native forms use
`__overgardenDocumentGeneration`; same-origin fetches use
`x-overgarden-document-generation`; the header is deliberately absent from the
cross-origin R2 PUT.

The separate enforcement artifact is
`contracts/auth/authenticated-mutation-enforcement.v1.json` (SHA-256
`e0489a3762509dcd7fcedc2144ce5f1cee7a4f2958621b9d14ba256a4dea5d4b`).
It binds registry digest
`a147908910898445fddeeead325748446c3004361f529b97eecafcee21377f29`
and source receipt digest
`cfe781930f04279dc082583b5ffff48e056594034f16ea228ea901c86737e80e`.
The current server-side OVE-290 partition contains 14 enforced high-risk
entrypoints and 141 consumer edges at 11 admission boundaries. All 125
remainder entrypoints and 350 consumer edges remain
`enforced_ove_291` at their 67 declared admission boundaries. The
five-entrypoint, 15-edge OVE-295 partition remains reserved with ownership digest
`9f9273ac6222c4e04cc77069dc14bfebc3860218d6791623055c27420687adad`;
OVE-286 capability-runtime paths remain distinct from mutation enforcement.

Production imports only the generated bounded receipt
`contracts/auth/authenticated-mutation-deployment-receipt.v1.json` (SHA-256
`7d53af323eebacf59ef6ac4f10aeae2a86c0c2d4ec4f31d047822baee21009bc`,
canonical receipt digest
`b7ec91469c96d2e6b3db55f2f2b5d6123f21c1b28f7ea53d59a2ec43aed96ed5`).
It contains the deployment-receipt schema, counts, and digests only. The full
registry and enforcement graph remain build-time artifacts and their schema
sentinels are forbidden from Next.js runtime chunks.

Matching work preserves the active server-authoritative behavior. A valid owner
transition emits one payload-free `DOCUMENT_OWNER_CHANGED` event into the
terminal session invalidation path. No session refresh, focus, visibility, or
connectivity observation replays a journal mutation. Native, edit, publish, and
media actions retain current-tab intent for explicit retry only. Explicit
rollback sets `DOCUMENT_MUTATION_ADMISSION_ENABLED=false`, which disables
envelope issuance and enforcement together while retaining Better Auth,
request scope, owner predicates, and media safety.

## OVE-286 bounded non-fencing rollout

OVE-290 closes the complete protected-effect surface reachable from the
existing-entry editor, so OVE-286 may keep that exact editor mounted through an
ordinary focus or visible-page session observation. The browser policy admits
only `/garden/entries/{valid UUID}/edit`; every adjacent, locale-prefixed,
encoded, query-bearing, malformed, or other authenticated path remains on the
OVE-236 compatibility fence. Background session-read failure never grants
mutation authority: the journal and media calls still require their current
OVE-290 document-generation envelope plus canonical Better Auth authorization.

The authoritative mutation graph remains the expansion gate. OVE-286 does not
promote any of the 128 `remaining_ove_291` entrypoints and does not reinterpret
capability-runtime paths as mutation admission. OVE-291 may expand the route
policy only after its checked graph reports zero remaining entrypoints and its
browser proof covers every newly reachable protected effect. A forward rollback
returns the pure route matcher to `compatibility_fenced` for all paths while
retaining the terminal invalidation marker and all OVE-290 enforcement.

## OVE-291 remainder enforcement

Every remaining authenticated user, moderator, administrator, founder,
profile, social, lineage, notification, curation, lifecycle, and account
disconnect mutation now calls the same OVE-290 admission classifier before its
first effect. Existing role, approval, scoped-repository, transaction, outbox,
media, erasure, and final-provider controls still run after admission and remain
the canonical authorization rules. Better Auth POST guarding uses an exact
account/session-mutation allowlist; ordinary sign-in, sign-up, password reset,
sign-out, session read, Google sign-in, and explicit Google linking are not
reclassified as document mutations.

Native and Server Action forms carry the current generation through one shared
recovery-aware form wrapper. Remaining same-origin fetch clients use the same
header and bounded recovery state. Recoverable failures retain the current
intent and require an explicit retry; a confirmed owner change emits the
existing payload-free terminal event. The strict graph test proves every
remainder entrypoint and consumer edge reaches its declared live boundary,
while the production smoke submits a real elevated owner form after an A-to-B
cookie switch with an intentionally invalid no-write payload. It also probes a
user mutation and provider disconnect, verifies unchanged effect-count digests,
checks ordinary Google authentication and the exact retired-Facebook denial,
and fails if an explicit-link path is invoked.

The deployment read-back route exposes only schema versions, counts, and
digests derived from the bundled registry and enforcement artifacts. It never
returns graph paths, identifiers, sessions, generations, content, provider
state, or other protected evidence.

## Historical OVE-289 foreground autosync

OVE-289 previously owned a document-local queue coordinator and browser-storage
effect owners. OVE-323 deleted that coordinator, its triggers, queue ownership,
runtime imports, fixtures, and package dependencies. This section is retained
only as provenance for the generated-registry contraction: current production
code has no autosync mount, durable browser journal row, or automatic retry
trigger. The structural audit keeps negative recognizers so any reintroduction
fails the checked graph.

## Closed source policy

The only production roots are `sql` and `src`. A path is
excluded when an exact segment is one of:

`__test__`, `__tests__`, `fixture`, `fixtures`, `snapshot`, `snapshots`,
`spec`, `specs`, `test`, or `tests`.

Equivalent test/spec/fixture/snapshot filename suffixes are also excluded.
Names that merely contain those words, such as `latest-testament`, remain
production input. A production import of an excluded source is a blocking
finding rather than an implicit exclusion.

The structural scan records imports, re-exports, typed action props, callbacks,
route handlers, Server Actions, native forms, same-origin calls, Better Auth
client calls, contextual transactions, SQL triggers, effect owners, and
negative signatures for retired browser-storage producers. Every ready source
node is resolved and every evidence path is covered by the source-evidence
digest; current production source resolves zero retired producer entrypoints.

## Admission and effect model

Authorities are a closed enum. Distinct guest, public auth, locale, operator,
cron, visual-fixture, recovery, and retired-provider authorities cannot be
silently treated as an authenticated browser document. An effectful entrypoint
must declare `required_before_first_effect`, own at least one consumer edge,
and resolve to one admission boundary. A read-only, distinct-authority, or
retired-provider entrypoint must have a bounded reason and zero effects.

Effect families are exactly:

- `canonical_row` and `transactional_outbox`;
- `public_projection`;
- `quarantine_object` and `public_derivative`;
- `auth_account` and `auth_session`;
- `browser_cookie` and `browser_storage`;
- `analytics_event` and `external_call`.

The checked artifact contains at least one boundary for every active family.
Kysely transaction callbacks co-commit only proven canonical/outbox effects
reached through the same executor. The audit retains Dexie and IndexedDB
recognizers only as negative fixtures so a retired producer cannot be mistaken
for an ordinary in-memory `Map` or `Set` mutation. Provider calls, cookies,
projections, and best-effort effects remain separate true boundaries. Branch
conditions, execution modes, and predecessor edges form an acyclic graph.

The test-only effect oracle consumes the registry instance-locally. Rejected
admission emits zero boundary receipts; accepted admission emits each reachable
true boundary once in deterministic topological order; reused attempt IDs,
unknown entrypoints or edges, and missing conditional predecessors fail closed.

## Better Auth semantic negatives

The semantic adapter pins Better Auth `1.6.25`, the installed package integrity,
the lockfile, the configured route, and the relevant Google and retired-provider
source bytes.

- Direct Google `idToken` link admission has zero effects because
  `disableIdTokenSignIn: true` rejects it before Better Auth mutation.
- Explicit redirect-based Google linking remains effectful but is reserved for
  OVE-295.
- Facebook is retired by OVE-296 and has zero effects before Better Auth.

Any package, integrity, lockfile, source anchor, configuration, or negative-
variant drift makes the semantic receipt inconclusive until this decision is
re-audited.

## Execution ownership

The registry assigns every effectful entrypoint to exactly one downstream
owner:

- `high_risk_ove_290`: current journal and media mutation paths after removal of
  all six historical OVE-289 local effect owners;
- `capability_runtime_ove_286`: 7 owner-session and owner-composer capability
  paths;
- `owned_by_ove_295`: 5 explicit-linking paths;
- `remaining_ove_291`: 125 remainder effectful paths, now enforced.

The remaining 73 non-enforced paths map to `excluded_with_reason`: 72 excluded
entrypoints plus one retired-provider entrypoint. Owner sets are disjoint by
construction and validation.

## Determinism and bounded execution

`pnpm mutation:surface:audit -- --check` is the normal read-only gate. It scans
real repository bytes, compares them with the committed artifact, and never
writes. Artifact regeneration is explicit:

```bash
pnpm mutation:surface:audit -- --write-artifact
```

The operation has one 30-second deadline, settles once, propagates an abort
signal, distinguishes `deadline` from `scan_error`, and waits safely for late
work. Tests run four scanners as independent CLI processes and require stable
identical output within the deadline. `pnpm test:mutation-surface-concurrency`
runs that CPU-heavy proof in isolation before the broad `pnpm test` suite, so
each scanner receives an independent event loop and deadline timer. Artifact
checking is
byte-deterministic after path, source text, set-like field, and collection
normalization.

Runtime enforcement checking is separate from graph generation:

```bash
pnpm exec tsx scripts/authenticated-mutation-enforcement-receipt.ts --check
```

It verifies final registry/source-receipt digest binding, the complete enforced
14/141 high-risk and 125/350 remainder stable-ID sets, all 11 high-risk and 67
remainder live pre-effect guard bodies, deterministic bytes, the frozen
explicit-Google-link partition, and the committed enforcement artifact.

The exact-SHA production smoke is reject-only and requires two private
synthetic sessions supplied outside logs and chat:

```bash
pnpm smoke:remaining-document-mutation-admission -- \
  --environment production \
  --mode reject-only \
  --base-url "$OVE291_IMMUTABLE_DEPLOYMENT_URL" \
  --expected-sha "$OVE291_IMPLEMENTATION_SHA" \
  --families remainder,account-disconnect,provider-authority-negative \
  --exclude-explicit-google-link \
  --redacted
```

After a production build, run the separate isolation check:

```bash
pnpm mutation:surface:audit -- --check-runtime-imports
```

It checks both the production source import graph and generated Next.js chunks.
Missing build metadata is inconclusive, never success.

## Downstream order and reopen signals

The strict authenticated-mutation chain is:

`OVE-296 -> OVE-285 -> OVE-293 -> OVE-288 -> OVE-290 -> OVE-286 -> OVE-287 -> OVE-291 -> OVE-289 -> OVE-294 -> OVE-295 -> OVE-292 -> OVE-284 -> OVE-186`

OVE-297 and OVE-298 are separate leaves in the authenticated Linear DAG; they
must not be inserted into this strict chain. Authenticated Linear read-back
remains the queue authority.

Reopen OVE-285 or create a successor decision before relying on the registry if
any of these changes: production roots or exclusions, a mutation transport or
authority, an effect family or atomicity boundary, Better Auth version or pinned
semantics, Google direct-id-token configuration, retired Facebook behavior,
execution ownership, canonicalization, timeout/concurrency semantics, or a
source/runtime isolation finding.

Receipts contain counts, digests, paths, and closed classifications only. They
must never contain secrets, tokens, cookies, emails, provider payloads, live
user identifiers, journal content, media keys, request metadata, or precise
location data.
