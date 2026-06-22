# ADR-0013 — Realtime delivery: Supabase Broadcast from Database

- **Status:** Accepted — 2026-06-23
- **Deciders:** Founder (operator)
- **Related:** ADR-0012 (access topology), ADR-0011 (Drizzle / RLS-in-schema), VIRALITY_RESEARCH (lineage = retention, not virality), MVP_LOGGING §2 (single-player-first)

## Context & forces

v0 wants **live feeds** (auto-updating without manual refresh — e.g. the public "who grows variety X in region Y" aggregation, lineage "your seeds bloomed" notifications). Supabase Realtime offers three mechanisms:

- **Client-to-client Broadcast** — the server must explicitly emit each event. **Dual-write problem:** a forgotten emission (new write path, the Python worker, a migration) = a silently missed update.
- **Postgres Changes** — clients subscribe to raw table WAL changes, RLS-filtered. But it **streams raw rows to clients**, is **single-threaded** with a per-subscriber-per-change RLS check that **bottlenecks at scale** (100 subscribers × 1 insert = 100 authorization reads), and **DELETE events are not RLS-filtered** (Postgres cannot verify access to a deleted row).
- **Broadcast from Database** — DB triggers call `realtime.broadcast_changes()` / `realtime.send()`.

The location lock (ADR-0012) requires the **server to control what egresses** on the most sensitive surface.

## Decision

Use **Broadcast from Database**.

- A **trigger fires on every WAL write** → the database is the single source of truth; no dual-write, cannot "forget" to emit.
- The **trigger/server chooses which columns** go in the payload → sensitive raw rows never stream (preserves the location lock + the server-controls-output model of ADR-0012).
- It **scales far better** than Postgres Changes — Supabase's recommended method for scalability + security.
- **Clients subscribe to private channels** with Broadcast authorization (RLS on `realtime.messages`), **not to raw tables** → consistent with the Variant D topology (ADR-0012); does **not** force RLS-primary on domain tables.

### Cross-cutting caveat (mandatory)

Supabase Realtime **does not guarantee delivery** — a client offline during a change loses it (no queue; Broadcast Replay is limited + alpha). Therefore:

> **Invariant:** every realtime-updated surface MUST have a server fetch path that is the canonical state. Realtime is an **enhancement layer** (live deltas), never the feed itself.

The live feed = normal server fetch (truth) + a realtime subscription for instant deltas (enhancement).

## Alternatives considered

- **Client-to-client Broadcast.** Rejected: dual-write / forgotten-emission risk; no DB-source-of-truth property.
- **Raw Postgres Changes.** Rejected: streams raw rows to clients — a **footgun** on the most sensitive surface (a future sensitive column leaks by default); single-threaded scaling cliff; DELETE not RLS-filtered. (The operator initially selected this; reversed after the mechanism comparison showed Broadcast-from-DB delivers the same "DB-driven" property without the footgun.)

## Consequences

- **Good:** true live, DB-driven (no dual-write), with payload control on sensitive data, and scales; consistent with Variant D (no RLS-primary forced); fits Drizzle RLS-in-schema (policies on `realtime.messages`).
- **Disliked / costs (named honestly):**
  - More setup than Postgres Changes (trigger functions + broadcast wiring).
  - **Triggers run on the write path** — keep them lightweight; a trigger failure must not break the originating write. (`realtime.send` is designed to catch exceptions and `pg_notify` errors rather than break the trigger.)
  - **Delivery is not guaranteed** → the mandatory server fetch path as canonical truth (above) is not optional.

## Verification owed (at implementation, version-sensitive)

- Current Supabase Realtime **Authorization** model and the `realtime.broadcast_changes()` / `realtime.send()` API + private-channel setup against live docs before wiring triggers.
- Postgres version constraints noted in the Realtime repo for `realtime.broadcast_changes()` called from a trigger (older Postgres had limitations).
