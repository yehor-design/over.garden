# Coverage and evidence ledger

## Method and environments

Date: 2026-09-21, Europe/Sofia. Local source baseline: `e554aec506e84ec6f8304c4704084671ed19f399`. The audit combined live production navigation, screenshot inspection, DOM/accessibility-tree reading, selected keyboard interactions, current project contracts, component/route source and Mobbin references. No subagents.

The initial in-app-browser public pass rendered guest navigation. Later pages in that browser rendered signed-in controls; role is determined from the observed page, not assumed stable across the session. The owner explicitly authorized use of the existing Chrome session for read-only inspection. That account exposed owner tools and had multiple spaces and objects. It does not prove a normal non-owner account experience.

No forms with external effects were submitted. Opening pages can run normal application reads/telemetry; this audit made no deliberate content or account mutations. No browser cookies, tokens, private email addresses or credentials are included in the report. Screenshot data describes the inspected account and is not an anonymized general-user study.

## Journey coverage

| Journey / family | Inspected state | Evidence | Remaining proof |
|---|---|---|---|
| Public home/feed | Guest and signed-in, populated, type/topic controls | 01, 09; EntryCard and feed source | Empty/no-network experience across all locales; actual social mutations |
| Global search | Query for tomato, grouped results, keyboard dismissal | 02 | No-results/error, slow response, non-Latin normalization, focus under all entry points |
| Public journal directory | Populated desktop, mobile filter dialog, sort/search layout | 03; mobile-filter-dom.txt | Apply/back preservation, all combinations, 0/large results |
| Catalogue | Default populated directory, scientific facets and pagination | 04 | Common-name search quality measured with gardeners; large-result performance |
| Species | Tomato with experience and 621 forms | 05 | Animal/fungi variants, empty/source-error identities |
| Register | Tomato 621-row register table | 43 | Search/pagination need; narrow table interaction; all registry variants |
| Cultivar/form | 6 punto 7 F1 without gardener entries, wishlist affordance | 44 | Saving, unknown identity, breed-specific variant |
| Public entry | Existing entry, media, context, actions, previous/related links | 06, 07 | Publish/edit/delete, populated comment threads, sharing, reaction feedback |
| Public profile | Owner profile, objects/journal/about tabs | 18 | Ordinary viewer/blocked viewer, large profiles, follow outcomes |
| Public object | Tomato passport/history/gallery | 19 | Other lifecycle states, missing media, populated provenance |
| Garden home | Returning owner, multiple spaces/objects, attention, recent activity, creation | 10, 11, 32 | New ordinary user; hundreds of objects; section failures beyond sources |
| New object + first entry | Blank existing-user form, current-space selection | 11; first-entry-composer source | Actual creation, disclosures, uploads, errors and success |
| Existing-object follow-up | Blank composer, help, object history/settings | 12–14 | Dirty exit, formatting, photo processing/reordering, publish and error recovery |
| Space entry | Presence in garden DOM/source, selected-space binding | garden-dom.txt; home route | Direct full space-entry interaction and persistence; every existing space |
| Entry edit | Route inventoried; shared editor architecture considered | ROUTES.md | Live edit screen and edit success were not tested; no edit-specific visual verdict |
| Personal saved content | Empty bookmarks and wishlist | 20, 21 | Populated lists, save/unsave feedback, result-type filtering |
| Notifications | Four unread reminders, settings collapsed | 23 | Mark read, dismiss, preferences, populated comments/mentions, grouping |
| Followed feed | Navigation/source contract only in this pass | route inventory; accessibility test source | Live populated/empty followed feed and ordinary-user behavior |
| Profile settings | Handle, name/bio/region, avatar choices, public preview and account sections | 17 | Save validation, avatar upload, rename, password operations, blocked-user flow |
| Account menu | Owner expanded menu | 15 | Ordinary-member variant and mobile keyboard behavior |
| Knowledge index | Guide/answer/topic groups and counts | 22 | All query states and sort relevance |
| Guide | Start a living plant record | 33 | Further guide templates; actual conversion to first entry |
| Answer | Yellow tomato leaves, including FAQ contradiction | 36, 41; answer-dom.txt | Horticultural source review; other answer templates |
| Topic | Plants with 9 linked entries | 39 | Empty and long-filtered topics, follow behavior |
| Blog | Listing and positioning text | 37 | Blog detail visually untested; route inventoried |
| Communities | One community; empty detail, rules, join and first-entry action | 24, 25 | Joining, submitting, populated discussion/replies and permissions |
| Public lineage | Entity routes inventoried, private/public distinction reviewed | ROUTES.md; object DOM | Populated lineage tree, invitation acceptance, non-owner variants |
| Lineage requests | Empty claim inbox DOM | read-only browser observation | Questions, populated decisions, invitation invalid/expired/accepted states |
| Owner catalogue queue | Empty queue and applied-history empty state | 28 | Populated review, merge/split/correction outcomes; all mutations excluded |
| Owner sources | Partial timeout with metrics still available | 31 | Retry success and recurrence; no systemic outage conclusion |
| Comment moderation | Empty complaint queue DOM | read-only browser observation | Populated report decision/detail and safeguards |
| Community moderation | Index and empty complaint summary | 42 | Detail, member actions, report decisions |
| Owner erasure requests | Heading and loading section observed only | read-only browser observation | Settled queue and all request lifecycle states; no pass claim |
| Sign-in/up | Existing signed-in session redirected sign-in to garden; sign-up/auth component source read | 32 (redirect destination), auth source | Signed-out forms, OAuth, reset/help, all success/error and restore-intent states |
| Support | Contact and help/privacy/erasure paths | 34 | Sending support requests not in scope |
| Privacy | Full public text and consent settings labels | 38 | Preference changes not performed; legal review not part of audit |
| First disclosure | Full public text | 40; disclosure-dom.txt | First-time acceptance and version transition |
| Erasure | Explanation and blank request form | 35 | Submission and destructive lifecycle not performed |
| Market landing pages | Route inventory only | ROUTES.md | Live localized landing content and links |
| EPPO source index/detail | Route inventory only | ROUTES.md | Live provenance display and source-error states |
| Legacy/retired paths, 404/410 | Catch-all handlers inventoried; current address rules reviewed | ROUTES.md; ADR-0029 | Live redirect chains, tombstone/unknown route, no-JS variants |

