# OVE-183 Social Return Loop V2 Design

Status: implemented
Date: 2026-07-13

## Product Decision

OverGarden will use a utility-first social loop: a reader discovers public
living-object evidence, follows the people, objects, or topics that make that
evidence useful, and returns through a chronological followed feed and a
bounded notification center. Public status, opaque ranking, direct messages,
and popularity mechanics remain out of scope.

The load-bearing assumption is still unproven: relevant evidence can create
repeat visits without making users feel watched or pressured to perform. The
smallest reversible implementation is therefore chronological, explicit, and
preference-controlled. It measures useful return behavior without introducing
algorithmic ranking or external delivery.

## Canonical Data Contract

- `profile_follows` remains the source of truth for person follows.
- `engagement_follows` owns idempotent object and curated-topic follows.
- `engagement_bookmarks` and `wishlist_items` remain private owner utilities.
- `engagement_comments` gains actor-scoped mutation idempotency and explicit
  deleted/removed tombstones. One root plus one reply level is the supported
  depth.
- `engagement_comment_reports` records one bounded report per actor/comment;
  reporting does not grant a reader unilateral moderation power.
- Notification content is derived from canonical rows at read time. Only
  opaque read receipts and category preferences are persisted. Raw comment,
  journal, question, location, animal-detail, media-key, transport, and request
  payloads are never copied into notification storage.

## Read Models

The followed feed is one actor-scoped chronological projection over public,
active, non-gone journal entries. An entry is eligible when the actor follows
its public author, its public living object, a curated eligible topic attached
to it, or an already-confirmed lineage node. A mutual active block excludes the
row before serialization. The projection never changes target visibility.

The notification center derives allowlisted events for comment, reply, follow,
mention/provenance claim, claim decision, lineage question, and stale-journal
prompt. Summaries are code-owned templates over public-safe labels; comment and
journal bodies are never notification payloads. Opaque event keys join to
actor-scoped read receipts. Category preferences are explicit and in-product
only; OVE-183 sends no email or push.

Comment readback is guest-open and root-paginated. Replies stay attached to
their root. Deleted or moderator-removed comments serialize as body-free
tombstones. Signed-in viewers do not receive comments from either side of an
active block. Writes fail closed when the target is no longer public or when a
target owner/reply author has an active block relationship with the actor.

## UI Contract

- Journal and object routes expose guest-readable discussion and intent-aware
  bookmark/comment/follow/report/block controls.
- Profile follow/report/block keeps the OVE-180 interaction model.
- Curated topic routes expose intent-aware follow utility.
- `/feed`, `/notifications`, `/bookmarks`, and `/wishlist` form one coherent
  `My` section inside the shared shell, with URL-owned filters, pagination,
  loading, recoverable error, and useful empty states.
- Mobile retains every safety action. Dense lists use unframed sections,
  bounded rows, stable icon controls, and no card-inside-card composition.

## Fixture And Verification Contract

OVE-187 advances to a new deterministic manifest version with multi-actor
comments, replies, follows, bookmarks, receipts, preferences, reports, and
blocks. Manifest evidence must cover zero, one, one page, page-size-plus-one,
dense and private collections, read/unread and grouped/individual
notifications, mixed followed-feed pagination, unavailable targets, and real
repository state transitions. Fixture mode remains production-refusing and
never triggers analytics, search, email, or push.

Closeout requires focused red-green repository/component tests, generated type
parity, complete lint/typecheck/test/build, deterministic seed-reset-reseed
proof, desktop and mobile browser QA, Drive2 pattern reference plus exact
OverGarden before/after comparison, current-main containment, exact-SHA CI and
deployment proof, redacted live smoke, and a Linear closeout comment.
