# Activity and reminders — OVE-501

The exact tested and merged commits, CI runs and the production check are in
the authenticated Linear receipt.

## What changed

- **Every row says what happened, what it is about, and where it came from**
  (criterion 1; OG-UX-022; DESIGN.md §5.22).
  - A reminder names the plant or animal, its kind, its space and its
    organism, read the way the garden list reads them
    (`buildNotificationObjectSubjectsQuery`: the space joined on its owner,
    the catalogue's active public identity only).
  - A comment names the entry («…»). When the entry is the reader's own, it
    also names the plant and space. A reply under somebody else's entry names
    that entry and nothing of theirs.
  - Follows, claims and questions name the reader's plant and its space.
  - The meta line starts with where the row came from: "Від @handle, @handle
    та ще N" for what other gardeners did, "Нагадування" for the optional
    reminder.
  - No backend produces a notice from OverGarden itself. The chip that said
    «Системні» held only the journaling reminders, and it now says
    «Нагадування». The filter is `?filter=reminders`, and an old
    `?filter=system` link still lands on it. The stored kind stays `system`,
    because it is hashed into every reminder's receipt key: renaming it would
    bring back every reminder a reader had read or dismissed.
- **Repeated rows are told apart.** A row that would read the same as another
  climbs one level at a time, each saying a little more: the variety, then the
  day each was added, then the minute. The title link is `aria-describedby`
  its two lines, so a keyboard reader hears the where and the when. Each
  control's accessible name carries its row:
  "Позначити прочитаним: Нагадування про запис · Томат · Рослина · Балкон ·
  додано …".
- **A reminder states a fact** (criterion 3). It says "Останній запис: 3 тижні
  тому" (a `<time>` with the date) or "Ще без записів". The copy that said
  «Час додати новий запис до журналу» is gone. A reminder's time is now when
  its rule began to hold: two weeks after the newest entry, or when an object
  with none was added. It used to be the object's `updated_at`, so renaming a
  plant dated its reminder today. The unused "needs attention" and "due" copy
  (`attention`, `objectState`, `workspace.nextAction`, `summary.dueInView`) is
  deleted from `garden-workspace-copy.ts`. No reminder rule, frequency or
  health claim changed.
- **Write opens the composer for exactly that plant, in one activation**
  (criterion 2).
  - The link is `/garden/new?object={id}&returnTo=/notifications…#notification-{key}`,
    and Close returns to the row.
  - A plant deleted since the list was drawn opens the composer with «Рослини
    чи тварини з цього посилання немає у вашому саду — можливо, її видалили»
    and the picker. The same applies to a space, and to a destination that
    could not be read.
  - Signing in keeps the plant and the way back. The return-path guard
    (`internal-return-path.ts`) refuses an encoded `/` anywhere in an address,
    and the composer built its sign-in return with `URLSearchParams`, which
    encodes every one. So a guest's sign-in from a reminder, or from a
    community, used to come back to an empty composer. The composer now keeps
    those slashes literal.
  - A guest on Activity signs in and returns to the same view, filters and
    all.
- **The count is the receipts** (criterion 4).
  - The header says "Непрочитані: N", where N is the number of unread
    events, never rows.
  - A grouped row carries how many of its events are unread and everyone who
    acted.
  - A row groups only events that say the same thing about the same target
    and lead to the same place. Every reminder is about one plant, so no two
    reminders share a row.
  - The garden's rail used to count lineage events with no receipts at all,
    so its number never went down and never matched this page. It now shows
    this page's count (`countUnreadNotifications`), and "—" when the count
    could not be read.
  - A row's receipts are one bounded upsert (`updateNotificationReceipts`,
    `statement_timeout` 3 s). They used to be one statement per event outside
    a transaction.
  - A refused write is said beside its row. Nothing on the page changes until
    the write succeeds, and the row's own button is the retry. The receipt and
    preference routes answer with a relative `Location`. An absolute one,
    built from `request.url`, sent the reader to another host and away from
    their session cookie; `auth/intent/resume` fixed the same defect in
    `OVE-504`.
