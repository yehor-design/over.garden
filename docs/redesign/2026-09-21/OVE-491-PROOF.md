# An owned object's history, settings and provenance — OVE-491

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **`/garden/objects/[objectId]` is the object's history.** The shell's "Живий
  об'єкт" is the page's one `h1` (the passport overview is given
  `headingLevel={2}`; `PageHeader` gained `level`). Under it: the breadcrumb
  My garden › the space (its own page since `OVE-490`) › the object; the name;
  the kind and identity; the badges (journal state, catalogue state, the last
  observation's date). Then the object's sections — **History / Settings /
  Provenance**, the provenance count on its link — then Write (the one composer
  with the object named) and the timeline. The owner's overview lost what
  repeated the header: the "Доглядальник: Ви" line (a reader's page still shows
  the caretaker), and the kind, latest-observation and state facts; the
  context, first observation and entry count stay.
- **The specimen and the organism are two named links** (criterion 2). The
  owner's header offers "Публічний паспорт цього об'єкта" when the object has
  an active public entry, and "{organism} у каталозі" when it is matched. The
  "До мого саду" button is gone, because the breadcrumb already leads there. The
  public-passport line above the timeline moved into the header.
- **`/garden/objects/[objectId]/settings`** (new, the IA's `/settings`
  child): location privacy, catalogue matching and the data source, moved as
  they were. The same Server Actions do the same server validation.
  Catalogue matching now names the change before saving: "Після збереження:
  «{proposed}» замість «{current}»." A matched object says what it is matched
  to and links the organism. The server resolves only an unmatched object, so
  there is nothing to change there. `#passport-management`, `#passport-privacy`
  and `#passport-catalog` keep their ids.
- **`/garden/objects/[objectId]/provenance`** (new, the IA's `/provenance`
  child): the records first, under "Записи походження", then "Записати
  джерело" with the three ways to add one.
  - **The own-object source is chosen, never preselected.** The list opens on
    "Оберіть об'єкт-джерело". The button stays disabled until a source is
    chosen, then names both sides: "Записати: «Томат черрі» походить від
    «Розсада томата»". Each option names its kind.
  - **Same kind only, enforced twice.** The list is
    `buildLineageSourceObjectOptionsQuery(…, subject.objectKind)`. On the
    server, `createProvenanceEdge` throws `ProvenanceRelationError("cross_kind")`
    when the source's kind differs, before anything is inserted.
    `createProvenanceEdgeAction` answers `{ status: "refused" }` and the form
    says why. With no other object of the kind, the page says so for plants or
    for animals.
- **What the audit saw vs what was proven** (criterion 4, OG-UX-045). The
  audit saw a bee colony *offered* while viewing a tomato. The mutation bug
  behind it was also real:
  - The pre-change `createProvenanceEdge` checked only that the source belonged
    to the gardener.
  - The schema has no rule against it either: the exact row it would have
    written for "tomato comes from bees" (`own_object`, plant subject, animal
    source) was inserted in a rolled-back transaction on the local database and
    accepted.

  Both are closed now. The browser proof submits exactly that crafted request
  and finds no row.
- **Plant/animal words follow the kind** (OG-UX-026). The object pages say
  Рослина/Тварина (Растение/Животно, Растение/Животное), and each kind has its
  own hint and empty state. The last "plant species" labels were dead copy
  (`garden-workspace-copy` `catalogKinds`, unused since `OVE-489` removed the
  old garden view, and `publicCatalogIdentityLabel`, unused). They are deleted
  so they cannot come back. The owner breadcrumb's Ukrainian "Моя градина"
  (a Bulgarian word) is now "Мій сад".
- **Recency, not diagnosis** (criterion 5, OG-UX-023). The object page states
  the last observation's date and nothing about health. The garden's "needs
  attention" was removed in `OVE-489`, and its unused copy blocks remain inert.
  No reminder stands before writing.
- **Settled reads and boundaries** (criterion 6). Both new pages read through
  `loadOwnedObject` (one settled read of the object and its provenance). A
  malformed id is the missing record before any read. Each page has its own
  `loading.tsx` and `error.tsx`. `WorkspaceSurface` gained `object-settings`
  and `object-provenance`, and `prove-workspace-resilience` probes both.
  Mutations revalidate `/garden/objects/{id}` as a layout, so all three pages
  refresh.
- **Old links keep working.** `/garden/objects/{id}` is unchanged. A fragment
  never reaches the server, so the history page maps the old
  `#passport-management|privacy|catalog` fragments to `/settings#…` and
  `#passport-provenance` to `/provenance#…` in the browser
  (`legacyObjectAnchorLocation`). The context rail's provenance link points at
  the page.
- **Two defects only the rendered page showed:**
  - **"Прогрес живого об'єкта" was a second timeline.** It listed every entry,
    and it stood above Write. With 30 entries, the composer and the real
    timeline began three screens down. It is now a summary: the span and, when
    there are two, the first and latest photographs. It sits below Write,
    directly above the timeline it summarises.
  - **The button outlived the list.** React resets a form once its action
    answers, so the list went back to "Оберіть…" while the button still named
    the old choice. After a success, that button was still enabled with an
    empty value. A choice now belongs to the answer it was made after
    (`choice.after === state`), so the answer clears it. The answer then shows
    until the next choice.
- **Also**: `ROUTE_OWNERSHIP.md` rows for both routes, PROJECT_STATE, DESIGN.md
  §5.13. The progressive-form guard now names `provenance-section.tsx`, where
  the provenance forms live.

## Proof

`tests/object-pages.spec.ts` (new, registered in `scripts/browser-gate-specs.ts`),
against `next start` and the local database:

1. **History, then settings, then provenance** (UK, 1440; a tomato with 30
   entries, a seedling, a bee colony):
   - History: one `h1` ("Живий об'єкт") and the name as the first `h2`. History
     is marked current, Write sits above the timeline, and all 30 entries are
     in the timeline. The progress summary sits below Write and lists nothing.
     Neither settings nor provenance appear, there is no caretaker line, and
     axe is clean.
   - Settings (via its section link): one visible `h1` "Налаштування об'єкта",
     "Рослина · Балкон · Черрі з ринку", privacy and catalogue, no timeline or
     composer, axe clean.
   - Provenance: one visible `h1` "Походження об'єкта". The list opens on
     "Оберіть…" and holds only "Розсада томата · Рослина · Невідомо", never the
     bee colony. The button is disabled, the hint is "Лише рослини…", axe clean.
   - Back returns to settings and then to the history.
2. **Crafted cross-kind request, then the honest one** (UK):
   - The seedling is chosen and the button names both objects.
   - The chosen option's value is rewritten to the bee colony's id and
     submitted. The form says "Не записано: рослина не може походити від
     тварини…" and the database holds **no** edge. The list is back on
     "Оберіть…" and the button is disabled with its neutral label.
   - From a fresh page the seedling is recorded: "Походження записано.", one
     edge (tomato ← seedling) in the database, one record listed, and "1" on
     the section link. The list and the button reset as above.
3. **An animal on a phone** (BG, 390):
   - The overview says "Животно" and "Вид или порода" and nothing about plants.
     No sideways scroll.
   - Provenance: "Животно · Балкон" and, with no other animal, "В градината
     ви още няма друго животно…" with no list. Axe clean.
   - Settings: the same header, no sideways scroll, axe clean.
4. **Old links, a stranger, a cancelled delete** (RU):
   - `/garden/objects/{id}#passport-catalog` lands on `/settings#passport-catalog`,
     and `#passport-provenance` lands on `/provenance#…`.
   - Delete from the entry's menu opens the confirmation naming the entry with
     "Отмена" focused. Enter closes it, and the entry is still `active` and
     still in the timeline.
   - A second gardener gets the "not in your garden" record on all three pages,
     with neither the object's nor the space's name in them. No edge is
     written.

**Hard-load bounded failure**: `pnpm prove:workspace-resilience` against a
`next start` whose database is a closed port, with a signed-in cookie — all
12 surfaces, `object-settings` and `object-provenance` included, answered 200
with their own heading, `data-section-failure="connection_unavailable"`,
nothing stranded and no errored boundary.

The whole local gate on the first build of this change: 226 passed, 1 skipped
and 2 failed on Better Auth's sign-up limit (429), which also kept 21 tests
from running. Rerun alone, `public-profile` (5/5) and `static-documents`
(18/18) passed. After the two fixes above and the rail change,
`object-pages`, `catalog-picker`, `public-profile` and `space-page` were run
again on a fresh build, all green.

Unit:
- `object-progress-moment.test.tsx`: a summary with no list.
- `objects/[objectId]/page.test.tsx` (18): one `h1`, the sections, no
  settings or provenance on the history page, the two named links and the
  breadcrumb, a malformed id read nothing.
- `settings/page.test.tsx` (9): the page and its ids, a matched object's
  readback, source credit in UK/BG/RU, an animal, missing and malformed ids,
  bounded failure, the guest.
- `provenance/page.test.tsx` (10): records before forms in UK/BG/RU, same-kind
  options with nothing chosen, the animal's empty state, person-mention cases,
  missing, failure, the guest.
- `actions.test.ts` (5): recorded, refused cross-kind with nothing revalidated,
  other errors thrown, a refused session, layout revalidation.
- `lib/garden/object-pages.test.ts` (2).
- `lineage-repository.test.ts`: the kind filter's SQL.
- `owner-object-passport-presentation.test.ts`: facts and named links.

`pnpm test`, lint and typecheck green.

### Screenshots (`docs/redesign/2026-09-21/ove-491/`)

`object-history-uk-1440-long`, `object-settings-uk-1440`,
`object-provenance-uk-1440`, `object-provenance-uk-1440-refused`,
`object-provenance-uk-1440-recorded`, `object-provenance-bg-390-animal`,
`object-settings-bg-390-animal`.

## Not claimed

- **The public passport's breadcrumb** ("Живі об'єкти" → the catalogue on
  `/@handle/objects/{slug}`, OG-UX-019's public half) belongs to its route's
  owner, OVE-495. This task keeps the owner's side, where the breadcrumb is the
  containment (garden › space › object) and the catalogue is a separately named
  link.
- **Re-identifying a matched object** is not offered: the server refuses to
  resolve an object that already has a catalogue identity, and changing that
  contract is out of scope.
- **Moving an object to another space**: there is no backend for it.
- **A real screen-reader session** (OVE-478).
