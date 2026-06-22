# ADR-0012 — Data-access topology & RLS enforcement (Variant D)

- **Status:** Accepted — 2026-06-23
- **Deciders:** Founder (operator)
- **Related:** ADR-0011 (Drizzle), ADR-0013 (realtime), privacy invariants INV1–4, ENTRY_DATA_AND_RANKABILITY §5, CROSS_USER_TRUST_AND_PRIVACY_SPEC

## Context & forces

The privacy invariants (INV1–4; wartime location lock) need enforcement that survives bugs and newly added code paths. Supabase's default model — **browser → PostgREST → Postgres**, where RLS is the *only* barrier — is the exact failure mode behind CVE-2025-48757 (AI-built apps shipping with RLS bypassed).

But this stack is **not** that model: it has a **trusted server tier** (Next route handlers / server actions; the Python worker). The browser talks to the server, not directly to the database. That changes the calculus: RLS can be a true backstop rather than the sole gate.

## Decision — "Variant D": server-tier-primary authorization + a narrow RLS floor

1. **Access-topology invariant.** All data access flows through the server tier (Next + Python). The browser gets **no anon-key-wide direct access** to Supabase tables — no direct table reads, no Realtime on raw tables, no broad Storage. **Controlled exceptions:** signed upload URLs (a single, server-authorized object) for photo upload; Realtime via **Broadcast-from-Database channels** (ADR-0013), which are not raw-table subscriptions.

2. **Primary authorization lives in one server-tier data-access/repository layer** that every query physically passes through and that always scopes by user + visibility. INV1–4 are primary here — structurally impossible to "forget," because the path *is* the gate (not scattered `if` checks).

3. **RLS is a real floor on sensitive tables only** — location-bearing data, private objects, `proposed` lineage edges — via a **least-privilege DB role** (never superuser/service-role). Because the server tier already scopes by user, the full per-query `SET LOCAL` context dance is not needed broadly; the floor is narrow. Policies are declared in the Drizzle schema (ADR-0011), plus Broadcast authorization policies on `realtime.messages` (ADR-0013).

4. **Location lock via data minimization first.** v0 stores **no precise coordinates** (`exact_coords` dropped); EXIF-GPS is stripped in the worker (sharp); RLS on location fields is tertiary. "Don't store" + "don't serve in photos" is the primary control — stronger than a policy hiding a column that exists.

5. **Invariant tests (REQUIRED — new cross-cutting invariant).** A CI test suite **proves** INV1–4: user A cannot see user B's private object/location via *any* access path (server query, realtime channel, storage URL). Runs on every commit. This is the structural mitigation for the Drizzle agent-corpus risk (ADR-0011) and for RLS-misconfiguration generally.

## Alternatives considered

- **RLS-primary on all ~30 tables.** Rejected for v0: complexity + leak surface spread across every table; per-row policy cost on joins/large selects; all authorization expressed in SQL. It is only *required* if clients subscribe to raw tables — which Broadcast-from-Database (ADR-0013) specifically avoids. Reconsider only if a feature genuinely needs browser-direct raw-table access.
- **App-layer authz only, no RLS.** Rejected: leaves no DB backstop on the safety-critical surface; a single server bug becomes a breach.

## Consequences

- **Good:** a forgotten check degrades to "missing defense-in-depth on one query," not a breach; narrow RLS keeps complexity + performance cost bounded to a handful of tables; the realtime choice stays consistent with the topology (Broadcast-from-DB does not force RLS-primary). The same floor also protects the Meilisearch privacy boundary (the indexing role can be restricted to public rows only).
- **Disliked / costs (named honestly):**
  - **Architectural lock-in (access topology).** The "browser never gets direct DB access" invariant must be held **from day 1** — retrofitting it after features assume browser-direct access is expensive. Recorded deliberately.
  - A future feature that needs browser-direct raw-table access (e.g., raw Postgres-Changes Realtime) would force RLS-primary on those tables — a conscious, scoped exception, not the default.

## Verification owed (at implementation)

- Confirm the Supabase Realtime **Broadcast authorization** model (RLS on `realtime.messages`) against live docs (ties to ADR-0013).
- Define the exact least-privilege DB role grants for (a) the app server tier and (b) the Python worker (which needs a privileged role for catalog merge/seed and a restricted read role for Meilisearch indexing).
