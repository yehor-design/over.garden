# Consent, privacy and erasure — OVE-505

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **One consent question, never in the way** (criteria 1, 2, 6; OG-UX-044).
  - The notice asks one question: who measures and which pages. It names only
    the tools this deployment runs — Microsoft only where Clarity is
    configured, which production is not — and links to the privacy page's
    choices. It used to be two sentences naming both tools in every build.
  - Its two answers are the same `secondary` button, side by side at every
    width. It is a named region, not a dialog, and on every page until
    answered (ADR-0032 D7), unchanged.
  - Shorter by 60 px at 320 px in every language. With the tab bar it now
    covers 31% of a 320 × 640 screen in Ukrainian and Russian (was 42%) and
    37% in Bulgarian (was 48%); at 200% zoom 32% (was 43%) and 36% (was 52%).
  - Consent storage, the measured paths and the tags' own gating are
    unchanged.
- **The bottom of the screen is one number** (criterion 2; DESIGN.md §2.11).
  - `--bottom-chrome-height` on `<html>` is the tab bar where it is drawn (its
    row, border and the device's bottom inset, from whether the bar is in the
    document) plus the consent question's measured height. The notice
    measures itself (`useNoticeHeightOnRoot`, `lib/consent-notice-room.ts`)
    because it is as tall as its text: the fixed guesses it replaces were 14 px
    short at 320 px in Ukrainian and 52 px short in Bulgarian.
  - Focus scrolls clear of it (`scroll-padding-bottom`). **This was broken for
    the tab bar too, answered or not**: at 320 × 640 focused links sat 5–44 px
    under the bar on `/journals`, `/` and `/support`, and with the notice the
    search field, its button, the sort select and two filters on `/journals`
    were left beneath it.
  - Rows that stick to the bottom sit on top of it (`above-bottom-chrome`):
    a setup flow opened at 320 px with its "Далі" under the tab bar (12 px of
    it showing), and the composer's publish row stuck 8 px from the bottom,
    under the bar.
  - The page ends with the notice's room (the spacer after the shell), so the
    last row can be scrolled above it.
  - The Meta marketing question, when a deployment has one, waits for the
    analytics answer and then takes the same place and room.
  - **A setup step opens at the top** (`openStep`, space and object setup).
    The first full gate after the reservation found both flows at 320 px
    leaving an answered step's "Змінити" 88% under the sticky header — 79 ×
    11.5 px of it pressable — once "Далі" no longer hid under the tab bar and
    the page stopped scrolling past it. Focus had only ever scrolled as far as
    it had to, so where a new question landed depended on the last click. It
    now focuses the question without scrolling and brings the step to just
    below the header: its fields are in view and the answered steps are wholly
    above it or out of view.
- **Trust pages lead with what the reader gets** (criterion 3; OG-UX-004).
  - Privacy: what becomes public, what is kept and for how long, the reader's
    choices (`#privacy-choices`, where the notice links), where to write, and
    only then "About this text" — the founder-approved status, the pending
    legal review, the versions. The analytics and marketing choices say the
    answer in words, announce a change, and keep the storage key in a
    disclosure.
  - Support: where to go for what, including that one entry is deleted in the
    garden, then "About this text". The first-publication page: what
    publishing means, then its version and status. Its versioned lines are
    unchanged.
  - "MVP" left every heading, title and top-of-page description. The status
    that said it is stated where each page ends.
- **Erasure, as a member asks for it** (criteria 4, 5; OG-UX-037).
  - Where their request stands comes first: its state in words, when it was
    sent, its reference, and what happens next.
  - Three things are told apart before anything is asked: one entry (deleted
    in the garden, no request), the account and all that hangs from it (the
    request), and copies outside OverGarden (removed only as far as possible).
  - What is deleted, what survives and how long an address answers come
    before the form. The form's card is named for the request, not "Request
    status", and the intro says sending deletes nothing. These sentences are
    the privacy promise set, unchanged and in the order a reader meets them.
  - Sending lands back on the page with the reference read back from the
    record; a form without its conditions accepted is refused by the server
    and says it was not sent.
