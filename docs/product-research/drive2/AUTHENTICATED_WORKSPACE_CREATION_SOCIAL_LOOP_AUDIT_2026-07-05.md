> # 🕰 STATUS 2026-09-04 · `RETROSPECTIVE`
>
> This corpus is product research written **before** the code existed. The repository is the
> source of truth for the product. Canon: `PRODUCT_CANON_2026-09.md` · superseded decisions:
> `SUPERSEDED_DECISIONS_LEDGER.md` · per-file status: `RESEARCH_STATUS_INDEX.md`.
> Reconciled against `over.garden` @ `main` `ab52664`, 2026-09-04.
>
> Dated audit of another product, 2026-07-05. Useful as mechanics research; it does not describe OverGarden as built.

---

# Drive2 Authenticated Workspace, Creation, And Social Loop Audit

Status: OVE-146 research artifact
Date: 2026-07-05
Mode: signed-in browser audit after founder completed login manually
Scope: authenticated workspace, creation, profile, social, notification, and settings mechanics
Redaction boundary: no credentials, private messages, private account details, screenshots, copied UGC text, or raw account identifiers are stored here
Related inputs: OVE-145 guest audit, OVE-147 Drive2-to-OverGarden synthesis

## Executive Take

Drive2's signed-in product is a retention loop built around ownership, not a generic social feed. A user is pushed to declare an owned object, maintain that object's journal, receive feedback and reminders, tune the feed by subscriptions, and return when comments, reactions, follows, mentions, shares, or stale-journal nudges arrive.

The strongest transfer to OverGarden is the loop shape:

1. Empty workspace asks for the first owned object.
2. Object creation creates a durable passport.
3. The object passport becomes the default home for future journal entries.
4. Journal entries are distributed to people with matching object interests.
5. Comments, bookmarks, follows, notifications, and reminders create the repeat-session loop.
6. Profile and settings controls make participation feel like an owned identity, not a disposable post.

The unsafe transfer is equally clear. Drive2 can ask for and expose car-world identifiers, city-level profile context, real-name visibility, vehicle numbers, VIN-like fields, marketplace intent, and direct messaging. OverGarden cannot copy that posture. In OverGarden, the owned object is a living plant or animal tied to a safety-sensitive place. Public location must stay coarse or hidden, exact location must not reach product UI, profile pages stay noindex at MVP, and social graph surfaces must remain consented and public-safe.

## Method And Source Boundary

I inspected Drive2 in the in-app browser after the founder logged in manually. I did not ask for, view outside the browser, store, or write down any Drive2 credentials. I did not submit forms, save drafts, publish posts, add cars, upload media, comment, follow, join communities, connect social accounts, open private messages, or change settings. I used the authenticated session only to read product structure.

Account-local URLs are written with `[handle]` instead of the actual account handle. Any account-specific object suggestions, profile data, and private values were excluded from this document.

Sampled authenticated surfaces:

- Signed-in home/feed: `https://www.drive2.ru/`
- First object flow: `https://www.drive2.ru/my/r/add/`
- Public profile shell: `https://www.drive2.ru/users/[handle]/`
- Personal blog shell and composer: `https://www.drive2.ru/users/[handle]/blog/`, `https://www.drive2.ru/users/[handle]/blog/add`
- Profile settings: `https://www.drive2.ru/my/profile`
- Notification and message settings: `https://www.drive2.ru/my/settings`
- Feed configuration: `https://www.drive2.ru/my/content/`
- Social account connection settings: `https://www.drive2.ru/my/profile/social-connect.cshtml`
- Subscription lists: `https://www.drive2.ru/users/[handle]/carsfollowing`, `https://www.drive2.ru/users/[handle]/following`, `https://www.drive2.ru/users/[handle]/expfollowing`
- Dashboard and bookmarks: `https://www.drive2.ru/my/dashboard`, `https://www.drive2.ru/my/bookmarks/`
- Authenticated engagement controls on public entry/object pages sampled during OVE-145
- Mobile viewport pass at 390px wide for home, add-object, composer, and settings surfaces

