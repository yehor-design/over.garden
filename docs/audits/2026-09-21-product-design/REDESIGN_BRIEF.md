# Information architecture and visual direction

## Organizing principle

Separate **read**, **find**, **record**, **manage** and **administer**. A shared visual language does not mean every task needs the same page template. Put frequently repeated work close to the user; put reference depth and rare administration behind clear contextual entry points.

The main product loop is: see a useful observation → understand its author and subject → record an observation about one's own space/object → return to that same subject → build a comparable history. This is a hypothesis about the intended value loop, supported by the product contract and owner direction, not measured retention evidence.

## Proposed navigation

| Primary destination | Job | Contents | Keep out |
|---|---|---|---|
| Feed | Read recent/relevant real observations | Latest / Following modes, compact posts, clear authorship | Registry taxonomy, setup forms, generic dashboard metrics |
| My garden | Find an owned space or object and act | Search, spaces, object list/grid, last observation, contextual New entry | Full editors, repeated full timelines, destructive forms |
| Explore | Find organisms, experience and knowledge | Search with explicit result types; catalogue and knowledge entry points; communities | Personal object management disguised as catalogue |
| Activity | Understand replies, follows, reminders, provenance requests | Named actors/subjects, unread state, direct relevant actions | Owner operational queues as ordinary gardener activity |
| Profile/account | Public identity and personal utilities | Public profile, edit profile, bookmarks, wishlist, preferences, security, owner-only tools | A second copy of every primary destination |
| New entry | Record an observation | Shared contextual composer | Forced add-object onboarding for repeat users |

These are proposed labels/groupings. Validate localization and findability before changing navigation. Existing permalinks stay valid; reorganizing page responsibilities does not authorize changing public addresses. The public catalogue and journal search remain independently crawlable, even if their navigation grouping changes.

## Entity page contracts

| Surface | Primary question | Primary action | Secondary information |
|---|---|---|---|
| Feed entry card | Who observed what, about which subject, when? | Open/read or reply | Species, space context where public, social actions |
| Public entry | What happened at this point in the history? | Read/discuss; author can find Edit | Object link, observation date, previous/next, supporting media |
| Public object | What is the history of this gardener's subject? | Read timeline/follow where supported | About, species reference, selected gallery, public provenance |
| Owned object | What do I record next, and what happened before? | New entry | Timeline, About, Settings/Origin |
| Owned space | What is happening here across my objects and space notes? | New entry to this space | Contained objects, aggregated history, manage space |
| Organism | What is this species/form and what experience exists? | Read experience; add/select own object | Varieties, names, source provenance |
| Topic | What relevant observations or guidance exist? | Read/filter/follow | Related topics and community, no indexing status |
| Community | What belongs here and how can I contribute? | Read/join/contribute | Rules, moderation/contact, clear membership state |
| Knowledge article | What useful guidance can I apply and how reliable is it? | Read; record a relevant observation | Sources, reviewer/author, update date, real linked experience |
| Profile | Who is this gardener and what have they shared? | Follow/read their objects and entries | Bio, coarse region, public object collection |
| Owner queue | What decision is pending and what will it change? | Review one item | Evidence, filters, decision history, failure/retry |

A dedicated space page may be a new surface relative to the current dashboard composition. Treat it as a proposed information-architecture decision and reconcile the applicable owner-facing surface rule when planning implementation. The owner has explicitly requested multi-space usability, but this report does not invent a new admin application.

## Centered three-column shell

The owner requirement is structural: **left rail + content + right context form one centered container**. Do not center only the content between viewport-fixed rails.

```text
wide viewport
| balanced outer margin | nav | gap | main reading column | gap | context | balanced outer margin |

medium viewport
| outer margin | compact navigation | main content | outer margin |

phone
| compact header |
| main content   |  context is inline/on demand
| bottom nav     |  creation is always discoverable
```

Starting design hypothesis: outer maximum around 1240–1320 CSS px, navigation around 200–224 px, content around 640–704 px, optional context around 264–288 px, with deliberate gaps. These are proposed ranges, **not measured vc.ru design tokens**. Choose an internally consistent sum, then test real labels and content. Avoid adding arbitrary gaps inside a fluid 1fr column while the rails remain at the viewport edges.

