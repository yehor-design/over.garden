# Accepted information architecture and delivery boundary

> **Superseded in part on 2026-09-25 (SDD Slice 29, ADR-0034 and ADR-0035).** The Explore
> («Огляд») hub and its catalogue, community and knowledge entries are gone: the desktop rail is
> Стрічка, Мій сад, Події, New entry, «Рослини й тварини» and «Спільноти · Скоро»; the mobile tabs are
> Стрічка · Новий запис · Мій сад · Події. Creation is a full-screen stepper, and the garden home has
> no first-entry composer. `DESIGN.md` §3.2, §5.13 and §5.24 are the current rules; this page stands
> where they do not change it.

Decision date: 2026-09-21. Owner authorization: radical restructuring, end-to-end execution, no subagents. This document resolves implementation choices for OVE-475; it does not claim new routes or behavior are already in production. The 45-finding audit is observation; the target below is a product decision; flow efficiency beyond the specified action budgets is an unvalidated hypothesis.

## Core model

A space is an owned place/collection. An object is an owned living subject. An organism is a shared catalogue identity. An entry is one public observation; a journal is the chronological history. One entry has one destination. Showing an object entry in its space aggregate never creates another entry or permalink. Community contributions remain their existing entity, not a disguised object entry.

The current SQL contract requires `plant_objects.space_id` (generated.ts and createFirstPlantEntry in journal-repository.ts). Therefore **No space is not a valid create option today**. The fixture contains unassigned records to exercise inconsistent/unavailable association handling: show “Choose a space” and preserve input, never choose spaces[0]. Do not introduce null space IDs or a synthetic hidden default space to satisfy the prototype. A future supported unassigned-object model requires an explicit additive data-contract change; it is not needed for quick writing to the existing owned model.

## Navigation and labels

| Job | UK / BG / RU label | Destination | Active descendants |
|---|---|---|---|
| Read recent experience | Стрічка / Емисия / Лента | `/` (Following uses existing `/feed`) | Entry detail retains originating feed context; direct entry defaults Feed |
| Discover references and people | Огляд / Открий / Обзор | `/catalog`, with Catalogue/Communities/Knowledge secondary destinations | Catalogue, species/forms, source archives, knowledge/topics/articles, community discussions |
| Find owned subjects and write again | Мій сад / Моята градина / Мой сад | `/garden` | Spaces, objects, creation, edit, owned provenance |
| Respond to activity | Події / Известия / События | `/notifications` | Activity preferences preserve Activity context |
| Write | Новий запис / Нов запис / Новая запись | New routed fallback `/garden/new` | Action, never a selected navigation tab |
| Account utilities | Акаунт / Акаунт / Аккаунт | Header/rail account menu | Public profile, saved reading, wishlist, profile/settings, support and sealed owner tools |

Desktop: four job links plus one Write action and account utilities. Mobile: Feed, Explore, Write, My garden, Activity; account in header. Use short mobile BG Garden label `Градина` where the full label fails 320px. Meaningful visible labels remain except the named central write icon. Selected-route resolver takes actual page family, not substring `catalog` inside a private garden route. Guest protected actions use explicit auth intent; owner links appear only for the sealed owner and all reads/mutations remain server guarded.

Desktop frame: max 1280px **including** 20px inline padding each side. Inner grid 1240px = 208px left + 24px gap + 704px main + 24px gap + 280px right. At >=1280 three columns; at 1024–1279 centered two-column frame; below 1024 single column. Context is dispensable and absent when irrelevant. This is an implementation hypothesis to verify on actual localized content, not claimed vc.ru measurements.

## Route/function migration matrix

The exhaustive 114-file ownership table is ROUTE_OWNERSHIP.md; every listed file maps to one family below, including wrappers and retirement handlers. No public permanent address changes for a cosmetic regrouping. Existing ASCII/canonical/308/404/410 laws prevail. Public query views continue through `/q` twins, never static-page session/searchParams reads.

