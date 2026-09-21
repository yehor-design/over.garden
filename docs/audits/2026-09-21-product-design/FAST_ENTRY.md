# Fast entry creation for many spaces and objects

## Decision and design hypothesis

**Owner requirement:** the shortest practical path to publishing into any existing owned space or object; many spaces and many objects are normal. **Recommended interaction:** one shared, text-first composer, launched globally or in context, with a persistent visible destination. This is a proposed design, not shipped functionality or a claim of user-tested superiority.

Optimizing click count alone is insufficient. A hidden default saves a click but increases the chance of publishing to the wrong tomato. The better target is **the fewest necessary decisions, with the destination always visible**. Writing time and photo-picker interactions are excluded from the navigation counts below; publication acknowledgment is never excluded from completion.

## Domain model visible to the user

- **Space:** a place or collection the gardener owns, such as Balcony or Orchard. A space can receive its own observation.
- **Object:** one owned plant, animal, colony or other supported living subject. It can have a parent space. It is not the canonical catalogue species.
- **Entry:** one dated public observation, attached to one explicit destination.
- **Organism:** the shared reference identity. Selecting tomato in the catalogue does not identify which of the gardener's tomatoes receives an entry.
- **Journal:** the chronological history produced by entries, not another object that must be created before writing.

The default design publishes to **one destination per entry**. Multi-object or multi-space broadcasting is not authorized by this audit: it introduces duplication, notification and attribution semantics. An object entry can appear in its parent-space aggregate without becoming a second copied entry. Preserve the existing domain semantics during implementation.

## Three launch paths, one composer

| Starting point | Recommended interaction | Navigation decisions before writing | Expected completion |
|---|---|---:|---|
| Existing owned object page/card | New entry opens composer with that exact object and parent visible | 1 activation | Write, optionally add media, Publish, server acknowledgment |
| Existing space page/card | New entry opens composer for the space itself; optional change to a contained object | 1 activation | Same flow; no forced object creation |
| Global New entry, many destinations | Open composer with destination chooser expanded; recent destinations and search immediately available | Open + select; search adds typing, not a separate page | Write and Publish without a dashboard detour |
| Reminder for an object | Write update opens the same composer, explicitly naming object and space | 1 activation | Same flow; timestamp and content remain editable |
| Catalogue species | If owned matching objects exist, show them; otherwise Add object using this species | Choice is necessary | Never silently create a duplicate specimen |
| First-time gardener, no destinations | Name a space or object inline, then write in the same flow | Only genuinely required setup | Create destination and publish with clear transactional outcome |

Counts are design budgets, not measured production results. Do not require a separate Continue button after selecting a destination unless another necessary decision remains. Publication itself is always an explicit action.

## Composer anatomy

Desktop: a focused, accessible dialog or dedicated routed composition surface, visually aligned with Threads. Mobile: a full-height writing surface with an obvious Close/Back action and reachable Publish. A full page is a supported fallback for direct links and no-JavaScript behavior; do not break existing server-authoritative endpoints to obtain a modal aesthetic.

1. Compact header: New entry, close, Publish. Avoid a large page introduction inside the composer.
2. Destination control: `Tomato · Balcony` with object thumbnail/icon and Change. For a space entry: `Balcony · Space journal`. Public visibility is explicit and cannot be mistaken for private saving.
3. Editable observation date defaulting to today in the user's interface context; do not let a timezone boundary silently change the day.
4. Text input: a natural prompt such as “What changed?” The user can type immediately. No required title/cover/formatting decision for a short observation unless a current server contract genuinely requires it; derive a fallback title consistently if supported.
5. Visible Add photo affordance. Optional rich formatting remains available; slash commands are an enhancement, not the only discoverable route.
6. Media preview with processing/upload state and accessible remove/reorder alternatives. Cover selection is relevant after more than one suitable image exists, not before a photo is added.
7. Concise status near Publish: unsaved / preparing photos / publishing / published / could not publish. Never use Saved for transient local text.

Keep Lexical and JournalDocumentV1. Threads is the composition and styling reference; Notion-shaped rich blocks can remain available underneath. ADR-0028 fixed canvas/gutter assumptions need explicit responsive reconciliation, not silent removal of supported content types.

## Destination chooser

### Empty query

Show a short Recent section from actual successful activity, then Your spaces and Browse all objects. Do not label algorithmic suggestions as favourites unless the user intentionally pinned them. A remembered destination is a suggestion, not an invisible authorization to publish there. Contextual launch preselection is stronger evidence than recency.

A compact list item contains name, entity type, parent space and a small recognizable image when available. Scientific identity is secondary disambiguation, not the primary name. Example display concepts:

- `Tomato · Balcony` — object, Solanum lycopersicum
- `Tomato · Greenhouse` — object, Solanum lycopersicum
- `Balcony` — space journal

These are illustrative labels, not claims about actual user data.

### Search

Search across **all owned permitted destinations**, not just visible dashboard rows. Match display name and useful species synonyms; show the parent space in every ambiguous result. Group Spaces and Objects, but use one query. Results should not unexpectedly reorder under the pointer after enrichment. Use stable identifiers for selection, never a displayed name as identity.

At hundreds or thousands of objects, use a bounded server search and cursor/pagination or a keyboard-accessible virtual list. Do not dump a thousand items into a native select. If virtualized, the active descendant must exist and be announced; test screen-reader traversal rather than assuming virtualization is accessible.

### Creating during writing

When search has no match, offer an explicit `Create object “…”` or Create space action, separate from “No results.” Existing matches remain selectable. New object setup asks only necessary name/type/space information; catalogue matching is optional where current rules allow it. Retain the written text and media in memory while adding the destination.

The current contract may create destination and first entry together. Choose a consistent transaction model during implementation: either atomic create-and-publish or clearly acknowledged separate creation. Never tell the user an entry was saved because only the object was created. Do not introduce a new persistence policy accidentally.

## Selection rules and failure behavior

| Situation | Required behavior |
|---|---|
| One destination exists | It may be preselected visibly; Change remains available |
| Many destinations, generic launch | Show chooser immediately; no silent first-space fallback |
| Same object name in multiple spaces | Parent path visible before and after selection |
| Object without space | Clearly label “No space” rather than assigning a default |
| Space renamed while editor is open | Resolve stable ID; update label if possible; no content loss |
| Destination removed or access revoked | Keep in-memory content; explain and allow selecting another permitted destination; server checks at submit |
| User changes destination after adding text/photos | Preserve content and date; do not reset the editor; visibly update destination |
| Network fails during selection | Retry and retained query; never pretend the owned list is empty |
| Network fails during Publish | Retain content; describe uncertainty accurately; use existing idempotency semantics to avoid duplicate posts |
| Session expires | Resume the intent where technically possible without claiming durable drafts; never discard input simply because a login panel appeared |
| Double-click Publish | One durable entry; pending state prevents accidental duplicates while backend remains authoritative |
| Dirty close / Escape / back | Explain loss and offer Stay or Discard; clean close is immediate |
| Reload or browser closes | Current no-draft policy remains; warn at the appropriate exit boundary, never promise recovery that does not exist |
| Successful publication | Acknowledge server success, link to exact permalink, retain clear context for another entry |

First-publication disclosure must be accurate and fit into this flow once when required. Do not add recurring confirmation dialogs to every publication merely to compensate for an unclear destination.

## Accessibility and mobile contract

The chooser is a labeled combobox/listbox or an equally valid accessible search dialog; the actual implementation must follow one coherent pattern. Typing filters, arrows navigate, Enter selects, Escape dismisses without deleting text, Tab follows a predictable route. Announce result count and chosen destination without repeating a full list on every keystroke. Focus returns to the invoking control.

Use reachable touch targets, visible labels and high-contrast focus. Test 320 CSS px, long Bulgarian/Russian labels, 200% text zoom, landscape, browser chrome and on-screen keyboard. The keyboard must not hide the final line of writing or trap Publish behind fixed navigation. Hiding the ordinary mobile tab bar while a full-screen composer is active is reasonable if close/back and navigation recovery remain explicit. Dragging photos cannot be the only reorder method.

## Prototype validation before implementation is accepted

Recruit a small formative sample including new gardeners, people with several spaces, and at least one keyboard/assistive-technology workflow. This audit did not run interviews or usability sessions. Use realistic seeded collections, not fabricated public production users.

Tasks: record a note for one of two identically named tomatoes; record a space-level weather observation; move a half-written note to another destination; add a newly acquired plant while composing; recover from a simulated failed publish; find the published entry again. Ask users to state where the entry will appear before pressing Publish.

Record time to editor, time to correct destination, number of navigation actions, wrong-destination attempts, abandoned composition, successful acknowledged publication and time to find the result. Proposed acceptance: contextual writing opens in one activation; global existing-destination path needs only open plus selection when the target is in recent results; no incorrect destination in the small formative test. Zero errors in a small sample is a design gate, not a population-level statistical claim.

Evaluate repeat-entry completion separately from first-entry activation. A garden journal's value depends on returning to an existing subject. Avoid collecting raw entry text, object names or sensitive location in analytics; measurement changes require the existing consent and route exclusions to remain intact.
