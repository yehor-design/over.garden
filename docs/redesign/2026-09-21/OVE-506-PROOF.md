# Catalogue curation and sources as work queues — OVE-506

The exact tested and merged commits, CI runs and the production check are in
the authenticated Linear receipt.

## What changed

- **Decisions and diagnostics, apart** (criterion 1; OG-UX-038/039/040;
  DESIGN.md §5.12).
  - `/garden/catalog/queue` is decisions:
    - the one on screen is in a detail pane;
    - the open decisions are a table (`catalog-work-table.tsx`). Each row has
      what it is, why in words, its state, its impact and one review link;
    - the week's automatic decisions are a table with Undo.
  - `/garden/catalog/sources` is diagnostics:
    - the sources, with freshness and coverage;
    - whether picking works;
    - what gardeners could not find;
    - how often an automatic decision was taken back;
    - what no card can hold.
  - The oldest open decision's age moved to the queue's summary line, where
    it concerns the work.
- **The detail pane draws a decision by its kind.**
  - A gardener's label and the card it would join.
  - The card a merge folds away and the one it folds into.
  - A source and the card it would vouch for.
  - A split: the one card under review, with the way to it.
  - The pane lists the reasons in words with each rule's code beneath. The
    table's narrow cell shows only the words, because a forty-letter code
    broke into a column of fragments.
- **Accept only where it can succeed.** The queue reads each open item's
  block from the same preconditions `catalog_apply_queue_item` refuses on
  (`CURATION_BLOCK_SQL`). The page used to offer Accept on all of these, and
  every press ended on the error page:
  - no target — a search miss the owner queued, or a merge without a
    survivor;
  - a retired target;
  - a split.
  Such an item now says why and offers Reject and Skip.
- **Every answer is read back** (criterion 6).
  - Accept, Reject, Skip and Undo redirect to the view they were pressed in,
    to the next decision (`queue/actions.ts`, `lib/catalog/curation-queue.ts`).
    The notice names the item and reads its state from the record:
    - `accepted`, `rejected`, `skipped`, `reverted`;
    - `stale` — already decided in another tab; nothing is written;
    - `confirm` — the merge now moves more than fifty objects and asks again;
    - `failed` — the same item stays on screen to retry;
    - `denied` — nothing is written.
  - The notice says only what the record bears out
    (`queueOutcomeFromRecord`, `automaticOutcomeFromRecord`). A "failed" over
    an item the database holds as decided reads as already decided, and a
    claimed decision the record does not show is not repeated.
  - A decision whose answer was lost after it committed (a dropped connection)
    is recognised on the retry: decided by this owner in the last two minutes
    is their decision, not "already decided". This holds for Accept, Reject,
    Skip and Undo.
  - A decision asked for by name below the twenty the table lists is read on
    its own and shown, with no position claimed. A queued search miss sits at
    impact 1, and its link used to open the top item instead.
  - The merge confirmation now counts the objects on the item's own subject,
    read from the database, rather than on a form field.
  - Refresh and "to the queue" answer the same way. A queued miss links to
    its new item in the queue.
  - No mutation's meaning changed: the same SQL functions and the same
    idempotent enqueue.
- **A figure carries its sample** (criterion 4, OG-UX-039).
  - Median, P95 and shares show the number of measurements and the window's
    dates.
  - A median is printed from five measurements, a P95 from twenty, and a
    percentage from five attempts (`lib/catalog/pick-latency.ts`). Below
    that the cell says «Замало вимірів: 1 з 20».
  - Durations are seconds, not milliseconds.
  - Rule codes are named in words.
  - No count follows a preposition: «29,7 с · 21 вимір» and «Прив'язано до
    карток: 1 з 3 (33%)». The earlier «з 21 вимір» / «1 з 3 записи» wanted
    the genitive in UK and RU.
- **Precision counts a revert.** The owner's revert is written with
  `automatic = false`, so the old statement counted automatic revert rows and
  every rule read 0 reverted. A revert is now counted on the decision it undid
  (`reverted_by_action_id`), grouped by the rule code the apply function
  recorded.
