# Progressive object setup — OVE-485

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- `/garden/objects/new` — add a plant or an animal in four questions: **kind**
  (plant / animal), **name** (the name field is the catalogue search: a pick
  links the shared organism, "keep without a match" keeps the gardener's own
  words, as the first-entry composer does), **space** (every owned space
  through the OVE-483 picker, plus "Create a new space", which opens the OVE-484
  flow in a sheet and selects the space it creates), and a **review** that
  says what will be added and that adding publishes nothing. Answered
  questions fold into one line with a named "Change"; values survive every
  move, including a nested space setup that is cancelled half-way.
- The questions are the fields `plant_objects` requires — kind, name, space —
  and nothing else. There is no "No space" choice because the schema has none
  (`space_id` is not null). Provenance and advanced attributes stay on the
  object's own page.
- `POST /api/garden/objects` + `server/object-setup-repository.ts` apply the
  first-entry publication's identity rules (`resolveObjectKindForCatalogSelection`,
  `selected` / `free_text` / `unknown`, the space's location privacy). The
  request id is the object id: replays read back one object, another owner's id
  is `conflict`, another owner's space is `space_unavailable`, an unselectable
  organism is `identity_unavailable`. A same name in the same space asks first;
  in another space it does not ask. A 503 is an uncertain outcome that is safe
  to retry.
- Catalogue launch: an organism's card now sends "Record this species" to
  `/garden/objects/new?catalog={publicSlug}`. The gardener's own objects of that
  organism come first, each with "Write"; "Add another" opens the flow with kind
  and name answered and the space next. It used to open the first-entry
  composer, which always started a new object.
- My garden: the attention section's "Add object" and a new "New plant or
  animal" action in the inventory lead here. The empty garden keeps the
  composer, which creates the first object and its first entry atomically
  (INFORMATION_ARCHITECTURE.md transaction table); writing to an existing
  destination never passes through this setup.
- `components/garden/progressive-steps.tsx` is the step shape both setups use.
- After adding: "Write the first entry" (`/garden/objects/{id}#follow-up-composer`)
  and "Back to My garden". The result never says an entry was saved.

## Proof

`tests/object-setup.spec.ts` (registered), every outcome read back from the
database:

1. First-time gardener at 320 px (UK): empty name refused inline, a space
   created in the sheet and selected, the name kept, axe WCAG 2.2 AA clean on
   review, the one object row exact (`unknown` identity), zero journal entries.
2. Returning gardener with 20 spaces (RU): animal, the seventeenth space found
   by typing, a same-name warning in that space, an explicit second object.
3. Catalogue launch (BG): the card's link, the gardener's existing linked
   tomato offered first with a working "Write" link, then a second object
   linked to the organism (`selected`, its catalogue id).
4. Endpoint: 201 then 200 replay, three concurrent replays → one row with the
   own label as `free_text`; foreign space 422; unselectable organism 422;
   empty name 422; malformed 400; another gardener claiming the id 409; guest
   401.
5. A nested space closed half-way writes nothing; Next without a space is an
   inline error; My garden links the flow.

Also green locally: `space-setup`, `garden-workspace`, `organism-card`;
`pnpm test` (565 files / 4,333 tests) and lint.

## Not claimed

No real screen-reader session (OVE-478). The first-entry composer's own
object fields are OVE-486's to recompose.
