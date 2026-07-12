# OVE-179 Journal Entry V2 Design

Status: approved for implementation by the OVE-179 Linear execution request
Date: 2026-07-12

## Product decision

The public journal entry becomes a chapter inside a living object's durable
history, not a standalone post card. A guest must understand the object,
caretaker, date, narrative, evidence, chronology, and public discussion before
any authentication request appears. The page adopts Drive2's information order
and cross-linking mechanics while retaining OverGarden styling, Shadcn
primitives, safety boundaries, and terminology.

The load-bearing assumption is that object context increases comprehension and
discovery depth enough to turn one search or feed visit into continued reading.
The user job is to understand what changed, why it matters for this particular
living object, and what happened immediately before or after without exposing
precise location or private garden data.

## Architecture

1. Replace the raw HTML route with App Router pages under both
   `/journal/[slug]` and `/{bg|ru}/journal/[slug]`, so the shared SiteShell,
   route-owned context rail, language switcher, and responsive navigation are
   canonical.
2. Keep HTTP lifecycle handling outside the React page. Proxy performs a
   document-only public lookup and returns localized, generic, noindex `404` or
   `410` documents for GET/HEAD while RSC, prefetch, and actions continue to the
   App Router.
3. Expand the public repository into one explicitly public read model:
   published entry content, safe object/space context, public profile, curated
   topics, processed derivatives, publication-scoped adjacent/related entries,
   and public-passport-safe mentioned objects. It returns no owner id, email,
   raw/quarantine key, precise location, draft, or moderation-only field.
4. Load owner controls through a separate user-scoped query. The public view
   model never carries owner identity or authorization state.
5. Map repository data into a localized presentation contract consumed by a
   focused React component. The component owns hierarchy and rendering, not
   privacy decisions.

## Page hierarchy

- Breadcrumbs: journals, living object or space, current entry.
- Compact passport strip before secondary engagement: object kind, identity,
  safe region/hidden state, caretaker, and passport link when one exists.
- Entry header: title, author/profile, entry date, publication date, curated
  topic links, and optional isolated owner control.
- Evidence gallery: zero, one, or bounded mixed-aspect processed derivatives;
  derived safe alt text when stored alt text is absent; optional captions.
- Narrative: natural paragraph sections with preserved line breaks and a
  readable measure. No synthetic milestone/chip substitution.
- Chronology: explicit newer and older neighbors with first/last boundaries.
- Related context: additional public entries and topic/knowledge routes.
- Engagement: public social proof and active comments are readable by guests;
  comment/bookmark mutations retain OVE-174 intent behavior.

The desktop layout uses the shared left navigation, central reading column,
and route-owned contextual rail. Mobile keeps object context above the title,
uses stable media dimensions, wraps long Cyrillic names, and never introduces
horizontal scrolling.

## Data and safety rules

- A direct-object entry may expose its object only because the entry and object
  passport anchor are public under existing public predicates.
- A space entry may expose mentioned objects only when each mentioned object
  independently has an active public passport anchor. Private/unpublished
  mentioned objects are omitted rather than represented with distinguishing
  placeholders.
- Adjacent and related queries use the same public predicates as the root page
  and deterministic date/creation/id ordering.
- Topic links require curated topics plus accepted, public-eligible signals.
- Media queries require processed derivatives owned by the same actor as the
  public entry. Galleries are bounded and never return quarantine keys.
- Optional media alt/caption fields are nullable readback metadata. This slice
  does not add caption authoring to the composer; production rows without these
  fields use a localized object-and-entry-derived alt and no caption.
- Private, unpublished, unknown, malformed, and removed-comment states are
  indistinguishable beyond the generic public `404`/omission contract. Only a
  previously public archived entry receives `410`.

## Deterministic evidence

Extend the shared fixture manifest with a real public space entry and bounded
public object mentions plus journal-entry evidence cases covering short,
normal, long multi-section, no-media, portrait, landscape, mixed gallery,
plant, animal, bee colony, safe-region, hidden-region, localized, chronology
first/middle/last, related zero/one/many, guest, authenticated reader, owner,
private `404`, unknown `404`, and deleted `410` states.

The verifier must call the production public repository and the separate owner
control loader, then assert status, context kind, media order/aspects,
chronology slugs, topic slugs, related count, and owner-control visibility.

## Verification contract

- Focused repository, presentation, component, route, proxy, localization,
  auth-intent, fixture-manifest, and fixture-verifier tests follow red-green.
- Local schema bootstrap and generated Kysely types are current if SQL changes.
- Full lint, typecheck, test, build, fixture verify, diff check, and mainline
  closeout pass.
- Browser QA covers guest and authenticated/owner paths, desktop and 320px,
  all three object kinds, long content, gallery, chronology boundaries,
  localized routes, comments readback, owner isolation, `404`, and `410`.
- Screenshot evidence includes Drive2 reference, exact OverGarden before,
  desktop after, mobile after, and matched side-by-side composites.
