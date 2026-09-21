# Centered shell delivery — OVE-481

Baseline: `88f02031f943e11a7e754bb403fd1dfee653d806`. Release identity,
CI and production verification belong to the authenticated Linear receipt.
This document describes the implemented contract and reproducible proof;
it is not a claim that the entire redesign has shipped.

## Delivered

- One centered grid: 1280 px outer frame, 20 px gutters, 208 px navigation,
  704 px reading column, 280 px context and two 24 px gaps. From 1024 to
  1279 px the two-column frame is 976 px including gutters. Below 1024 px
  the header, reading content and five-slot bottom navigation use one column.
  These are OverGarden design decisions, not measurements attributed to vc.ru.
- Feed, Explore, My garden and Activity are the primary destinations.
  Explore exposes Catalogue, Communities (when ready) and Knowledge locally.
  Feed exposes reading/following locally. Saved reading, wishlist, lineage
  claims, profile and account tools are utilities; personal pages no longer
  repeat a competing four-tab navigation.
- Owned object/space routes select My garden; public organism/passport and
  discovery routes select Explore. Profiles and entry permalinks select Feed.
  Pre-hydration active-section CSS and the enhanced route matcher agree.
- Search is a native localized link before enhancement, including with scripts
  disabled. After enhancement the same control opens the keyboard-driven
  palette and restores focus on Escape. Secondary bars are in the served HTML
  and selected by the document boot marker before paint, not inserted late.
- Mobile account access is in the header. Protected destinations carry real
  sign-in return paths. Pending/unreachable session feedback retains its status
  semantics and retry link, including the compact account control.
- Only page-owned context with actual links produces an aside. Empty modules
  and the generic welcome card are absent. The wide track remains reserved:
  late context does not move the reading column. Essential links remain in
  the page when the aside disappears below 1280 px.
- New entry temporarily opens `/garden#inventory`, where existing objects have
  working contextual entry links. It never opens add-object as a substitute.
  The targetless guest intent resumes at that same inventory; explicit named
  composer controls retain their existing return anchors. The shared routed
  composer and direct space writing remain downstream work, not delivered here.
- Shared list rows place trailing actions below their content on narrow
  screens; named sections have a zero minimum width. A populated garden fixture
  exposed a real 28 px overflow at 320 px before this fix. Horizontal tab
  strips do not acquire an accidental vertical scrollbar.
- No persistence, schema, publication visibility, consent or authorization
  change. Journal entries remain public only. Late shell state continues to
  use the external store; no page ancestor was made reactive to session data.

## Proof and reproduction

`tests/site-shell.spec.ts` measures the frame and its center numerically,
asserts no document overflow, one main/banner and a single visible writing
entry point. It covers guest/member, UK/BG/RU, 320/390/768/1280/1920/2560 px,
plus the 1024 px two-column boundary. Member fixtures use isolated local
synthetic ownership and clean up afterward. Full viewport screenshots include
actual populated garden content rather than a shell-only specimen.

`tests/mobile-shell.spec.ts` covers keyboard, 44 px targets, text spacing,
axe and 320 CSS px reflow. That reflow is equivalent viewport geometry for
1280 px at 400%; it is not a claim of a native browser-zoom session.
`tests/static-documents.spec.ts` covers served bytes, no-JavaScript reading,
pre-hydration active navigation and session convergence. The store stability
unit tests additionally retain actual page DOM identity across late changes.
`tests/garden-workspace.spec.ts` retains hard-load degraded dependency proof.
Consent navigation assertions now follow Feed/Explore without weakening their
same-document persistence or no-tracker assertions.

All specs are in the existing browser gate. Run against `next build`/`next
start` through `scripts/run-browser-gate.ts` with the isolated local infra
wrapper; do not substitute a development server. Evidence in `ove-481/`
contains baseline and delivered viewport captures. Exact gate results and
release checks are added after completion; failures are not completion proof.

No native VoiceOver/NVDA session is claimed. This slice does not close the
three expected UX failures owned by the destination picker, composer and
mobile filters, nor the static/performance prerequisites of final integration.

## Local verification recorded so far

- Production build and typecheck passed; lint passed with zero warnings.
- Full unit/gate command: 561 files / 4,290 assertions passed, six files / 29
  assertions skipped in the local no-infra unit environment. Python: 14 passed.
- Focused real-browser shell gate: nine tests passed in 14.4 seconds, including
  the 36 role/locale/viewport matrix with loaded inventory, numerical center,
  one main/banner and single visible writing action.
- Full browser run: 200 passed / one external integration skip / one failed
  setup of the filter baseline. Its trigger readiness was corrected, then all
  three baseline tests reran successfully (17.1 s). Those three successes are
  expected failures, not delivered UX fixes. The full CI suite remains a merge
  requirement; its exact tested SHA and results are recorded in Linear.
- The final context-only removal also passed its focused unit test. The final
  production build and lint passed. Before/after artifacts include 40 delivered
  viewport captures and a 36-sample geometry JSON: maximum centering error 0 px,
  maximum horizontal overflow 0 px.
- Manual inspection of narrow and wide rendered screenshots confirmed visible
  account access, the wrapped inventory action and the centered column group.
  This visual inspection is not a native screen-reader session.
