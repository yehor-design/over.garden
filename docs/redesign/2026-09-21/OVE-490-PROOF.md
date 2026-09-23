# A space's own page — OVE-490

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **`/garden/spaces/[spaceId]`** (new, the IA's workspace space route; there is
  still no public space address). The shell heading is "Простір" and the
  space's name is the first heading under it, as the object page does. The
  overview states facts only — "Рослин і тварин: 2 · Записів: 1 · Останній
  запис: сьогодні", and whether the region shows — and offers three actions:
  **Write** (`/garden/new?space={id}` — the one composer with the space named,
  its common picker still able to change the destination), **Add a plant or
  animal** (`/garden/objects/new?space={id}` — object setup with the space
  preselected, returning here) and **Settings**.
- **Plants and animals** in the space are the collection's own rows
  (`GardenItemRow`, the space left out of their line), six on the page and all
  of them at `?view=objects` in pages of 24; each Write returns to its row
  here. `listGardenObjects` gained a `spaceId` option; nothing else about the
  collection read changed.
- **History** (`server/space-page-repository.ts`, `listSpaceHistory`): every
  active entry that belongs to the space — its own notes and its objects'
  entries — each once (the object join is one-to-one; mentions are not joined),
  newest observation first, then by when it was written, then by id. Each row
  is labelled "Про простір" or "Про «Томат»" (a link to the object), links to
  the entry's one public permalink and has Edit returning to the row. Ten on
  the page and all at `?view=history` in pages of 20; a page past the end
  shows the last page.
- **Views when needed**: the Overview / Plants and animals / History links
  appear once either list outgrows its preview.
- **`/garden/spaces/[spaceId]/settings`** (new, the IA's `/settings` child):
  the fields the `spaces` table holds — name and region visibility — through
  `updateSpaceSettingsAction` (the space-setup validation; the new name
  expires the public caches of the space's objects and entries, which show
  it). **Deletion only of an empty space**: the foreign keys from
  `plant_objects` and `journal_entries` are `ON DELETE CASCADE`, so a bare
  delete would take the gardener's plants and entries — including entries
  inside their seven-day window — with it. The page counts both (retained
  entries included) and, when anything hangs from the space, says so and
  offers no button; `deleteEmptySpace` locks the space row and counts again in
  the same transaction, so an object or entry created in between blocks the
  delete instead of vanishing with it. The confirmation names the space, Cancel
  is focused first, and success is the server's answer only.
- **Every read settles on its own** (ADR-0023): summary, plants, history, the
  deletion count. A failed history keeps the plants and never reads as empty; a
  space that is not the reader's (or a malformed id) is the shared "not in your
  garden" record, which says nothing about whether it exists.
- **Old addresses keep answering**: `/garden?space={id}` (the garden page's
  space journal until now) answers **308** here in the proxy
  (`legacySpaceJournalLocation`, the post-save moment carried along), and the
  history keeps an `id="space-journal"` anchor for the old fragment. The one
  composer, the edit page, the destination picker, the collection's space rows,
  the context rail and the entries API fallback now point here; space setup's
  result offers "Відкрити простір" and its same-name warning opens the existing
  space; an owned object's passport links its space.
- **Also**: `WorkspaceSurface` gained `space` and `space-settings`;
  `prove-workspace-resilience` probes both; `ROUTE_OWNERSHIP.md` lists both
  routes; PROJECT_STATE and DESIGN.md §5.13 record the rules.

## Proof

`tests/space-page.spec.ts` (new, registered in `scripts/browser-gate-specs.ts`),
against `next start` and the local database — 5/5:

1. **Space note → acknowledged permalink → history** (UK, 1440): the space
   page shows no history yet; axe clean; Write (one activation) opens the
   composer with "Теплиця" named; one mention ticked; Publish → back on
   `/garden/spaces/{id}`, one history row labelled "Про простір"; the database
   holds exactly one `space` entry in that space; the row's link is
   `/@{handle}/post/{n}`, which shows the text; Back returns to the history
   with the one row.
2. **Object creation in the space, on a phone** (BG, 390): no sideways scroll;
   the empty plants state; Add a plant → object setup with "Балкон"
   preselected → created → back on the space with the new row; the object's
   `space_id` is the space.
3. **Many children and a long history** (UK, 1440; 30 plants, 25 entries): six
   plants and ten entries with both labels, "Уся історія (25)"; the history
   view pages 20 then 5, no id twice; the plants view shows 24 and
   "Сторінка 1 з 2"; an object's page links its space and the link lands here.
4. **Settings** (RU, 1440): axe clean; a space with a plant says "растений и
   животных — 1" and offers no delete; renaming saves, the database holds the
   new name and the space page shows it; an empty space's delete opens a
   dialog with "Отмена" focused, deletes, lands on `/garden`; the other space
   and its plant are untouched.
5. **Permissions and the old address**: `/garden?space={id}` answers 308 to
   `/garden/spaces/{id}` (asked without following); a second gardener opening
   the first one's space and its settings gets the "not in your garden" record
   with neither the name nor the plant anywhere in the page.

**Server fixture proof** (the repository's SQL executed against the local
database before the browser run): a space with three objects, two space notes
(one mentioning two objects), three object entries and one entry in its
seven-day window → the history holds the five active entries, each once, the
mentioned note included once, labelled by what they are about; the summary
counts 3 plants / 5 entries; the deletion count is 3 / 6 (the retained entry
counts); another user reads `null`, a history of 0, and gets `missing` on
update and delete; a non-empty delete answers `not_empty` and leaves the
objects; an empty space is deleted.

**Hard-load bounded failure**: `pnpm prove:workspace-resilience` against a
`next start` whose database is a closed port, with a signed-in cookie — all
10 workspace surfaces, `space` and `space-settings` included, answered 200 with
their own heading, `data-section-failure="connection_unavailable"`, nothing
stranded and no errored boundary.

Unit: `spaces/[spaceId]/page.test.tsx` (9: identity and actions, rows without
the space, labelled history once with its permalink and Edit, views and "all"
links, history paging reads nothing else, the empty space in words, a failed
history keeps the plants, missing and malformed ids, the guest),
`settings/actions.test.ts` (5: rename with cache expiry, validation before the
database, a foreign space, a refused session, delete only when empty),
`lib/garden/space-page.test.ts` (4), `proxy.test.ts` (the 308). The full local
gate: 243 passed, 1 skipped, and 2 that met Better Auth's sign-up limit (429)
passed alone (`publication-notice` 2/2, `site-shell` 9/9). `pnpm test`, lint
and typecheck green.

### Screenshots (`docs/redesign/2026-09-21/ove-490/`)

`space-uk-1440-note-in-history`, `space-bg-390-plant-added`,
`space-uk-1440-many`, `space-settings-ru-1440-blocked`,
`space-settings-ru-1440-delete-dialog`.

## Not claimed

Moving an object to another space is not offered (no backend for it; it is the
object's setting, OVE-491). No real screen-reader session (OVE-478).
