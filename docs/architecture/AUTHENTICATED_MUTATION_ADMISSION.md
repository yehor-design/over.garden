# Authenticated Mutation Admission

Status: OVE-285 decision receipt — ready  
Baseline: `5c403444cddc2e195690808de08304d14fe41fd3`  
Prerequisite: OVE-296 receipt `d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152`

## Decision

Every authenticated mutation surface is represented by one byte-exact,
machine-checked registry before downstream admission work changes runtime
behavior. The registry closes the path from production source node to logical
entrypoint, admission boundary, true effect boundary, branch, predecessor, and
execution owner. It is the handoff contract for OVE-293 through OVE-295; it is
not itself an admission implementation.

OVE-285 is report-only. It changes no application runtime, database schema,
provider state, production data, authentication behavior, cookie, offline
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
| Source nodes                    |                                                              2,476 |
| Logical entrypoints             |                                                                303 |
| Effect boundaries               |                                                                183 |
| Consumer edges                  |                                                                655 |
| Excluded entrypoints            |                                                                128 |
| Retired-provider entrypoints    |                                                                  1 |
| Unresolved nodes or entrypoints |                                                                  0 |
| Registry digest                 | `c49e5e22e4c1f1cba678fbae18e829bbdc0c793a4af746d4c0aba1de67a2da92` |
| Source-evidence digest          | `3f5620a5d7fb7a31836ce53a253054b81fbfa0d45e62e351c6cb8cf863a43f4a` |
| Receipt digest                  | `868e076ae689950edd9b0d3dbe5191ec61ffcd4d07abcd7e0399806ad65ffd34` |
| Artifact file SHA-256           | `d5daa0f0c94bae4186a7f9dee2505f11e515190b275fb44920e7d669b26d216a` |

The independently pinned Better Auth semantic adapter produced:

- manifest digest `c370aab0583381f75c9741793ed6a5da8198a0f411c592d348bd6854bc0a0f92`;
- semantic source-evidence digest `61268c682d2fcfbf0a7da1da2dfa5f5e8d7ff25af863400ac703983341f649b6`;
- semantic receipt digest `77d24c8d4582867ee8cf2ef89edc7db3e212332c2a241798a58646506e6e1cdb`.

The receipt binds the exact baseline, TypeScript and Better Auth toolchain,
OVE-296 prerequisite receipt, normalized production-source evidence, and
canonical registry bytes. A change to any bound input changes the receipt. The
values above are the deterministic OVE-293 downstream regeneration; the
original OVE-285 terminal receipt remains preserved in its Linear closeout and
the execution roadmap.

## Closed source policy

The only production roots are `public/sw.js`, `sql`, and `src`. A path is
excluded when an exact segment is one of:

`__test__`, `__tests__`, `fixture`, `fixtures`, `snapshot`, `snapshots`,
`spec`, `specs`, `test`, or `tests`.

Equivalent test/spec/fixture/snapshot filename suffixes are also excluded.
Names that merely contain those words, such as `latest-testament`, remain
production input. A production import of an excluded source is a blocking
finding rather than an implicit exclusion.

The structural scan records imports, re-exports, typed action props, callbacks,
route handlers, Server Actions, native forms, same-origin calls, Better Auth
client calls, offline producers, contextual transactions, SQL triggers, and
effect owners. Every ready source node is resolved and every evidence path is
covered by the source-evidence digest.

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

The checked artifact contains at least one boundary for every family. Kysely
transaction callbacks co-commit only proven canonical/outbox effects reached
through the same executor. Dexie `rw` callbacks similarly collapse proven
IndexedDB writes into one browser-storage transaction; ordinary `Map` and `Set`
methods are not storage effects. Provider calls, cookies, projections, and
best-effort effects remain separate true boundaries. Branch conditions,
execution modes, and predecessor edges form an acyclic graph.

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

- `high_risk_ove_290`: 34 journal/media/offline mutation paths;
- `capability_runtime_ove_286`: 7 owner-session and owner-composer capability
  paths;
- `owned_by_ove_295`: 5 explicit-linking paths;
- `remaining_ove_291`: 128 remaining effectful paths.

The remaining 129 non-effectful paths are `excluded_with_reason` (128 ordinary
exclusions plus the one retired-provider entrypoint). Owner sets are disjoint by
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