## Page And Flow Archetypes

### 1. Logged-In Home / Feed

Primary user job: return to a personalized corpus where owned-object prompts, followed content, new public entries, communities, and commercial modules compete for attention.

IA and layout: the signed-in home keeps the public navigation but adds a strong "My" area: add object, personal blog, albums, dashboard, browsing history, guests, bookmarks, settings, and subscriptions. The feed can be filtered by event type such as entries, object updates, blogs, communities, and photos.

Input friction and creation sequence: the first visible creation CTA is not "write anything"; it is "add your object." This makes the object passport the prerequisite for the higher-value journal loop.

Return-loop mechanic: the feed is a mixed habit surface. It combines subscribed object/category content, recommended communities, interesting items, and prompts to add or inspect an owned object.

Trust, safety, and privacy cue: maturity comes from visible breadth and activity. The risk is that the workspace also surfaces potentially private account-adjacent areas, so OverGarden should keep its private workspace cleaner and avoid making account history or guests a primary habit hook.

OverGarden transfer: `/garden` should open as an owned workspace, not as a generic feed. The empty state should ask for the first living object or space, then turn into a personalized journal and followed-feed hub.

Must change for OverGarden: do not combine too much commercial inventory or account-history clutter with the first workspace. The first screen should reinforce safe journaling and the public-safe growth loop, not marketplace breadth.

### 2. Zero-Object Workspace And Onboarding Prompt

Primary user job: establish identity by declaring the first owned object.

IA and layout: the signed-in profile shell can show zero owned objects and a direct prompt to write about or add an object. The same object-first prompt recurs from home and profile areas.

Input friction and creation sequence: Drive2 makes the first object a relatively heavy form. That is workable for cars because make/model/year/specs are known identity markers, but it would be too much for OverGarden beginners.

Return-loop mechanic: the product cannot form a durable journal habit until the first object exists. The empty state is therefore a conversion gate, not a passive blank slate.

Trust, safety, and privacy cue: an empty profile still has identity surfaces and public profile shell. For OverGarden, an empty public profile should not become searchable or trust-bearing before the user has safe public content.

OverGarden transfer: the first-session flow should be `space_created -> living_object_created -> first_entry_started`, with an Unknown/catalog fallback and smart defaults.

Must change for OverGarden: do not require taxonomy precision before the first entry. Beginner plant owners often do not know cultivar or exact species. The object gate must feel like "name what you are growing", not "complete a database record."

### 3. Object Creation / Passport Setup

Primary user job: turn an owned object into a durable public and personal record.

IA and layout: the creation form is a single long object setup page with sections for object identity, photos, owner story, technical characteristics, and publication settings. Fields include taxonomy selectors, free-text full name, nickname, production/purchase time, color/state, former ownership, photos, long description, technical specs, and sensitive identifiers.

Input friction and creation sequence: the form asks for structured identity first, then story, then specs, then publication settings. It rewards completeness but creates a high initial burden.

Return-loop mechanic: once the object exists, it can anchor logbook entries, comments, followers, "drive" score, profile identity, and same-model distribution.

Trust, safety, and privacy cue: details make the object credible, but Drive2's vehicle identifiers and public display options are not transferable. In OverGarden, analogous fields would expose a home, dacha, greenhouse, apiary, animal pen, or rare-plant collection if handled carelessly.

OverGarden transfer: create a living-object passport with catalog item or Unknown state, nickname, optional cover photo, optional start date, space assignment, safe status summary, and public journal list.

Must change for OverGarden: remove exact identifiers and exact place cues. Do not copy vehicle-like identifiers into plant/animal analogs. The public settings section should center location visibility and first-publication disclosure, not public display of sensitive identifiers.

### 4. Object-Bound Logbook / Journal Loop

Primary user job: publish updates about an owned object so other people with the same object context can discover them.

