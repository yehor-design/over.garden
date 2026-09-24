# Reproducible redesign states and accessibility proof

OVE-480, 2026-09-21. These are synthetic test fixtures, never production seed data.
The fixture matrix supplements the dated audit; it is not a WCAG conformance claim.

## Run and ownership

Build against a disposable loopback database with every current migration, then run
`pnpm exec tsx scripts/run-browser-gate.ts` from `apps/web`. The runner seeds the
existing sealed synthetic owner before starting `next start`; all new specs are in
`scripts/browser-gate-specs.ts` and run in both local and CI gates. Individual specs
use `--spec=redesign-fixtures.spec.ts`, `--spec=redesign-baselines.spec.ts` or
`--spec=component-specimens.spec.ts` (one at a time).

`tests/helpers/redesign-fixtures.ts` creates only rows owned by a fresh
`@example.test` gardener on loopback. Cleanup is scoped to that user. Collection
inserts are transactional. Never point these helpers at production or copy real
user photographs, descriptions or identifiers into them.

## Coverage matrix

| Dimension | Executed proof / fixture | Boundary |
|---|---|---|
| Guest | Empty `/api/auth/get-session` response | No assumed client identity |
| Ordinary member | Real signup/signin, persisted ID, no admin role, `/garden` with 20 spaces/1000 objects | Different account from sealed owner |
| Owner | Existing seeded owner, real signin and server session ID, persisted owner role | Owner UI remains covered by `owner-catalog-curation.spec.ts` |
| Expired | Expire only synthetic account sessions; retain signed token, remove cookie cache; server answers no session | Does not fake a signed-out UI while session remains valid |
| Collections | 0/0, 1/0, 1/1, 3/100, 20/1000 spaces/objects; database count assertions | Not an impossible Cartesian product: zero spaces cannot own objects |
| Ambiguous labels | Same object name in every distinct space | Identity uses IDs, not labels or first array item |
| Unassigned | Explicit null association boundary value, never persisted | SQL requires space_id; UI must request a choice |
| Deleted destination | Synthetic object inserted then deleted in populated-space presets; database absence asserted | Future composer tests must submit it and verify preservation/no write |
| Languages | Long UK/BG/RU collection names and component labels; mixed-script entries | Per-page copy still needs its own migration proof |
| Content | Text-only (zero media rows), portrait, landscape, multiple photographs, long observation | Every entry is public; no private journal/draft fixture |
| Media weight | Chromium canvas creates deterministic WebP pixels, measured >100 KB and <12 MiB, local request interception serves real bytes | Synthetic transport/layout proof, not R2 promotion or production LCP evidence |
| Empty/error/loading | Existing `screen-states.spec.ts` runs six real design-system states | Does not replace live server failure proof |
| Failing section | Existing `garden-workspace.spec.ts` breaks the local session read and hard-loads the page | Bounded failure and recovery; no production outage injection |
| Width | UK/BG/RU component specimens at 320, 390, 768, 1280, 1920 CSS px | Actual page layouts migrate separately |
| Enlarged text | Every specimen at 200% root font size, fonts settled, geometry and PNG width asserted | Not identical to browser UI zoom |
| 400% reflow | 320 CSS-pixel width is the layout equivalent of a 1280 CSS-pixel desktop at 400% | Browser zoom/AT manual check below remains required |
| Keyboard | Tab traversal, dialog trap/return, Escape, menu and tabs | Focused controls alone do not prove full workflow |

Reusable assertions in `tests/helpers/redesign-accessibility.ts` cover keyboard
reachability, dialog trap/return, live messages, pending named controls,
field-error association and reflow. They assert semantics, not CSS snapshots.
Existing keyboard publication tests exercise a real server write and confirm the
persisted object; new fixture SQL inserts are never presented as UI publication.

## Automated accessibility scope

New scans use `wcag2a`, `wcag2aa`, `wcag21aa`, **`wcag22aa`** with no rule exclusions.
The installed axe-core is 4.12.1; `target-size` is the installed WCAG 2.2 AA rule.
Each scan attaches runtime engine version, requested tags, supported 2.2 rules,
violations and incomplete results. CI fails on violations; incomplete results need
human review. Since OVE-478 every browser spec scans with these tags: the list is
`WCAG_AA_TAGS` in `tests/helpers/redesign-accessibility.ts`, and
`pnpm check:browser-specs` fails a spec that spells its own (eighteen scanned
with a WCAG 2.1 list until then, so `target-size` never ran on them).

