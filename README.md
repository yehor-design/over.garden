# OverGarden

A gardening journal that doubles as a catalog-as-social-graph — plant varieties are the shared graph — for Ukraine and Bulgaria. People keep a searchable narrative growing-journal; public variety-in-region pages aggregate real first-hand experience; a lineage layer traces where each plant came from (seed and cutting provenance passed between growers).

Status — zero-stage pre-MVP. The technology stack and architecture are decided and locked (see `docs/TECH_STACK_DECISIONS.md`); application implementation has not yet started. Any commands referenced below describe the planned toolchain and are not yet scaffolded — do not assume they work until this section is filled in with real commands.

## Stack (summary)

Next.js (App Router) + TypeScript · shadcn/ui · Drizzle ORM · PostgreSQL via Supabase · an isolated Python matching service (Meilisearch · RapidFuzz · Splink · PyICU · CyrTranslit) · Supabase Realtime (Broadcast from Database) · PWA · Cloudflare edge · PostHog analytics.

Full rationale, the rejected alternatives, and the binding invariants are in `docs/TECH_STACK_DECISIONS.md` and the ADRs under `docs/adr/`.

## Repository layout

* `docs/TECH_STACK_DECISIONS.md` — consolidated, binding stack & architecture decisions, with the ADR index.
* `docs/adr/` — Architecture Decision Records (one per significant decision; immutable, superseded rather than edited).
* `AGENTS.md` — operating guide and binding invariants for AI coding agents (and humans). Read it before contributing.
* `CLAUDE.md` — pointer to `AGENTS.md` for Claude Code.

## Getting started (planned — not yet scaffolded)

The repository is at the decisions-locked stage; there is no application code yet. Once the app is scaffolded, this section will document the exact install / dev / test / build commands and the local Supabase + Meilisearch + Python-service setup.

## Contributing

This product handles data for users under wartime risk, so several architectural rules are safety-critical. Before contributing — human or agent — read `AGENTS.md` and the relevant ADR. Do not weaken the privacy invariants (location lock, single-door data access, EXIF stripping, the RLS floor and its invariant tests) without a superseding ADR and maintainer sign-off.

## License

TBD.
