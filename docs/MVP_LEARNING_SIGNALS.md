# MVP Learning Signals (OVE-200)

Status: current self-serve policy after OVE-314
Policy version: `ove200.learning.v1`  
Date: 2026-08-11

## Purpose

H1 (journal retention), H4 (publication), and H6 (organic/public acquisition) must be computed from real eligible actors only. Production smoke, fixture, editorial, and bot evidence is visible as exclusions and cannot change continue/iterate/stop.

Honest zero real users is a valid baseline. Synthetic activity must never pad it.

## Actor / evidence classes

Canonical write set:

| Class              | Decision eligible?                |
| ------------------ | --------------------------------- |
| `real_self_serve`  | Yes (the single real-user cohort) |
| `production_smoke` | Exclusion only                    |
| `visual_fixture`   | Exclusion only                    |
| `editorial_seed`   | Exclusion only                    |
| `automated_bot`    | Exclusion only                    |

Migration `0021_ove314_retire_obsolete_control_plane.sql` converts historical aliases and retired cohort values once. Current runtime writers and readers accept only the canonical classes above.

Durable rows live in `learning_actor_attributions` (`user_id`, bounded `actor_class`, source). OVE-219 makes attribution asynchronous and transactional: every successful canonical journal create/edit advances one non-identifying `learning_attribution_outbox` intent in the same database transaction; the response is not allowed to wait for attribution reads or writes. A monotonic desired generation guarantees that an event committed after an earlier consumer settlement is backfilled by a later lease; reopening terminal work resets the retry budget for that new generation. The leased consumer resolves an explicit producer classification, then a durable row, then the `real_self_serve` default. A post-response drain is best effort; protected `/api/cron/learning-attribution` is the normal recovery path. `pending`, `processing`, `failed`, or `dead` outbox work, any missing durable class for an active journal owner, and any analytics class inconsistent with its durable row all fail the decision gate closed. The outbox stores only the user id and bounded processing state; never a product-access hint, invitation, email, URL, request metadata, or content.

## Metric rules

- **H1:** activated eligible gardeners with ≥2 dated same-object entries plus same-session revisit/decision proxy (`own_record_revisited` followed by action). First save alone is not retention.
- **H4:** the rate numerator is distinct eligible gardeners with at least one active public, decision-eligible journal `content_class` value (`real_ugc`, `founder_first_hand`). Raw publication-entry volume is diagnostic only, so the rate remains within `[0, 1]`. Location visibility stays a separate diagnostic.
- **H6:** organic acquisition is deliberately `not_instrumented` and `decisionReady: false`. It is visibly reported as “organic acquisition is not measured yet”; editorial public traffic and indexability remain separate content diagnostics, never an H6 proxy. No new consent, cookie, referrer, ID, content, or third-party acquisition collection is authorized by this policy.

The active first-party event vocabulary is bounded to `activation_started`,
`space_created`, `object_created`, `entry_logged`, `entry_photo_attached`,
`progress_screen_shown`, `own_record_revisited`, `follow_up_value_pulse`,
`journal_blocks_reordered`, and `journal_cover_changed`. Historical connectivity
events are non-operative provenance documented in
`docs/OFFLINE_RETIREMENT_PROVENANCE.md`; they are never decision-eligible H1,
H4, or H6 inputs.

## Decision gate

The canonical report owns the gate and evaluates it fail-closed:

1. Missing or inconsistent durable attribution, outstanding attribution work, or unclassified activity returns `unclassified`.
2. Until a future founder-approved, consented H6 instrumentation contract exists, H6 is `not_instrumented` and returns `insufficient`, regardless of H1/H4 values or zero real users.
3. A strategic continue/iterate/stop recommendation is permitted only when the canonical `decisionGate` is exactly `ok`; every other state is `insufficient_data`.

The reconciliation smoke scans keys that actually exist in `analytics_events.properties` and emits an aggregate hit count only. A forbidden key, timeout, or scan error is non-green and exposes neither a key nor a value.

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

Production reclassify (after reviewing the SELECT-only plan) is only for current canonical producer/self-serve classification. It does not recreate retired cohort semantics:

```bash
pnpm smoke:mvp-learning-signals -- --environment production --confirm-environment production --confirm-reclassify --confirm-production-reclassify
```

## Operator surfaces

- There is no learning-status or pilot-health UI.
- Operators use the aggregate-only CLI commands above and the protected `/api/cron/learning-attribution` recovery boundary.
- Product decisions must not depend on owner-authored manual forms or synthetic activity.

## Retention

First-party analytics expire at 13 months via OVE-195 (`ove195.retention.v1`). Learning reports state both policy versions and generation freshness.
