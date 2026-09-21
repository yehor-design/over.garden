# Findings register

All IDs are stable handoff identifiers, not Linear issue IDs. Priority is an expert judgment, not measured conversion loss. **P1**: core task, trust or owner-direction blocker. **P2**: substantial friction or accessibility/verification risk. **P3**: polish or lower-impact comprehension defect. No P0 incident was established. Source-confirmed risks are not automatically WCAG failures.

Heuristic lens: match users’ mental models, visible state, control and recovery, consistent language, recognition over recall, efficient repeated tasks, and relevant information. These are applied expert judgments; representative user testing is still needed.

| ID | Priority | Area | Finding | Evidence confidence |
|---|---|---|---|---|
| [OG-UX-001](#og-ux-001) | P1 | Creation | Global New entry starts object creation | Live + source |
| [OG-UX-002](#og-ux-002) | P1 | Creation | Existing-space selection is incomplete | Live + source |
| [OG-UX-003](#og-ux-003) | P1 | Trust | Help promises a private-first workflow that does not exist | Live + source |
| [OG-UX-004](#og-ux-004) | P1 | Trust | Privacy and disclosure describe retired media and indexing behavior | Live + source |
| [OG-UX-005](#og-ux-005) | P1 | Layout | Three columns are not centered as one group | Live + source |
| [OG-UX-006](#og-ux-006) | P2 | Architecture | My garden combines too many independent tasks | Live |
| [OG-UX-007](#og-ux-007) | P2 | Architecture | Owned object page mixes reading, writing and administration | Live |
| [OG-UX-008](#og-ux-008) | P2 | Navigation | Owned object is highlighted as Catalogue | Live |
| [OG-UX-009](#og-ux-009) | P2 | Navigation | Primary and secondary navigation repeat each other | Live |
| [OG-UX-010](#og-ux-010) | P2 | Content model | Journals lists individual entries | Live |
| [OG-UX-011](#og-ux-011) | P2 | Discovery | Desktop filter form dominates the journal directory | Live |
| [OG-UX-012](#og-ux-012) | P2 | Discovery | Catalogue defaults to registry browsing rather than gardener intent | Live |
| [OG-UX-013](#og-ux-013) | P2 | Discovery | Organism card competes with hundreds of forms | Live |
| [OG-UX-014](#og-ux-014) | P2 | Feed | Post authorship appears after large media | Live |
| [OG-UX-015](#og-ux-015) | P2 | Feed | Duplicate taxonomy controls overwhelm a sparse feed | Live |
| [OG-UX-016](#og-ux-016) | P2 | Consistency | Same entry displays different unexplained dates by surface | Live + source |
| [OG-UX-017](#og-ux-017) | P2 | Entry | Social actions have fragmented visual hierarchy | Live |
| [OG-UX-018](#og-ux-018) | P2 | Entry | Related-entry navigation repeats the same destination | Live |
| [OG-UX-019](#og-ux-019) | P2 | Object | Public object breadcrumb points to the organism catalogue | Live |
| [OG-UX-020](#og-ux-020) | P2 | Creation | Composer presents advanced mechanics before the observation | Live |
| [OG-UX-021](#og-ux-021) | P2 | Creation | Publish-only behavior needs concise and timely loss feedback | Live + contract |
| [OG-UX-022](#og-ux-022) | P2 | Notifications | Reminder rows omit the destination name | Live |
| [OG-UX-023](#og-ux-023) | P2 | Retention | No recent entry is framed as requiring attention | Live |
| [OG-UX-024](#og-ux-024) | P2 | Profile | Profile settings mix identity, avatar selection and account operations | Live |
| [OG-UX-025](#og-ux-025) | P2 | Localization | Region names remain English in localized UI | Live |
| [OG-UX-026](#og-ux-026) | P2 | Localization | Animal species is labeled Plant species | Live + source |
| [OG-UX-027](#og-ux-027) | P2 | Accessibility | Filter sheet close is named Clear all | Live DOM + source; screenshot is desktop context only |
| [OG-UX-028](#og-ux-028) | P2 | Accessibility | WCAG 2.2 promise exceeds the configured axe tag set | Source-confirmed verification gap |
| [OG-UX-029](#og-ux-029) | P2 | Accessibility | Feed image alternatives collapse to entry titles | Live + source |
| [OG-UX-030](#og-ux-030) | P2 | Accessibility | Mixed-language card wrapper also contains interface date | Source-confirmed risk; pronunciation not tested |
| [OG-UX-031](#og-ux-031) | P3 | Component craft | Horizontal strips show unwanted vertical scrollbars | Live + source |
| [OG-UX-032](#og-ux-032) | P2 | Knowledge | Search-index eligibility is exposed as reader-facing status | Live |
| [OG-UX-033](#og-ux-033) | P2 | Knowledge | Educational answer quality is supported by product principles only | Live |
| [OG-UX-034](#og-ux-034) | P2 | Content | Blog communicates internal acquisition strategy | Live |
| [OG-UX-035](#og-ux-035) | P2 | Community | Empty community writing loses the community context | Live + source |
| [OG-UX-036](#og-ux-036) | P3 | Saved content | Empty saved lists still show irrelevant type filters | Live |
| [OG-UX-037](#og-ux-037) | P2 | Trust | Erasure workflow is described in implementation language | Live |
| [OG-UX-038](#og-ux-038) | P2 | Owner tools | Owner sources can show a partial timeout | Live single occurrence |
| [OG-UX-039](#og-ux-039) | P3 | Owner tools | Operational metrics imply precision with a sample of one | Live |
| [OG-UX-040](#og-ux-040) | P2 | Layout | Generic right rails do not advance the current task | Live |
| [OG-UX-041](#og-ux-041) | P2 | Media | Fixed large covers dominate density across unlike content | Live + canon |
| [OG-UX-042](#og-ux-042) | P2 | System | The design canon overclaims what mechanical gates can prove | Source + live contradictions |
| [OG-UX-043](#og-ux-043) | P2 | Scaling | Many-object workflows lack a proven large-collection model | Live small dataset + design risk |
| [OG-UX-044](#og-ux-044) | P2 | Trust | Consent notice is text-heavy and obstructs current content | Live |
| [OG-UX-045](#og-ux-045) | P2 | Object safety | Destructive and provenance controls need stronger task separation | Live; mutations untested |

<a id="og-ux-001"></a>

## OG-UX-001 — Global New entry starts object creation

**P1 · Creation · Live + source**

**Observed:** The persistent New entry link targets /garden#first-entry-composer, whose first task is adding a living object. Existing-object recording requires another route and mental model.

**Why it matters:** Frequent users must distinguish creation of an observation from creation of its subject; duplicates become a plausible error.

**Recommended change:** Open one composer with an explicit destination picker; contextual object actions preselect that object. Keep Add object separate.

**Acceptance:** From a public page, open creation and select an existing object without visiting the garden dashboard or entering an object name.

**Source locator at baseline:** `apps/web/src/components/site-shell/site-shell.test.tsx:218`.

**Visual/context evidence:** [11-new-entry-destination](screenshots/11-new-entry-destination.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-002"></a>

## OG-UX-002 — Existing-space selection is incomplete

**P1 · Creation · Live + source**

**Observed:** The first-entry form receives initialSpace only. Its spaceChoice select contains that single existing space and Create new; the garden route defaults to spaces[0].

**Why it matters:** With two or more spaces, the form cannot directly target all owned spaces and can encourage duplicate spaces.

**Recommended change:** Supply a searchable owned-destination model; include every accessible space with pagination/search, not only the first page of a dashboard.

**Acceptance:** With 3 spaces and 100 objects, each space is selectable directly; duplicate names show parent context; no automatic fallback to the first space.

**Source locator at baseline:** `apps/web/src/app/(default)/garden/first-entry-composer.tsx:703; apps/web/src/app/(default)/garden/(home)/page.tsx:206`.

**Visual/context evidence:** [11-new-entry-destination](screenshots/11-new-entry-destination.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-003"></a>

## OG-UX-003 — Help promises a private-first workflow that does not exist

**P1 · Trust · Live + source**

**Observed:** The Bulgarian tomato answer tells readers to save a personal entry first and publish later only if they choose. Current ADR-0022 says no private entries or drafts.

**Why it matters:** A reader can misunderstand who sees their words and images. This is a behavior/trust defect, not just tone.

**Recommended change:** Rewrite help and activation copy around public Publish, transient unsaved work and coarse optional region. Audit all locales together.

**Acceptance:** Every help-to-publish journey conveys public visibility before publication; no text promises a private durable entry or later optional publication.

**Source locator at baseline:** `apps/web/src/server/public-localized-content.ts:699; apps/web/src/lib/garden-workspace-copy.ts:971`.

**Visual/context evidence:** [41-answer-privacy-contradiction](screenshots/41-answer-privacy-contradiction.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-004"></a>

## OG-UX-004 — Privacy and disclosure describe retired media and indexing behavior

**P1 · Trust · Live + source**

**Observed:** Privacy and first-publication pages describe server-cleaned photos, original retention, restricted UGC indexing and archiving; the current product uses browser-generated WebP, no originals and public indexability.

**Why it matters:** Consent and expectation-setting describe a different product. Repainting the pages would entrench the mismatch.

**Recommended change:** Reconcile public statements with actual current processing, deletion and indexing contracts; version material disclosure changes through the existing mechanism.

**Acceptance:** Compare each factual statement with current ADRs and implementation in UK/BG/RU; publication notice and privacy agree. Do not silently reuse acceptance of materially changed text.

**Source locator at baseline:** `apps/web/src/lib/trust-surface-copy.ts:1323; apps/web/src/lib/trust-surface-copy.ts:1330; apps/web/src/lib/trust-surface-copy.ts:1404`.

**Visual/context evidence:** [38-privacy](screenshots/38-privacy.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-005"></a>

## OG-UX-005 — Three columns are not centered as one group

**P1 · Layout · Live + source**

**Observed:** At wide desktop widths the rails sit at opposite viewport edges while the reading column is separately centered, leaving large internal gaps. vc.ru groups the columns within outer margins.

**Why it matters:** Navigation and context feel detached from the task; widening the window makes the composition less coherent.

**Recommended change:** Use one bounded grid with auto outer margins and explicit gaps; align rail, content and context within it.

**Acceptance:** At 1440 and 1920 CSS px the whole group is centered; side rails do not drift toward viewport edges. At narrower widths columns collapse without document-level horizontal scrolling.

**Source locator at baseline:** `apps/web/src/components/site-shell/site-shell.tsx:285; apps/web/src/app/globals.css:137`.

**Visual/context evidence:** [09-signed-in-navigation](screenshots/09-signed-in-navigation.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-006"></a>

## OG-UX-006 — My garden combines too many independent tasks

**P2 · Architecture · Live**

**Observed:** Attention list, recent events, object directory, spaces, onboarding instructions, new-object editor and space-entry editor share one long page.

**Why it matters:** A returning gardener must scan repeated content to reach a simple action; complexity grows with their collection.

**Recommended change:** Make the garden an owned collection and action launcher. Move writing into a shared composer and settings into contextual panels.

**Acceptance:** A user can find a specific object, write to a space, and add an object from distinct named actions without scrolling past onboarding.

**Source locator at baseline:** `apps/web/src/app/(default)/garden/(home)/page.tsx:230`.

**Visual/context evidence:** [10-garden-desktop](screenshots/10-garden-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-007"></a>

## OG-UX-007 — Owned object page mixes reading, writing and administration

**P2 · Architecture · Live**

**Observed:** Passport, photo gallery, timeline, composer, full history, deletion controls and provenance management sit in one document. Two H1 headings were present.

**Why it matters:** The primary action competes with rare advanced operations; long-page position is difficult to recover.

**Recommended change:** Give the object a concise identity header and timeline; launch writing contextually; separate About and Settings/Origin.

**Acceptance:** One clear page title; timeline is the default; advanced relationship and destructive tasks do not interrupt ordinary reading.

**Source locator at baseline:** `apps/web/src/app/(default)/garden/objects/[objectId]/page.tsx`.

**Visual/context evidence:** [12-object-workspace](screenshots/12-object-workspace.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-008"></a>

## OG-UX-008 — Owned object is highlighted as Catalogue

**P2 · Navigation · Live**

**Observed:** The left rail highlights Catalogue while the user is in /garden/objects/... editing their own object.

**Why it matters:** The product confuses a personal specimen with a canonical organism, undermining location awareness.

**Recommended change:** Resolve shell section from semantic route ownership; distinguish My garden object routes from public organism routes.

**Acceptance:** All /garden/objects/* routes highlight My garden in desktop and mobile navigation; back navigation restores the collection context.

**Source locator at baseline:** `apps/web/src/components/site-shell/`.

**Visual/context evidence:** [12-object-workspace](screenshots/12-object-workspace.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-009"></a>

## OG-UX-009 — Primary and secondary navigation repeat each other

**P2 · Navigation · Live**

**Observed:** Personal destinations appear in the left rail, a horizontal personal tab row and the account menu; lineage claims occupy a primary slot.

**Why it matters:** Many repeated choices make the product look larger and harder than the gardening task requires.

**Recommended change:** Use a small primary set: feed, garden, explore, activity; group saved content and settings under the profile/account surface. Preserve direct links.

**Acceptance:** Each destination has an intentional primary home; rare lineage administration is reached from an object or activity context.

**Source locator at baseline:** `apps/web/src/components/site-shell/site-shell-navigation.tsx`.

**Visual/context evidence:** [15-account-menu](screenshots/15-account-menu.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-010"></a>

## OG-UX-010 — Journals lists individual entries

**P2 · Content model · Live**

**Observed:** The Journals page reports 11 entries and renders individual posts, while an object itself also has a journal and the home feed shows the same content.

**Why it matters:** Readers cannot predict whether a result is a complete history, an object, or one observation.

**Recommended change:** Define and localize one vocabulary: entry, object, space, organism, journal-as-timeline. Make feed vs search a mode distinction rather than duplicate destinations.

**Acceptance:** User testing can identify an entry versus a timeline from the card and page labels before opening either.

**Source locator at baseline:** `apps/web/src/components/public/public-journal-directory.tsx`.

**Visual/context evidence:** [03-journals-desktop](screenshots/03-journals-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-011"></a>

## OG-UX-011 — Desktop filter form dominates the journal directory

**P2 · Discovery · Live**

**Observed:** Search plus six select controls and supporting labels precede the first result, despite only 11 entries in the observed inventory.

**Why it matters:** Reading starts late and filters impose taxonomy knowledge before a reader sees useful content.

**Recommended change:** Keep search, sort and one Filters control visible; show selected chips and only useful quick facets.

**Acceptance:** At a standard laptop height the first meaningful result is visible; advanced facets remain available without dominating the page.

**Source locator at baseline:** `apps/web/src/components/public/public-journal-directory.tsx:169`.

**Visual/context evidence:** [03-journals-desktop](screenshots/03-journals-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-012"></a>

## OG-UX-012 — Catalogue defaults to registry browsing rather than gardener intent

**P2 · Discovery · Live**

**Observed:** The default catalogue exposes kingdom/rank/register filters, alphabet navigation and 101619 organisms; early results include numeric cultivar names without obvious parent species.

**Why it matters:** The initial catalogue experience gives little help identifying a familiar plant or animal.

**Recommended change:** Lead with common-name search, familiar groups and experience-backed organisms; keep full registry navigation as an explicit advanced mode.

**Acceptance:** A gardener searching tomato can distinguish species, cultivar and owned object; ambiguous cultivar cards show parent species. Catalogue completeness is not mistaken for experience density.

**Source locator at baseline:** `apps/web/src/app/[locale]/catalog/page.tsx`.

**Visual/context evidence:** [04-catalog-desktop](screenshots/04-catalog-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-013"></a>

## OG-UX-013 — Organism card competes with hundreds of forms

**P2 · Discovery · Live**

**Observed:** The tomato page combines identity, statistics, experiences, a list of 621 forms and source information in a long document.

**Why it matters:** A reader seeking practical experience must distinguish the useful journal layer from reference inventory.

**Recommended change:** Separate Experiences, Varieties/forms and About/sources as deliberate sections or tabs with anchors and progressive loading.

**Acceptance:** The first useful experience and action are discoverable before the long form directory; forms support search and bounded navigation.

**Source locator at baseline:** `apps/web/src/app/[locale]/species/[slug]/page.tsx`.

**Visual/context evidence:** [05-species-desktop](screenshots/05-species-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-014"></a>

## OG-UX-014 — Post authorship appears after large media

**P2 · Feed · Live**

**Observed:** Feed cards lead with subject and title, then a large photo; the author and discussion affordance appear below the image.

**Why it matters:** Trust and social continuity arrive after the visually dominant content; it does not follow the requested Threads hierarchy.

**Recommended change:** Adopt author/avatar/time first, destination context second, text/media next, then a compact action row.

**Acceptance:** Authorship and destination are visible before media on desktop and phone; a screen reader encounters the same meaningful order.

**Source locator at baseline:** `apps/web/src/components/ui/entry-card.tsx:176`.

**Visual/context evidence:** [01-feed-desktop](screenshots/01-feed-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-015"></a>

## OG-UX-015 — Duplicate taxonomy controls overwhelm a sparse feed

**P2 · Feed · Live**

**Observed:** Plants and Animals appear as primary type filters, verified-topic chips and contextual rail navigation.

**Why it matters:** The same choice looks like several different concepts and consumes the first screen.

**Recommended change:** Use one discovery filter model; distinguish truly different dimensions only when content supports them.

**Acceptance:** No repeated Plants/Animals selector in the initial viewport; active filtering is clear and reversible.

**Source locator at baseline:** `apps/web/src/components/public/public-home-feed.tsx`.

**Visual/context evidence:** [01-feed-desktop](screenshots/01-feed-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-016"></a>

## OG-UX-016 — Same entry displays different unexplained dates by surface

**P2 · Consistency · Live + source**

**Observed:** Feed uses publication time while the journal directory uses observation entryDate. Both look like a generic post date.

**Why it matters:** A gardener cannot reliably compare the history or understand why the order changed.

**Recommended change:** Choose a primary observation date and label publication/edit timing when different; use one card contract.

**Acceptance:** A backdated entry shows the observation date consistently and explicitly distinguishes publication time wherever used for sorting.

**Source locator at baseline:** `apps/web/src/components/public/public-home-feed.tsx; apps/web/src/components/public/public-journal-directory.tsx:393`.

**Visual/context evidence:** [03-journals-desktop](screenshots/03-journals-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-017"></a>

## OG-UX-017 — Social actions have fragmented visual hierarchy

**P2 · Entry · Live**

**Observed:** Like/count, outlined save and green comment action use separate rows and unequal emphasis. The inspected action area has no obvious share action.

**Why it matters:** Routine social interaction takes more scanning and does not feel like a cohesive post.

**Recommended change:** One accessible action row with consistent icon/label/count logic; provide a discoverable copy-link/share action. Keep server-authoritative mutation semantics.

**Acceptance:** Like, reply, save and share are discoverable together; pressed state is announced; counts never form unlabeled orphan rows.

**Source locator at baseline:** `apps/web/src/app/engagement/public-engagement-panel.tsx`.

**Visual/context evidence:** [07-entry-actions](screenshots/07-entry-actions.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-018"></a>

## OG-UX-018 — Related-entry navigation repeats the same destination

**P2 · Entry · Live**

**Observed:** Previous entry, more from this journal and the context rail repeat entries and metadata.

**Why it matters:** A short entry is surrounded by more navigation chrome than useful next-step differentiation.

**Recommended change:** Offer chronological previous/next within the object, then one small related-content section.

**Acceptance:** Related lists deduplicate entry IDs and describe whether a link is chronological or topical.

**Source locator at baseline:** `apps/web/src/app/[locale]/[profileHandle]/post/[entryNumber]/page.tsx`.

**Visual/context evidence:** [07-entry-actions](screenshots/07-entry-actions.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-019"></a>

## OG-UX-019 — Public object breadcrumb points to the organism catalogue

**P2 · Object · Live**

**Observed:** The Living objects breadcrumb leads to /bg/catalog even though the viewed thing is a gardener-owned object.

**Why it matters:** Backtracking changes entity type without warning.

**Recommended change:** Link back to the author collection or an explicitly named public object directory; label the separate organism reference as species.

**Acceptance:** Breadcrumb ancestors reflect the actual containment relationship; Catalogue is used only for canonical organisms.

**Source locator at baseline:** `apps/web/src/app/[locale]/[profileHandle]/objects/[objectSlug]/page.tsx`.

**Visual/context evidence:** [19-public-object](screenshots/19-public-object.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-020"></a>

## OG-UX-020 — Composer presents advanced mechanics before the observation

**P2 · Creation · Live**

**Observed:** A large blank editor, slash/Markdown instructions, help, cover choices and repeated unsaved-work language precede or compete with the basic action.

**Why it matters:** A short garden note appears to require learning a document editor.

**Recommended change:** Default to a text-first Threads-shaped composer with visible Add photo and Publish. Reveal block formatting on demand while retaining Lexical and the document contract.

**Acceptance:** A plain note can be written with no slash command, formatting decision, cover decision or required photo. Rich blocks remain keyboard-accessible.

**Source locator at baseline:** `docs/adr/ADR-0028-notion-shaped-composer.md`.

**Visual/context evidence:** [13-follow-up-composer](screenshots/13-follow-up-composer.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-021"></a>

## OG-UX-021 — Publish-only behavior needs concise and timely loss feedback

**P2 · Creation · Live + contract**

**Observed:** The interface repeatedly warns about persistence, but the most consequential situations are closing, navigation, session expiration and upload failure. Those outcomes were not executed.

**Why it matters:** Repeated warnings can be ignored while a user still mistakes transient input for saved work.

**Recommended change:** One persistent unsaved status; guarded dirty close; retain in-memory input through destination changes/errors; clear only after acknowledged publish.

**Acceptance:** Test cancel, Escape, back, failed publish and expired session without losing visible input. Never claim autosave or add durable drafts without a new decision.

**Source locator at baseline:** `docs/adr/ADR-0022-owner-mvp-reset.md; apps/web/src/components/garden/unpublished-work-guard.test.tsx`.

**Visual/context evidence:** [13-follow-up-composer](screenshots/13-follow-up-composer.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-022"></a>

## OG-UX-022 — Reminder rows omit the destination name

**P2 · Notifications · Live**

**Observed:** Four unread reminders use the same New journal entry wording and differ only in timestamp and link destination.

**Why it matters:** Users with many objects must open each row to know what needs an update.

**Recommended change:** Show object name, parent space and reason; provide Write update linking directly to the preselected composer.

**Acceptance:** Two similarly named objects in different spaces are distinguishable in notifications without opening them.

**Source locator at baseline:** `apps/web/src/app/[locale]/notifications/page.tsx`.

**Visual/context evidence:** [23-notifications](screenshots/23-notifications.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-023"></a>

## OG-UX-023 — No recent entry is framed as requiring attention

**P2 · Retention · Live**

**Observed:** Every observed object is in Requires attention, based on elapsed time since an entry, including one at 20 days.

**Why it matters:** The UI can imply a horticultural problem when it only knows logging recency, creating guilt and false urgency.

**Recommended change:** Say Not updated recently; reserve care warnings for actual user rules or supported evidence. Prefer a gentle continue-history action.

**Acceptance:** A dormant seasonal object is not described as unhealthy or overdue solely because no entry was written.

**Source locator at baseline:** `apps/web/src/lib/garden-workspace-copy.ts`.

**Visual/context evidence:** [10-garden-desktop](screenshots/10-garden-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-024"></a>

## OG-UX-024 — Profile settings mix identity, avatar selection and account operations

**P2 · Profile · Live**

**Observed:** Handle changes lead the form, profile fields follow, media selection and preview expand it, then security/blocking functions appear below.

**Why it matters:** Routine profile editing and consequential address changes have indistinct boundaries.

**Recommended change:** Separate Edit profile, account/security and public address management; explain address consequences where editing occurs.

**Acceptance:** Updating a biography does not require scanning handle migration or security information; profile preview is optional and clearly read-only.

**Source locator at baseline:** `apps/web/src/app/(default)/garden/profile/page.tsx`.

**Visual/context evidence:** [17-profile-settings](screenshots/17-profile-settings.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-025"></a>

## OG-UX-025 — Region names remain English in localized UI

**P2 · Localization · Live**

**Observed:** Bulgaria - Varna Province appears in otherwise BG/RU profile and region selection surfaces.

**Why it matters:** Location becomes a technical value rather than natural user-facing language.

**Recommended change:** Localize display labels while retaining stable region codes; provide culturally familiar names.

**Acceptance:** Every supported region has UK/BG/RU labels in picker, preview and public profile.

**Source locator at baseline:** `apps/web/src/app/(default)/garden/profile/page.tsx`.

**Visual/context evidence:** [18-public-profile](screenshots/18-public-profile.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-026"></a>

## OG-UX-026 — Animal species is labeled Plant species

**P2 · Localization · Live + source**

**Observed:** Bee colonies show the Russian label Вид растения before Apis mellifera.

**Why it matters:** The domain model appears plant-only and breaks confidence for animal keepers.

**Recommended change:** Use Species as a neutral label or choose accurate entity-specific language.

**Acceptance:** Plant, animal and bee fixtures render correct labels in all locales and screen-reader names.

**Source locator at baseline:** `apps/web/src/lib/garden-workspace-copy.ts:1151`.

**Visual/context evidence:** [10-garden-desktop](screenshots/10-garden-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-027"></a>

## OG-UX-027 — Filter sheet close is named Clear all

**P2 · Accessibility · Live DOM + source; screenshot is desktop context only**

**Observed:** At 390 px the journal filter dialog exposes its close button as Reset everything, also used by the real reset link. FilterBar passes labels.clear as closeLabel.

**Why it matters:** A screen-reader user cannot distinguish dismissal from clearing their filters.

**Recommended change:** Use a dedicated localized Close filters label; keep reset a separate explicitly named action.

**Acceptance:** Accessible-name assertion distinguishes Close filters, Apply and Clear all; Escape returns focus to Filters without committing pending changes.

**Source locator at baseline:** `apps/web/src/components/ui/filter-bar.tsx:235`.

**Visual/context evidence:** [03-journals-desktop](screenshots/03-journals-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-028"></a>

## OG-UX-028 — WCAG 2.2 promise exceeds the configured axe tag set

**P2 · Accessibility · Source-confirmed verification gap**

**Observed:** The gate uses wcag2a, wcag2aa and wcag21aa, but not wcag22aa. Most routes are scanned at a single inherited width; only home/followed feed explicitly use both widths.

**Why it matters:** A green run cannot substantiate the stated whole-product WCAG 2.2 AA gate.

**Recommended change:** Include applicable WCAG 2.2 rules and manual checks; build a state/route/viewport matrix rather than treating axe as certification.

**Acceptance:** Evidence covers 2.2 focus-obscuring, target size and drag alternatives plus keyboard/screen-reader workflows; coverage is explicit for each redesigned family.

**Source locator at baseline:** `apps/web/tests/accessibility.spec.ts:44; apps/web/tests/accessibility.spec.ts:265`.

<a id="og-ux-029"></a>

## OG-UX-029 — Feed image alternatives collapse to entry titles

**P2 · Accessibility · Live + source**

**Observed:** Cards call publicMediaAltText with an empty object and the entry title; the observed tomato image is labeled with the post title/date.

**Why it matters:** An informative photograph can provide no additional observation to a nonvisual reader.

**Recommended change:** Carry useful authored image descriptions when available; avoid title duplication as a universal fallback. Decide decorative versus informative image use explicitly.

**Acceptance:** A photo showing leaf damage has an equivalent description; decorative repetitions do not create redundant announcements.

**Source locator at baseline:** `apps/web/src/components/public/public-home-feed.tsx:366; apps/web/src/components/public/public-journal-directory.tsx:402`.

**Visual/context evidence:** [01-feed-desktop](screenshots/01-feed-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-030"></a>

## OG-UX-030 — Mixed-language card wrapper also contains interface date

**P2 · Accessibility · Source-confirmed risk; pronunciation not tested**

**Observed:** EntryCard applies contentLanguage to a wrapper containing the UGC title/excerpt and localized dateLabel.

**Why it matters:** Assistive technology may pronounce a Bulgarian interface date using the Ukrainian post language.

**Recommended change:** Scope lang to actual authored text, and leave interface metadata in the page language.

**Acceptance:** DOM fixtures with UK text in BG chrome show correct language inheritance for both content and date; verify with a screen reader.

**Source locator at baseline:** `apps/web/src/components/ui/entry-card.tsx:176`.

<a id="og-ux-031"></a>

## OG-UX-031 — Horizontal strips show unwanted vertical scrollbars

**P3 · Component craft · Live + source**

**Observed:** Personal navigation and filter strips visibly display vertical scrollbar tracks on desktop. Tabs uses overflow-x-auto with a negative bottom margin. The exact CSS interaction needs reproduction.

**Why it matters:** The strips look broken and add visual noise; clipping may affect focus indicators.

**Recommended change:** Fix cross-axis overflow and verify outlines with persistent system scrollbars enabled.

**Acceptance:** Tab/filter rows have no vertical scroll track and no clipped focus ring at 100% and 200% zoom.

**Source locator at baseline:** `apps/web/src/components/ui/tabs.tsx:46`.

**Visual/context evidence:** [23-notifications](screenshots/23-notifications.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-032"></a>

## OG-UX-032 — Search-index eligibility is exposed as reader-facing status

**P2 · Knowledge · Live**

**Observed:** Topics and knowledge listings tell readers there is enough experience for indexing.

**Why it matters:** An internal SEO threshold is presented as a quality cue without explaining usefulness or editorial review.

**Recommended change:** Use real counts, provenance and relevant recency; keep indexing eligibility out of ordinary reading surfaces.

**Acceptance:** Reader-facing badges describe content meaning and evidence, not crawler admission.

**Source locator at baseline:** `apps/web/src/app/[locale]/topics/[slug]/page.tsx`.

**Visual/context evidence:** [39-topic](screenshots/39-topic.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-033"></a>

## OG-UX-033 — Educational answer quality is supported by product principles only

**P2 · Knowledge · Live**

**Observed:** The yellow-leaves answer cites OverGarden approach as its basis, has no linked gardening evidence, and shows zero public records.

**Why it matters:** Product philosophy is not evidence for a gardening claim; the editorial framing risks overstating authority.

**Recommended change:** Distinguish editorial orientation from sourced horticultural advice; include qualified source/review attribution and genuinely relevant experiences when available.

**Acceptance:** Claims have an appropriate source/reviewer or are clearly bounded observations; no fabricated evidence or implied verified diagnosis.

**Source locator at baseline:** `apps/web/src/server/public-localized-content.ts`.

**Visual/context evidence:** [36-answer](screenshots/36-answer.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-034"></a>

## OG-UX-034 — Blog communicates internal acquisition strategy

**P2 · Content · Live**

**Observed:** The blog heading speaks about useful pages before thin pages and delayed indexing, rather than what the gardener can learn.

**Why it matters:** A public reader receives the team SEO plan instead of a clear promise.

**Recommended change:** Replace with an editorial collection whose title, excerpts and categories answer reader intent.

**Acceptance:** The page explains its content without SEO jargon and offers a direct relevant next action.

**Source locator at baseline:** `apps/web/src/server/public-localized-content.ts:258`.

**Visual/context evidence:** [37-blog](screenshots/37-blog.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-035"></a>

## OG-UX-035 — Empty community writing loses the community context

**P2 · Community · Live + source**

**Observed:** Write the first entry points to the generic /garden#first-entry-composer with no visible community destination.

**Why it matters:** A contribution invitation becomes an add-object task and gives no assurance where the result will appear.

**Recommended change:** Carry the community intent explicitly into the composer or explain the actual submission pathway. Do not silently cross-post.

**Acceptance:** From a community invitation, the composer identifies the intended community and actual owned subject; cancel and success return coherently.

**Source locator at baseline:** `apps/web/src/components/public/public-community.tsx:949`.

**Visual/context evidence:** [25-community-detail](screenshots/25-community-detail.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-036"></a>

## OG-UX-036 — Empty saved lists still show irrelevant type filters

**P3 · Saved content · Live**

**Observed:** Bookmarks and wishlist show multiple content-type chips with zero saved items; wishlist terminology also differs between rail and title.

**Why it matters:** The empty view asks a classification question before there is anything to classify.

**Recommended change:** Lead with purpose and one meaningful discovery action; introduce filters when useful; standardize labels.

**Acceptance:** Zero-item state has a clear next step and consistent name; returning with one item makes its location obvious.

**Source locator at baseline:** `apps/web/src/app/[locale]/bookmarks/page.tsx; apps/web/src/app/[locale]/wishlist/page.tsx`.

**Visual/context evidence:** [20-bookmarks](screenshots/20-bookmarks.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-037"></a>

## OG-UX-037 — Erasure workflow is described in implementation language

**P2 · Trust · Live**

**Observed:** The page foregrounds MVP status, schema links, tombstones, HTTP 410 and maintainer approval, with a long preamble before the request.

**Why it matters:** A person trying to remove their data must understand operations rather than outcome, scope and progress.

**Recommended change:** Explain what the request does, what remains, external-copy limits and how to track it in plain language; move technical details to expandable information.

**Acceptance:** A user can correctly explain whether submission itself deletes data, what happens next and where status appears. No unverified completion promise.

**Source locator at baseline:** `apps/web/src/app/(default)/erasure/page.tsx`.

**Visual/context evidence:** [35-erasure](screenshots/35-erasure.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-038"></a>

## OG-UX-038 — Owner sources can show a partial timeout

**P2 · Owner tools · Live single occurrence**

**Observed:** The source inventory timed out while picker metrics still rendered and a retry link remained available.

**Why it matters:** The owner lacks the source state for a curation decision, although the page stays usable.

**Recommended change:** Preserve bounded section failure; add last-success context when valid and measure recurrence before attributing a systemic outage.

**Acceptance:** Source failure never looks like zero sources; retry only reloads the appropriate work; no action assumes missing source data is complete.

**Source locator at baseline:** `apps/web/src/app/(default)/garden/catalog/sources/page.tsx`.

**Visual/context evidence:** [31-owner-sources](screenshots/31-owner-sources.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-039"></a>

## OG-UX-039 — Operational metrics imply precision with a sample of one

**P3 · Owner tools · Live**

**Observed:** Median and P95 picker time both show 29672 ms from one attempt; internal rule identifiers are rendered directly.

**Why it matters:** The owner may overinterpret tiny samples and raw units while deciding whether the picker works.

**Recommended change:** Show sample size beside every metric, format seconds, suppress percentile interpretation at tiny N and translate rule names.

**Acceptance:** The owner sees 1 attempt and insufficient sample rather than a reliable-looking percentile story; raw identifiers remain in details.

**Source locator at baseline:** `apps/web/src/app/(default)/garden/catalog/sources/page.tsx`.

**Visual/context evidence:** [31-owner-sources](screenshots/31-owner-sources.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-040"></a>

## OG-UX-040 — Generic right rails do not advance the current task

**P2 · Layout · Live**

**Observed:** Curation and personal utility pages show a generic Continue reading / Start journal context rail.

**Why it matters:** A whole column is spent on an unrelated next action and makes operational screens feel assembled from templates.

**Recommended change:** Make context optional and task-specific; on focused forms collapse it or show only useful help.

**Acceptance:** Every visible rail item has a stated reason for the current task; no duplicate generic Start journal prompt on an active editor or curation queue.

**Source locator at baseline:** `apps/web/src/components/site-shell/site-shell.tsx`.

**Visual/context evidence:** [28-owner-catalog-queue](screenshots/28-owner-catalog-queue.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-041"></a>

## OG-UX-041 — Fixed large covers dominate density across unlike content

**P2 · Media · Live + canon**

**Observed:** The same large 4:3 image rhythm is applied to feed entries, even where short text and authorship are the essential information. DESIGN.md partly justifies image size via LCP-element selection.

**Why it matters:** The feed is optimized around geometry rather than reading pace and information value.

**Recommended change:** Use a consistent social card with bounded media height and intentional crops; let content determine density, then optimize real loading performance.

**Acceptance:** Text-only, portrait, landscape and multi-photo entries remain balanced; important plant evidence is not cropped away; measured LCP is not improved merely by changing its target element.

**Source locator at baseline:** `DESIGN.md: section 2.10; apps/web/src/components/ui/entry-card.tsx`.

**Visual/context evidence:** [01-feed-desktop](screenshots/01-feed-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-042"></a>

## OG-UX-042 — The design canon overclaims what mechanical gates can prove

**P2 · System · Source + live contradictions**

**Observed:** DESIGN.md enforces tokens/components but includes historical inventories and the current system still has task-structure defects. Passing a component gate is not proof of useful information architecture.

**Why it matters:** Future work can repeat the previous redesign: technically consistent components on confusing pages.

**Recommended change:** Separate invariant technical contracts, current component inventory and evaluated interaction patterns. Add task success and wrong-destination proof to signoff.

**Acceptance:** Each redesigned journey has representative data, task evidence and accessibility proof in addition to lint/axe; dated inventories are labeled historical.

**Source locator at baseline:** `DESIGN.md; docs/adr/ADR-0031-design-system-and-redesign.md`.

<a id="og-ux-043"></a>

## OG-UX-043 — Many-object workflows lack a proven large-collection model

**P2 · Scaling · Live small dataset + design risk**

**Observed:** Live account has multiple spaces/objects, but no 100-object collection was available for usability proof. The dashboard emphasizes lists and recency, not destination search.

**Why it matters:** A design that works for four objects can fail dramatically for 100 similar names.

**Recommended change:** Make search, parent context, pagination and context-preserving return explicit requirements now; validate with synthetic large collections locally.

**Acceptance:** Run the scenarios in FAST_ENTRY.md for 0/1/3 spaces and 0/1/20/100/1000 objects, including duplicate names and objects without spaces.

**Source locator at baseline:** `apps/web/src/app/(default)/garden/(home)/page.tsx`.

**Visual/context evidence:** [10-garden-desktop](screenshots/10-garden-desktop.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-044"></a>

## OG-UX-044 — Consent notice is text-heavy and obstructs current content

**P2 · Trust · Live**

**Observed:** The unchosen analytics notice occupies a large persistent bottom panel across reading and owner pages, with a long implementation-oriented explanation.

**Why it matters:** It competes with the primary action and consumes scarce mobile height; overlay/focus behavior requires explicit testing.

**Recommended change:** Retain the required choice on every page per ADR-0032 D7, but summarize purpose, offer equal understandable choices and link details.

**Acceptance:** At 320 CSS px and 200% zoom, choices and focused controls remain reachable; no keyboard trap or hidden publish action. Do not remove the notice from excluded measurement routes merely because measurement is off.

**Source locator at baseline:** `docs/adr/ADR-0032-static-public-documents.md: D7`.

**Visual/context evidence:** [23-notifications](screenshots/23-notifications.png). The exact behavior may additionally be evidenced by the DOM/source described above.

<a id="og-ux-045"></a>

## OG-UX-045 — Destructive and provenance controls need stronger task separation

**P2 · Object safety · Live; mutations untested**

**Observed:** Full history exposes repeated delete controls and the provenance form offers objects of different kinds, including a bee colony while viewing a tomato. This is an available/default option observation, not a confirmed accepted invalid relationship.

**Why it matters:** Rare irreversible operations and unrelated relationship choices compete with everyday writing and invite mistakes.

**Recommended change:** Place deletion in a deliberate object/entry menu with specific confirmation; make relationship selection neutral, explicit and semantically validated by the server.

**Acceptance:** No relationship is silently inferred from the first option; invalid cross-kind relationships are rejected with explanation; deletion names the exact entry and irreversibility.

**Source locator at baseline:** `apps/web/src/app/(default)/garden/objects/[objectId]/page.tsx`.

**Visual/context evidence:** [12-object-workspace](screenshots/12-object-workspace.png). The exact behavior may additionally be evidenced by the DOM/source described above.

## Triage order

1. OG-UX-003/004: reconcile publication, privacy and media promises before inviting more users to publish.
2. OG-UX-001/002/043: make the core recurring write journey correct for many destinations.
3. OG-UX-005/006/007/009/010: establish the centered shell and page responsibilities before restyling each page.
4. OG-UX-027/028/029/030: incorporate accessibility corrections into shared components and proof.
5. Remaining discovery, reading, social, knowledge, saved-content and owner-tool findings follow their page families.

Do not turn every symptom into an independent component patch. One shared change may resolve several findings, but each finding needs its own acceptance evidence. Do not close a source-only risk as fixed without running its actual scenario.