- **The preferences are their own page** (criterion 5).
  - `/notifications/settings` sits under Activity, which stays the selected
    destination. It has two groups: what other gardeners did, and the
    reminders with the rule that makes one ("без записів за останні два
    тижні", optional).
  - Saving answers `?saved=1` or `?saved=failed`, and a failure used to be an
    error page.
  - The route policy `public-notification-settings` is what makes the
    unprefixed address rewrite to the reader's locale. Without it the
    `(default)/notifications/[...missing]` catch-all answered 404.
- **Settled reads, empty, error and retry states** (criterion 5).
  - Both pages read the viewer through `resolveWorkspaceViewer`: an unreadable
    session is a failure, not "sign in".
  - Both pages settle their one read. A failure is `WorkspaceSectionError`
    with a retry of the same view; the filters stay, and nothing reads as
    empty.
  - The list keeps its two empty states: nothing yet, or nothing under these
    filters.
  - Rows are the shared `ListRow`, which gained `linkProps` for
    `aria-describedby`, and every icon is Phosphor.
- The personal layout (`MySocialLayout`) gained header actions for the
  settings link, and its count carries `data-my-social-count`.

## Proof

**`tests/notification-activity.spec.ts`** (9/9), in the gate, against
`next start` and the local database. One ordinary member, with no owner
rights, has four plants called «Томат»: two on «Балкон» and two in
«Теплиця», none written about in two weeks. Two other gardeners comment on
the member's basil, and one follows the member.
1. Seven unread: four reminder rows, one comment row "(2)" and one follow.
   - The four reminders have four distinct identity lines and four distinct
     Write names, and they cover exactly the four object ids. Each names its
     space and "додано …".
   - One says "Останній запис: 4 тижні тому" with the date 25 days ago; three
     say "Ще без записів".
   - No row says «Час додати», «уваги» or «Системні».
   - The comment row names «Базилік на підвіконні» · Базилік · Балкон and
     both commenters, newest first.
   - The row link's description reads its identity and its origin.
   - Axe is clean at 1440 px and 375 px, with no sideways scroll.
2. Write of one greenhouse tomato:
   - its Write opens `/garden/new?object={that id}`, and Cancel returns to
     `/notifications#notification-{key}`;
   - the other twin's Write opens the composer with «Томат» · «Теплиця» and no
     picker, and Publish lands on `/garden/objects/{that id}`;
   - the database's newest entry belongs to that tomato, not to its twin;
   - its reminder leaves the list, and the count goes from 7 to 6.
3. A balcony tomato is deleted after the list was drawn. Its Write opens the
   composer with the reason and the picker, and back on Activity its reminder
   is gone (count 5).
4. A trigger refuses the member's receipt writes.
   - "Позначити прочитаним" on the comment row answers `receipt=failed`: the
     row says «Не вдалося зберегти, нічого не змінилося. Спробуйте ще раз.»,
     stays unread, the count stays 5, and no receipt exists.
   - With the trigger dropped, the row's own button reads it: «Позначено
     прочитаним.», and the count falls by exactly the row's two events, to 3.
   - The header equals the sum of the rows' unread counts, and the garden's
     rail says «Події 3».
5. Another member posts the member's reminder key as `dismissed`: 303, the
   member's row is still there, the count is still 3, and no receipt of the
   member's exists for it.
6. The settings link opens `/notifications/settings`, with Activity still
   `aria-current`.
   - The page shows two legends and the reminder rule. Axe is clean at
     1440 px and 375 px.
   - Unchecking «Нагадування про записи» saves with «Налаштування
     збережено.».
   - Activity then has no reminder rows and counts 1, the sum of the rows.
   - Turning reminders back on brings back two rows and a count of 3.
7. A guest:
   - the composer's sign-in keeps `next=/garden/new?object={id}&returnTo=/notifications`;
   - Activity's sign-in keeps `next=/notifications?filter=reminders`;
   - signing in on the screen lands on that filtered view.
8. Bulgarian at 1440 px and Russian at 375 px: «Известия» and «События», the
   reminder origin, the identity «Томат · Растение · Балкон», the last entry,
   the Write name, and the settings title.
9. Before the bundle runs, every form on both pages has a real endpoint, and
   at least one posts. With scripts off the list itself stays behind its
   loading frame, as every streamed personal page does.

**`pnpm prove:notification-activity-failure`**
(`ove-501/notification-activity-failure-receipt.json`) is a hard load while
`notification_preferences` is locked:
- `/notifications?filter=reminders` and `/notifications/settings` answer 200
  with their title, `data-section-failure="query_timeout"`, a retry of the
  same view, and no skeleton;
- after the lock is released, the retry shows the reminder and the form;
- the garden's rail says «Події—» during the failure and «Події1» after.
The proof is not in the gate, because a table lock would stall the other
worker.

Screenshots are in `ove-501/`: Activity in UK at 1440 and 375, in BG at 1440
and in RU at 375; the refused receipt; the composer from a reminder; the
composer for a deleted plant; the settings page, and its saved state at 375;
and the guest.

Unit tests cover what a browser cannot set up: two twins added on the same day
(the minute tells them apart), the receipt route's relative `Location` for
every outcome, the unread view's anchor (a row read there has left it), a
failed or timed-out read on both pages, the composer's notice for a missing
object, space or unreadable destination, and a guest's composer `next` passing
the return-path guard.

## Defects the browser found

- **A receipt's redirect left the reader's origin.** `request.url` named
  `localhost` while the reader was on `127.0.0.1`, so the page after "mark
  read" was signed out. A relative `Location` fixes it, as it did for
  `OVE-504`.
- **A guest's sign-in from the composer lost the plant.** Encoded slashes in
  `returnTo` made the return-path guard throw the address away. This also
  affected the community composer from `OVE-500`.
- **Screenshots and scans taken before the reveal.** The list replaces its
  loading frame about half a second after `load`. A count of rows passes
  while the rows are still hidden, so the spec waits for them to be visible.