At large widths, cap the group; at intermediate widths, remove optional context first; at smaller widths, collapse navigation. Content must not jump horizontally simply because the right rail has little content. Focused tasks can use a reduced shell, while the feed retains the full composition. Required actions never exist only in the optional right rail.

Before signoff measure at 320, 390, 768, 1024, 1280, 1440 and 1920 CSS px, including browser scrollbar widths, long translations, zoom and empty/error states. Exact breakpoints follow content fit, not device names. The audit visually confirmed desktop composition; it does not claim all these target widths have passed.

## Threads-led style contract

- Quiet light neutral canvas; content and photographs provide most visual variation. Keep brand recognition, but do not make every selected chip, status and action compete in green.
- Author/avatar and date anchor a post. Destination explains the gardening context. Main text follows in natural reading order; media supports it.
- Use a small stable typography hierarchy. Page titles should not consume the same visual weight on a feed, a settings form and an article.
- Prefer consistent separators and restrained surfaces over nested cards, pills, uppercase eyebrows and callouts around every piece of metadata.
- Use one coherent icon family and clear filled/outline state rules. Icon-only controls need accessible names and, where unfamiliar, visible labels.
- A primary action earns emphasis through task importance. Comment should not look like a separate conversion funnel below an unrelated Save button.
- Empty-state illustrations are optional support, not the dominant visual identity. Do not add 3D illustration chrome everywhere merely because an earlier reference used it.
- No dark-mode expansion is proposed; current light-only policy remains. Copying a dark Threads reference does not authorize a theme system.

This is a style hierarchy, not pixel copying. OverGarden must retain organism identity, dated evidence, public visibility, destination selection and multi-object history that Threads does not provide.

## Shared components to specify before page implementation

| Component/pattern | Required variants and state contract |
|---|---|
| AppShell | centered three-column, two-column, focused task, phone; optional context without essential-only actions |
| EntryCard | text only, one image, multiple images, long excerpt, backdated observation, owned entry, different content language |
| DestinationPicker | 0/1/many results, search, groups, duplicate names, loading/error, unavailable selection, keyboard selection |
| Composer | context-bound/global, clean/dirty, media preparing, submitting, rejected, acknowledged, first disclosure |
| EntityHeader | owned object, public object, organism, space; clear entity type and one principal action |
| FilterBar | search/sort/active chips, desktop progressive disclosure, phone sheet, pending vs applied distinction |
| Feedback | field error, form error, section failure, retry, zero results, success; never use zero as a failure fallback |
| Navigation | correct current location, back context, overflow at long labels, keyboard focus, active state not color only |
| ActionRow | like/reply/save/share, pending/pressed/count states, no accidental nested interactive elements |
| Settings section | stable headings, descriptions, inline errors, separate dangerous operations |

Token consistency is necessary but not sufficient. Component acceptance includes semantics, focus, content density, localization and representative data. Do not add a new generic component only to reduce repeated JSX if its task semantics differ.

## Content and trust contract

Remove product-internal words from ordinary tasks where they add no decision value: fail-closed, source projection, safe indexing threshold, first-publication version mechanics, current schema and HTTP status. Retain honest explanations of visibility and erasure without simplifying away actual consequences. Owner tools can expose technical details progressively where useful.

Do not translate or filter away user-authored content merely because the interface locale differs. Scope language metadata correctly. Use localized common names where available, with scientific names as stable secondary context. A taxonomy match is not a verified horticultural recommendation. An editorial example is not independent community evidence.

## Performance and interaction guardrails

Preserve public content in served bytes, stable permalinks, cache invalidation and server-authoritative mutations. UI responsiveness must include perceived progress and failure recovery. A fast-looking skeleton is not success if the promised content never arrives. Do not enlarge media simply to make it the measured LCP element. Re-run real image/loading budgets with the final design and realistic mobile connections.

## What would change the recommendation

If testing shows gardeners cannot distinguish space versus object destinations, improve the picker hierarchy and language before adding more setup steps. If the centered three-column shell leaves the main content too narrow in real translations, collapse the optional rail earlier. If rich blocks are commonly used in repeated notes, expose their entry points more visibly without restoring a dense permanent toolbar. These questions require observation, not aesthetic preference alone.
