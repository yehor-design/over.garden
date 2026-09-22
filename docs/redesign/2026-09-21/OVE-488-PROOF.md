# Editing, leaving and deleting an entry — OVE-488

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **The edit page names the entry's place.** `/garden/entries/{id}/edit` shows
  "Запис у {object} · {kind} · {space}" (read with `readOwnedDestination`
  through `settleSection`; a slow read costs the name, never the editor) and
  the entry's own menu beside it. Title, date and every block load into the
  shared editor as before; the address is unchanged by a save. Editing from
  the object timeline carries `returnTo=/garden/objects/{id}#passport-entry-{entryId}`,
  so Save and Discard return to the entry's own place.
- **Leaving is asked about only when something would be lost.**
  `UnpublishedWorkGuard` gained `closeRequestRef` (a guarded close for Cancel,
  Close and Escape) and a Back guard: while the composer is dirty it keeps one
  marked copy of the current history entry on top, so the browser's Back lands
  on the same page and asks; Stay puts the copy back, Leave goes back for real.
  `isComposerEscape` ignores Escape a widget took (slash menu, listbox, link
  field, date picker, a portal) and IME composition. All three composers use
  it — the entry composer's and the first-entry composer's Cancel used to
  discard dirty work without a question. The edit composer's own discard dialog
  is gone: one dialog, one set of words. `beforeunload` (reload, close, a typed
  address) is unchanged and promises no draft.
- **Failed save and ended session.** A refused save keeps the text and photos
  and says so; Save works again. A save or publish refused for an ended session
  (`session_required` or an auth-intent URL) no longer navigates the tab away —
  in the edit composer and the first-entry composer as already in the entry
  composer — and offers sign-in in a new tab.
- **Deletion lives in the entry's own menu** (`components/garden/entry-actions-menu.tsx`,
  OG-UX-045). The object timeline shows Edit and the public page as links and
  a "⋯" menu whose one item is "Видалити запис…"; the per-entry inline delete
  form, the per-entry passport link and the per-entry publication notice are
  gone (the passport link appears once above the timeline). The edit page's
  menu offers the public page and Delete. The confirmation names the entry
  ("Видалити «Жовте листя»?") and the ADR-0021 consequences; Cancel is focused
  first and focus returns to the menu's button. The form posts to the server
  action itself (a real endpoint before hydration, like every form here), and
  the dialog closes when a newer answer arrives. Success is the server's receipt only:
  the timeline refreshes, focus moves to its heading and a body-level status
  says the entry was deleted; from the edit page the owner lands on the
  object (or space), never on the tombstone. The server action, its
  revalidation and the 410/404 address rules are unchanged.
- **A defect only a browser showed**: the delete dialog is a portal, and React
  carries a portal's `submit` up its own tree, so confirming a delete inside
  the edit page also ran the composer's Save. The dialog's form stops the
  event, and every composer's submit handler now answers only its own form
  (the first-entry composer's space-setup sheet had the same shape).

## Proof

`tests/entry-editing.spec.ts` (new, registered), outcomes read from the
database and the public address:

1. Direct edit link (hard load): the destination is named ("Томат" ·
   "Теплиця"), the menu is named with the entry; a **double press** on Save is
   **one** revision (1 → 2); the owner lands on `/garden/objects/{id}#passport-entry-{entryId}`;
   the public address still answers 200 and shows the edit.
2. Clean Cancel leaves with no dialog. Dirty: Escape asks, Stay keeps the text;
   Back (`history.back()`) asks with the edit URL still in place, Stay keeps
   the text; Cancel asks, Discard returns to the entry's place with the
   revision unchanged; Back then Leave reaches the page before, not a loop.
3. A save refused once (routed 503) shows the failed state and keeps the text,
   revision unchanged; cookies cleared → Save shows the session-ended notice
   with a new-tab link and the page stays; cookies back → Save succeeds
   (revision 2).
4. Timeline delete by keyboard: the menu opens, Delete opens a dialog that
   names the entry and the seven days, Cancel is focused, Enter cancels and
   focus returns to the menu's button, the entry stays `active`; confirmed →
   the menu and the entry leave the timeline, the status region says
   "Запис «Перше цвітіння» видалено.", the row is `deleted_retention`, the
   public address answers **410**; its edit link no longer opens an editor.
   Deleting from the edit page lands on `/garden/objects/{id}`.
5. Another gardener's entry: no editor and none of its text.

`journal-deletion-retention.spec.ts` (OVE-353) now drives the menu and dialog
and still proves 410 then 404 after purge. Also run locally against the
production build: `entry-composer` 4/4, `composer-media` 2/2.

Unit: the object page renders the named menu and the edit link with its
`returnTo`, and no delete form; the deletion copy states seven days and no
undo in UK/BG/RU; the guard, the edit page and the composers' tests pass.

### Screenshots (`docs/redesign/2026-09-21/ove-488/`)

`uk-1280-*`, `bg-390-*`, `ru-390-*`: `1-timeline` (Edit, public page, the
menu), `2-delete-dialog`, `3-edit` (destination and menu), `4-leave-dialog`
(dirty Escape), `5-session-ended`.
