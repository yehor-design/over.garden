# Drive2 Guest Public Page Archetype Audit

Status: OVE-145 research artifact
Date: 2026-07-05
Mode: logged-out browser audit, no Drive2 account, no credentials, no screenshots committed
Scope: public page archetypes and transferable mechanics, not exhaustive UGC enumeration
Related follow-up: OVE-147, Drive2-to-OverGarden synthesis

## Executive Take

Drive2's public growth engine is not a single feed. It is a linked system:

1. A durable object passport for each car.
2. Long-tail journal entries tied to that object.
3. Aggregation pages for make, model, generation, categories, search, communities, and curated topics.
4. Read-open, write-gated social interaction.
5. Dense internal links that keep a guest moving between object, author, entry, category, search result, and community.

The useful transfer to OverGarden is the mechanism, not the brand, UI styling, text, assets, or Russian-market context. OverGarden should adapt the object -> passport -> public journal -> aggregation -> discovery loop to living objects, with the existing wartime privacy lock and SEO thinness gates. Drive2's visible city/country and identity-forward profile patterns must be treated as dangerous defaults for OverGarden, not copied.

## Method And Source Boundary

I inspected Drive2 while logged out on desktop and mobile-sized viewport. I used only public pages and kept notes at the pattern level. I did not create or use a Drive2 account, did not submit forms, did not capture or commit screenshots, and did not copy long user-generated text.

Sampled public URLs:

- Home: `https://www.drive2.ru/`
- Brand page: `https://www.drive2.ru/cars/bmw/`
- Model page: `https://www.drive2.ru/cars/bmw/5_series/m271/`
- Generation page: `https://www.drive2.ru/cars/audi/a4/g30/`
- Object passport: `https://www.drive2.ru/r/bmw/5_series/617922512226898921/`
- Logbook entries: `https://www.drive2.ru/l/599573587304652279/`, `https://www.drive2.ru/l/736016383241887522/`
- Personal blog entry: `https://www.drive2.ru/b/462772350576755187/`
- Search result: `https://www.drive2.ru/search/?text=%D0%B7%D0%B0%D0%BC%D0%B5%D0%BD%D0%B0%20%D0%BC%D0%B0%D1%81%D0%BB%D0%B0`
- User profile: `https://www.drive2.ru/users/bmojioko/`
- Communities index and community: `https://www.drive2.ru/communities/`, `https://www.drive2.ru/communities/323/`
- Curated topics: `https://www.drive2.ru/featured-topics/`
- Adjacent commercial surfaces: `https://www.drive2.ru/companies/`, `https://www.drive2.ru/market/`
- Auth and error states: `https://www.drive2.ru/reception/`, `https://www.drive2.ru/signup/`, a synthetic 404 URL

## Page Archetypes

### 1. Public Home / Entry Point

Primary user job: arrive with an automotive question and choose either search or a car make path.

IA and layout: sparse top header, prominent search-answer promise, car selector, brand grid, and car-sale ads below. The first screen frames the corpus as lived owner experience rather than generic editorial content.

Navigation model: home -> search, brand pages, sign-in, sign-up. The broader product navigation is less dominant on the home page than on inner pages.

Trust and quality cues: a large visible corpus claim, brand grid, recognizable car makes, and the promise of answers from owners.

Social proof mechanics: scale of historical stories and owner-generated corpus is the trust signal before any single author is encountered.

SEO/AEO relevance: the home page acts as a broad category/brand entry, but its stronger acquisition role is to route users into long-tail answer pages.

OverGarden transfer: OverGarden's public front door should make the corpus legible as "real growing experience from living objects", then route to search, variety/problem/topic pages, and a first living-object path.

Do not transfer: do not make the home page a generic marketing landing page that hides the journal corpus. Do not copy Drive2 wording, visual hierarchy, or brand associations.

### 2. Global Navigation Shell

Primary user job: move laterally between cars, logbooks, communities, services, marketplace, featured topics, and car-sale inventory.

IA and layout: inner pages expose a persistent top-level navigation stack. The logged-out header always keeps sign-in and sign-up available.

Navigation model: horizontal product areas plus breadcrumbs inside catalog and object pages.

Trust and quality cues: breadth of sections signals a mature ecosystem, but also creates commercial clutter.

Social proof mechanics: communities, marketplace, services, and featured topics imply a full network beyond a single content page.

SEO/AEO relevance: repeated cross-links increase crawl paths across public surfaces.