| Current family / old mixed job | Audience and primary job | Target / primary action | Secondary or moved functions | Implementation |
|---|---|---|---|---|
| `/`, `/feed`, `/journals` | Guest/member: read or find experience | Same addresses; Latest/Following and scoped search | Filters in dedicated bar/sheet; authorship before media | OVE-492, OVE-482 |
| `/garden` collection + all editors/settings | Member: locate owned destination | Same route; search spaces/objects, contextual Write | Setup to `/garden/spaces/new` and `/garden/objects/new`; full editors off home | OVE-489 |
| Space cards/space composer inside garden | Member: own a place and its history | New `/garden/spaces/[spaceId]`; Write for the space itself | Objects/history sections; `/settings` child for rename/destructive actions | OVE-490 |
| Owned object mixed timeline/editor/provenance/delete | Member: revisit subject and record change | `/garden/objects/[objectId]`; Write | New `/settings` and `/provenance` children; one H1 each | OVE-491 |
| Global New entry → first-entry/add-object anchor | Member: write to existing destination | New `/garden/new`; global chooser or typed contextual destination | Dialog enhancement over same routed flow; setup only on explicit create | OVE-486 |
| First-entry setup | Member: acquire new space/object | New `/garden/spaces/new`, `/garden/objects/new` | Progressive required questions; optional catalogue matching/provenance | OVE-484, OVE-485 |
| Existing entry editing | Author: correct observation | `/garden/entries/[entryId]/edit`; Save changes | Common editor, dirty-exit guard and contextual delete | OVE-488 |
| Public entry and legacy aliases | Anyone: read one observation/discussion | `/@handle/post/n`; read/comment/save/share | One relevant related-history section; old addresses redirect | OVE-493 |
| Public profile | Anyone: understand gardener and experience | `/@handle`; Entries/Objects | Self edit links to private settings; no security form in public content | OVE-494 |
| Public object and lineage view | Anyone: follow a living subject | `/@handle/objects/slug`; chronological entries | Reference organism link, progressive lineage; legacy lineage route retains canonical contract | OVE-495 |
| `/catalog` | Anyone: identify/find a reference organism | Same URL; common/scientific-name search | Explore secondary navigation; technical register behind detail | OVE-496 |
| Species, form, variety/breed aliases, register | Anyone: understand organism and actual experience | Existing canonical species/form URL; owned match or Add object | Large forms list searchable/paged in register; no indexability jargon | OVE-497 |
| Knowledge, answers, guides, topics | Anyone: credible gardening help | Existing URLs; read answer and supporting sources | Product support stays `/support`; evidence is not product principles | OVE-498 |
| Blog/article/market/source archive | Anyone: supporting reading/reference | Existing URLs; read/find source | Technical archive context separate from everyday catalogue | OVE-499 |
| Communities and discussions | Guest/member: participate around a topic | Existing community/discussion URLs; contextual contribution | Community management and moderation remain role-scoped account routes | OVE-500 |
| Notifications/reminders | Member: understand event and act | `/notifications`; exact-target action | Preferences separate; no health inference from logging recency | OVE-501 |
| Bookmarks/wishlist | Member: return to saved reading/wanted organism | Existing URLs; open saved entity | Account utility entrance; no empty filter controls | OVE-502 |
| Garden profile + auth methods mixed | Member: edit public identity or security | `/garden/profile` for public identity; new `/account/settings` and `/account/security` | Separate form outcomes; handle/history and auth semantics preserved | OVE-503 |
| Sign-in/up/reset/help/intent | Guest/expired member: regain access | Existing auth routes; complete validated same-origin intent | No copied credentials, no hidden local durable draft | OVE-504 |
| Privacy/disclosure/erasure/support | Anyone: understand consequence/get help | Existing routes; appropriate choice/request | Owner review remains `/garden/privacy/erasure-requests` | OVE-505 |
| Owner catalogue queue/sources | Sealed owner: review identities/source state | Existing `/garden/catalog/**`; exact-item action | Diagnostics separate; honest freshness/sample size | OVE-506 |
| Lineage questions/claims/invitation acceptance | Authorized member/owner: resolve relationship | Existing `/garden/lineage/**`; named relationship action | Enter from provenance/account; never a prerequisite for writing | OVE-495 |
| Catch-all, 404/410, `/q`, skeleton diagnostics | Anyone as appropriate: recover/render correct response | Preserve redirect/status/parameter policy | No retired feature resurrection or public diagnostic menu | OVE-478, OVE-482 |

New workspace paths require registration in the existing route/address policy and protected settled shells. Do not rename existing APIs solely to match screen names. The public UI may reorganize entrances without introducing a new public object/space address scheme. No new public space URL is authorized by this plan.

## Transaction and recovery decision

