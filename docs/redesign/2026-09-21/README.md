# OverGarden — complete product redesign execution plan

[Linear project](https://linear.app/overgarden/project/overgarden-complete-product-redesign-7e66fe5e4bb0) · [Coordination OVE-474](https://linear.app/overgarden/issue/OVE-474/complete-product-redesign-audit-implementation-and-release)

Status: planning complete. **32 executable issues + 1 coordination issue**, all Backlog. No redesign code has been implemented by this planning task. Authenticated readback verified all 33 issue descriptions, seven required sections, project/parent placement, expected native blockers and an acyclic dependency graph. All 45 findings have an implementation owner.

The original 38 work packages were consolidated after Linear rejected issue creation at the workspace free-tier limit. The owner explicitly chose consolidation: original icon package 04 → foundations 03; moderation 33 → communities 26; lineage inboxes 34 → passports 21; owner erasure 35 → privacy 31; localization/integrated accessibility/release 36–38 → repurposed integration issue OVE-478. No scope was dropped. **OVE-478 executes last despite its low issue number.**

## Start here

Start OVE-475 to check in the audit/evidence package, ratify the new IA and reconcile the canon. Then follow the native blockers below. Existing OVE-467/468/469 remain external technical workstreams, not newly duplicated issues. Do not implement shared shell files concurrently with OVE-468.

## Topological execution order

| Order | Issue and outcome | Native blockers |
|---|---|---|
| 1 | [OVE-475 — Ratify the new product IA, wireflows and redesign canon](https://linear.app/overgarden/issue/OVE-475/ratify-the-new-product-ia-wireflows-and-redesign-canon) | None |
| 2 | [OVE-476 — Correct public-first, media and deletion promises throughout the product](https://linear.app/overgarden/issue/OVE-476/correct-public-first-media-and-deletion-promises-throughout-the) | OVE-475 |
| 3 | [OVE-477 — Build the Threads design system with Phosphor-only interface icons](https://linear.app/overgarden/issue/OVE-477/build-the-threads-visual-foundations-and-accessible-component-states) | OVE-475 |
| 4 | [OVE-480 — Build representative fixtures and accessibility gates before page migration](https://linear.app/overgarden/issue/OVE-480/build-representative-fixtures-and-accessibility-gates-before-page) | OVE-475 |
| 5 | [OVE-479 — Create the Thiings illustration system and integrate it into product states](https://linear.app/overgarden/issue/OVE-479/create-the-thiings-illustration-system-and-integrate-it-into-product) | OVE-477 |
| 6 | [OVE-481 — Replace global navigation with a centered responsive three-column shell](https://linear.app/overgarden/issue/OVE-481/replace-global-navigation-with-a-centered-responsive-three-column) | OVE-477, OVE-480 |
| 7 | [OVE-483 — Build the all-owned-destinations search and selection contract](https://linear.app/overgarden/issue/OVE-483/build-the-all-owned-destinations-search-and-selection-contract) | OVE-475, OVE-480 |
| 8 | [OVE-482 — Standardize discovery search and mobile filter interactions](https://linear.app/overgarden/issue/OVE-482/standardize-discovery-search-and-mobile-filter-interactions) | OVE-481, OVE-467 |
| 9 | [OVE-484 — Create spaces through a focused Airbnb-inspired progressive flow](https://linear.app/overgarden/issue/OVE-484/create-spaces-through-a-focused-airbnb-inspired-progressive-flow) | OVE-479, OVE-481, OVE-483 |
| 10 | [OVE-485 — Create owned objects through progressive setup without catalogue dead ends](https://linear.app/overgarden/issue/OVE-485/create-owned-objects-through-progressive-setup-without-catalogue-dead) | OVE-484 |
| 11 | [OVE-486 — Ship one text-first composer for global and contextual entry creation](https://linear.app/overgarden/issue/OVE-486/ship-one-text-first-composer-for-global-and-contextual-entry-creation) | OVE-476, OVE-481, OVE-483, OVE-485 |
| 12 | [OVE-496 — Make Catalogue a gardener-friendly discovery front door](https://linear.app/overgarden/issue/OVE-496/make-catalogue-a-gardener-friendly-discovery-front-door) | OVE-482, OVE-485, OVE-467 |
| 13 | [OVE-487 — Make media and rich blocks progressive inside the shared composer](https://linear.app/overgarden/issue/OVE-487/make-media-and-rich-blocks-progressive-inside-the-shared-composer) | OVE-486 |
| 14 | [OVE-489 — Rebuild My garden as a scalable collection home](https://linear.app/overgarden/issue/OVE-489/rebuild-my-garden-as-a-scalable-collection-home) | OVE-486, OVE-481 |
| 15 | [OVE-497 — Reorganize organism, variety, breed and register detail pages](https://linear.app/overgarden/issue/OVE-497/reorganize-organism-variety-breed-and-register-detail-pages) | OVE-496 |
| 16 | [OVE-488 — Unify editing, dirty-exit recovery and entry deletion](https://linear.app/overgarden/issue/OVE-488/unify-editing-dirty-exit-recovery-and-entry-deletion) | OVE-487 |
| 17 | [OVE-490 — Add dedicated space pages with space writing and object aggregates](https://linear.app/overgarden/issue/OVE-490/add-dedicated-space-pages-with-space-writing-and-object-aggregates) | OVE-489, OVE-484 |
| 18 | [OVE-492 — Recompose the public feed with Threads hierarchy and vc.ru reading affordances](https://linear.app/overgarden/issue/OVE-492/recompose-the-public-feed-with-threads-hierarchy-and-vcru-reading) | OVE-481, OVE-482, OVE-487, OVE-467 |
| 19 | [OVE-498 — Restructure knowledge, answers, guides and topics around credible help](https://linear.app/overgarden/issue/OVE-498/restructure-knowledge-answers-guides-and-topics-around-credible-help) | OVE-482, OVE-497 |
| 20 | [OVE-506 — Rebuild owner catalogue curation and sources as focused work queues](https://linear.app/overgarden/issue/OVE-506/rebuild-owner-catalogue-curation-and-sources-as-focused-work-queues) | OVE-481, OVE-497 |
| 21 | [OVE-491 — Separate owned-object timeline, settings and provenance](https://linear.app/overgarden/issue/OVE-491/separate-owned-object-timeline-settings-and-provenance) | OVE-489, OVE-488, OVE-490 |
| 22 | [OVE-493 — Unify entry reading, comments, reactions, saving and sharing](https://linear.app/overgarden/issue/OVE-493/unify-entry-reading-comments-reactions-saving-and-sharing) | OVE-492 |
| 23 | [OVE-494 — Rebuild public profiles around identity, entries and owned journals](https://linear.app/overgarden/issue/OVE-494/rebuild-public-profiles-around-identity-entries-and-owned-journals) | OVE-492 |
| 24 | [OVE-499 — Align blog, articles, markets and source archives with the new reading system](https://linear.app/overgarden/issue/OVE-499/align-blog-articles-markets-and-source-archives-with-the-new-reading) | OVE-498 |
| 25 | [OVE-500 — Redesign communities, discussions and moderation operations](https://linear.app/overgarden/issue/OVE-500/redesign-communities-and-discussions-with-preserved-posting-context) | OVE-493, OVE-486 |
| 26 | [OVE-501 — Make activity and reminders identify the exact next action](https://linear.app/overgarden/issue/OVE-501/make-activity-and-reminders-identify-the-exact-next-action) | OVE-486, OVE-491 |
| 27 | [OVE-502 — Unify saved entries and wishlist navigation and states](https://linear.app/overgarden/issue/OVE-502/unify-saved-entries-and-wishlist-navigation-and-states) | OVE-493, OVE-496 |
| 28 | [OVE-503 — Separate public profile editing from account and security settings](https://linear.app/overgarden/issue/OVE-503/separate-public-profile-editing-from-account-and-security-settings) | OVE-481, OVE-494 |
| 29 | [OVE-504 — Redesign authentication and preserve action intent](https://linear.app/overgarden/issue/OVE-504/redesign-authentication-and-preserve-action-intent) | OVE-481, OVE-486, OVE-503 |
| 30 | [OVE-495 — Redesign object passports, lineage inboxes and ownership handoffs](https://linear.app/overgarden/issue/OVE-495/redesign-public-object-passports-and-lineage-reading) | OVE-491, OVE-493, OVE-504 |
| 31 | [OVE-505 — Redesign consent, privacy and member/owner erasure workflows](https://linear.app/overgarden/issue/OVE-505/redesign-consent-privacy-support-and-user-erasure-flows) | OVE-476, OVE-481, OVE-504 |
| 32 | [OVE-478 — Integrate, verify and release the complete product redesign](https://linear.app/overgarden/issue/OVE-478/migrate-every-interface-icon-to-phosphor-and-remove-mixed-icon) | OVE-475, OVE-476, OVE-477, OVE-479, OVE-480, OVE-481, OVE-482, OVE-483, OVE-484, OVE-485, OVE-486, OVE-487, OVE-488, OVE-489, OVE-490, OVE-491, OVE-492, OVE-493, OVE-494, OVE-495, OVE-496, OVE-497, OVE-498, OVE-499, OVE-500, OVE-501, OVE-502, OVE-503, OVE-504, OVE-505, OVE-506, OVE-467, OVE-468, OVE-469 |

This is a valid reading/execution sequence, not a promise that external blockers are already done. The parent is a non-executable coordination container.

## Finding ownership

| Audit finding | Primary implementation owner |
|---|---|
| OG-UX-001 | [OVE-486](https://linear.app/overgarden/issue/OVE-486/ship-one-text-first-composer-for-global-and-contextual-entry-creation) |
| OG-UX-002 | [OVE-483](https://linear.app/overgarden/issue/OVE-483/build-the-all-owned-destinations-search-and-selection-contract) |
| OG-UX-003 | [OVE-476](https://linear.app/overgarden/issue/OVE-476/correct-public-first-media-and-deletion-promises-throughout-the) |
| OG-UX-004 | [OVE-476](https://linear.app/overgarden/issue/OVE-476/correct-public-first-media-and-deletion-promises-throughout-the) |
| OG-UX-005 | [OVE-481](https://linear.app/overgarden/issue/OVE-481/replace-global-navigation-with-a-centered-responsive-three-column) |
| OG-UX-006 | [OVE-489](https://linear.app/overgarden/issue/OVE-489/rebuild-my-garden-as-a-scalable-collection-home) |
| OG-UX-007 | [OVE-491](https://linear.app/overgarden/issue/OVE-491/separate-owned-object-timeline-settings-and-provenance) |
| OG-UX-008 | [OVE-481](https://linear.app/overgarden/issue/OVE-481/replace-global-navigation-with-a-centered-responsive-three-column) |
| OG-UX-009 | [OVE-481](https://linear.app/overgarden/issue/OVE-481/replace-global-navigation-with-a-centered-responsive-three-column) |
| OG-UX-010 | [OVE-492](https://linear.app/overgarden/issue/OVE-492/recompose-the-public-feed-with-threads-hierarchy-and-vcru-reading) |
| OG-UX-011 | [OVE-482](https://linear.app/overgarden/issue/OVE-482/standardize-discovery-search-and-mobile-filter-interactions) |
| OG-UX-012 | [OVE-496](https://linear.app/overgarden/issue/OVE-496/make-catalogue-a-gardener-friendly-discovery-front-door) |
| OG-UX-013 | [OVE-497](https://linear.app/overgarden/issue/OVE-497/reorganize-organism-variety-breed-and-register-detail-pages) |
| OG-UX-014 | [OVE-492](https://linear.app/overgarden/issue/OVE-492/recompose-the-public-feed-with-threads-hierarchy-and-vcru-reading) |
| OG-UX-015 | [OVE-482](https://linear.app/overgarden/issue/OVE-482/standardize-discovery-search-and-mobile-filter-interactions) |
| OG-UX-016 | [OVE-492](https://linear.app/overgarden/issue/OVE-492/recompose-the-public-feed-with-threads-hierarchy-and-vcru-reading) |
| OG-UX-017 | [OVE-493](https://linear.app/overgarden/issue/OVE-493/unify-entry-reading-comments-reactions-saving-and-sharing) |
| OG-UX-018 | [OVE-493](https://linear.app/overgarden/issue/OVE-493/unify-entry-reading-comments-reactions-saving-and-sharing) |
| OG-UX-019 | [OVE-495](https://linear.app/overgarden/issue/OVE-495/redesign-public-object-passports-and-lineage-reading) |
| OG-UX-020 | [OVE-487](https://linear.app/overgarden/issue/OVE-487/make-media-and-rich-blocks-progressive-inside-the-shared-composer) |
| OG-UX-021 | [OVE-488](https://linear.app/overgarden/issue/OVE-488/unify-editing-dirty-exit-recovery-and-entry-deletion) |
| OG-UX-022 | [OVE-501](https://linear.app/overgarden/issue/OVE-501/make-activity-and-reminders-identify-the-exact-next-action) |
| OG-UX-023 | [OVE-489](https://linear.app/overgarden/issue/OVE-489/rebuild-my-garden-as-a-scalable-collection-home) |
| OG-UX-024 | [OVE-503](https://linear.app/overgarden/issue/OVE-503/separate-public-profile-editing-from-account-and-security-settings) |
| OG-UX-025 | [OVE-503](https://linear.app/overgarden/issue/OVE-503/separate-public-profile-editing-from-account-and-security-settings) |
| OG-UX-026 | [OVE-485](https://linear.app/overgarden/issue/OVE-485/create-owned-objects-through-progressive-setup-without-catalogue-dead) |
| OG-UX-027 | [OVE-482](https://linear.app/overgarden/issue/OVE-482/standardize-discovery-search-and-mobile-filter-interactions) |
| OG-UX-028 | [OVE-480](https://linear.app/overgarden/issue/OVE-480/build-representative-fixtures-and-accessibility-gates-before-page) |
| OG-UX-029 | [OVE-487](https://linear.app/overgarden/issue/OVE-487/make-media-and-rich-blocks-progressive-inside-the-shared-composer) |
| OG-UX-030 | [OVE-492](https://linear.app/overgarden/issue/OVE-492/recompose-the-public-feed-with-threads-hierarchy-and-vcru-reading) |
| OG-UX-031 | [OVE-481](https://linear.app/overgarden/issue/OVE-481/replace-global-navigation-with-a-centered-responsive-three-column) |
| OG-UX-032 | [OVE-497](https://linear.app/overgarden/issue/OVE-497/reorganize-organism-variety-breed-and-register-detail-pages) |
| OG-UX-033 | [OVE-498](https://linear.app/overgarden/issue/OVE-498/restructure-knowledge-answers-guides-and-topics-around-credible-help) |
| OG-UX-034 | [OVE-499](https://linear.app/overgarden/issue/OVE-499/align-blog-articles-markets-and-source-archives-with-the-new-reading) |
| OG-UX-035 | [OVE-500](https://linear.app/overgarden/issue/OVE-500/redesign-communities-and-discussions-with-preserved-posting-context) |
| OG-UX-036 | [OVE-502](https://linear.app/overgarden/issue/OVE-502/unify-saved-entries-and-wishlist-navigation-and-states) |
| OG-UX-037 | [OVE-505](https://linear.app/overgarden/issue/OVE-505/redesign-consent-privacy-support-and-user-erasure-flows) |
| OG-UX-038 | [OVE-506](https://linear.app/overgarden/issue/OVE-506/rebuild-owner-catalogue-curation-and-sources-as-focused-work-queues) |
| OG-UX-039 | [OVE-506](https://linear.app/overgarden/issue/OVE-506/rebuild-owner-catalogue-curation-and-sources-as-focused-work-queues) |
| OG-UX-040 | [OVE-481](https://linear.app/overgarden/issue/OVE-481/replace-global-navigation-with-a-centered-responsive-three-column) |
| OG-UX-041 | [OVE-492](https://linear.app/overgarden/issue/OVE-492/recompose-the-public-feed-with-threads-hierarchy-and-vcru-reading) |
| OG-UX-042 | [OVE-475](https://linear.app/overgarden/issue/OVE-475/ratify-the-new-product-ia-wireflows-and-redesign-canon) |
| OG-UX-043 | [OVE-483](https://linear.app/overgarden/issue/OVE-483/build-the-all-owned-destinations-search-and-selection-contract) |
| OG-UX-044 | [OVE-505](https://linear.app/overgarden/issue/OVE-505/redesign-consent-privacy-support-and-user-erasure-flows) |
| OG-UX-045 | [OVE-491](https://linear.app/overgarden/issue/OVE-491/separate-owned-object-timeline-settings-and-provenance) |

Foundation and integration issues also provide cross-cutting proof. A mapping is ownership, not a claim that the original defect is fixed.

## Portable documents

- [Redesign execution contract — owner decisions, references and proof](https://linear.app/overgarden/document/redesign-execution-contract-owner-decisions-references-and-proof-f8007f2ae99c)
- [Audit evidence — 45 OG-UX findings (2026-09-21)](https://linear.app/overgarden/document/audit-evidence-45-og-ux-findings-2026-09-21-9137eb58e042)
- [Fast writing — spaces, objects, destination picker and recovery](https://linear.app/overgarden/document/fast-writing-spaces-objects-destination-picker-and-recovery-4a839349a952)
- [Execution queue — 32 issues, 45 findings and 114 route owners](https://linear.app/overgarden/document/execution-queue-32-issues-45-findings-and-114-route-owners-4497b79896cd)

## Local artifacts

- `EXECUTION_CONTRACT.md`: decisions, references, retained contracts and proof rules.
- `task-specs.json`: consolidated work-package source.
- `linear-manifest.json`: exact IDs, URLs, dependencies and authenticated remote readbacks.
- `issues/`: full normalized remote descriptions, one Markdown file per executable issue.
- `ROUTE_OWNERSHIP.md`: every baseline page file mapped to an issue; migrated route choices are finalized in OVE-475.

Source audit remains at `docs/audits/2026-09-21-product-design/`; no historical audit observations were rewritten.

## Accepted IA and executable wireflows

OVE-475 implements [the route/function and transaction decisions](INFORMATION_ARCHITECTURE.md) and the [interactive synthetic wireflows](wireflows/index.html). Run `node --test docs/redesign/2026-09-21/wireflows/model.test.mjs`; CI runs the same decision scenarios. These are design-contract proofs, not production implementation or recruited usability research.