IA and layout: Drive2 separates object-bound logbooks from personal blog posts. The personal composer explicitly positions itself as the place for everything except the owned object, while object-related posts belong in the object's logbook. Public object pages show a logbook list with sorting and comments.

Input friction and creation sequence: in the audited account state, object-bound logbook creation was gated by the absence of an owned object. I did not create a real object to unlock the downstream composer because that would create an external account side effect. The inspected UI still makes the product rule clear: object first, logbook second.

Return-loop mechanic: the logbook is distributed to people who care about the same object taxonomy. This is the core repeat loop: update object -> reach interested peers -> receive feedback -> return.

Trust, safety, and privacy cue: object context makes the entry more credible than a freeform post. OverGarden needs that credibility, but without public precise location, private identity, or unsafe ownership signals.

OverGarden transfer: make the default `/garden` composer context-bound. From an object screen, the entry should inherit object, catalog item, space, date, and safe location setting. From a space screen, it should support optional object mentions.

Must change for OverGarden: do not hard-block users who cannot identify a plant precisely. Unknown/provisional catalog states and later correction are necessary. Also, OverGarden should not make "people with the same variety" visibility imply precise locality or exact collection ownership.

### 5. Personal Blog / Freeform Composer

Primary user job: write a non-object story, announcement, question, or broader post.

IA and layout: the personal composer has title, body, photo upload, markup help, poll, publication settings, date, draft save, and publish controls. It supports allowing comments and pinning the post in the blog.

Input friction and creation sequence: the composer is text-first and simple compared with object creation. It has a clear draft path and a publish path.

Return-loop mechanic: comments and pinned profile presence can keep a user returning, but this is secondary to the object logbook.

Trust, safety, and privacy cue: freeform blog posts are less structurally useful for search than object-bound entries. They need moderation and topic boundaries if transferred.

OverGarden transfer: reuse the draft/publish split, title/body narrative primitive, optional media, backdate/date control, and comment settings where moderation exists.

Must change for OverGarden: do not make personal blogging a primary MVP route. OverGarden's canonical unit should remain object or space journal entries. Polls are not a launch requirement and would add moderation and product complexity without proving the journal loop.

### 6. Profile And Public Identity Controls

Primary user job: manage how the user's identity appears across public content and social interactions.

IA and layout: the profile settings surface includes current-object prompt, real name fields, real-name visibility, sex, birthday, age visibility, biography, languages, country/city, experience, avatar/header imagery, and personal-data consent.

Input friction and creation sequence: Drive2 treats profile completion as part of account maturity and trust. It asks for enough identity data to make profiles feel real.

Return-loop mechanic: a richer profile supports followers, comments, credibility, and repeat interaction.

Trust, safety, and privacy cue: profile controls include some visibility choices, but the baseline asks for city and demographic details that are risky for OverGarden's wartime Ukrainian audience and for owners of valuable living collections.

OverGarden transfer: keep public-safe handle, display name, avatar, bio, language, notification preferences, blocked users, and erasure/account settings.

Must change for OverGarden: no exact city, no exact coordinates, no real-name pressure, no age/birthday defaults, no public searchable profile by default. Current OverGarden architecture is right to keep profiles public-visible but noindex at MVP.

### 7. Notifications, Reminders, And Messages

Primary user job: decide which site events should pull the user back.

IA and layout: the notification surface separates email notifications, in-product notifications, and chat/message settings. Categories include comments, private messages, followers, reactions, mentions, shares, object-score changes, digests, marketplace events, birthdays, and stale-journal reminders.

Input friction and creation sequence: most notification controls are simple checkboxes, which makes the system feel tunable rather than mysterious.

Return-loop mechanic: this is the clearest retention surface. Drive2 does not rely only on feed browsing; it pulls the user back through social feedback, social obligations, and object-maintenance reminders.

Trust, safety, and privacy cue: user control over notification categories is positive. Direct messages and birthday/social notifications are not automatically appropriate for OverGarden MVP.