- **A read fails in its own part** (criterion 3, OG-UX-038).
  - The source list is cheap and read first: newest imported snapshot, a newer
    rejected one reported beside it, and the refresh job found by its
    idempotency key.
  - Each source's counts are their own read. A slow source fails in its own
    cell, with a retry, while its snapshot date and refresh state stay on
    screen. The retry is the page itself, not an anchor on it: before
    hydration an anchor on the same page only scrolls, and reads nothing
    again.
  - The refresh state is dated by the job row's `updated_at`. The row is
    reused by every press under one idempotency key, so its creation date was
    the first-ever refresh.
  - The linked share counts records that reached a card, not links: after a
    merge one record can hold two links.
  - Every other block, and the queue's two parts, are one settled read each.
  - Each part says when it was read.
- **An outage is not a refusal** (criterion 2).
  - A role table that could not be read says «Не вдалося перевірити доступ»
    with a retry. It used to say «Доступ заборонено».
  - A member sees «Лише для власника каталогу» and no way to the other owner
    page. Nothing of either page is read for them.
  - Access is still the server's owner check (`operator:read` to see,
    `operator:mutate` to act); no admin or health page was added.
- **Keyboard and phone** (criterion 5).
  - Every row's action is reachable by Tab. The keys Y/N/J/K/U are printed
    from the array that binds them.
  - Single-letter keys can be switched off (WCAG 2.1.4); the choice is
    remembered in the browser, and a held key decides once.
  - Below `md` the same tables are labelled blocks, with explicit roles so the
    table semantics survive and nothing is rendered twice.
  - Long names and identifiers wrap (`wrap-anywhere`) rather than widen the
    page.
- **No context rail** beside either queue (OG-UX-040): neither page registers
  one, so the generic "keep reading" column is gone.
- Both routes have their own `loading.tsx`, the same shell as the page.

## Proof

**`tests/owner-catalog-curation.spec.ts`** (4/4, in the gate) runs against
`next start` and the local database, as the sealed owner. The tests are in
the same file as the existing decision-stream proof, because the queue is one
for the whole catalogue and a parallel file would move its "highest impact
first". That proof's merge fixture now names its survivor the way every
producer does; it used to name a shape the function refuses.

1. The queue, with four decisions of four shapes:
   - the table rows carry identity, the reason in words (the code only in the
     pane), the state, impact and a review link;
   - no context rail; axe is clean at 1440 and 375 px;
   - **the keyboard walk** (`ove-506/queue-keyboard-walk.json`): 25 stops from
     the top — skip link, shell, filters, the card, Accept, Reject, Skip, the
     key switch, Next, then one review link per row, each named by its item;
     every stop draws a visible 2 px ring;
   - Tab to a row's review link, then Enter: the search miss opens with no
     Accept and says why, and Y decides nothing;
   - keys switched off: N decides nothing, and the choice survives a reload;
     switched on, one N rejects it, the notice names it, and focus is on the
     notice;
   - one Y accepts the ready label: the owner's two objects gain the card and
     keep their words;
   - a split offers the way to its card;
   - a Skip form captured before the item was rejected in another view is
     posted: `303 … result=stale`, nothing written, and the page says it was
     already decided;
   - at 375 px the rows are labelled blocks, there is no sideways scroll, and
     a 60-character identifier ends inside the viewport;
   - BG and RU titles and headers.
2. The sources:
   - a source with an imported snapshot, a newer rejected one, three records
     (one linked) and a pending refresh shows its snapshot date, the
     rejected-after badge, the refresh state, «3 записи» and «Прив'язано до
     карток: 1 з 3 (33%)»;
   - every median and P95 cell's status matches the database's sample at the
     thresholds, and an insufficient one reads «Замало вимірів: n з N»;
   - a reverted automatic merge counts as reverted under its rule's name;
   - with twenty-one higher-impact decisions already open, one press queues a
     search miss; the notice names it and links to the new item, which opens
     on its own with no Accept and no position;
   - Refresh answers «Оновлення поставлено в чергу»;
   - axe is clean at 1440 and 375 px, with no sideways scroll.
