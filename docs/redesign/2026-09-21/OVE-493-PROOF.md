# The entry page and its conversation — OVE-493

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **The page reads as its card does** (criterion 1, OG-UX-014). The header is
  now:
  1. the byline: author (the avatar hidden from assistive technology, the
     name read as "Автор Олена @olena") and the observation date, plus
     "Опубліковано …" when publication fell on another day;
  2. the context line: the object (a link), its kind in words and the place;
  3. the title, the page's one `h1`.

  The overline "Журнал об'єкта" and the author link under the title are
  gone. "Про що цей запис" no longer repeats the object link and the place;
  it keeps the identity, the topics and the mentioned objects.
- **`lang` on the gardener's words only** (OG-UX-030; ADR-0029 D11,
  amended 2026-09-23 — "the entry element" is the entry's own words).
  - Before: `<main>` carried the entry's language, so every interface label
    on the page was declared in the gardener's language.
  - Now: `<main>` is the reader's language. The title, the story, the
    captions, the object's name and the titles and previews of the journal's
    other entries carry the entry's language, and only when it differs.
- **One row for what a reader can do** (criteria 1 and 2): like, save,
  comment (a link to the composer) and share, in that tab order.
  - Share (`app/engagement/share-control.tsx`) opens the device's own sheet
    when there is one. Otherwise it copies the link and says "Посилання
    скопійовано." in a polite status. If copying fails, it says so and shows
    the address, selected.
  - A closed sheet says nothing.
  - It always sends the canonical permalink the route builds
    (`absolutePublicUrl(entry.publicPath)`), never the address bar with its
    `from`, cursor or sign-in intent.
  - It needs a script, so it appears only once the page is interactive.
- **Comments** (criterion 3):
  - A reply names whom it answers ("Відповідь для Олена").
  - The button says "Надсилаємо…" and refuses a second press while a comment
    is on its way.
  - A refused comment keeps every word. React resets a form when its action
    answers, and the uncontrolled field used to lose a refused comment to
    that reset.
  - A deleted or reported comment reads "Автор видалив цей коментар." /
    "Коментар на перевірці модератора." in the reader's language. The
    repository's English placeholders ("Comment deleted by its author.") were
    shown to every reader before.
  - A guest's comment keeps its intent through sign-in, as before.
- **Duplicates and the server's word** (criterion 4). Like, save and follow
  refuse a press while their last one is on its way (`aria-busy`, not
  `disabled`, so focus stays). Their optimistic state is only ever the
  pending one.
- **A lost request is answered in place.** A request that never reached the
  server made React throw where the form stood, and the nearest boundary is
  the locale's `error.tsx`: a dropped connection on Like replaced the whole
  entry with an error screen. `TransportBoundary` (in
  `engagement-controls.tsx`) now re-draws the control from what the server
  last confirmed, with "Дію тимчасово не вдалося виконати. Спробуйте ще раз."
  beside it. A comment's words live above the boundary and survive. The forms
  remain bare Server Action endpoints (the progressive-endpoint guards pass
  unchanged).
- **One section for the rest of the journal** (criterion 5, OG-UX-018). The
  previous/next strip and the "Ще з цього журналу" grid, which listed the
  previous entry a second time, are one section. The entry before and after
  come first, named as such, then the journal's other entries, each once.
  Everything in it is the same object's (or space's) history; the page
  recommends nothing from elsewhere.
- **The way back** (criterion 5). Feed cards now carry `?from=` to their feed
  view, as the directory's always did. The entry page's back link then reads
  "Стрічка" and returns to that view, or "Журнали" and the directory view. It
  is read after hydration (the page is a static document); the canonical
  address is untouched.
- **Photographs** (criterion 6). A portrait cover stands at its own shape
  instead of a 16:9 strip. The gallery's photographs keep theirs instead of
  a 4:3 crop. Media, the author, the object and the owner's menu are
  separate links.

## Proof

`tests/entry-reading.spec.ts` (new, registered in the gate), against
`next start` and the local database. The fixture is an entry with a public
author, three earlier entries of the same object, a signed-in member, and
one publication through the real ingress to expire the listings' caches.

1. **Reading order** at 1440, 390 and 320:
   - one `h1`;
   - the byline's accessible name, then byline < context < title;
   - "Рослина" in the context;
   - no sideways scroll, axe clean at 320;
   - one related section: the previous entry once in the chronology, each
     earlier entry linked once.
2. **One row, in tab order:** Like → Save → Коментувати → Поділитися, and
   Enter on Коментувати lands on the composer.
3. **Share:**
   - the device's sheet receives `{ title, url }` with the canonical address,
     although the page was opened with `?from=…&cursor=…`;
   - without a sheet, the clipboard holds the canonical address and the status
     says it was copied.
4. **A member's comment** (390):
   - the connection is dropped for the one Server Action request: the words
     stay in the field, the reason is shown, the page is still the entry, and
     the database has **no** comment;
   - a double press then posts **one** comment; it appears in the thread and
     the field empties.
5. **Like and save:**
   - a dropped connection brings the button back unpressed with the reason;
   - a double press is one like, still pressed 1.5 s later, with one row for
     the member;
   - save's double press leaves one active bookmark.
6. **A guest and the document:**
   - the guest's comment trigger leads to sign-in;
   - the served HTML holds the title, the byline, the engagement bar and the
     intent form, and no share control.
7. **The way back:** `?from=/?kind=plant` reads "Стрічка" and links
   `/?kind=plant`; `?from=/journals?topic=…` reads "Журнали" and links that
   view. The canonical link is the entry's own path.
8. **The directory's card and the page** show the same observation date and
   the same author.

The whole local gate, on the build before the back-link change: 262 passed
and 1 skipped. Its one failure was `entry-addresses`, which asserted the old
`<main lang="bg">`. It now asserts the amended D11 — the title and the story
in the entry's language, `<main>` in the reader's — and passes. On the final
build these were rerun green: `entry-reading` 8/8, `entry-addresses`,
`public-feed-cards` 7/7, `journal-entry` 6/6 and `static-documents` 18/18.

Unit:
- `public-journal-entry.test.tsx` (10): the order, the publication date,
  `lang` scope, one related section with each entry once, the gallery's
  portrait at its own shape.
- `public-engagement-panel.test.tsx` (11): the row, the reply target,
  localized deleted and reported states.
- `comment-form.test.tsx` (6): words kept on a refusal and on a lost request,
  emptied only after success, typing after a success, one request per double
  press, the reply target, and the like control coming back as the server
  had it.
- `share-control.test.tsx` (4): sheet, closed sheet, copy, failed copy.
- `directory-return-link.test.tsx`: the feed return target.

### Screenshots (`docs/redesign/2026-09-21/ove-493/`)

`entry-uk-1440`, `entry-uk-390`, `entry-uk-320`,
`entry-uk-390-comment-dropped`.

## Not claimed

- **New reaction types.** Like remains the only one.
- **Moderation workflows.** They are OVE-500's; this task only makes their
  states readable.
- **A real screen-reader session** (OVE-478).