OverGarden transfer: use a restrained public shell with discovery, journal, catalog/topic, community/profile where relevant, and auth actions. Keep it simpler than Drive2 until OverGarden has enough content density.

Do not transfer: do not ship marketplace/services as primary MVP navigation. In OverGarden docs, monetization is post-MVP.

### 3. Feed / Main Stream Pages

Primary user job: browse recent or filtered owner experience.

IA and layout: the logbook index exposes filters by car make/model and content category. Generation-specific feeds add sorting by likes or comments and show entry cards with object, author, snippet, comments, and time.

Navigation model: global logbook feed -> make/model/generation-specific feed -> entry -> object passport -> author.

Trust and quality cues: filterable corpus, visible author and object context, comments previews, dates, and category labels.

Social proof mechanics: likes, comments, recency, and repeated owners create a sense of active network.

SEO/AEO relevance: category and generation feeds act as crawlable pathways into individual long-tail entries.

OverGarden transfer: build discovery around variety, problem, topic, coarse region, season, and object type. Use comments and save/follow signals carefully; current docs already say cosmetic anonymous likes must not feed ranking.

Do not transfer: do not let popularity signals amplify private, exact-location, or personally identifying surfaces.

### 4. Brand / Model / Generation Catalog Pages

Primary user job: find all owner experience for a known car make, model, or generation.

IA and layout: brand pages list models and latest owner posts. Model pages list generations and latest posts. Generation pages combine photos, latest owner entries, tires/parts/marketplace modules, and car sale ads.

Navigation model: make -> model -> generation -> latest entries or all cars. Breadcrumbs make the current catalog level explicit.

Trust and quality cues: editorial catalog summaries, model/generation taxonomy, owner activity, and commercial inventory all reinforce the object taxonomy.

Social proof mechanics: every catalog level shows living activity, not just a static encyclopedia page.

SEO/AEO relevance: this is the strongest transferable aggregation pattern. A page is useful because it combines canonical object taxonomy with fresh UGC and links to entries.

OverGarden transfer: map to catalog-backed variety/species/topic/problem pages. A variety page should not be a static encyclopedia only; it should surface public-safe real journal entries and season/region patterns once quality gates are met.

Do not transfer: do not expose thin catalog pages to search just because Drive2 can. OverGarden's public SEO policy keeps thin or unsafe UGC noindex until promotion gates.

### 5. Object / Car Passport

Primary user job: understand one owner's object, its specs, history, owner context, photos, and journal.

IA and layout: object title, make/model/generation breadcrumbs, owner card, visible location, album, owner review, passport/spec section, logbook list, related car-sale ads, and comments.

Navigation model: object page links back to catalog generation, full logbook, owner profile, album, previous cars, and entries.

Trust and quality cues: hard specs, long owner description, maintenance history, photos, mileage, cost fields in entries, and many comments/followers make the object feel real.

Social proof mechanics: comments on the object, entry counts, author profile, multiple owned cars, and follower graph.

SEO/AEO relevance: object pages are durable hubs that concentrate all entries around one node. They make journal entries more credible because the reader can inspect the underlying object.

OverGarden transfer: create a public-safe living-object passport: plant or animal identity, catalog item or unknown/provisional state, visible-safe context, album, public journal list, health/status summary, provenance summary where consented, and related variety/problem/topic links.

Do not transfer: do not copy visible city-level or precise place cues. For OverGarden, user/product precise location is locked out. Public object pages may show only allowed coarse region or hidden location.

### 6. Logbook / Journal Entry Pages

Primary user job: answer a specific problem or learn from a concrete maintenance episode.

IA and layout: entry H1, object specs, owner, date, body, category/tag, price/mileage fields when relevant, previous/next entry, related parts, car-sale ads, and comments. Entry metadata is specific enough to become a long-tail answer page.

Navigation model: entry -> object passport, make/model/generation, category feed, author, previous/next entry, comments.

Trust and quality cues: object specs next to narrative body, date, costs, mileage, comments, author identity, and links to related entries.

Social proof mechanics: comment count, replies, visible commenters with their own cars, and prior/next continuity.

SEO/AEO relevance: this is Drive2's strongest page archetype for long-tail search. The page combines a user-authored narrative with structured object context and crawlable internal links.

OverGarden transfer: OverGarden entry pages should bind human narrative to living-object context: object, catalog item or unknown, season/date, coarse region if allowed, problem/task/topic tags, safe photos, and previous/next entries. This directly supports `ENTRY_DATA_AND_RANKABILITY_SPEC_v0.md`.

