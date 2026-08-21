# Precise-Location Text Firewall

Status: active guardrail
Owner issue: [OVE-234](https://linear.app/overgarden/issue/OVE-234/p0-precise-location-text-firewall-coordinates-never-enter-persist)
Policy version: `ove234.precise-location.v1`
Authority: `AGENTS.md` hard rule 1

## ADR-0018 successor posture

ADR-0018 supersedes refusal-first language when authorization, ownership, or
session state is unresolved: the request serves, with the accepted
cross-account-read exposure, and OVE-332 owns that runtime transition. A
positively detected precise coordinate is still outside the product data model;
this successor does not authorize collecting or publishing precise location.
The refusal descriptions below are the current transitional implementation and
historical OVE-234 proof, not vocabulary that a new issue must reproduce.

## Why This Exists

OverGarden serves Ukrainian gardeners under wartime risk. A precise coordinate
in free text is not a formatting problem — it is a targeting-grade disclosure.
Before OVE-234 the codebase enforced hard rule 1 on structured location fields
(`location_visibility`, `coarse_region_code`) but accepted arbitrary coordinate
text in journal entries, comments, profile bios, lineage labels and questions,
interview notes, and public search terms. Any of those could then reach the
public projection, moderator queues, notifications, and logs.

The firewall closes that gap with one authoritative server-side policy applied
at every boundary.

## Authority

| Concern                   | Module                                                          |
| ------------------------- | --------------------------------------------------------------- |
| Detection policy (TS)     | `apps/web/src/lib/privacy/precise-location-text.ts`             |
| Structured journal walk   | `apps/web/src/lib/privacy/precise-location-journal-document.ts` |
| Localized refusal copy    | `apps/web/src/lib/privacy/precise-location-copy.ts`             |
| Detection policy (Python) | `services/matching/app/precise_location.py`                     |
| Shared corpus contract    | `contracts/privacy/precise-location-text-corpus.json`           |
| Read-only inventory       | `apps/web/src/server/privacy/precise-location-inventory.ts`     |

Both detectors are pinned to the same corpus. Changing detection means changing
the corpus and re-running both suites; the policy version string must move with
any behavior change.

## What Counts As Precise Location

| Kind                      | Example shape                                 |
| ------------------------- | --------------------------------------------- |
| `decimal_pair`            | `50.45010,30.52340`, `50,45010 30,52340`      |
| `labeled_decimal`         | `широта 50.4501`, `lat: 50.4501`              |
| `hemisphere_decimal`      | `50.4501N, 30.5234E`, `50.4501 Пн 30.5234 Сх` |
| `degrees_minutes_seconds` | `50°27'0.4" N 30°31'24.2" E`                  |
| `geo_uri`                 | `geo:50.45010,30.52340`                       |
| `map_url_coordinates`     | a map link carrying a coordinate pair         |
| `plus_code`               | a full Open Location Code                     |

Input is Unicode-normalized first: full-width digits, bidi and default-ignorable
controls, minus/degree/prime/comma/full-stop homoglyphs all fold onto the ASCII
forms before matching. Glyph folding runs before _and_ after NFKC, because NFKC
itself rewrites `º` to `o` and `″` to `''`.

### Precision thresholds

An unlabeled decimal pair needs **three** fractional digits on both numbers
(~110 m). A labeled or hemisphere-marked value needs **two**, because the label
already declares intent. This is the deliberate trade-off that keeps prices,
dimensions, quantities, and ratios writable.

### What is deliberately _not_ blocked

Keyword-only detection is not a strategy here. Writing "не публікуйте
координати своєї ділянки" is fine — a label only lowers the numeric threshold.
Ordinary vocabulary that doubles as a coordinate label in Bulgarian and Russian
("ширина", "дължина" — width/length) is excluded from the label list entirely.
A single hemisphere-marked number is ambiguous with units (`12.35 W`,
`220 В`), so it is only rejected when both axes appear or a label is present.

## Enforced Boundaries

Write and query boundaries (refuse before any DB, outbox, queue, or log write):

- journal title — `journal-repository.ts` `normalizeJournalEntryTitle`
- journal document + derived body — `journal-document-persistence.ts`
  `resolveJournalContentForWrite` (every span, nested list item, quote
  attribution, and link href, plus the joined block text so a coordinate cannot
  hide across inline marks; the canonical document shape is never rewritten)
- public comments — `engagement-repository.ts` `normalizeCommentBody`
- profile bio and display name — `owner-profile-repository.ts`
- lineage source labels and pending labels — `lineage-repository.ts`
- lineage questions — `lineage-interactions-repository.ts`
- subject-linked interview notes — `lib/pilot/interview-learning.ts`
- analytics properties — `analytics-events.ts` (defence in depth over an
  already-bucketed vocabulary)
- public journal directory search and community search — the term is **dropped**
  rather than thrown, so a crafted GET link cannot become an error page that
  routes the value through logs

Transitional read and projection behavior on legacy rows (the refusal-first
wording is superseded for future contracts by ADR-0018):

- Meilisearch public journal projection — `services/matching/app/search.py` and
  the TS contract fixture in `server/search/documents.ts` drop the document;
  OVE-331 quality classes never convert precise location into a degraded reason
- public profile serializer — bio and avatar alt are withheld
- comment readback — a coordinate-bearing legacy comment reads as under review
- notifications and followed-feed excerpts — label and excerpt are withheld

Queue: OVE-225 already enforces exact identifiers-only payloads at producer,
storage `CHECK`, and Python consumer. OVE-234 adds the standing assertion that
no manifest kind declares a free-text payload key.

Client-side checks remain advisory. The enforcement boundary is always the
server call that persists or projects the value.

## Errors

Refusals are typed (`PreciseLocationTextError`, code `precise_location_text`)
and carry surface plus classification only. Neither the message, the stack, the
HTTP response, the redirect status, nor the inventory report ever echoes the
rejected value. User-facing copy is localized for `uk`/`bg`/`ru` and is
actionable: it tells the gardener to describe the place by region.

## Commands

```bash
cd apps/web && pnpm privacy:location:audit
```

```bash
cd apps/web && pnpm smoke:precise-location-firewall
```

The audit is SELECT-only and reports counts, classifications, and row ids. The
smoke additionally proves, against live Postgres, that every named surface
refuses a synthetic coordinate payload before any row is written and that the
row count is unchanged.

## Cleanup Policy

The audit is read-only by design. Any reclassification or redaction of existing
rows is a separate, exact, reversible plan that requires maintainer sign-off
before it touches production (`AGENTS.md` "Do Not Touch Without Explicit
Maintainer Sign-off"). Until such a plan is approved, legacy rows stay in place
and are contained by the read-side firewall above.

As of the OVE-234 closeout the local inventory reported `0` affected rows across
`663` scanned rows, so no cleanup plan was required.
