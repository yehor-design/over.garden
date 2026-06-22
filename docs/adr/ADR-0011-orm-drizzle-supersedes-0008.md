# ADR-0011 — ORM: Drizzle (supersedes ADR-0008 "Prisma")

- **Status:** Accepted — 2026-06-23
- **Supersedes:** ADR-0008 (Prisma), recorded in TECH_STACK_DECISIONS §2.6
- **Deciders:** Founder (operator)
- **Related:** ADR-0012 (access topology & RLS), ADR-0013 (realtime), privacy invariants INV1–4

## Context & forces

The TypeScript app backend needs an ORM. ADR-0008 chose **Prisma** on three real grounds: largest AI-agent training corpus (agents write reliable Prisma), DX, and the Rust-free client closing the serverless cold-start gap. Those grounds are factually correct.

Pressure-testing the locked stack surfaced a conflict between two "binding" decisions — **Prisma + Supabase RLS** — on the safety-critical privacy surface:

- Prisma by default connects to Postgres as a **superuser**, which **bypasses every RLS policy**. RLS simply does not run on that connection.
- Making RLS work through Prisma requires connecting as a non-superuser role **and** wrapping **every** query in a transaction that first `SET LOCAL`s the user context via a client extension. The most thorough practitioner guide explicitly discourages this as too tightly coupling Prisma to Supabase; the raw-SQL workaround (`$executeRawUnsafe`) opens an injection risk.
- **CVE-2025-48757** (May 2025): ~10% of analyzed "AI-builder + Supabase" apps shipped with RLS bypassed/misconfigured — readable with the anon key. This stack's exact profile is "solo founder + AI agents + Supabase."

The privacy invariants (INV1–4, wartime location lock) are safety-critical, so the RLS axis is **load-bearing**, and ADR-0008's rejection of the alternative did not weigh it.

## Decision

Use **Drizzle ORM** instead of Prisma.

Drizzle provides **first-class Postgres/Supabase RLS ergonomics**:
- Policies are declared in the **TypeScript schema** (`pgPolicy()`) — versioned in git, code-reviewed, and applied via migrations, rather than living in the Supabase dashboard where they drift and escape review.
- A documented Supabase RLS integration wraps queries under the `authenticated` role with the JWT context, instead of a hand-rolled `SET LOCAL` extension.

This makes the safety-critical privacy policies **versioned + testable** and fits the narrow-RLS-floor model in ADR-0012.

## Alternatives considered

- **Keep Prisma + a client-extension RLS pattern.** Viable, but pays a per-query wrapper tax universally and carries a "forget the wrapper → leak" risk on every query. Prisma's agent-corpus advantage is real but does not outweigh RLS safety on a wartime-privacy product.
- **Keep Prisma, treat RLS as a backstop only** (app-layer authz primary). Acceptable, but leaves RLS ergonomics poor exactly where they are needed and keeps the dashboard-policy drift problem.

## Consequences

- **Good:** RLS policies in code, under version control, with CI invariant tests (ADR-0012); natural fit for the narrow-RLS-floor model; the strongest remaining argument for Drizzle (RLS ergonomics) is exactly the safety-critical axis.
- **Disliked / costs (named honestly):**
  - **Smaller agent-training corpus than Prisma.** AI agents write Drizzle less reliably, and a mistake in an RLS wrapper is a leak. **Mitigations (required):** CI invariant tests that prove cross-user isolation (ADR-0012) catch agent errors before prod; a single repository/data-access layer agents copy a working pattern from; mandatory review of security-sensitive queries.
  - **Reverses a recorded decision (ADR-0008).** Intentional. Do not re-revert to Prisma without re-weighing the RLS axis against the agent-corpus axis.
  - **Tooling:** Prisma Studio → Drizzle Studio (comparable GUI); Drizzle's migration tooling is less mature than Prisma's.

## Verification owed (at implementation, version-sensitive)

- Current Drizzle Supabase-RLS helper API/limits (the wrapper under the `authenticated` role + JWT context) against live Drizzle docs before writing the data-access layer.
