> # ⚠️ STATUS 2026-09-04 · `PARTLY-SUPERSEDED`
>
> This corpus is product research written **before** the code existed. The repository is the
> source of truth for the product. Canon: `PRODUCT_CANON_2026-09.md` · superseded decisions:
> `SUPERSEDED_DECISIONS_LEDGER.md` · per-file status: `RESEARCH_STATUS_INDEX.md`.
> Reconciled against `over.garden` @ `main` `ab52664`, 2026-09-04.
>
> The transferable mechanics still hold. The implementation sequence, IA and component inventory predate ADR-0022/0023/0024: no drafts, no offline, no auth modal, one sign-in screen, every live public page indexable, market-first locales. Check any concrete instruction against `PRODUCT_CANON_2026-09.md`.

---

# Drive2 To OverGarden Adapted Blueprint

Status: OVE-147 decision artifact
Date: 2026-07-05
Mode: synthesis of OVE-145 guest audit and OVE-146 authenticated audit
Scope: IA, UX/CX mechanics, component inventory, and vertical SDD implementation sequence
Non-scope: no product implementation, no pixel clone, no Drive2 copy, no new external data collection

## Product Thinking Gate

Input files reviewed:

- `docs/product-research/README.md`
- `docs/product-research/DRIVE2_CANON_v1.md`
- `docs/product-research/drive2/GUEST_PUBLIC_PAGE_ARCHETYPE_AUDIT_2026-07-05.md`
- `docs/product-research/drive2/AUTHENTICATED_WORKSPACE_CREATION_SOCIAL_LOOP_AUDIT_2026-07-05.md`
- `docs/product-research/B3_INFORMATION_ARCHITECTURE_AND_FLOWS_v0.md`
- `docs/product-research/OverGarden_PAGE_ARCHITECTURE_v1.md`
- `docs/product-research/OverGarden_PAGE_ARCH_DECISIONS_v0.md`
- `docs/product-research/ENTRY_DATA_AND_RANKABILITY_SPEC_v0.md`
- `docs/MVP_SCOPE_RECHECK_2026-07-03.md`
- `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- current app routes under `apps/web/src/app`

User/job assumption:

The founder/operator needs a decision gate between competitor research and redesign implementation. The product job is not "copy Drive2". It is to translate the proven object-passport and journal-discovery loop into OverGarden's privacy-safe living-object model, so future Linear slices can be vertical and behavior-backed instead of UI-only.

Load-bearing product risks:

- If OverGarden copies Drive2's visible city, identity, direct-message, marketplace, or object-identifier posture, it will violate the wartime privacy and trust model.
- If OverGarden copies only the surface navigation and misses the object -> journal -> aggregation loop, it will build a prettier app without improving acquisition or retention.
- If animal compatibility is silently treated as MVP implementation scope, it can widen the product before the plant-first MVP has enough proof. OVE-147 still requires the blueprint to handle plants and animals, so this document separates architecture compatibility from execution scope.

Conflict resolution:

- `B3_INFORMATION_ARCHITECTURE_AND_FLOWS_v0.md` says the seed domain is plants only. OVE-147 requires explicit plant and animal handling. Resolution: use "living object" as the durable IA abstraction and include animal-compatible fields and slices, but keep current MVP execution plant-first unless the founder explicitly promotes animal keeping into MVP scope.
- Older page architecture names some authenticated surfaces as `/app`; current implementation uses `/garden`, `/garden/objects/[objectId]`, `/feed`, `/notifications`, `/bookmarks`, `/wishlist`, `/garden/lineage/*`, `/garden/profile`, and `/garden/privacy/erasure-requests`. Resolution: map concepts to current routes where they exist and treat older route names as historical concept labels.
- Drive2 uses public profile and geography density as trust signals. OverGarden must instead use safe object context, public-safe journal evidence, moderated social proof, consented lineage, and coarse or hidden region.

## Decision Summary

OverGarden should adopt Drive2's growth mechanism, not Drive2's product posture.

The transferable mechanism is:

1. A user owns an object.
2. The object has a durable passport.
3. The object passport anchors a chronological journal.
4. Journal entries become useful public answer pages when they contain real narrative text and safe structured context.
5. Catalog/topic/problem aggregations collect those entries into discovery surfaces.
6. Read-open and write-gated engagement converts public discovery into accounts and repeat use.
7. Notifications, follows, comments, bookmarks, claims, and reminders create return loops.

The required OverGarden adaptation is:

1. Object means a living object, not a car.
2. Space means garden, balcony, greenhouse, plot, coop, apiary, pen, tank, or another safe container, not a garage.
3. Location is never exact in product/public/search/log surfaces. Public output may use only allowed coarse region or hidden location.
4. Public entries and aggregations obey the existing public indexing policy and thinness gates.
5. Profiles and full lineage graphs remain shareable but `noindex` at MVP.
6. Auth is OverGarden's Better Auth path. Do not copy Drive2 provider assumptions. Apple Sign-In is not MVP after the 2026-07-04 founder decision.
7. Marketplace, commercial modules, direct messages, and identity-heavy social mechanics are rejected for MVP.

## OVE-145 Guest Audit Summary

Observed guest-side Drive2 pattern:

- Public home routes readers into search, catalog, and object paths.
- Public navigation exposes a mature ecosystem, but the useful crawl loop is object, entry, catalog, profile, search, and community.
- Catalog pages are alive because they combine taxonomy with latest owner entries.
- Object passports make UGC credible by attaching posts to durable real-world objects.
- Logbook entries work as long-tail answer pages because narrative text is bound to object context.
- Guest comments and public social proof make the corpus feel active, while writing remains gated.
- Search result cards expose enough object context to make results credible.
- Mobile pages keep public reading paths available without forcing app install or account creation.

Guest-side OverGarden translation:

- Public entry pages should show real living-object context, safe media, date/season, and public-safe related links.
- Variety/species/problem/topic pages should become evidence pages with public journal examples after quality gates, not static encyclopedia stubs.
- Guest readers should be able to read public entries, variety/topic/problem pages, guides, answers, and safe profiles, then hit auth only for state-changing actions.
- Public profiles can support trust but must remain `noindex` at MVP.
- Deleted public UGC must use the existing 410/de-indexing model when applicable.

## OVE-146 Authenticated Audit Summary

Observed authenticated Drive2 pattern:

- Signed-in home is a retention loop around ownership, not a generic feed.
- Zero-object state pushes the user to create the first owned object.
- Object creation creates a durable passport that later hosts journal entries.
- Object-bound logbooks are separated from freeform personal blogging.
- Profile, settings, subscriptions, bookmarks, notifications, comments, reactions, and reminders support repeat sessions.
- Feed configuration lets users tune interests by people, objects, taxonomy, and activity type.
- Mobile logged-in flows preserve object creation, composer, and settings controls.

Authenticated OverGarden translation:

- `/garden` should open as owned workspace first, feed second.
- Empty workspace should lead to `space_created -> living_object_created -> first_entry_started`.
- Object creation must be much lighter than Drive2 car creation: catalog/typeahead when known, Unknown/provisional fallback when not, smart defaults, optional media, inherited location setting.
- The composer should inherit context from object or space and preserve draft intent through auth when needed.
- Notification controls should cover comments, replies, follows, mentions, claim inbox, stale-object reminders, digest, and product updates.
- Direct messages should wait until moderation, reporting, blocking, and privacy copy are ready.

## Pattern Extraction Table

| Drive2 observed pattern                                  | Transfer class             | OverGarden adaptation                                                                                                             | OverGarden user job                                                         | Smallest reversible path                                                                    |
| -------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Object passport anchors the journal                      | Direct                     | Living-object passport for plants and animals with catalog/Unknown, nickname, space, start date, cover, status, safe journal list | "I need one stable place for this plant or animal's story"                  | Start with private `/garden/objects/[objectId]` passport and one "new entry" action         |
| Garage/container organizes objects                       | Direct with domain rename  | Space = garden, balcony, greenhouse, plot, coop, apiary, pen, tank, or other safe container                                       | "I need to group living things without repeatedly entering context"         | Default first space plus editable name/type and inherited location visibility               |
| Logbook entries are object-bound                         | Direct                     | Object and space journal entries use title + body, safe media, date/backdate, mentions, and context inheritance                   | "I want to record what happened without building a database record first"   | Title/body/date entry from object page, with media and mentions optional                    |
| Catalog pages surface live owner entries                 | Privacy/domain adapted     | Variety/species/problem/topic pages show public-safe entry evidence only after trust and thinness gates                           | "I want to know what happened to similar living objects in real conditions" | `noindex` aggregation from first safe entry; index only via policy promotion                |
| Read-open, write-gated social interaction                | Direct                     | Guests read public surfaces; auth required for comments, follows, claims, object creation, publishing, bookmarks                  | "Show me value before asking for an account"                                | Preserve return path and draft/action intent through auth wall                              |
| Search result cards show object context                  | Privacy adapted            | Search cards show title/body snippet, object type/catalog, safe date/season, coarse/hidden region, no precise location            | "I need credible search results, not anonymous snippets"                    | Query + result cards from public-safe journal entries only                                  |
| Comments, reactions, bookmarks create return loop        | Domain adapted             | Auth-gated comments, cosmetic likes, private bookmarks, report/block, conservative ranking impact                                 | "I want feedback and saved references without unsafe exposure"              | Comments and bookmarks first; likes cosmetic; no ranking boost until moderation proof       |
| Feed subscriptions tune interests                        | Direct                     | Follow people, living objects, varieties/species, topics, problems, and provenance chains                                         | "I want updates that match what I grow or keep"                             | `/feed` starts with followed feed and explicit filters; no opaque recommendation dependency |
| Notifications and stale prompts bring users back         | Direct with safety copy    | Comments, replies, follows, mentions, claims, stale-object/stale-journal reminders, digest                                        | "Remind me when my living record needs attention or someone responds"       | Notification settings plus one stale reminder category; no exact place in push/email copy   |
| Profile supports trust and identity                      | Privacy adapted            | Handle, display name, avatar, bio, languages, public objects summary, noindex metadata, erasure controls                          | "Can I trust this grower/keeper?"                                           | Shareable profile page remains `noindex`; no exact city or real-name pressure               |
| Lineage/provenance makes object relationships meaningful | Privacy adapted            | Confirmed edges only; variety/species-mediated public rendering; claim inbox before exposure                                      | "Where did this plant/animal line come from, and who can answer safely?"    | Claim inbox and object-level provenance summary before full graph UI                        |
| Personal blog absorbs non-object stories                 | Limited                    | Space-level narratives are allowed; unscoped personal blogging stays secondary                                                    | "I need to explain the greenhouse/coop/garden context, not only one object" | Space story composer with optional object mentions                                          |
| Marketplace/services modules monetize dense intent       | Rejected for MVP           | Keep monetization, supplies, vets, plant clinics, seed sellers, and marketplace out of primary MVP IA                             | "I need journal value first; commerce can come later"                       | No MVP route; revisit after journal/discovery loop proves repeat use                        |
| City/country/profile geography builds trust              | Rejected as copied posture | Never expose exact/city-level location by default; use allowed coarse region or hidden setting only                               | "I need safety and control before public contribution"                      | Location control stays on space/object; public rendering tested for no precise data         |
| Direct messages create social gravity                    | Rejected for MVP           | Wait until moderation, blocking, reporting, and privacy expectations are proven                                                   | "I need a safe way to ask, not an uncontrolled inbox"                       | Ask-the-lineage or comments before private messages                                         |
| Heavy car specs create object credibility                | Rejected as initial burden | No VIN-like, serial-like, exact-property, exact-collection, or sensitive animal-location identifiers                              | "Let me start even if I only know the common name"                          | Unknown/provisional catalog path with later correction                                      |
| Auth provider stack mirrors local social norms           | Rejected                   | Follow OverGarden Better Auth decisions; Apple Sign-In is not MVP                                                                 | "I need a trustworthy account path, not copied providers"                   | Keep approved self-serve auth and existing provider scope                                   |

## OverGarden IA Map

### Guest Public IA

Purpose: let a reader discover useful living-object evidence before account creation.

- `/`, `/bg`, `/ru`: localized authored homepage surfaces. They should signal the public corpus and route to search, guides, answers, variety/topic/problem pages, and first-object creation, not behave as generic marketing-only pages.
- `/journal/[slug]`: public journal entry route. Entry is the answer page: title, body, safe media, object/space context, date/season, catalog or Unknown state, tags, previous/next when safe, comments read model, and 410 state if deleted.
- `/variety/[slug]`: current public variety aggregation. It should eventually represent the Drive2 brand/model/generation pattern: taxonomy plus living journal evidence, with `noindex` until quality gates pass.
- `/answers/[slug]`, `/guides/[slug]`, `/blog/[slug]`, `/markets/[market]`: authored SEO/AEO and market surfaces. They can bridge readers into public entries and safe object creation, but should not substitute for the object-journal loop.
- `/feed` and localized feed routes: followed/public feed surfaces should stay auth-aware and `noindex` where current policy requires.
- `/[locale]/[profileHandle]`: public-visible profile route, `noindex` at MVP. It supports trust, not acquisition.
- `/lineage/objects/[objectId]`: public-safe lineage/object relationship surface where available. Full graph stays `noindex`.
- `/bookmarks`, `/wishlist`, `/notifications`: public route aliases exist, but behavior should remain auth-aware and route state-changing actions through sign-in.
- 404 and 410 states: recovery links should point to public discovery, not thin indexed dead ends.

### Authenticated IA

Purpose: make owned living records easy to maintain and safe to publish.

- `/garden`: owned workspace. It starts with empty-state onboarding, first space/object/entry path, current objects, recent journal continuity, draft resume, private progress feedback, and entry composer.
- `/garden/objects/[objectId]`: object passport and object journal. It should be the primary repeat-session surface for a living object.
- `/garden/catalog/curation`: operator/admin catalog resolution and source provenance where authorized.
- `/garden/lineage/claims`: claim inbox for proposed cross-user edges.
- `/garden/lineage/invitations/claim`: invite/claim path with zero-leak boundary.
- `/garden/lineage/questions`: ask-the-lineage or lineage update surface, still safety-gated.
- `/garden/profile`: handle, display name, avatar, bio, languages, profile safety controls.
- `/garden/privacy/erasure-requests`: operator erasure workflow.
- `/notifications`: notification center and preferences.
- `/bookmarks`: saved references.
- `/wishlist`: future-season object/catalog planning shelf.
- `/admin/*`: operator-only control plane. Never part of public discovery.
- `/auth/*`: Better Auth account flows.

## Guest Vs Authenticated Navigation Model

Guest model:

- Read public home, guides, answers, public entries, variety/topic/problem pages, safe profiles, and safe lineage summaries.
- Search and browse without account creation.
- See comments and social proof where moderation allows.
- Hit auth only on writing, bookmarking, following, claiming, commenting, object creation, and publishing.
- Preserve return path and draft/action intent through auth.

Authenticated model:

- Land in `/garden` as owned workspace, not a public feed clone.
- Create or continue a living object before being pushed into generic social browsing.
- Move laterally between workspace, object passport, composer, draft resume, feed, notifications, bookmarks, wishlist, profile, and lineage/claims.
- Keep privacy and publication controls available on mobile. No desktop-only safety controls.
- See public readback after publication so the user understands what the outside world sees.

## Public Indexed Journal Model

Drive2's strongest transferable SEO/AEO move is that long-tail entries answer real problems through object context. OverGarden's version must be stricter:

- The public journal entry is title + body first. Do not regress to milestone-only, chip-only, or auto-generated thin pages.
- The entry must bind to object or space context. Object context includes catalog item or Unknown/provisional, object kind, safe date/season, media derivative state, topic/problem tags, and coarse/hidden location setting.
- Public entry metadata and HTML must never include precise coordinates, raw media keys, unsafe user identifiers, private account history, or exact collection/place hints.
- Entry indexing follows `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`: public entries remain `noindex` while `public_noindex = true`; thin body/content stays `noindex`; sitemap eligibility comes from server policy.
- Aggregations are not automatically indexable. Variety/species/problem/topic pages can exist for navigation from the first safe entry, but stay `noindex` until quality gates promote them.
- Profiles and full lineage graphs remain `noindex` at MVP even when shareable.
- Deleted public UGC must leave discovery and return the correct gone state rather than becoming a 404 or stale indexed page.

## Object Passport For Plants And Animals

The shared abstraction is `LivingObject`. A plant and an animal are not identical, but the Drive2 transfer works because both can have durable identity, ownership/care context, a timeline, and public-safe learning value.

Shared passport fields:

- Object kind: plant, animal, or future living-object subtype.
- Catalog/species identity: catalog item where known, Unknown/provisional where not.
- Nickname/display label.
- Space assignment.
- Optional cover photo from stripped derivative only.
- Optional start/acquired/planted/arrival date.
- Lifecycle/status summary.
- Public-safe location setting inherited from space with optional object override.
- Public journal list.
- Provenance/lineage summary where consented and safe.
- Related variety/species/topic/problem links.

Plant-specific passport examples:

- Variety/cultivar/species/common name.
- Planted, seeded, propagated, transplanted, harvested, overwintered, failed, recovered.
- Garden bed, balcony pot, greenhouse, field, orchard, indoor shelf.
- Problem/topic tags such as germination, pests, pruning, flowering, fruiting, wintering, soil, irrigation.
- Lineage can mean seed/source/cutting/propagation relationship.

Animal-specific passport examples:

- Species/breed/strain/common name, where legally and ethically appropriate.
- Herd/flock/hive/coop/pen/tank/stable context.
- Arrival, birth/hatch, health check, feeding, breeding, molt, laying, harvest-adjacent or welfare event, relocation, loss.
- Privacy risk can be higher because animals may imply exact property value, biosecurity exposure, or household identity. Animal surfaces need at least the same location lock as plants and often stricter copy.
- Lineage can mean breeding/provenance/colony/source relationship, but must avoid public exposure of sensitive stock, exact facility, or illegal/regulated activity.

Execution guard:

Current MVP docs are plant-first. OVE-147's blueprint should therefore keep the IA compatible with animals but not quietly create animal MVP implementation tickets unless the founder confirms that scope. The smallest safe step is to use neutral concepts where they do not cost complexity (`living_object`, `object_kind`, `space`) and keep plant labels in current UI where the active product is already plant-specific.

## Garden Or Workspace Replaces Garage

Drive2's "garage" is the owned-object container. OverGarden should not use car metaphors. The functional replacement is a workspace made of spaces:

- A `Space` is the owned container: garden, balcony, greenhouse, plot, orchard, indoor shelf, coop, apiary, pen, tank, or similar.
- A space carries a default location visibility setting. Objects inherit it unless explicitly overridden.
- A space has a journal for space-level stories.
- A space has an object list and object creation action.
- Empty workspace should auto-create or prompt a default space so the first object does not float without context.
- The UI should call this the user's garden/workspace in current plant MVP, while keeping the internal concept adaptable to non-plant living-object domains later.

## Journal And Logbook Creation/Readback

Creation model:

- Start from object screen, space screen, public variety page preselection, or guest draft path.
- Required: title and body.
- Default context: current object or current space.
- Optional: media, voice-to-text, backdate, topic/problem tags, `@` mentions of own objects, later cross-user mentions.
- For unknown catalog identity, allow creation now and resolution later.
- For first publication, use the existing inline disclosure model. Do not introduce a recurring per-entry public/private selector.

Readback model:

- Authenticated object readback shows passport, recent entries, new entry action, progress moment, privacy controls, catalog resolution, provenance summary, and follow-up prompts.
- Public entry readback shows exactly what guests can see: title, body, safe media, safe object/space context, safe links, comments if allowed, and auth-gated state-changing controls.
- Public aggregation readback shows safe evidence density, not a static content shell.
- Mobile readback must keep context and safety controls visible before secondary modules.

## Discovery, Feed, Search, And Category Model

Discovery surfaces:

- Variety/species pages: Drive2 brand/model/generation equivalent. They collect safe journal evidence for a catalog identity.
- Problem/topic pages: real-world task and condition discovery such as pest, pruning, wintering, germination, flowering, disease, feeding, health, or habitat.
- Coarse-region and season facets: useful only when location setting allows safe coarse region. Never infer or expose precise location.
- Search: query + object kind + catalog/species + problem/topic + coarse region where safe.
- Curated guide/answer pages: authored bridges that explain a topic and link to safe public journal evidence.

Feed surfaces:

- Followed people, objects, varieties/species, topics, problems, provenance chains, comments, claims, and mentions.
- Explicit filters before opaque algorithmic ranking.
- Cosmetic likes can exist but must not become early ranking authority.
- Ranking should prefer safety, freshness, text usefulness, catalog/source trust, moderation status, and public indexing eligibility over raw popularity.

## Profile, Social, And Notification Model

Profile:

- Public-safe handle, display name, avatar, bio, languages, public objects summary, noindex metadata.
- No real-name pressure, exact city, birthday, demographic defaults, external social identity as trust substitute, or searchable profile by default.
- Erasure and account deletion paths must remain visible and operational.

Social:

- Comments are read-open when safe and write-gated through auth.
- Follows do not increase target visibility beyond target settings.
- Cross-user mentions and provenance require proposed -> confirmed/declined state before public contribution.
- Bookmarks/wishlist are private utility, not public status.
- Report/block must exist before higher-risk social expansion.
- Direct messages are rejected for MVP.

Notifications:

- Comments/replies.
- Follows.
- Mentions.
- Claim inbox.
- Provenance updates.
- Saved/shared entry feedback where safe.
- Stale object or stale journal reminders.
- Digest and product updates.
- Push/email copy must not include precise place, private content, raw object identifiers, or sensitive animal/location details.

## Mobile-First Navigation And Density

Drive2 proves mobile parity matters; OverGarden needs a lighter mobile path because users will often document living things outdoors or in interrupted care contexts.

Rules:

- First object and first entry should require the fewest possible decisions: object identity or Unknown, default space, title/body.
- The primary mobile bottom/near-thumb actions should be object, new entry, feed, notifications, and workspace, not marketplace or admin.
- Privacy controls, first-publication disclosure, location visibility, draft state, and media upload status must never be desktop-only.
- Object passport cards should be compact and stable: identity, status, last entry, location visibility, new entry action.
- Public mobile entry pages should show answer value and object context before comments, auth prompts, or secondary recommendations.
- Avoid Drive2's commercial density until OverGarden has corpus density. Early mobile clutter will suppress the first-journal habit.
- Empty states should ask for the next owned action, not present generic marketing copy.

## Component Inventory For Implementation Slices

Workspace and object components:

- `WorkspaceShell`
- `SpaceList`
- `SpaceCard`
- `SpaceCreateSheet`
- `SpaceJournalTimeline`
- `LivingObjectCreateSheet`
- `LivingObjectPassport`
- `ObjectStatusSummary`
- `ObjectJournalTimeline`
- `ObjectContextHeader`
- `LocationPrivacyControl`
- `CatalogResolveControl`
- `UnknownCatalogBadge`
- `ObjectProgressMoment`

Composer components:

- `EntryComposer`
- `ObjectEntryComposer`
- `SpaceStoryComposer`
- `DraftResumePanel`
- `VoiceInputControl`
- `PhotoSelectionControl`
- `MediaUploadStripStatus`
- `BackdatePicker`
- `MentionTypeahead`
- `TopicProblemTagPicker`
- `FirstPublicationDisclosure`
- `SaveProgressMoment`
- `AuthWallWithDraftIntent`

Public discovery components:

- `PublicEntryPage`
- `PublicEntryObjectContext`
- `PublicSafeMedia`
- `PublicCommentsReadModel`
- `PublicVarietyEvidencePage`
- `PublicProblemTopicPage`
- `PublicSearchResults`
- `PublicResultCard`
- `PublicProfileSummary`
- `PublicLineageSummary`
- `IndexabilityBadgeForOperators`
- `Gone410Recovery`

Social and retention components:

- `FollowButton`
- `BookmarkButton`
- `WishlistAction`
- `CommentComposer`
- `ReportBlockControls`
- `FollowedFeedFilters`
- `NotificationCenter`
- `NotificationSettings`
- `ClaimInbox`
- `LineageQuestionComposer`
- `ProvenanceSummary`
- `StaleObjectReminderSettings`

Animal-compatible future components:

- `AnimalPassportFields`
- `AnimalSpaceTypeSelector`
- `AnimalLifecycleEventHints`
- `AnimalBiosecurityPrivacyNotice`
- `AnimalLineageConsentSummary`

These components should be introduced only inside vertical SDD slices. Do not create a component library ticket detached from user behavior.

## Prioritized Vertical SDD Implementation Sequence

This sequence is executable as vertical slices. Each item maps to an observed Drive2 pattern, an OverGarden user job, and a smallest reversible path.

| Order | Vertical behavior slice                                                 | Drive2 pattern                                              | OverGarden user job                                                | Smallest reversible path                                                                       | Notes                                                                    |
| ----- | ----------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0     | Blueprint review gate                                                   | Competitor audit -> product synthesis before implementation | Founder needs a clear adapted IA before redesign starts            | This OVE-147 document only                                                                     | Do not start implementation until reviewed                               |
| 1     | Empty `/garden` workspace creates first living object path              | Zero-object workspace asks for first owned object           | "Help me start my record without knowing the taxonomy"             | Default space + object create sheet + Unknown fallback + first-entry CTA                       | Plant-first UI; neutral internals where already cheap                    |
| 2     | Object passport readback becomes repeat-session home                    | Object passport anchors logbook                             | "Show me the history and next action for this object"              | `/garden/objects/[objectId]` passport with status, last entry, safe location, new entry action | No public object SEO yet                                                 |
| 3     | Context-bound entry composer writes object/space journal                | Object-bound logbook and secondary personal blog            | "Let me write what happened with inherited context"                | Title/body/date save from object; space story with optional own-object mentions                | Media/voice can stay progressive if not already ready                    |
| 4     | First-publication and public readback prove safe guest view             | Entry as public answer page                                 | "I need to know what others can see after I publish"               | Public entry route with policy metadata, safe media, object context, 410 state                 | May remain `noindex` until quality gate                                  |
| 5     | Variety/species aggregation turns entries into evidence pages           | Brand/model/generation pages with latest entries            | "Show me real outcomes for this variety/species"                   | Public aggregation exists from first safe entry but `noindex` until promotion                  | Reuse server public-surface policy                                       |
| 6     | Search and result cards expose safe object context                      | Search result cards route to entries, objects, catalog      | "Find relevant experience by problem, species, object, or region"  | Public-safe query + result cards; no exact location, no private identifiers                    | Meilisearch index remains public rows only                               |
| 7     | Followed feed and notification center create repeat loop                | Subscriptions and notification settings                     | "Bring me back for relevant updates"                               | Followed feed filters + comments/claims/follows/stale reminders settings                       | No direct messages                                                       |
| 8     | Comments, bookmarks, wishlist, and report/block add low-risk engagement | Comments, reactions, bookmarks, dashboard                   | "Let me respond, save, and control unsafe interactions"            | Auth-gated comments + private bookmarks/wishlist + report/block                                | Likes cosmetic only; no early ranking authority                          |
| 9     | Profile and consented lineage support trust without SEO exposure        | Profile, followers, provenance, object relationships        | "Can I trust this source and relationship?"                        | Shareable `noindex` profile + claim inbox + object-level provenance summary                    | Full graph stays `noindex`; proposed edges have zero public contribution |
| 10    | Mobile/offline/media hardening protects field capture                   | Mobile parity and object journal continuity                 | "I need to capture while outside or offline"                       | Mobile controls for object/composer/privacy/media state; offline text first if needed          | Media derivative tests and no desktop-only safety controls               |
| 11    | Animal-domain extension gate                                            | Same owned-object loop can apply beyond cars                | "Can this support animals without risking privacy or scope creep?" | Founder-reviewed feature flag/prototype for one animal space type, no public indexing          | Only after plant MVP evidence or explicit founder scope change           |

## Launch Risk And Privacy Notes

Privacy and safety:

- Exact location remains prohibited across product UI, public HTML, metadata, logs, analytics, public search documents, sitemap, and evidence.
- Drive2's city/country trust pattern is a direct non-transfer.
- Animal objects can expose property value, biosecurity, household identity, or regulated activity. The blueprint supports animals but does not make animal public indexing automatic.
- Raw media and EXIF are never public. Only stripped derivatives render publicly.
- Public search must index public rows only.
- Cross-user edges do not contribute publicly until confirmed.
- Profile and lineage graph pages stay `noindex` at MVP.

Product and launch:

- Thin public pages are more dangerous than no pages. Aggregations should exist for navigation before they become indexed.
- Marketplace and commercial links are premature before the journal/discovery loop proves retention.
- Direct messages would create moderation and safety obligations before the trust system is ready.
- Heavy object setup would suppress first-entry activation.
- Generic feed-first navigation would dilute the owned-object habit.
- Over-broad animal scope can slow launch. Keep the architecture compatible while execution remains evidence-led.

Measurement signals to watch after implementation:

- First-session completion: space created, object created, first entry started, first entry published.
- Unknown/provisional object rate and later resolution rate.
- Public readback completion after first publication.
- Entry body length and media derivative success rate.
- Variety/topic aggregation promotion rate.
- Search result click-through to public entries.
- Comment/bookmark/follow/claim/stale reminder return rates.
- Location hidden/coarse selection distribution.
- Profile `noindex` share interactions versus abuse/moderation reports.

## Founder Questions Before Implementation

1. Are animals in MVP implementation scope, or only architecture compatibility until plant MVP proof? Current B3 remains plant-only; OVE-147 requires animal handling in the blueprint.
2. Should public object passports exist at MVP, or should object passports remain authenticated/private while public value comes from entries and aggregations first?
3. What exact thinness threshold promotes variety/species/problem/topic pages from `noindex` to indexable?
4. Should topic/problem pages be language-filtered or language-agnostic while corpus density is low?
5. Which social proof is allowed on public result cards before moderation is mature: comment count, bookmark count, cosmetic likes, or none?
6. What stale reminder cadence is acceptable for plants, and would animals require stricter opt-in copy?
7. Is "ask the lineage" acceptable as a safer MVP substitute for direct messages?
8. If animal scope is approved later, which first domain is least risky: bees, chickens, aquarium, house pets, livestock, or another segment?
9. Should route naming stay `/garden` for authenticated workspace long term, even if future living-object scope includes animal spaces?
10. Which founder-reviewed route should own public-safe object/lineage summaries: `/lineage/objects/[objectId]`, future `/objects/[slug]`, or only entry-attached summaries?

## Acceptance Criteria Check

- Guest audit summary included: yes, see "OVE-145 Guest Audit Summary".
- Authenticated audit summary included: yes, see "OVE-146 Authenticated Audit Summary".
- Pattern extraction table included: yes, with direct, privacy/domain-adapted, limited, and rejected transfers.
- OverGarden IA map included: yes, split into guest public IA and authenticated IA with current route references.
- Implementation sequence included: yes, eleven vertical SDD slices plus this blueprint gate.
- Launch risk/privacy notes included: yes.
- Open founder questions included: yes.
- Every proposed implementation slice maps to an observed Drive2 pattern and an OverGarden user job: yes, see the implementation sequence table.
- Plants and animals are explicitly handled: yes, see "Object Passport For Plants And Animals" and the animal-domain extension gate.
- Public/private/search-indexing rules are preserved: yes, see public indexed journal model, IA map, and launch risk notes.
- Each major implementation area names a smallest reversible path: yes, see pattern extraction table and implementation sequence.
- Prioritized implementation order is executable as vertical SDD slices: yes, and component inventory is constrained to those slices rather than standalone component work.
