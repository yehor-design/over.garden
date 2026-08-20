# ADR-0017 — Network-required product and retirement of durable browser capture

- **Status:** Accepted
- **Date:** 2026-08-20
- **Decision owner:** OVE-320
- **Current authority:** this ADR is the sole current authority for product
  connectivity and browser-local journal persistence.
- **Supersedes:** ADR-0014 Decision 8, ADR-0014's ADR-0006 compatibility and
  offline-capture context clauses, the offline-dependent clauses of ADR-0015,
  and ADR-0006's PWA-first decision as carried by the consolidated stack index.
  Those records remain readable historical provenance.

## Context

OverGarden previously treated outage-tolerant local capture as a core product
property. That produced a second durable write plane in IndexedDB, a mutation
queue, foreground replay, a cached application shell, device-local cleanup,
and UI states whose apparent success could diverge from the server record.
These mechanisms are real runtime behavior at the time of this decision; this
canon change does not pretend that they have already been removed.

The owner decision of 2026-08-18 selects a smaller, network-required product.
The trade is explicit: less availability during network failure in exchange
for one authoritative write path, honest save confirmation, less account and
device ambiguity, and a narrower safety surface. Product research recording
Ukraine's blackout exposure remains counterevidence and must not be rewritten
to manufacture agreement.

## Decision

OverGarden is online-only and network-required. A journal change is saved only
after the canonical server acknowledges it. No new durable browser journal
write, local draft, mutation queue, background or foreground replay, cached
product shell, or installability promise is allowed in the target state.

An unavailable or uncertain request produces the explicit
`network_unavailable_save_refused` state. It is never represented as saved,
queued, synchronized, or recoverable from a new browser-local product record.
The browser hint `navigator.onLine` is not an authorization, availability, or
save-success oracle; only the bounded server request and its authenticated
response establish the outcome.

`JournalDocumentV1` remains the sole persistence, API, and read contract.
Lexical remains a transient editor. Server idempotency, owner-scoped
repositories, session convergence, the precise-location firewall, media
original quarantine and stripped-derivative boundary, erasure, and public
search projection controls remain binding. Removing the local write plane does
not weaken any of them.

This is a one-way and irreversible product decision: no telemetry threshold,
cohort result, outage rate, or save-abandonment measurement reopens durable
local journal capture. Such measurements remain operational evidence and
product provenance, not a reversal gate. A future decision may improve honest
network failure UX, but it must not silently recreate the retired write plane.

## Blackout exposure after offline retirement

The retired mitigation covered a real structural risk: Ukrainian gardeners
may lose connectivity during wartime blackouts, exactly as recorded in
`docs/product-research/CROSS_LOCALE_BG_UA.md` and
`docs/product-research/STATE_OF_UA.md`. Removing it means a gardener may be
unable to persist a journal update during an outage. The replacement is a
clear refusal state, preservation of the in-memory editor only while the
current page remains alive, an accessible retry after connectivity returns,
and server-authoritative confirmation before success is shown.

That replacement does not provide outage durability. The residual exposure is
accepted as final under the 2026-08-18 owner decision. Product copy and release
evidence must say so truthfully; they must not imply an offline-capable PWA,
background synchronization, or guaranteed recovery after a tab, browser, or
device closes.

## Staged retirement and ownership

The target state is reached through bounded owners:

1. **OVE-320** owns this decision, active-canon convergence, the classified
   reference manifest, and continuous canon enforcement.
2. **OVE-321** owns server-authoritative journal drafts and the finite request,
   CAS, idempotency, owner scope, and failure protocol. Migration `0029` is
   reserved to that issue if its validated implementation requires SQL.
3. **OVE-325** cuts all four composer flows over to the server draft and shows
   `network_unavailable_save_refused` without false success.
4. **OVE-322** owns migration `0030` when required and the isolated read-only
   retirement bridge for work already written by returning devices. The bridge
   may inspect, migrate, fence, and delete legacy owner-bound records; it cannot
   accept a new local journal write or become a compatibility write path.
5. **OVE-323** removes Dexie, IndexedDB journal ownership, service-worker and
   PWA artifacts, local queues, obsolete fixtures, copy, dependencies, and
   cached-shell claims after the server cutover is proved.
6. **OVE-326** proves absence, analytics classification, exact-SHA production
   behavior, and steady-state documentation.
7. **OVE-324** is the non-executable integration container. It closes only
   after every child receipt, relation, exact-main, and production proof agrees.

Runtime matches remain `runtime_pending_child` only while their named owner is
non-terminal. A surviving match after its owner reaches a terminal state is
canon drift and fails closed.

## Legacy data and erasure boundary

This ADR creates no SQL, browser mutation, provider mutation, deployment, or
claim that legacy data is already absent. Existing browser work may be read
only through OVE-322's retirement bridge after the authoritative owner binding
and current session are proved. Ordinary sign-out, account switching, or
server-side account erasure does not prove removal from another physical
browser.

never-returning devices cannot be cleaned remotely. Evidence must state that
limitation instead of treating an unreachable browser as empty. OVE-322 may
prove cleanup only for the exact returning physical target it actually opens
and verifies.

## Canon classification and enforcement

`docs/ONLINE_ONLY_CANON_CLASSIFICATION.json` is the checked-in classification
contract. Matching spans use exactly one of:

- `active_forbidden`;
- `active_required_guardrail`;
- `historical_provenance`;
- `product_research`;
- `active_unrelated`;
- `runtime_pending_child`.

The checker scans both current canon/documentation and runtime paths with the
Latin and Cyrillic vocabulary recorded by OVE-320. It rejects unclassified or
duplicate rules, active promises, a dirty or changing proof tree, an expired
runtime owner, cancellation, nondeterministic evidence, and work beyond the
five-second deadline. Its receipt contains only relative paths, stable anchors,
classification/reason codes, owner issue identifiers, counts, duration,
baseline SHA, version, and an aggregate digest—never source excerpts or user
data.

## Consequences

Positive:

- one server-authoritative write plane and one truthful save moment;
- fewer cross-account, returning-device, replay, and cached-shell states;
- smaller runtime and a machine-enforced boundary for the staged removal.

Costs and accepted risks:

- a gardener cannot durably capture new work without a reachable server;
- navigation, tab loss, browser loss, or device loss may discard unsaved
  in-memory changes;
- legacy browser records require a bounded returning-device retirement path;
- removal must be staged because declaring the target does not remove current
  runtime bytes.

## Rollout and rollback

OVE-320 changes canon, tests, and CI only. It does not change runtime behavior.
Runtime children land in the declared dependency order and each re-runs the
canon check against clean exact main. Rollback of this documentation change is
allowed only when its evidence is falsified and must restore one coherent
authority; it must never leave two simultaneous current decisions. Runtime
rollback promotes a previously proved safe exact deployment or reverts the
responsible child without inventing a local-write fallback.