| Launch | What is durable before final publication | Submission | Failure and retry |
|---|---|---|---|
| Existing object/space | Existing entity only | Existing atomic entry publication, stable destination ID and mutation idempotency | Keep in-memory editor; server authorization; no duplicate acknowledged entry |
| Nested Create while writing first entry | Nothing new; proposed required space/object values stay in this editor only | Extend/reuse `createFirstPlantEntry` atomic database transaction and media promotion contract; destination and entry are acknowledged together | Failed validation/commit leaves neither new destination nor entry acknowledged; retain input and retry same idempotent intent |
| Standalone Create space/object | Nothing until explicit Create | Separate acknowledged entity creation endpoint under server authorization; show “Created”, never “Entry saved” | After successful creation, later failed entry publication leaves the already acknowledged empty entity; offer Write, never imply a draft |
| Community contribution | Existing community only | Existing contribution contract, not plant-entry mutation | Keep community ID/intent through allowed auth recovery; no accidental plant or space creation |

The current first-entry transaction creates a required space if none is selected and an object plus entry under the transaction. Preserve that atomic behavior for nested creation. Standalone entity creation is **new implementation** in OVE-484/485, not claimed as an already existing endpoint. Photo staging still uses its current lease/orphan cleanup; transaction rollback does not mean staging files were durable posts. Timeout ambiguity requires current idempotency/readback reconciliation, not blind new submissions.

Destination chooser searches all owned records server-side with bounded results, stable IDs and visible parent labels. Contextual launch is stronger than recency. Generic multiple-destination launch has no invisible default. Space rename resolves by ID; removal/revocation preserves transient input and asks for another permitted choice. Never turn search failure into an empty owned collection.

## Linked executable wireflows and budgets

Open `wireflows/index.html` through a local static server. It is a deliberately low-fidelity decision model with synthetic fixtures, not production functionality or an accessibility certification. `wireflows/model.mjs` is shared by the interactive artifact and its executed Node scenarios. The fixture has 3 real spaces and 100 objects, duplicate tomatoes in different spaces and explicit invalid/unassigned records. Community context is separately typed.

| Scenario anchor | Starting state and actions | Expected result | Budget / risk |
|---|---|---|---|
| `#same-name` | Global Write → search Tomato → choose greenhouse Tomato | Visible greenhouse + correct immutable object ID | 2 navigation activations for a recent target; typing separately counted |
| `#space` | Balcony contextual Write → type weather note | Space destination, no object setup | 1 activation before writing |
| `#first-object` | Zero objects → required setup → editor → Publish | New destination+entry atomic acknowledgment | Count setup separately, no unnecessary welcome/cover step |
| `#change` | Balcony Tomato → type/add mock media → Change → greenhouse Tomato | Text/date/media preserved, changed visible target | Extra choices justified by correction; no reset |
| `#community` | Community Write, optionally auth intent | Exact contribution community; no garden destination | 1 contextual activation; auth reported separately |
| `#failure` | Publish fails → retain input → retry same mutation | One acknowledgment for the intended ID | No duplicate; no “Saved” while transient |

Action budgets exclude writing time/photo picking but never treat completion before server acknowledgment. No conversion/retention lift is asserted. Recruiting real gardeners remains desirable subsequent discovery; fixture results are recorded as fixture results.

## Incremental transition

1. OVE-475 lands evidence, amended canon, this route matrix and tested wireflows. Production stays unchanged.
2. Correct trust copy (OVE-476); foundation and Phosphor (OVE-477) keep existing component APIs while new tokens/weights are adopted. Accessibility fixtures (OVE-480) reproduce baseline gaps before surface work.
3. New shell (OVE-481) must route every visible action to a functioning endpoint. Before the new composer is available, retain a truthful existing contextual entry path; do not relabel object creation as global writing. Introduce the new global trigger with its working routed composer in OVE-486.
4. Destination search → progressive creation → shared writing/media/editing. Then move garden sections to dedicated routes; existing deep links remain functional and old entry points point to the new destinations.
5. Public families consume OVE-467 static architecture and shared reading components. Personal/owner families follow. Preserve the existing editorial task boundaries; no fictional news backend.
6. OVE-478 verifies full route/state/locale/role coverage, manual AT, real server outcomes and production budgets after OVE-468/469, then releases. Remove redundant transitional entrances after their replacements are proven, not before.

Every merged intermediate task is usable on its own. No redesign feature flag, duplicated permanent shell or parallel icon family survives its owning migration. Update the live project state and attach actual PR/CI/release proof per task; do not close from these documents alone.
