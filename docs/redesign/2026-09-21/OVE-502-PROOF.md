# Bookmarks and the wishlist — OVE-502

The exact tested and merged commits, CI runs and the production check are in
the authenticated Linear receipt.

## What changed

- **Two shelves, one name each** (criterion 1; OG-UX-036; DESIGN.md §5.23).
  - «Закладки» / «Отметки» / «Закладки» are saved reading.
  - «Список бажань» / «Списък с желания» / «Список желаний» are the wanted
    species, varieties and breeds. The wishlist page used to call itself
    «Хочу спробувати» and every row «Спробувати пізніше». Now the account
    menu, the title, the sign-in prompt and every notice use the same words;
    the BG menu label was «Желани».
  - A wishlist row says what kind of organism it is: «Сорт рослини», «Вид»,
    «Порода». Bookmarks' «Об'єкти» is «Рослини й тварини».
- **An empty shelf** (criterion 2) shows one browse action and its
  illustration, and no filter chips. The chips appear only when there is
  something to filter.
- **A populated shelf** (criterion 3).
  - A saved entry is drawn by the feed's own `EntryCard` data
    (`listSavedEntryCards`, sharing `mapFeedEntryRow` with the followed
    feed): author, date, what it is about, the gardener's words and photo.
  - It opens with `?from=` the shelf view. The entry's way back
    (`DirectoryReturnLink`, new `readSavedReturnTarget`) names Bookmarks and
    lands on the same filter and page.
  - Plants, varieties and topics are reference rows.
  - The filters and the pages are unchanged. Every removal, restore and
    failure now comes back to the view it was pressed in
    (`lib/social/shelf-view.ts`: `?outcome=&action=&target=`). It used to land
    on the first page with no filter.
  - The notice names what it removed (««Томат, день 14» прибрано із
    закладок») and offers Undo; the Undo's notice names it again.
  - The count says «2 елементи», not «2 елементів».
- **Guests and roles** (criterion 4).
  - A guest's sign-in prompt keeps the view it was asked for.
  - An ended session sends a removal to sign-in and back to the same view,
    and writes nothing. The wishlist used to send it to `/garden?wishlist=…`,
    the flow that adds an item.
  - Every read and write is the reader's own, through the existing mutation
    scope.
- **Unavailable items and refused writes** (criterion 5).
  - A saved entry its author withdrew stays on the shelf: «Більше недоступно»
    with the reason, and it can be removed. `listEngagementBookmarks` used to
    drop it, and `setEngagementBookmark` refused a removal whose target was
    not public, so it could not be taken off at all. Only saving now requires
    a public target.
  - A wishlist item the catalogue retired stays too: «Цього більше немає в
    каталозі.», removable by catalogue id (`removeWishlistCatalogItem`). The
    list used to drop it, and removal went through the offered slug. Undo is
    offered only while the catalogue still offers the item.
  - A write the database refused is said beside its row, which is still
    there, and the same press is the retry. It used to escape as the shelf's
    error page. A refused Undo, or a row that has since moved to another page,
    is said above the list instead.
  - Undo is offered only when putting the item back can succeed: a bookmark
    whose target is still public, or a wishlist item the catalogue still
    offers.
  - An unavailable bookmark's remove button names what it was and when it was
    saved («Більше недоступно · Записи · Збережено …»), so two withdrawn
    entries are two different buttons.
  - The bookmark targets are looked up four at a time, not fifty in a row.
  - Both reads are settled: a failure is a retry of this view, never "nothing
    saved", and an unreadable session is not "signed out".
- **The duplicate navigation** (criterion 6). `PERSONAL_SURFACE_TABS` and
  `personalSurfaceTabs`, the helper for the tab strip the shell replaced, are
  deleted, and so are the strip's four bars in the loading frame.

## Proof

**`tests/saved-shelves.spec.ts`** (7/7), in the gate, against `next start`
and the local database. One ordinary member has saved thirteen of another
gardener's entries, that gardener's tomato passport, and one entry the author
has since withdrawn. They want one catalogue variety and one the catalogue
has retired. A second member has saved nothing.
1. The empty member's two shelves at 375 px each show one browse action and
   no filter form. Axe is clean and there is no sideways scroll.
2. In UK, BG and RU, the page title, the account menu link and the guest's
   sign-in prompt name each shelf alike. The guest's sign-in `next` keeps
   the filter.
3. Many:
   - fifteen saved (the count says so), twelve to a page, all twelve drawn as
     entry cards. Axe is clean at 1440 px and 375 px;
   - on page two of the entry filter, a card's link carries
     `from=/bookmarks?kind=journal_entry&page=2`;
   - the entry's way back reads «Закладки» with that address, and pressing it
     returns to the same page.
4. A trigger refuses the member's bookmark writes. Remove, from the keyboard:
   - `outcome=failed`, the row still there with «Не вдалося прибрати,
     закладка лишилася.», the database still `active`, and the count still 15;
   - trigger dropped, the same press removes it with its name, and the
     database says `removed`;
   - Undo, by keyboard, puts it back, names it, and the database says
     `active`.
5. Unavailable items:
   - the withdrawn entry says «Більше недоступно» and why, is removed, and the
     notice invents no name for it and offers no Undo;
   - the retired variety says «Цього більше немає в каталозі.», is removed,
     and offers no Undo;
   - its wishlist row is gone from the database.
6. Before the bundle runs, both shelves' forms have real endpoints and at
   least one POST form. Axe is clean on the wishlist at 375 px.
7. With the session expired in the database, a removal goes to
   `/auth/sign-in?next=/wishlist` and the wishlist row is still there.
   Signing in on the screen returns to the wishlist with the item.

**`tests/personal-surfaces.spec.ts`**: the removal and Undo case follows the
new outcome addresses and checks that the notice names «Де Барао». The chip
case saves a variety first, because chips now appear only on a shelf with
something to filter.

**`pnpm prove:saved-shelves-failure`**
(`ove-502/saved-shelves-failure-receipt.json`) is a hard load under a lock on
the shelf's own table:
- `/bookmarks?kind=topic` and `/wishlist` answer 200 with their title,
  `query_timeout`, a retry of the same view with the filter kept, no skeleton,
  and no empty state;
- after the lock is released, the retry shows the shelf.

Screenshots are in `ove-502/`: both empty shelves at 375, many bookmarks at
1440 and 375, the refused removal, and the wishlist with a retired item.

## Defects the browser found

- **A withdrawn entry could not be removed.** Removal asked
  `ensureEngagementTargetIsPublic` for the same entry the shelf was saying was
  gone.
- **With scripts off the shelf is in the streamed, hidden segment**, outside
  `main`, so a check of `main form` saw only the loading frame. The spec checks
  every form.
