# Reference evidence and transfer decisions

Research date: 21 September 2026. Mobbin returns archived product examples; a screenshot is evidence of a pattern, not proof that it is the current live design or that it improves conversion. Inline previews were visually examined. Canonical links below are durable citations; expiring image URLs are deliberately not embedded. No competitor screenshot is redistributed as an OverGarden asset.

## Reference hierarchy

1. **Threads (Meta): principal visual and composition reference**, explicitly reaffirmed by the owner during the audit.
2. **vc.ru: the centered three-column desktop layout**, explicitly required by the owner.
3. **Airbnb: supporting discovery/filter/card clarity**, subordinate to Threads styling.
4. **Notion: a narrowly scoped destination-search pattern**, not another competing visual theme. Existing rich editor behavior already relates to ADR-0028.

## Observed Mobbin references

| Reference | What was actually visible | Transfer to OverGarden | Do not copy blindly |
|---|---|---|---|
| [Threads feed](https://mobbin.com/screens/b05902e9-b215-47d3-afb7-54346c11af0d) | Author-led compact social entries, central reading feed, persistent left navigation and creation affordance; dark presentation | Reading hierarchy, authorship before content, compact social rhythm | Dark palette, recommendations unsupported by OverGarden data |
| [Threads multi-column view](https://mobbin.com/screens/0db0ea31-1837-4a35-98c8-dbb2d460b0e1) | Light surfaces, separate feed/search columns, restrained borders and repeated post structure | Quiet visual system and consistent post anatomy | User-configurable multiple feeds; it is not the vc.ru shell requirement |
| [Threads adding images flow](https://mobbin.com/flows/b38612ad-da22-4755-a575-084a64ec4cc0) | A centered New thread composer over the feed; text first; small attachment tools; image previews with remove controls; Post remains distinct. Preview positions 1, 3 and 4 were returned and inspected | Focused writing surface, progressive media preview, few visible decisions, clear publish action | Draft icon/behavior, audience/community rules, unsupported media; four screens are not a measured four-click claim |
| [Airbnb discovery cards](https://mobbin.com/screens/65e3429b-12dd-45be-a076-b69d47c03124) | Search results count, compact filtering chips and image-led comparable cards | Filter/result clarity and consistent metadata | Travel-specific categories, booking pricing, map assumptions |
| [Airbnb home search](https://mobbin.com/screens/a4ec4424-9a4c-4700-a253-562fabac3394) | Mode navigation and a prominent search area above rows of listings | Make the main discovery input obvious and distinguish result modes | Large travel search hero on every OverGarden page |
| [Notion destination search](https://mobbin.com/screens/f8e60bf2-639b-4edf-9331-294556537eb5) | Search field over a list of pages, secondary context, teamspace grouping and selected destination inside an import flow | Search among many owned destinations, parent context, visible selection | Import wizard and mandatory Continue step for a simple entry |
| [Notion move-page picker](https://mobbin.com/screens/0df641e3-d047-4712-9479-d491e52d984f) | Compact contextual move picker with search, suggested pages and expandable groups | Change destination without leaving the current task | A deeply nested page tree: OverGarden currently needs spaces and objects, not arbitrary Notion hierarchy |

The destination picker recommendation combines observed search/grouping mechanics with OverGarden's actual entity model. Mobbin does not itself establish that these are the best possible patterns for gardeners. Validate the resulting flow with the task scenarios in FAST_ENTRY.md.

## vc.ru inspection

[vc.ru](https://vc.ru/) was inspected live at ordinary and wide desktop sizes. [Wide screenshot](screenshots/16-vc-centered-1920.png) shows navigation, a main feed and a secondary column grouped centrally with outer background margins. The [initial screenshot](screenshots/08-vc-reference-desktop.png) supplies additional context. Advertising and a third-party sign-in overlay were visible; neither is recommended for OverGarden. Exact rail widths were not reverse-engineered; proposed OverGarden dimensions are design hypotheses.

The important mechanism is spatial grouping: navigation, content and supporting context remain perceived as one application instead of being stretched to the two edges of a wide display.

## Evaluation framework

[NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) provide the general review lens: clear system state, familiar concepts, user control, consistency, error prevention, recognition, efficiency, restrained presentation, recovery and useful help. The report applies these through concrete OverGarden scenarios, not numerical scores presented as scientific measurements.

[W3C WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) is the accessibility criteria reference. Automated rules cover only part of conformance. Manual keyboard, assistive-technology, zoom/reflow, target and error-recovery checks remain necessary. ACCESSIBILITY.md distinguishes actual observations from proposed verification.