OverGarden transfer: ship notification controls for comments, replies, follows, provenance claims, mentions, shared/saved entry signals, and stale-object/stale-journal reminders. The stale journal reminder is especially transferable because living objects decay, grow, bloom, fruit, fail, or need seasonal follow-up.

Must change for OverGarden: private messaging should not outrun moderation and privacy readiness. Location-sensitive alerts must never reveal exact object location or private content in email/push copy.

### 8. Feed Configuration And Subscription Lists

Primary user job: tune what the feed is made of.

IA and layout: Drive2 has explicit feed configuration and separate subscription lists for objects, people, and object taxonomies. Feed modules can be shown, hidden, mixed, or pinned.

Input friction and creation sequence: the user does not need to understand ranking internals; controls map to recognizable feed ingredients.

Return-loop mechanic: subscriptions turn one-time discovery into a repeat content stream. Taxonomy subscriptions are particularly important because they convert "I care about this model" into recurring updates.

Trust, safety, and privacy cue: subscriptions to people and objects can reveal social graph interest. OverGarden needs consent and conservative public rendering.

OverGarden transfer: build followed feed and notification center around people, living objects, varieties, topics, problems, provenance chains, and mentions. Use explicit controls rather than opaque recommendations only.

Must change for OverGarden: avoid making following or mentions increase public exposure beyond the target's own visibility settings. Follow and mention must not promote exact location or private identity.

### 9. Comments, Reactions, Bookmarks, And Dashboard

Primary user job: participate without creating a full post.

IA and layout: authenticated public entries and object pages expose comment composer, replies, reporting, reaction-like score, and object-level discussion. Bookmarks have folders. Dashboard summarizes account or content performance through a help/explanation surface.

Input friction and creation sequence: small actions are much easier than object creation and keep low-intent users engaged after reading.

Return-loop mechanic: comments, replies, reactions, bookmarks, and dashboards convert publishing into feedback. Feedback creates a reason to return and to add the next entry.

Trust, safety, and privacy cue: comments make pages feel alive, but they also create abuse and privacy risk. Dashboards can motivate, but public scores can distort behavior.

OverGarden transfer: comments, bookmarks, anonymous cosmetic likes, report/block, and private progress feedback match current MVP direction. A private "garden memory health" or "journal continuity" dashboard may be healthier than a public leaderboard.

Must change for OverGarden: do not let likes/comments drive unsafe public ranking early. Do not expose exact social graph, exact location, or identity-heavy commenter metadata.

### 10. Account, Social Connections, And External Identity

Primary user job: secure the account and connect external identities.

IA and layout: social account connection exists as a settings surface; profile settings include security and login-adjacent controls; notification settings include chat enablement.

Input friction and creation sequence: these are account-maturity controls, not first-session core.

Return-loop mechanic: social connections and messages can deepen lock-in, but they also increase support and privacy obligations.

Trust, safety, and privacy cue: OverGarden should not import Drive2's provider assumptions or social identity posture. The current OverGarden auth direction is separate and Apple Sign-In is explicitly not MVP after the founder decision.

OverGarden transfer: keep self-serve auth, account management, session/device settings, social provider controls where already approved, notification settings, blocked users, and erasure request.

Must change for OverGarden: do not add extra provider or social-link surfaces because Drive2 has them. Do not use social account connection as a trust substitute for privacy-safe product behavior.

### 11. Desktop And Mobile Responsive Behavior

Primary user job: perform the same signed-in tasks on a narrow screen.

IA and layout: mobile retained the same major hierarchy for home/feed, object creation, personal composer, and notification settings. Forms stack vertically; the same headings, fields, draft/publish controls, and notification checkboxes remain accessible.

Input friction and creation sequence: the heavy object form becomes more visually demanding on mobile, but the sequence remains intact.

Return-loop mechanic: mobile parity keeps the habit loop available wherever the user notices a relevant update or needs to journal.

