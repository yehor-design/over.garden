# OVE-184 Moderated Community Design

Status: implementation contract
Date: 2026-07-13
Issue: OVE-184

## Product Decision

OverGarden will launch one operator-curated community archetype, `observation-and-care`, instead of a general-purpose group creator. It is a guest-readable evidence hub for plant, animal, and bee-colony keepers. Community participation routes people into canonical public journal entries and their existing comment threads; it never creates a second copy of a journal or an isolated post format.

The production community identity and rules may exist before user activity. Global navigation is stricter: it remains hidden until the community passes the server-owned readiness gate with an active lifecycle, open participation, a curated topic, active rules, an active moderator, and at least one active public canonical contribution. Synthetic fixture activity never satisfies production readiness.

## User Jobs

- A guest can understand the community purpose and rules, search or filter its public journal evidence, and open the canonical journal without an account prompt.
- A signed-in keeper can follow the community, contribute one of their eligible public journals, comment through the canonical journal discussion, report a contribution, block its author, and leave.
- A scoped moderator can review submitted reports, remove or restore a contribution, close or reopen community participation, and ban or restore a member. Every moderation mutation is fail-closed and audited.

## Information Architecture

- `/communities` is the canonical browse surface. Before any community is ready, direct visitors see an honest empty state and global navigation stays unchanged.
- `/communities/observation-and-care` is the Ukrainian default route. `/bg/communities/...` and `/ru/communities/...` localize product and editorial chrome while preserving journal-authored content.
- The detail page uses a Drive2-like hierarchy: community identity and participation state, compact rules/context rail, then a dense chronological journal stream. Cards link to canonical `/journal/[slug]` pages and existing comments.
- `/admin/communities` is an operational route outside the product shell. It contains only the scoped moderation queue and bounded internal IDs; no email, precise location, private journal text, media keys, request metadata, or raw authentication data.

## Data Boundaries

New tables own only community-specific state:

1. `communities`: canonical slug, code-owned localized content key, trusted topic link, lifecycle, participation state, and readiness threshold.
2. `community_rules`: ordered code-owned rule keys and active/retired state.
3. `community_memberships`: actor-scoped active/left/banned state.
4. `community_moderators`: scoped active/revoked assignments, granted only through sealed-owner administration or deterministic non-production fixtures.
5. `community_contributions`: references one canonical `journal_entries` row and stores only community inclusion/removal state.
6. `community_contribution_reports`: actor-scoped report intake.
7. `community_moderation_audit_log`: append-only bounded moderation action evidence.

No community table stores a journal title/body copy, profile presentation copy, location, media key, search document, notification payload, email, token, IP address, or user agent.

## Read Models And Invariants

- Guest reads require a known community slug and active rules. Archived communities render an explicit read-only state and remain `noindex`; unknown slugs return a hard localized `404` before App Router streaming.
- Community entries require active contributions joined to active, public, published, non-gone canonical journals and active public profiles.
- Signed-in reads additionally remove either direction of an active profile block. Banned members and removed contributions are never projected.
- Community search is a bounded SQL projection over the already-filtered community feed. It does not create a separate Meilisearch document or leak private/removed rows.
- Follow and leave update only the current actor's membership. Following does not widen journal, profile, or relationship visibility.
- Contribution authorization rechecks membership, community participation state, actor ownership, and journal public lifecycle at mutation time.
- Reporting never directly removes content. Blocking reuses the existing two-way profile block boundary.
- Moderator authorization requires an active scoped assignment on every request. The sealed credential-only owner receives the production assignment during bootstrap; no email, provider, or implicit owner fallback bypasses the assignment check.
- Moderator mutations and their audit insert happen in one transaction.
- Community and profile surfaces stay `noindex`; readiness controls navigation, not search-engine promotion.

## Canonical Participation Flow

1. Guest opens the community and reads purpose, rules, and journal evidence.
2. A follow/contribute/report/block/comment intent prompts auth only at the attempted mutation and returns to the exact community or canonical journal anchor.
3. Follow creates/reactivates the actor membership; leave sets it to `left`.
4. An active member selects one of their eligible public journals. The contribution stores only its journal ID.
5. Readers open that canonical journal to comment. Existing OVE-183 notification derivation notifies the journal owner without copying comment text.
6. A report enters the community moderation queue. The reporter sees confirmation but cannot change visibility.
7. A moderator removes or restores the contribution, or enforces a member ban. The community feed/search changes immediately and the canonical journal remains intact outside the community.

## Visual Fixture Contract

OVE-187 advances to `ove187-v8` with deterministic community identities, rules, memberships, moderators, contributions, reports, and audit rows. Manifest-owned scenarios cover:

- guest, non-member, active member, moderator, blocked, and banned viewers;
- empty/new, one-item, typical, and over-page-threshold streams;
- plant, animal, bee-colony, and mixed evidence;
- short and maximum-length community copy, no-cover and raster-cover presentation;
- active, reported, removed, restored, archived, participation-closed, loading, error, and no-result states;
- zero/one/many members, contributions, objects, and rules without exposing a public member list;
- deterministic expected routes, roles, counts, hidden IDs, and mutation outcomes.

Fixtures remain impossible in production and never claim production activity or metrics.

## Verification Gates

- SQL/Kysely schema generation and schema privacy tests.
- Repository query-contract tests for public lifecycle, ownership, two-way blocks, removal, report intake, moderation authorization, audit, and readiness.
- Route/action/component tests for guest read, exact intent auth, member transitions, moderation states, localization, noindex, and gated navigation.
- Visual fixture seed/reset/verify plus manifest hash.
- Full lint, typecheck, tests, build, mainline closeout check, and privacy poison sweep.
- Browser QA at matched desktop and mobile viewports, including Drive2 reference, OverGarden before, implemented after, and side-by-side evidence.
- Exact-main CI, deployment, and live smoke proof before Linear Done.