Axe does not certify focus not obscured, drag alternatives, complete keyboard
workflows, meaningful reading order, comprehensible announcements, cognitive load
or useful alternative text. Passing this gate is necessary, not sufficient.

## Baselines must fail for the right reason

`redesign-baselines.spec.ts` asserts desired behavior on actual rendered controls:
Write points to the destination-aware composer; three-space setup has no implicit
first-space value; filter dismissal is named Close. Setup/visibility assertions run
before `test.fail`, so missing controls or broken authentication are not expected
failures. Run with `REDESIGN_ENFORCE_BASELINES=1` to record ordinary failures.

All three corrections shipped (OVE-482, OVE-483, OVE-486), and the three
baselines are ordinary passing tests with no `test.fail` (checked by OVE-478).
The rule for any future baseline stands: a correction producing an unexpected
pass fails CI, so remove the annotation and migrate the locator to the shipped
control in that correction. Never replace the assertion with a snapshot of the
old bug or skip it because the UI moved.

## Manual assistive-technology protocol

For each migrated page, record OS, browser, screen-reader version, viewport,
locale, role, exact tested SHA, steps and observed outcome. A headless Chromium
result is not a VoiceOver or NVDA result.

1. macOS VoiceOver + Safari (and Windows NVDA + Firefox/Chrome where available):
   navigate landmarks, headings and form controls with the rotor/elements list.
   Confirm one meaningful main heading, correct reading order and labels without
   duplicate decorative glyph announcements.
2. Start global Write using only the keyboard. Search duplicate object names in
   different spaces; confirm each result announces its disambiguating space.
   Confirm focus stays visible above the mobile action bar and after opening a
   dialog, selecting a result, cancelling nested creation and returning.
3. Trigger validation, an offline network error and a slow request on the local
   fixture. Listen for one useful error/status announcement; ensure pending state
   is named and retry preserves the in-memory input. Do not infer announcements
   from merely finding role=status in DOM.
4. At 1280px desktop zoom the browser to 400%; at normal zoom use 200% text-only
   enlargement where the browser supports it. Read and operate primary controls
   without two-dimensional scrolling or clipped labels. Check dialog close,
   sticky bars and the virtual keyboard separately.
5. Enable forced colors and reduced motion. Confirm selected state, errors and
   keyboard focus remain distinguishable without color or animation alone.
6. Verify real photo alternatives/captions against the depicted content. Synthetic
   pixels can verify image transport and reserved geometry, not caption quality.

Unperformed AT steps must remain marked unperformed in a task receipt. Never
substitute an axe score or screenshot for listening to the actual announcement.

**Performed so far (OVE-478, 2026-09-24):** one real pairing — Orca 46.1 with
Chromium 141 on Linux (AT-SPI 2.52, speech-dispatcher 0.12 with espeak-ng
1.51), at 1280 × 900, keys pressed through the X server, what Orca said read
from its own log; the transcript is `ove-478/screen-reader/`. Step 1:
landmarks, headings and links on the home page, a 404, the journals, an entry
and the gardener's collection. Step 2: global Write by keyboard only — three
same-named tomatoes, each announced with its space, one chosen by arrows;
a plant created while writing and cancelled back to the picker; focus after
the journals' filters and the sign-out confirmation close. Focus above the
mobile action bar is checked in a real engine rather than heard
(`tests/route-families.spec.ts`). Step 3: validation (the required
first-publication box, and Publish unavailable until it is ticked) and an
offline Publish — one announcement, the text kept, focus kept on Publish, and
Enter publishes on retry; a slow request was not staged. Steps 4 and 5 are
measured in a real engine by `tests/route-families.spec.ts`, which checks
layout, not listening. Step 6 was not performed with real photographs.
VoiceOver + Safari and NVDA + Firefox/Chrome were not run (no macOS or Windows
machine), and remain unperformed.