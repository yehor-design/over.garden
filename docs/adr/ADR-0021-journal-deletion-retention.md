# ADR-0021 — Journal deletion is a seven-day retention-only lifecycle

- **Status:** Accepted
- **Date:** 2026-08-27
- **Decision owner:** OVE-353
- **Decision version:** `ove353.journalDeletionRetentionCanon.v1`
- **Supersedes:** only the explicitly named active journal *archive* clauses of
  earlier canon — the archive lifecycle state, the archived owner surface, the
  archive-named public-projection and media-revocation reasons, and any wording
  that describes an archived journal entry as retained owner history.
  Historical implementation receipts remain readable facts.
- **Preserves:** ADR-0017's network-required semantics; ADR-0018's
  serve-under-uncertainty posture, `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`, and
  in-product admin boundary; ADR-0019's format-conversion-only media and the
  ban on server-side re-encoding or source-original retention; the precise
  location firewall; scoped server data access; and the existing transactional
  public-projection outbox, media lifecycle queue, retention leader, and
  account-erasure owners.
- **Explicitly does not touch:** archival semantics for catalog sources,
  lineage, profiles, communities, or any non-journal object.

## Context

The journal lifecycle had two states, `active` and `archived`. `archived` was
written by an owner action, it kept the row and its raw text indefinitely, and
the owner surface presented it as retained private history. The public page for
an archived slug resolved through `notFound()`.

That is three promises at once, and they conflict. A gardener pressing a control
labelled "archive" cannot tell whether their words are gone, hidden, or
recoverable. Nothing ever removed the row, so "archived" was in practice
permanent retention of exactly the content someone wanted removed. And the
public result — a `404` — told a crawler the URL never existed rather than that
it is deliberately gone, which is the wrong removal signal.

The load-bearing question was not archive-versus-delete in the abstract. It was
whether a delete can be *final and honest* without becoming fragile: the entry
must disappear from every product surface at once, while Meilisearch removal and
Cloudflare R2 revocation are external effects that can be slow, can fail, and
must be retried. A design that waits for those makes the destructive action
unreliable; a design that forgets about them leaves the content reachable.

## Decision

**There is no private or archived journal state for a gardener.** An entry
either exists, or the gardener has deleted it. The sole product lifecycle enum
is `active | deleted_retention`.

**Deletion is immediate and canonical.** One transaction removes the entry from
owner and public application reads, scrubs the raw title, body, document,
cover, mentions, topics, and media caption/alt text, records `deleted_at` and
`purge_after`, writes the durable search-absence intent, and enqueues one
derivative revoke per attached final WebP. The owner action never awaits an
external provider.

**What survives for at most seven days is a technical tombstone, not an
archive.** It holds no user-readable content. It exists only so the independently
retryable search and media workers have a canonical record to converge against,
and so the public URL can answer honestly while they do.

**The horizon is exactly `purge_after = deleted_at + interval '7 days'` in
PostgreSQL time**, enforced by a database check rather than by any caller. An
application-computed horizon would drift from a database-computed one across a
daylight-saving boundary; the constraint makes that class of bug impossible
rather than merely discouraged.

**There is no restore.** The lifecycle admits no transition from
`deleted_retention` back to `active`, and the retention check makes the reverse
update fail closed at the database rather than relying on application discipline.

**Physical purge is the terminal step and it is gated, not scheduled.** At or
after the horizon, `runRetentionWorkflow` deletes the row only when every
attached derivative carries a terminal revoke/unreachable receipt, the public
projection intent has verifiably converged to absent, and the
`ON DELETE RESTRICT` dependency from `community_contributions` is closed. An
unresolved effect extends only the hidden tombstone. It never restores
visibility and it never purges early.

## Public result

| State | HTTP | Robots |
| -- | -- | -- |
| `active`, published | `200` | ADR-0018 `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD` |
| `deleted_retention` | `410` | `noindex, nofollow` |
| physically purged | `404` | — |