Do not transfer: do not require artificial event taxonomies or thin auto-generated text. OverGarden already removed milestone-only content and requires real body text.

### 7. Personal Blog Entry Pages

Primary user job: read a user's broader off-object project or story.

IA and layout: author, car context when present, personal post body, previous/next post, parts blocks if detected, comments, and auth prompt before commenting.

Navigation model: personal blog -> author profile -> related object if attached -> comments and adjacent posts.

Trust and quality cues: continuity across a personal project, comments, author identity, and relation to owned objects.

Social proof mechanics: comments and the author's broader profile build reputation.

SEO/AEO relevance: personal blog entries can rank for long-tail project topics, but they are less structurally clean than object-bound logbook entries.

OverGarden transfer: allow space-level or gardener-level narrative only when it can safely link to living objects or topics. It can capture greenhouse, balcony, compost, coop, or garden infrastructure projects.

Do not transfer: do not let unscoped personal blogs become the primary growth engine. OverGarden's growth engine should stay object and entry anchored.

### 8. User Profile Pages

Primary user job: evaluate a person and their history across objects, posts, albums, followers, former objects, and communities.

IA and layout: profile title, current objects, personal blog list, about section, albums, former objects, communities, follower and following counts.

Navigation model: profile -> each object -> personal blog -> follower/following lists -> communities.

Trust and quality cues: time depth, multiple objects, visible comments/likes, former objects, and followers.

Social proof mechanics: follower count, subscribed cars, people followed, model subscriptions, and community memberships.

SEO/AEO relevance: useful for humans, but not necessarily good public SEO unless author names are search-demand-bearing.

OverGarden transfer: keep public-safe gardener profiles for trust, but preserve current OverGarden architecture: profile pages are public-visible and shareable, but noindex at MVP. Use profiles to explain a person's public objects and reputation, not as an SEO acquisition surface.

Do not transfer: do not expose exact location, full social graph, or sensitive object ownership trails. Do not make profiles indexable before quality and privacy gates.

### 9. Comments And Guest Engagement Surfaces

Primary user job: read discussion and decide whether to participate.

IA and layout: comments are readable to guests on entries and object/blog surfaces. Writing prompts a login/sign-up state. Reply buttons are visible, but authenticated participation is required.

Navigation model: entry comments link to commenter profiles and their cars.

Trust and quality cues: real discussion, dates, author object context, and nested replies make entries feel alive.

Social proof mechanics: comment counts appear in cards, feeds, search, and detail pages.

SEO/AEO relevance: comments add freshness and alternative wording, but can also introduce moderation and privacy risk.

OverGarden transfer: read-open comments can help trust, but MVP comments must be moderation-aware and privacy-safe. Auth-gated writing is the right default. Anonymous likes can remain cosmetic as current decisions require.

Do not transfer: do not expose raw user identifiers, precise locations, or ranking influence from comments/likes without abuse controls.

### 10. Search, Catalog, Category, Brand / Model / Type Pages

Primary user job: search a specific procedure/problem and filter it by object.

IA and layout: search accepts a text query plus optional car selection. Results mix logbook entries and personal blog posts. Each result shows object context, snippet, date, author, location, and engagement counters.

Navigation model: search -> entry/blog -> object/profile/catalog. Search also links to an external fallback search option.

Trust and quality cues: rich result cards with object metadata make UGC feel more answer-like than generic search snippets.

Social proof mechanics: comments and likes in result cards bias the guest toward active entries.

SEO/AEO relevance: this is an internal AEO surface: it packages UGC as answers to concrete questions.

OverGarden transfer: OverGarden search should combine query + object type/catalog item + problem/topic + coarse region. Result cards should show public-safe object context and text snippets.

Do not transfer: Drive2's result cards expose visible city/country and author handles. OverGarden search docs must never include precise or unsafe location and should avoid direct personal identifiers when not needed.

### 11. Communities, Forums, And Discussion Pages

Primary user job: find a niche group and read discussions by topic.

IA and layout: communities index shows recommended and new communities. A community page combines description, community blog, forum topics, currently discussed items, and rules.

Navigation model: communities index -> community -> blog posts or forum threads -> authors/profiles.

Trust and quality cues: member counts, topic lists, rules, and active discussions.

Social proof mechanics: member counts, forum reply counts, recent discussion, and join CTA.

SEO/AEO relevance: forums can rank, but they are secondary to the object-journal engine in the OverGarden canon.

