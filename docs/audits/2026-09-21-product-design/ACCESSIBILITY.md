# Accessibility review and release proof

## What this audit establishes

This is a manual visual/DOM/source review with selected keyboard interactions. **No fresh axe, screen-reader, Lighthouse or complete WCAG conformance run was executed.** Existing test code was inspected; its presence is not a passing test result. No blanket statement that OverGarden either passes or fails all of WCAG 2.2 AA is justified.

Confirmed accessible foundations: named search controls and form fields in inspected screens; skip-link presence; named mobile navigation; recognizable button/link semantics; command palette keyboard handling; an actual filter dialog with initial focus. Public content and signed-in enhancements are intentionally separated in current architecture. Preserve these during redesign.

## Findings and standards mapping

| Observation | Status | Relevant criterion/check | Required evidence |
|---|---|---|---|
| Filter-sheet close is labeled Reset all | Confirmed in live mobile DOM and FilterBar source | 2.4.6 / 4.1.2 semantic accuracy; do not claim missing name—the name exists but is wrong | Close, Clear all and Apply have distinct truthful names and actions; focus returns |
| Axe tags omit wcag22aa | Confirmed test-configuration gap | Coverage of WCAG 2.2 additions | Updated automated scope plus manual checks; green axe alone is insufficient |
| Feed alt repeats title/date | Confirmed pattern; adequacy depends on image purpose | 1.1.1 | Informative photo conveys its observation through a useful text alternative |
| UGC lang wrapper contains interface date | Source-confirmed risk; speech not tested | 3.1.2 | Correct inheritance and screen-reader pronunciation with mixed-language entries |
| Two H1 headings on owned-object screen | Confirmed structure issue, not automatically a WCAG failure | 1.3.1 / 2.4.6 review | Coherent heading outline and useful landmark navigation |
| Horizontal strips render vertical scrollbars | Confirmed visual defect; focus clipping not yet established | 2.4.7 / 2.4.11 risk | Focus remains visible with permanent scrollbars and zoom |
| Large consent notice overlays content | Confirmed overlay; focus-obscuring failure not established | 2.4.11 / 1.4.10 review | Focused controls and choices reachable at narrow widths and zoom |
| Composer supports drag operations | Interaction exists; full keyboard path not executed here | 2.5.7 and keyboard equivalence | Every drag task has a simple pointer alternative and keyboard path |
| Small icon actions | Named controls observed; no blanket target-size failure established | 2.5.8 | Measure effective target and spacing, not just icon glyph; 44 px is a design target, not the AA minimum |

Criteria references use the [W3C WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/). Mappings indicate the relevant evaluation area, not a legal conclusion.

## Existing automated coverage: concrete limits

`apps/web/tests/accessibility.spec.ts:44` uses `["wcag2a", "wcag2aa", "wcag21aa"]`. Its public scan includes home, followed feed, journals, `/objects`, organism, communities and sign-in. The signed-in pass creates a synthetic gardener and entry and scans workspace, profile and entry. Home/followed feed explicitly scan 375 and 1440 px; subsequent `scan` calls inherit the last viewport rather than independently proving both widths. The old `/objects` alias may reach the current catalogue, but canonical-route coverage should be explicit.

The same file has keyboard tests for sign-in, journal filtering, publishing, focus rings and command palette. These are useful assets, not a reason to skip new destination-picker, multi-space, dirty-close, media-error and mobile-keyboard tests. The injected deliberate violation check is a valuable guard against a scanner that never runs. Preserve it.

## Manual checks performed

- Desktop visual inspection at ordinary laptop and wide Chrome dimensions, with the actual system scrollbar presentation.
- Command search for a gardening term; result grouping and Escape/focus behavior inspected in the earlier search pass.
- Mobile journal filter dialog opened at 390 CSS px; initial focus and accessible names inspected; Escape returned focus to the invoking Filters button. This directly revealed the incorrect close name.
- Heading/landmark/control DOM review on core reader, garden, object, profile, knowledge and owner screens.
- Narrow-width document geometry checks saved in `responsive-measurements.json`; these are spot checks, not a responsive certification.

Viewport override screenshots rendered with inconsistent scaling through the browser capture backend. They were excluded rather than presented as product clipping defects. Desktop screenshots remain usable. No real phone, Safari or on-screen keyboard was available in this pass.

## Required test matrix for redesign signoff

| Dimension | Minimum cases |
|---|---|
| Input | Keyboard only, touch, pointer, speech-control-compatible visible labels |
| Assistive technology | VoiceOver + Safari and NVDA + a supported Chromium/Firefox setup where available; record actual versions |
| Width/reflow | 320 CSS px, 390, 768, 1024, 1280, 1440, 1920; 200% text resize and 400% browser zoom at a suitable starting width |
| Content | Empty, one item, many items, long title/name, mixed languages, image/no image, portrait/landscape, long URL |
| Auth | Guest, ordinary gardener, sealed owner, expired session, account switch |
| Feedback | Initial load, updating, zero results, section timeout, validation error, upload failure, uncertain submit, success |
| Motion/color | Reduced motion, forced colors/high contrast, focus distinguishability, meaningful status without color alone |
| Localization | UK/BG/RU UI with both same-language and different-language authored content |

## Journey-specific checks

**Create:** visible destination, usable listbox, correct focus on open/close, announcements for results/selection/upload/publish, no keyboard trap, no context change simply on focus, no lost text after validation. First disclosure must be readable and linked to its acceptance control. Data-entry hints must not live only in disappearing placeholders.

**Read:** article structure, image description quality, heading outline, link purpose out of context, date semantics, object versus species labeling, copy-link feedback, comment/reply focus and error association.

**Find:** search name and result status, pending vs applied filters, empty-results recovery, history/back preservation, no unexpected select-on-focus, pagination names and current state, long scientific names at narrow widths.

**Manage:** distinct public preview versus editable fields, password autocomplete and password-manager compatibility, clear field errors, non-destructive cancellation, named confirmations. Do not block paste or add cognitive puzzles to authentication.

**Owner tools:** table headers, selected rows, explicit scope of decisions, keyboard access to evidence/details, failure distinguished from empty queues, confirmation and outcome announced. Run mutation tests in a controlled fixture environment, not the owner's production session.

## Contrast and targets

This audit did not obtain a fresh reliable computed-color contrast set. Historical DESIGN.md ratios and earlier audit claims are not current measurements. Measure actual composited foreground/background pairs, including muted captions, placeholders, chips, disabled-looking enabled controls, images and focus states. Correctly parse OKLCH/Lab colors; do not repeat the historical RGB-parser false positives described in ADR-0031.

Evaluate text at the correct size/weight threshold; do not classify a placeholder as exempt merely because it is a placeholder. Check the 24-by-24 CSS px AA target rule with its spacing exceptions; aim for comfortable 44-by-44 interaction areas where layout permits. List exact failing elements and conditions instead of claiming every small icon fails.

## Release evidence format

For every page family: route, account role, seeded state, locale, viewport, browser/AT version, steps, expected result, observed result, screenshot/recording, automated report, open limitation. A successful action ends at a server-acknowledged result, not at a clicked button. No finding closes merely because a token, ARIA attribute or snapshot test changed.