`410` is the deliberate choice over `404` for the retention window: the URL did
exist, its removal is intentional, and `410` is the removal signal a crawler
acts on fastest. After purge the row is genuinely absent and `404` is the honest
answer. Cloudflare continues not to cache HTML, so the tombstone is served from
canonical state rather than from an edge copy.

## Canonical owners

No parallel queue, table, cron, or privacy policy is introduced.

| Concern | Owner |
| -- | -- |
| Lifecycle transition and content scrub | `apps/web/src/server/journal-repository.ts` |
| Public search removal | `apps/web/src/server/search/public-projection-outbox.ts` |
| Media revoke enqueue | `apps/web/src/server/media/media-lifecycle-enqueue.ts` |
| Provider revocation receipt | `apps/web/src/server/media/media-lifecycle-consumer.ts` |
| Physical purge | `apps/web/src/server/media/retention-executor.ts` |
| Account erasure | `apps/web/src/server/erasure-execution.ts` |
| Production classification and gated conversion | `apps/web/scripts/plan-journal-delete-retention-transition.ts` |

Account erasure remains the stricter, separate workflow. It may move an `active`
or `deleted_retention` entry directly through its own path, and it coalesces
rather than overwrites the retention stamps, so an erasure request can never
postpone an already-running purge by another seven days.

## Migration posture

Migration `0039` is the expand half. It adds the two timestamps, closes the
lifecycle enum, adds the retention equality check, and indexes the purge
horizon. Both new constraints are `NOT VALID`: PostgreSQL still enforces them on
every insert and update, so no runtime writer can produce `archived` again,
while pre-existing historical rows stay readable through a private raw-row
decoder until the separately authorized classification converts them.

The decoder is the only reader that accepts `archived`, it maps it to a
tombstone, and it is removed in this delivery once production reports zero
legacy rows and both constraints validate.

## Alternatives rejected

**Keep archive and add delete alongside it.** Two destructive-looking controls
is exactly the confusion that motivated this ADR. A gardener would have to
learn the difference before they could safely use either.

**Delete the row synchronously.** The row is the only place recording which
derivatives still need revoking and whether search removal has converged.
Deleting it first would make those effects unrecoverable — `media_assets`
cascades from `journal_entries` — and would trade a visible, retryable
obligation for silent orphaned public objects.

**Wait for Meilisearch and R2 inside the owner action.** This makes the most
destructive, least reversible action in the product also its least reliable one,
and puts a third-party outage between a gardener and the removal of something
they may urgently want gone.

**Compute the horizon in application time.** Simpler to read, and wrong twice a
year. It also spreads the definition of "seven days" across every caller
instead of pinning it once where the data lives.

**A shorter window than seven days.** The window has to survive a weekend
outage of a provider plus a bounded retry schedule. Seven days is long enough
that a stuck effect is an operational problem rather than a data-loss one, and
short enough to state plainly to a gardener in one sentence.

## Consequences and falsification

The gardener gets one control with one meaning, and a sentence they can act on:
it is permanent, there is no restore, and a scrubbed technical record is kept
for at most seven days to finish removing the entry from search and to make its
photos unreachable.

This decision is falsified if a real owner still cannot predict whether delete
is final; if a deleted slug remains a live public page or a search result after
a verified worker pass; or if the seven-day purge cannot complete because some
foreign key or external effect still retains raw content. The smallest
reversible response is to disable only the delete control behind its server
availability guard, preserve the tombstone and its retryable cleanup jobs,
investigate the failed receipt, and roll forward. Content, public reachability,
media capability, and archive state are never restored.

## Rollout

Phase A is the merged expand code plus a fresh-bootstrap and exact-SHA
deployment receipt. Phase B begins only after two equal read-only production
plan digests and maintainer approval; it applies one bounded conversion batch,
validates both constraints, and records the provider and HTTP cleanup read-back
before closeout.