OverGarden transfer: create curated topic communities later as retention and sensemaking layers, especially for problems, methods, and local growing constraints. For MVP, community mechanics should not replace object-bound journals.

Do not transfer: do not let forum-first work displace the living-object journal path. This would contradict `DRIVE2_CANON_v1.md`.

### 12. Curated Topics / Editorial Collections

Primary user job: browse human-selected themes across the corpus.

IA and layout: topic groups contain editorial-style cards and "show more" links into topic pages.

Navigation model: featured index -> topic page -> article/blog entry.

Trust and quality cues: curation makes the corpus feel navigable and raises perceived editorial quality.

Social proof mechanics: curated placement itself is authority; comments and author profiles persist below.

SEO/AEO relevance: curated hubs can target broader topic queries and route to UGC evidence.

OverGarden transfer: this maps to indexed guide/hub pages and curated topic pages in `OverGarden_PAGE_ARCHITECTURE_v1.md`. Use first-party editorial summaries plus public-safe UGC examples once enough content exists.

Do not transfer: do not create empty topic hubs. Thin topic pages should stay noindex until there is useful first-party content or enough safe UGC.

### 13. Adjacent Commercial Surfaces

Primary user job: buy/sell parts, find services, or move from content to transaction.

IA and layout: marketplace uses category trees, region filters, condition filters, and listings. Services/company pages use review counts, blog counts, status/open hours, addresses, and offers.

Navigation model: content and catalog pages repeatedly link to parts, tires, services, and car-sale inventory.

Trust and quality cues: reviews, blog counts, opening status, locations, discounts, and inventory.

Social proof mechanics: review volume and blog activity create marketplace trust.

SEO/AEO relevance: commercial pages can capture transaction-intent queries, but they are a different business model layer.

OverGarden transfer: only as post-MVP optional patterns for nurseries, tools, seeds, vet/plant-clinic services, or local supplies.

Do not transfer: do not put marketplace/services in MVP primary navigation. This would add operational load before the journal growth loop is proven.

### 14. Auth Prompts, Sign-In, Sign-Up, And Guest Walls

Primary user job: continue reading freely, but sign in to participate.

IA and layout: sign-in and sign-up are available in the header. Detail pages show an in-context prompt before writing comments. Login supports email/password and social providers; sign-up emphasizes social methods and an email/phone path.

Navigation model: auth URLs preserve return path through redirect query parameters.

Trust and quality cues: multiple auth methods and explicit account actions reduce participation friction after reading value.

Social proof mechanics: the guest sees the active community first, then is asked to join.

SEO/AEO relevance: read-open pages preserve crawlability and acquisition; write-gated actions protect state-changing surfaces.

OverGarden transfer: guest reads public pages; account is required for comments, follows, claims, object creation, and publishing. Preserve draft or action intent through auth when possible.

Do not transfer: do not copy Drive2's auth provider stack. OverGarden's current MVP excludes Apple Sign-In after the 2026-07-04 founder decision and uses its own Better Auth plan.

### 15. Empty States And Error States

Primary user job: recover from a missing page.

IA and layout: 404 page keeps the global navigation and offers routes back to home, cars, marketplace, interesting reads, owner experience, communities, and help.

Navigation model: error -> high-level discovery paths.

Trust and quality cues: clear error headline and recovery links.

Social proof mechanics: none directly, but the recovery links preserve exploration.

SEO/AEO relevance: error pages should not become thin indexed pages. For OverGarden, deleted public UGC should use 410 where required by current architecture.

OverGarden transfer: provide clear 404 recovery and 410 deleted-content states with safe links to public discovery and help.

Do not transfer: do not use 404 for known deleted public entries where OverGarden requires 410 and de-indexing.

### 16. Desktop And Mobile Responsive Behavior

Primary user job: read and navigate the same public corpus on a narrow screen.

IA and layout: mobile-sized inspection kept the same page hierarchy and content order: header, search/nav, object context, entry, related modules, comments. Cards stack vertically, and the same sign-in/sign-up prompts remain visible.

Navigation model: responsive behavior preserves public read paths rather than hiding the corpus behind app install or account creation.

Trust and quality cues: mobile keeps object specs and entry context close to the content, which matters for credibility.

Social proof mechanics: comments, counts, and profile/object links remain present on mobile.

SEO/AEO relevance: responsive parity supports search visitors who land directly on entries.

OverGarden transfer: public entry and object pages must be first-class on mobile. The object context, safe metadata, and comment/auth wall must remain readable without horizontal complexity.

