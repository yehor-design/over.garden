# All-owned destination picker — OVE-483

Baseline: `cbeb54df13cf09539265e76a0738eff84021e98e`. Exact tested/merged
identities, CI and production verification belong to the authenticated Linear
receipt. This is an incremental delivery, not the completed global composer.

## Contract and callers

`lib/garden/owned-destinations.ts` defines separate `space` and `object`
identities. A catalogue organism is descriptive species context, never a
publication destination. Each object carries its parent name and type, including
in the selected summary. The defensive transport supports an explicit
unassigned label; the database still requires every object to have a space.
There is no nullable-space migration or fabricated unassigned database fixture.

`server/owned-destination-repository.ts` searches the complete authenticated
owner's corpus, independently of the dashboard's loaded page. Two owned arms
form one SQL corpus. Objects also require an owned parent. Name, parent name,
canonical organism name, stored object label and catalogue name synonyms are
searchable. Literal `%`, `_` and backslash are escaped. Cursor input is bounded,
validated and bound to query/filter; ownership is always reapplied. Stable
`kind DESC,id` ordering survives label edits. Spaces precede matching children,
so searching a parent name exposes the space immediately rather than behind
fifty child matches. One response contains at most 20 browse
rows plus five recent destinations. Next replaces the current page rather than
accumulating 1000 DOM options. A back-to-browse action returns to page one.

Recency uses `max(published_at)` on active successful entries in the matching
entry scope. An object publication does not make its parent a recent space
publication. No click history, browser storage or unacknowledged input is used.
Queries have a 1200 ms PostgreSQL statement timeout and the private/no-store
API settles within 4500 ms including acquisition. Failure is a 503 with an
opaque digest; no database message is exposed.

`components/garden/owned-destination-picker.tsx` provides the reusable
combobox. Typing is debounced and stale requests are aborted. Arrow keys move
an active descendant that exists in the current DOM; Enter explicitly selects;
Escape closes without clearing text. A pointer click reopens an already focused
input. Selection is separate from query and survives error/retry. Options show
parent/type/species context, and selection uses immutable identity. There is no
implicit first result. The existing first-entry form may preselect a sole space;
a generic multi-space launch does not choose one.

Current callers:

- `garden-workspace-view.tsx` adds the all-owned picker at the inventory writing
  entrance. Selection opens the existing object composer at
  `/garden/objects/{id}#follow-up-composer` or the selected space journal at
  `/garden?space={id}#space-journal`.
- `first-entry-composer.tsx` replaces the one-space native select with the same
  picker in space-only mode. Changing parent keeps text and other fields.
- `api/garden/destinations/route.ts` is an authenticated, no-store read route.
  It uses the existing session/account-change boundary. This is not an admission
  token and never authorizes a later write.

The atomic publication route retains existing transaction ownership checks.
Their missing/foreign-destination outcomes now return the same non-enumerating
`destination_unavailable` 404. The first-entry form explains that the destination
is unavailable and offers another selection without clearing the editor. No
visibility, media, persistence, schema or canonical-address contract changes.
All entries remain public; no durable drafts have been introduced.

## Pattern provenance

Airbnb archived destination search was inspected in Mobbin:
https://mobbin.com/screens/f57b900d-2724-465b-9382-7d3623048717
and https://mobbin.com/screens/fe2300e9-033d-4ffc-8b78-1ff99edb9341.
The transferable pattern is contextual names and direct selection. The extra
Save step in the location-settings example is not imposed on writing. These
observations are not conversion research or claims about Airbnb's current UI.
No competitor screenshots are redistributed as product assets.

## Proof inventory

`tests/owned-destinations.spec.ts` is registered in the real browser gate. It
uses only loopback synthetic accounts and cleans up its own rows. It traverses
0/1/100/1000-object fixtures, checks complete pagination, duplicates, late-page
search, catalogue synonyms, cross-user isolation, invalid cursor reuse, actual
successful publication/recency and server refusal after destination removal.
The UI scenario covers explicit selection, keyboard/Escape/reopen, 503 retry,
retained fields, UK/BG/RU and 320/390/768/1280/1920 px, with screenshots and
WCAG 2.2 AA axe reports. A removed selected parent is followed by another choice
and actual publication, with the database checked for the intended parent and
retained body.

Unit tests cover malformed query/cursor boundaries, explicit unassigned context,
owned navigation paths, authenticated scope propagation and no-store API
failure/guest refusal. Existing workspace failure and publication protocol tests
remain in the full suite. Native screen-reader speech is not claimed by these
automated proofs.

The first-space regression in `redesign-baselines.spec.ts` is now an ordinary
passing assertion. Global `/garden/new` launch and filter-dismiss naming remain
owned by their downstream issues; no expected-failure annotation is removed
until its outcome exists.

## Local verification receipt

- Production build, typecheck and lint pass. Full `pnpm test`: 563 test files,
  4295 tests passed, 29 existing skips; media staging worker 14 passed.
  Subsequent targeted publication/selection contracts: four files, 27 passed
  (including three added missing-destination mappings).
- Full production-build browser gate: **203 reported passes, one existing
  skip, 6.0 minutes**. The count includes two explicitly expected baseline
  failures for the downstream global launch and filter-dismiss tasks; it is
  not a claim that those outstanding UX outcomes are delivered.
- Focused picker coverage also runs in that gate. Search by a catalogue synonym
  follows its cursor if the same name matches more than 20 owned objects; the
  fixture does not assume a randomly generated UUID is on page one.
- `ove-483/` contains 15 picker screenshots, 320/390/768/1280/1920 px in each
  of UK/BG/RU, and their SHA-256 manifest. Three whole-page axe 4.12.1 reports
  yielded zero violations across WCAG 2.0/2.1/2.2 A/AA tags. Incomplete rule IDs
  remain recorded rather than counted as passes. Keyboard behavior and the
  active-descendant DOM checks are separate assertions in the browser scenario.

Final focused browser rerun after the synonym-pagination assertion: two passed
in 10.9 seconds against the same production build.

The empty-corpus state is distinct from a query with no matches: it identifies
which owned entities do not exist yet. A noninitial empty cursor page never
claims that the whole collection is empty. The final 12.0-second focused run
passed both scenarios, including the new empty-space browser assertion; its
320 px capture is `ove-483/empty-space-picker.png` (16 captures total).