- **Erasure, as the owner carries it out** (criteria 7–10).
  - A request reads as a task: whose it is (their handle, or "already
    erased"), when it arrived, its state in words and the next step the owner
    may take. The preview is counts only, one list per data class; ids,
    versions and data-class definitions are a disclosure away. No step says
    "dry run", "tombstone" or "410".
  - The destructive confirmation names the request and what erasing covers —
    spaces, objects, entries, photos — on the card (a reader without scripts
    posts straight away) and in the dialog.
  - A request in `cleanup_pending` can be resumed. The same idempotent
    execution continues the cleanup and marks the request completed only once
    it is verified; resuming a completed one changes nothing. It was not
    offered at all before: a stalled cleanup had no way on.
  - Every action lands back on the queue with its outcome read back: saved
    (and the state now), not saved (already in another state), or nothing
    erased (the approval phrase did not match).
  - `cleanup_pending` now says what is pending — photos and search — and that
    the request completes once that is confirmed. It used to name only media.
- **An outcome takes focus whenever it changes** (DESIGN.md §5.3).
  `ActionOutcomeNotice` focused itself only when it mounted, and React keeps
  one notice across outcomes that share a place on a page. The browser proof
  found it: after "not sent", "received" appeared in the same element and
  focus stayed on the document the pressed button had left. It now takes an
  `about` — the record and its state now — and takes focus whenever that
  changes. The lineage inboxes (OVE-495) had the same exposure, one claim
  after another, and use it too.
- **Only the owner sees the queue** (criterion 11). A member who opens it is
  told so, and no request is on the page. The erasure pages keep the safe-exit
  shell: no garden chrome, so a failed session recheck cannot trap a person in
  an account.

## Proof

`tests/consent-and-erasure.spec.ts` (new, registered in the gate) passes
13/13 against `next start`. Measurement tags are answered locally; the
member is a synthetic gardener written into the local database with a space,
an object and a public entry, and the erasure of them is real.

1. **Every page asks the same question.** On `/`, `/journals`, `/privacy` and
   `/support` at 320 px: one named region, no role, the question and its
   link to `/privacy#privacy-choices`, two answers of the same class, colour,
   border and height, and no sideways scroll.
2. **Nothing the keyboard reaches is left under the chrome.** Tabbing through
   `/journals`, `/` and `/support` until focus reaches the tab bar or the
   notice, at 320 × 640 and 640 × 450 (1280 × 900 at 200% zoom), with an
   answer owed and once answered: no focused control overlaps either, by any
   amount. Before the fix the same walk failed on both.
3. **A phone's bottom inset.** With a 34 px inset (Chromium's safe-area
   override): the bar pads itself, the notice sits above the padded bar, and
   the walk is clean.
4. **Both answers by keyboard**; "Не дозволяти" by Enter hides the notice and
   the spacer, and the answer holds on the next page.
5. **The privacy page** says "Не вибрано", then "Дозволено" after the change,
   hides the notice, keeps the storage detail folded, and orders public →
   retention → choices → about.
6. **A member.** Signed in through the screen:
   - the three choices and the way to the garden;
   - the server refuses a form whose `required` was removed: "Запит не
     надіслано" (`role="alert"`), and no row is written;
   - the accepted form lands on `?result=received` with the request's
     reference, focused; the database has one `submitted` request; the form
     is gone;
   - the owner's queue tells the member it is not theirs;
   - axe at 1280 and 320 px.
7. **A phone, before any answer.** The member's session at 320 × 640: a setup
   flow's "Далі" at load and every control on the way through are clear of the
   bar and the notice; the composer's Publish is clear at load and while its
   row is stuck.
8. **The owner carries the request out.** Signed in through the screen:
   - the card names `@handle`, "Почніть розгляд.", and keeps the account id
     and definitions folded;
   - start review → "Збережено … На розгляді оператора", focused;
   - mark the preview reviewed → the next step says to decide, and the card
     states "простори: 1, живі об'єкти: 1, записи: 1";
   - axe at 1280 and 320 px on that state;
   - a wrong phrase → the dialog names the scope → "Нічого не стерто"; the
     database still says `reviewing` and the user row exists;
   - the phrase as shown → `handled` with `completed` or `cleanup_pending`,
     whichever the database records, and the card says the same. The user
     row is gone. In the recorded runs it ended `cleanup_pending`: the
     entry's removal from the local search index was not verified within the
     request, and the card offered "Продовжити очищення".
9. **A stalled cleanup.** A `cleanup_pending` request with nothing owed
   resumes with the phrase to `completed`, and the page says "Виконано".
10. **axe** is clean in UK, BG and RU at 320 and 1280 px on the owner's queue
    (with its requests loaded, not their skeleton), privacy, support, the
    first-publication page and erasure, each public page with the notice
    drawn, and none scrolls sideways.

Afterwards the local database holds no row of the run: requests are removed
by id, and the erased gardener's garden and removal intents by the subject id
the request names.

Unit tests:
- the notice's question per deployment, its measured room and the marketing
  question's, and the stylesheet's model (`consent-notices.test.tsx`,
  `globals.test.ts`);
- `ActionOutcomeNotice`: focus on mount, again on a new outcome in place, and
  not taken from the reader for the same one;
- the member's page (status first, the three choices, received and not-sent
  outcomes, identity verification) and its action;
- the owner's queue (task reading, outcomes, resume, jargon kept out of the
  main flow) and its actions (typed refusals land as outcomes);
- the trust pages in three languages: headings name the page, status closes
  it.

The full unit suite, the icon, design-token, component, browser-spec,
settled-read and address guards and lint pass.

The Meta Ads tripwire (`scripts/verify-facebook-login-retirement.ts`) pins a
digest of `meta-marketing.tsx`. This change restyles its consent banner and
privacy controls and gives the banner its measured room; consent gating, the
Pixel and events are untouched, so the digest was re-pinned, as #396 did for
the same file.

## Left as it is

- The viewport keeps the default `viewport-fit`, so on a phone the browser
  keeps the page inside the safe area and `env(safe-area-inset-bottom)` is 0
  there. The arithmetic is proved with an emulated inset; covering the screen
  is a separate decision for every edge of the layout.
- While an answer is owed at 320 px, a setup step's action row rides above
  the notice and over the step's first option; the notice leaves once
  answered.
- Production mutation proof is not claimed: the erasure flow was exercised
  on the local database only.
