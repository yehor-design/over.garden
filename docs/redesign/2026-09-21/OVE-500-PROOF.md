# Communities and moderation — OVE-500

The exact tested and merged commits, CI runs and the production check are in
the authenticated Linear receipt.

## What changed

- **A community says what it is and how to take part** (criteria 1 and 3;
  DESIGN.md §5.21).
  - The header carries the eyebrow "Спільнота", the name and description,
    what members do there, the topic it files under (a link to the topic in
    the reader's language), what it holds, and two actions: join and "Додати
    запис".
  - The directory card names the topic when it is not the community's own
    name said twice, and says whether the community is open for new entries.
  - The rail is this community's: its topic, the step that adds an entry, its
    rules, who writes there, and other communities when there are some. The
    generic "Пов'язані знання" is gone (OG-UX-040).
  - A failed directory read now empties only the rail's other communities.
    Before, it took the whole community page down with it.
- **Adding an entry is one step, the community's own** (criterion 2;
  OG-UX-035). `#community-contribute` is on every open community, for every
  reader:
  - a guest presses "Увійти, щоб додати запис". The new `contribute` sign-in
    intent brings them back to this step with the next control focused;
  - a signed-in reader who is not a member joins in the step, and comes back
    to the same step;
  - a member picks one of their published entries, or writes one.
  - "Написати запис для спільноти" opens the one composer as
    `/garden/new?community=…&returnTo=…`:
    - a banner names the community;
    - the destination picker offers plants and animals only, the entries a
      community takes;
    - Publish returns to the step with the new entry offered first
      (`?contribute=`), and adding it is the member's own press;
    - Close returns to the community;
    - signing in keeps the query;
    - a writer with nothing to write about adds a plant or animal and comes
      straight back to the composer, the community still named.
  - Nothing is cross-posted and nothing new is created. The entry keeps its
    one address; the contribution is the existing reference to it.
  - The first-run action goes to this step, not to `/garden/new`.
- **Refusals say which rule refused** (criterion 6). The repository throws a
  typed `CommunityMutationError`. The step says, in the reader's language:
  - not a member;
  - banned;
  - the community is closed;
  - not an entry a community takes;
  - the entry is already there;
  - a moderator removed the entry from this community;
  - no such community.
  "Unavailable", with a retry, is left for failures that are not a rule. A
  refused entry stays chosen.
- **Only what the server allows is offered.** A reader's own entry shows
  "Ваш запис", not a report and a block the server refuses. A closed
  community has no step.
- **Discussions** (criteria 4 and 6).
  - A discussion is titled after its entry ("Обговорення: …") and its
    canonical is its own address; it stays `noindex`.
  - The entry under discussion is the community's readable post
    (`EntryCard`), not a one-line row.
  - A removed or withdrawn discussion is a page that says so, with the
    community one press away, instead of a bare not-found page.
- **Moderation is pages of the workspace** (criteria 5 and 7–12).
  - `/account/communities` lists every community the reader may moderate:
    all of them for the owner, the assigned ones for a community moderator
    (`listModeratedCommunities`). It used to be one hard-coded card.
  - One rule decides access: an active assignment to the community, or the
    owner's `operator:mutate`. The pages, the public page's link and every
    mutation ask it. The operator-only pre-check that refused a moderator the
    server would let act is gone.
  - A community has two sections, "Скарги" and "Прийом записів"
    (`/settings`, new).
  - The reports have a filter, open or resolved, with counts.
  - Each report shows the entry's title and opening, its author, what it is
    about, the reason in words, the report's state and dates, and the
    record's state now. The reporter is never shown.
  - The decisions are labelled by what they change. Removal and a ban
    confirm first and name what they take. Closing the community to new
    entries confirms first too.
  - `SubmitButton` and `ConfirmSubmit` refuse a second press while one is on
    its way.
  - An action returns to the same view and report. Its outcome is read back
    from the record: in the report's card, or above the list when the report
    left the view. The outcomes are "Збережено" with the state now, "Нічого
    не змінено", "Немає доступу", or a failure that changed nothing and is
    safe to retry.
  - Comment reports show the comment while it is shown, its author and the
    page it is on (`place`), with review, dismiss and a confirmed removal.
  - The copy moved to `lib/moderation-copy.ts`. "Fail-closed панель", "шлюз
    участі", "канонічний журнал" and enum reasons are gone.
  - Every read is settled (the settled-read gate now covers these routes).
    Each page has a `loading.tsx`, a `WorkspaceSectionError` with a retry,
    sign-in and no-access states, and Phosphor icons.

## Proof

Two new browser specs in the gate, against `next start` and the local
database:

**`tests/community-contribution.spec.ts`** (5/5):
1. UK, BG and RU at 320 px (the reflow width) and 1280 px:
   - the identity block;
   - the topic link in the page's language;
   - the header's "Додати запис" pointing at the step, and the step's
     heading;
   - no sideways scroll;
   - axe clean on every 320 px scan and the UK 1280 px scan.
2. A guest presses the header's "Додати запис" and then the step's sign-in.
   - The sign-in screen says "Увійдіть, щоб додати свій запис до спільноти".
   - Signing in returns to `/communities/{slug}?authIntent=contribute…`,
     with Join focused.
   - Enter joins, and the step says so and offers to write for the community
     (`/garden/new?community=…`).
   - The membership is active in the database.
3. A member with one plant and nothing published:
   - "Написати запис для спільноти" opens the composer with the community
     named;
   - the picker, asked "Ба", offers only the plant, never the space "Балкон";
   - Publish returns to the step with the new entry selected, and nothing is
     added yet;
   - one press of "Додати до спільноти" adds it.
   - The database holds exactly one contribution, to this community, of that
     entry, which belongs to that plant. The member still has one object and
     one space. Axe is clean on the composer.