Trust, safety, and privacy cue: if controls exist on desktop but are buried or absent on mobile, trust breaks. Drive2 mostly preserves parity.

OverGarden transfer: mobile `/garden` must preserve object context, privacy controls, draft/publish state, photo/voice capture, offline status, and notification preferences.

Must change for OverGarden: first-object and first-entry mobile flows must be much lighter than Drive2's car form. Gardeners will often be outside, tired, holding a phone, or documenting something before they forget.

## First-Session Patterns OverGarden Should Adopt

1. Empty workspace has one dominant job: create the first owned living object or space.
2. The first object should be light enough to complete before the user loses motivation.
3. Object identity should use catalog/typeahead when possible, but Unknown/provisional must be accepted.
4. First entry should come immediately after object creation, not after profile completion.
5. Publicness and location safety must be explained at the first publication moment, not hidden in settings.
6. The user should receive an immediate local reward after the first entry, before any social feedback exists.

## Repeat-Session Patterns OverGarden Should Adopt

1. A followed feed that mixes followed people, followed living objects, varieties, topics, comments, and provenance events.
2. Stale-object and seasonal reminders that invite the next entry without shaming the user.
3. Comment/reply/mention/provenance-claim notifications with clear controls.
4. Bookmark/saved-entry folders for later reference.
5. Private continuity dashboard rather than public status competition.
6. Feed configuration that lets users tune interests by variety, problem, topic, and people.
7. Public-safe profile trust cues without making profiles an indexed acquisition surface at launch.

## Concrete `/garden` Implementation Candidates

1. `/garden` empty state: "Add your first plant or growing space" with one primary action and a secondary "I do not know the variety" route.
2. `CreateLivingObject` sheet: catalog/typeahead, Unknown fallback, nickname, space, optional start date, optional cover photo, inherited location visibility, no exact public location.
3. Object passport: current status, last entry, journal list, safe image derivative, provenance summary, and "new entry" action.
4. Space journal: a space-level narrative composer that can mention multiple owned objects.
5. Entry composer: title, body, photo-start, voice-to-text, backdate, draft save, publish, object/space context, optional `@` mentions, one-time first-publication disclosure.
6. Feed filters: all updates, followed growers, followed objects, followed varieties, claims, comments/replies, saved/bookmarked.
7. Notification settings: comments, replies, follows, mentions, claim inbox, stale object reminders, digest, and product updates.
8. Bookmarks: saved entries with optional folders or lightweight tags.
9. Private dashboard: first-entry streak, objects needing follow-up, entries with replies, claims awaiting action, safe public-page readiness.
10. Profile settings: handle, display name, avatar, bio, languages, notification preferences, blocked users, account deletion, erasure request.
11. Mobile parity: no desktop-only privacy or publishing controls.

## Critical Non-Transfers

1. Public city or exact-ish geography.
2. Real-name, age, birthday, and demographic visibility as trust defaults.
3. Vehicle identifier analogs such as exact address, greenhouse location, apiary location, rare-plant collection location, animal pen location, tag numbers, or private inventory identifiers.
4. Public profile indexing at launch.
5. Direct messages before moderation, blocking, reporting, and privacy copy are ready.
6. Marketplace and commercial modules in the signed-in workspace before the journal loop is proven.
7. Public scores or leaderboards that can push vanity behavior over useful journal continuity.
8. Polls and broad personal blogging as core MVP creation modes.
9. Social provider assumptions or Drive2-specific auth stack.
10. Visual trade dress, UI copy, labels, screenshots, or assets.

## Acceptance Criteria Check

- Creation, ownership, profile, social, and settings loops are covered.
- Drive2-specific car mechanics are separated from transferable living-object mechanics.
- First-session and repeat-session patterns are identified.
- No credentials, private Drive2 user data, private messages, screenshots, or sensitive account details are written here.
- Concrete implementation candidates for OverGarden's signed-in `/garden` experience are listed.