3. An ordinary member:
   - on both pages: `denied`, «Лише для власника каталогу», no cross link,
     and none of the owner's markers, labels or sources in the HTML;
   - the owner's Accept form posted with the member's session writes nothing:
     the item stays open and the objects stay free text.

**`pnpm catalog:health:prove-database`** (CI) builds a disposable database
from every migration. Receipt fields:
- `queueItemsMarked: 6`;
- `blockedItemsRefusedByTheFunction: 4` — every item marked blocked is
  refused by `catalog_apply_queue_item` and stays open, and the appliable one
  applies;
- `precisionCountsARevert`;
- `rejectionReportsNoChangeTheSecondTime`;
- `sourceUsesItsImportedSnapshot`;
- `sourceRefreshFoundByItsKey: pending`;
- `sourceCoverage: 3 records, 1 linked` — with that one record linked to two
  cards;
- `weekTimedPicks: 6`.

**`pnpm prove:catalog-queues-failure`**
(`ove-506/catalog-queues-failure-receipt.json`) hard-loads each page under an
ACCESS EXCLUSIVE lock on one table. Every page answers 200 with no skeleton
left, and after release the retry shows the content:
- `catalog_source_records`:
  - both sources' counts fail in their cells (`query_timeout`), each with a
    retry that reloads the page;
  - every source still shows its snapshot date and refresh state;
  - the pick figures, misses, precision and unplaced records all read.
- `catalog_curation_actions`: only the automatic decisions fail; the open
  decisions read.
- `catalog_curation_queue`: only the open decisions fail; the automatic
  decisions read.

Unit tests: 848 across the catalogue suites (24 files); the full suite has
5,170 passed and 29 skipped, and every repository guard passes.
- The page tests (30 and 36) cover:
  - every access state;
  - each part failing alone;
  - the one-attempt window, which never prints its milliseconds;
  - the blocked, confirm and grant rules;
  - outcome notices read back, and a queued miss whose item cannot be read,
    which says nothing.
- The action tests (40 and 23) cover the exact redirect for every result.
  They include a decision or undo whose follow-up read failed after the
  function committed: it is recognised as this owner's own, not reported as
  "already decided".
- `lib/catalog/curation-queue.test.ts`, `lib/catalog/pick-latency.test.ts`
  (including 59 960 ms as "1 хв") and `lib/operator-catalog-copy.test.ts`
  (identical keys and placeholders in UK/BG/RU, plural forms, rule names).
- `catalog-work-table.test.tsx`: caption, explicit roles, `scope`, one
  `aria-current`, `aria-hidden` phone labels.
- The repository statements.
- The two new loading frames in `route-states.test.tsx`: each claims
  `checking`, not `allowed`, and offers no way to the other owner page.

Screenshots in `ove-506/`: the queue at 1440 and 375, the sources at 1440 and
375, and the three failure states.

## Defects the proof and the review found

- **Accept on items the function refuses.** A queued search miss has no card
  to attach to, and `catalog_apply_queue_item` raises on it — as it does on a
  split and on a merge without a survivor. The page offered Accept on all
  three, and the press ended on the error page.
- **Precision never saw a revert.** See above; the database proof fails on the
  old statement.
- **The first 375 px screenshot was the skeleton.** Every assertion had
  passed against content still in the hidden streamed segment. The spec now
  waits for the revealed decision before measuring, scanning or shooting.
- **The loading frames said `allowed`.** A test waiting for the owner check's
  answer could read the frame's attribute first, and a member briefly saw the
  way to the other owner page. They now say `checking`.
- **A committed decision could be reported as stale.** `applyCatalogQueueItem`
  is two statements. If the read after the apply failed, the owner was told
  their own decision had been made elsewhere. The answer now recognises an
  item decided by this owner in the last two minutes; undo does the same from
  the revert's own row.
- **A queued miss's link opened another decision.** Below the listed twenty
  the page fell back to the top item, with a live Accept.
- **A repeated refresh was dated by the first one.**
- **The per-source retry reloaded nothing without JavaScript.**
- **The accessible name of «У чергу рішень» did not contain its label**
  (WCAG 2.5.3); it read «Додати в чергу рішень: …».
