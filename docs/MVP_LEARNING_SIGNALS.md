# MVP Learning Signals (OVE-200)

Status: done on main (Vercel READY)  
Policy version: `ove200.learning.v1`  
Date: 2026-07-24

## Purpose

H1 (journal retention), H4 (publication), and H6 (organic/public acquisition) must be computed from real eligible actors only. Synthetic, rehearsal, smoke, fixture, editorial, and bot evidence is visible as exclusions and cannot change continue/iterate/stop.

Honest zero real users is a valid baseline. Synthetic activity must never pad it.

## Actor / evidence classes

Canonical write set:

| Class | Decision eligible? |
| --- | --- |
| `real_self_serve` | Yes (self-serve baseline cohort) |
| `real_closed_pilot` | Yes (historical closed-pilot cohort; never mixed into self-serve) |
| `founder_rehearsal` | Exclusion only |
| `production_smoke` | Exclusion only |
| `visual_fixture` | Exclusion only |
| `editorial_seed` | Exclusion only |
| `automated_bot` | Exclusion only |

Legacy event property aliases still readable: `self_serve` → `real_self_serve`, `closed_pilot` → `real_closed_pilot`, `editorial` → `editorial_seed`.

Durable rows live in `learning_actor_attributions` (`user_id`, bounded `actor_class`, source). OVE-219 makes attribution asynchronous and transactional: every successful canonical journal create/edit advances one non-identifying `learning_attribution_outbox` intent in the same database transaction; the response is not allowed to wait for attribution reads or writes. A monotonic desired generation guarantees that an event committed after an earlier consumer settlement is backfilled by a later lease; reopening terminal work resets the retry budget for that new generation. The leased consumer resolves durable row → optional pilot grant → `real_self_serve` default, then backfills only missing bounded `actor_class` properties on that owner's existing analytics. A post-response drain is best effort; protected `/api/cron/learning-attribution` is the normal recovery path. `pending`, `processing`, `failed`, or `dead` outbox work, any missing durable class for an active journal owner, and any analytics class inconsistent with its durable row all fail the decision gate closed; documented historical analytics aliases (`self_serve`, `closed_pilot`, `editorial`) normalize before this comparison. The outbox stores only user id plus enum cohort/segment; never an invite token, email, URL, request metadata, or content.

## Metric rules

- **H1:** activated eligible gardeners with ≥2 dated same-object entries plus same-session revisit/decision proxy (`own_record_revisited` followed by action). First save alone is not retention.
- **H4:** publication counts only for eligible actors and decision-eligible journal `content_class` values (`real_ugc`, `founder_first_hand`). Location visibility stays a separate diagnostic.
- **H6:** privacy-safe public-surface aggregates; editorial public traffic reported separately. No private paths, referrers, IDs, or content in evidence.

## Composer / cover measurement

After a successful canonical journal aggregate mutation (not replay/retry/debounce):

- `journal_cover_changed` when cover source changes
- `journal_blocks_reordered` when block order hash changes

Allowlisted props only: `photo_count_bucket`, `cover_source`, `block_count_bucket`, `has_formatting`, `via_voice`, `schema_version`, `mutation_outcome`, `latency_bucket`, plus existing allowlisted enums. Never exact counts, media IDs, filenames, URLs, or content.

## Commands

```bash
cd apps/web
pnpm mvp-learning:plan -- --environment local --confirm-environment local
pnpm smoke:mvp-learning-signals -- --environment local --confirm-environment local
pnpm retention:report -- --environment local --confirm-environment local
```

Production plan/smoke require matching `--environment production --confirm-environment production`. Local reclassify:

```bash
pnpm smoke:mvp-learning-signals -- --environment local --confirm-environment local --confirm-reclassify
```

Production reclassify (after reviewing the SELECT-only plan):

```bash
pnpm smoke:mvp-learning-signals -- --environment production --confirm-environment production --confirm-reclassify --confirm-production-reclassify
```

## Operator surfaces

- `/garden/pilot-health` — closed-pilot health plus MVP learning dual-cohort panel
- `/garden/pilot-learning/decision` — refuse go/no-go when MVP learning gate is `unclassified` or `stale`

## Retention

First-party analytics expire at 13 months via OVE-195 (`ove195.retention.v1`). Learning reports state both policy versions and generation freshness.