Do not transfer: do not overfill mobile with commercial modules before the reader gets the answer. For OverGarden, the first mobile screen should prioritize living-object context and journal value.

## Growth Engine Patterns To Transfer

1. Object passport as graph anchor. Every useful entry points back to a stable object node. OverGarden equivalent: living-object passport with catalog, safe location setting, album, public journal, and provenance where consented.
2. Entry as answer page. A post earns search value because it binds narrative text to structured object context. OverGarden equivalent: title + body + object + catalog item + season/date + safe topic/problem tags.
3. Aggregations that are alive. Catalog pages are not static directories; they surface recent and popular owner entries. OverGarden equivalent: variety/problem/topic pages with public-safe journal evidence after quality gates.
4. Read-open, write-gated network. Guests read the value before joining; account is needed for state-changing actions. OverGarden should keep this shape.
5. Dense internal linking. Entry, object, author, catalog, category, previous/next, comments, and community links create both user movement and crawler comprehension.
6. Social proof at card level. Counts and comments appear in feeds/search before the reader opens a detail page. OverGarden can use lightweight proof, but ranking must not be vulnerable to abuse or location leakage.
7. Curated bridges over raw UGC. Featured topics and communities help humans find meaning in a large corpus. OverGarden needs curated guide/topic layers before raw UGC is strong enough.

## Critical Non-Transfers

1. Public exact-ish geography. Drive2 repeatedly shows city/country on entries, objects, users, companies, and marketplace surfaces. OverGarden must not copy that. Public product surfaces may only use allowed coarse region or hidden location.
2. Brand and geopolitical association. Drive2 remains an internal product mechanic reference, not a public UA positioning reference.
3. Visual trade dress, copy, labels, and assets. The copyright boundary is strict: mechanics may transfer; layout, visual styling, text, screenshots, icons, and content must not be copied.
4. Marketplace-first expansion. Drive2 can support parts, companies, services, and ads because it already has a dense automotive network. OverGarden MVP must prove the living journal and public discovery loop first.
5. Indexable profiles by default. Drive2 profiles are rich public surfaces. OverGarden's current architecture keeps profiles public-visible but noindex at MVP because identity, safety, and thinness risks are higher.
6. Unmoderated comment gravity. Comments create trust, but also introduce abuse, privacy, and moderation load. OverGarden should gate writing and keep ranking impact conservative.
7. Provider and auth assumptions. Drive2's auth stack is contextual to its market. OverGarden should follow current Better Auth and MVP auth decisions, not mirror providers.

## OverGarden Mapping For OVE-147

Recommended adapted page system:

1. Public living-object passport: `/{lang}/object/:slug` or the eventual public-safe route. It should show object identity, catalog/unknown state, safe owner display, safe region or hidden location, album, public journal, and provenance summary.
2. Public journal entry: `/{lang}/entry/:slug`. It should be the strongest long-tail page and include object context, body text, safe image derivatives, previous/next, comments, and safe schema.
3. Variety/problem/topic aggregation: `/{lang}/variety/:slug`, `/{lang}/problem/:slug`, `/{lang}/t/:slug`. These should remain noindex until the public-surface policy promotes them.
4. Guest search: query + object/category/problem filters, with result cards that expose enough object context to be credible but no precise location or unnecessary personal identity.
5. Public-safe gardener profile: shareable and useful for trust, but noindex at MVP.
6. Community/topic layer: retention and sensemaking, not the primary acquisition path.
7. Editorial/guide layer: first-party content can be indexed earlier than UGC where it is useful and not thin.

## Open Questions For The Synthesis Slice

1. Which object-passport fields create enough trust without exposing a gardener's home, dacha, apiary, greenhouse, or animal location?
2. What exact thinness gate promotes an OverGarden variety/problem/topic page from noindex to indexable?
3. Should comment counts appear in public search cards before moderation tooling is mature?
4. What is the minimum public profile that builds trust without making the social graph searchable?
5. Which curated topic hubs can ship before UGC density exists, and which must wait for real entries?
6. How should the first-publication disclosure explain that the content is public while location remains separately controlled?

## Acceptance Criteria Check

- Page archetypes are separated from individual UGC URLs.
- Each archetype includes UX/CX notes and an OverGarden mapping.
- Drive2's public-journal growth engine is named explicitly.
- Copyright and trade-dress boundary is explicit.
- No Drive2 credentials, screenshots, copied layouts, or long copied text are stored in the repo.
