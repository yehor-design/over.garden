# Founder interview capture (OVE-45)

Operator-only research-ops surface for recording structured pilot interview learnings after talking with invited gardeners.

## Purpose

Quantitative first-save and follow-up metrics are not enough during closed pilot. The founder needs bounded qualitative learning tied to cohort segment and activation outcome without turning private journals into research notes.

## Access

- Route: `/garden/pilot-learning/interviews`
- Gate: same operator allowlist as catalog curation (`CATALOG_CURATOR_USER_IDS`)
- Fail-closed: unauthenticated users see sign-in; authenticated non-operators see access denied

## What may be copied from interviews

- Segment bucket from `C2_RECRUITING_AND_SCREENER_v4.md` (casual-core, power-core, supply-side, channel-ally)
- Activation outcome observed in product (first save, follow-up, started-no-save, dropped, not in cohort)
- Return reason enum (same-object follow-up, seasonal return, never returned, friction, privacy concern, etc.)
- Main objection enum (effort, privacy, no habit, prefers paper/social, product too early, etc.)
- Observed value enum (history worth keeping, photo-safe capture, catalog help, offline queue, progress moment, etc.)
- Next operator action enum (continue pilot, iterate composer/onboarding/privacy copy, schedule follow-up, pause recruiting, close track)
- Optional internal `subject_user_id` UUID for aggregate cohort interpretation
- Optional `pilot_cohort` enum (`closed_pilot` only today)
- Optional short redacted note (max 280 characters) with no names, addresses, or quoted journal text

## What must NOT be copied

- Private journal title or body text
- Private media keys, quarantine paths, derivative paths, signed URLs
- Email, phone, street address, precise coordinates, EXIF GPS
- IP address, user agent, referrer, raw URL, query string
- Raw interview transcript or long free-form notes
- Contact management fields beyond an internal user id UUID

Validation rejects obvious forbidden fragments in all string inputs before insert.

## Storage

Table: `pilot_interview_learnings` in `apps/web/sql/0001_walking_skeleton.sql`

All structured fields are bounded enums enforced in SQL and TypeScript. The repository never joins journal entries, media assets, or analytics events.

## Verification

```bash
cd apps/web
pnpm lint
pnpm typecheck
pnpm test
```

## Failure gate

Do not mark Done if the surface becomes a raw transcript store, exposes private journal content, or works for non-operators.