4. A forged contribution: another gardener posts the member's form with
   their own entry.
   - Not a member: `contributeAction=not_member`, nothing written.
   - Banned: `contributeAction=banned`, nothing written, and the step says
     so in words.
5. A discussion, in Bulgarian:
   - from the community, its page carries the post and the title
     "Обсъждане: …", and Back returns to the community;
   - once removed, the same address says "Това обсъждане не е достъпно" and
     links back.

**`tests/community-moderation.spec.ts`** (7/7):
1. On all four owner pages, a guest gets `sign-in-required` and an ordinary
   member gets `denied`. Neither response contains a title, an excerpt, a
   comment or the queue marker.
2. The owner:
   - sees the community with "Відкритих скарг: 2" and opens it;
   - reads the report: title, "Не за темою", the author, "Кури (тварина)",
     the excerpt and the state;
   - reaches "Прибрати запис зі спільноти" by Tab, and Enter asks the named
     question;
   - Escape closes the dialog, returns focus, and changes nothing;
   - Enter and "Прибрати" then remove the entry.
   The card says "Збережено … запис прибрано зі спільноти". The database
   shows the contribution removed by the owner and one audit row. The other
   report is still listed.
3. A double press of "Закрити обговорення" is one change and one audit row.
   Replaying a dismiss form after the report is decided answers
   `result=stale`, and the page says "Нічого не змінено" above the list, in
   the open view. In the resolved view, "Відкрити обговорення" returns to the
   resolved view.
4. A member replays the owner's ban form with their own session. The result
   is `result=denied`: the author is still a member, and there is no audit
   row by the member.
5. Closing the community to new entries asks first and says what it does.
   The database shows `closed`, and the public page drops the step and shows
   the closed notice. Reopening restores `open`.
6. A comment report shows the comment, its author, and "Коментар в
   обговоренні спільноти" linked to its discussion. Removal asks first, then
   the comment is removed in the database.
7. At 320 px, the reflow width: the list, the open and resolved queues, the
   settings and the comments in UK; the resolved queue and settings in BG;
   the resolved queue and comments in RU. Each page is in the reader's
   language, has no sideways scroll, and axe finds nothing.

**Hard-load failure**
(`scripts/prove-community-moderation-partial-failure.ts`, run alone; receipt
in `docs/redesign/2026-09-21/ove-500/`). A second connection held an ACCESS
EXCLUSIVE lock on the table each page reads. Each page is a hard load, the
case a postponed boundary can leave on its skeleton for ever (ADR-0023):
- `/account/communities` and `/account/communities/{slug}`, with
  `community_contribution_reports` locked: 200, the frame and its two tabs,
  `query_timeout` named with a retry of the same address, and no skeleton.
  After the lock was released, the retry showed the community and the report.
- `/account/moderation/comments`, with `engagement_comment_reports` locked:
  the same result.
- `passed: true`.

The whole local browser gate ran on the production build
(`scripts/run-browser-gate.ts`, 364 tests), before the review fixes below
and again on the final build: 363 passed, 1 skipped and 0 failed both times.
Both new specs passed inside it.

Review found three defects, now fixed; the four specs they touch
(`community-moderation`, `community-contribution`, `consent-and-erasure`,
`communities`) were run again on the rebuilt app and passed:
- **`ConfirmSubmit` forgot it was pending when its own dialog closed.**
  React re-renders a component that reads the form's status when state
  beside it changes, and then reads the status as idle (react-dom 19.2). A
  second press of the trigger asked again, and a second Confirm posted
  again. The trigger now holds no state and the dialog reads no status.
- **A failed role read said "no access".** The owner's `operator:mutate`
  check now answers no only for a real refusal, so a moderation page says
  "unavailable, retry" and an action "failed". On the public page the same
  failure only hides the moderation link.
- **An entry a moderator removed was refused as "already here".** It now
  says the moderator removed it (`contributeAction=removed`).

Unit: the full suite (4,769 passed, 29 skipped), type check, lint and every
guard pass. The settled-read gate now covers `/account/communities/**` and
`/account/moderation/**`. The owner-form guard now lists the moderation parts
and the settings page. New and updated tests cover:
- the repository's refusals, queue views, counts, report readback, the
  moderated list and the role-read failure, with a scripted database for the
  order of reads;
- the comment queue's text-only-while-shown rule;
- the `contribute` intent;
- every action's wording and redirect, and the owner pages' access states,
  content and outcomes;
- the composer's community banner;
- `SubmitButton`, and `ConfirmSubmit` pending through its own dialog closing.

Two sub-agents wrote most of the updated unit tests, in parallel with the
browser work, to the source written here. Their review of that source found
the three defects above and the settings and comment outcome wording, which
now reads "Зараз: спільнота приймає нових учасників і записи." and "Зараз:
коментар прибрано з публічної сторінки; скарга: вжито заходів."

Before and after screenshots are in `docs/redesign/2026-09-21/ove-500/`
(`before-*` from the build of `main`, `after-*` from this build, with the same
seeded community, report and comment).

## Left as it is

- **Comment counts** are not shown on a community's entries: the product
  counts comments nowhere else, and one list would be the only place.
- **The discussion page has no rail.** Its breadcrumb and "До спільноти"
  lead back.
- **A community moderator assignment has no management page.** Assignments
  are rows the owner writes. Criterion 5 asks for moderation in the account,
  not an admin panel.