A route inventory entry is not a visited page. A screenshot of a blank composer is not a successful publication test. Remaining proof is a concrete release-work list, not an implicit pass.

## Responsive spot checks

`responsive-measurements.json` records document geometry and visible-control boxes for:

- garden at 320 × 740;
- entry at 390 × 844;
- catalogue at 768 × 1024;
- journals at 390 × 844;
- journal filters open at 390 × 844;
- journals at 1024 × 900.

For these samples, document scroll width did not exceed client width. This does not prove every child control, zoom level, media state or keyboard overlay fits. The mobile filter dialog opened and Escape returned focus to Filters. The incorrect close label was captured separately. No true mobile hardware or Safari test was run.

Browser screenshot captures with viewport overrides were scaled inconsistently by the capture path. Those intermediate files were excluded, and **no mobile clipping defect was inferred from them**. Desktop screenshots were opened and inspected as saved artifacts. All overrides were reset; the user's Chrome tab was returned to the home page.

## Screenshot index

See `screenshots/manifest.json` for file names, byte sizes and SHA-256 hashes. Number gaps identify excluded capture attempts, not missing claimed evidence. `32-auth-redirect-to-garden.png` shows the signed-in redirect destination, not a sign-in form. Raw DOM files are supplementary, time-bound observations and not executable instructions.

## Additional observations requiring follow-up

- Register browsing renders a very long 621-item table. Search within this bounded register is a strong candidate, but no timed task or pagination performance test was run.
- Cultivar pages without experiences foreground raw source keys (for example ua_state_register) and duplicate provenance details. Use progressive source detail and readable labels while retaining legally/contractually required attribution. Zero experience is meaningful here, unlike an unrelated zero counter on an editorial article.
- The guide teaches a first-entry workflow but its main article has no immediate contextual start action; the generic shell action remains. A targeted Create an observation action can connect learning to use.
- Community moderation uses implementation terms such as Fail-closed in its introduction. Owner tools deserve concise task language too.
- The source screen's P95 and median from one event are not evidence of a representative 29.7-second picker experience. Do not turn this small sample into a product performance claim.

## Uncertainty rules for downstream work

Retest before fixing if the production build has changed. Preserve finding IDs and attach new evidence rather than rewriting the historical observation as if it never happened. A source-only prediction becomes confirmed only after reproducing it. If a recommendation needs a changed contract, update the appropriate ADR deliberately before implementation. Never interpret untested as defect-free.
