# Authentication and a guest's action — OVE-504

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **One focused column for all four screens** (criterion 1). The four screens
  had three shapes:
  - sign-in and sign-up: a shadowed card on a grey band the height of the
    viewport;
  - help: a wide article with an eyebrow and a 30 px title;
  - reset: a card pinned left under a bare "OverGarden" link.

  Now all four use `auth/auth-frame.tsx`: heading, one sentence, the task, and
  the ways out under a rule, inside the shell.
- **The mode is named.** A two-link switch marks the current mode
  (`aria-current`) and carries `next` to the other one.
- **Every reason for arriving has its own sentence** (criterion 5). The
  sentence is also the description of the field that takes focus, so a screen
  reader hears it:
  - an action: "Увійдіть, щоб коментувати" and that the reader comes back to it;
  - an action older than its token: `notice=intent-expired`;
  - an action that cannot be verified: `notice=intent-invalid`;
  - a new password: `notice=password-reset`, which also says every other
    session ended;
  - a provider refusal: provider `error`, now returned to this screen;
  - an expired verification link: `verified=1&error`;
  - words waiting in another tab: `notice=return-to-tab`.
- **Distinct states.**
  - Pending: the button is busy, "Входимо…" is said, and a second press posts
    nothing.
  - Signed in: "Вхід виконано. Відкриваємо сторінку…".
  - A refusal: an alert above the fields that never names the wrong credential.
  - An unverified address with the right password: a sentence of its own. It
    used to be told "check your email and password".
  - A request that never came back: an alert saying there was no answer.
  - Already signed in: its own state (Continue, and sign-out for another
    account), not a redirect that made Back bounce forward. A verification link
    lands here too and says the address is confirmed.
- **What was typed is kept** (criteria 1 and 3).
  - The email and password live above a transport boundary (the one the
    engagement controls already had, now `components/transport-boundary.tsx`).
  - They are also taken at submit, because a password manager may have filled
    them without an `input` event.
  - A refusal or a lost request leaves both fields as they were. The typed
    email used to be cleared by React's reset of the form.
  - `autocomplete="username"` with `current-password` or `new-password`, no
    paste blocking and no puzzles.
- **Recovery.**
  - Help asks for the address in a real form. It used to be a `type="button"`
    calling the auth client, which did nothing before hydration.
    `requestPasswordResetAction` answers through the same code as
    `POST /api/auth/request-password-reset` (`server/auth/password-reset-request.ts`),
    so Better Auth's rate limit, the equalised lookup and the outbox all still
    apply, and every address gets the same sentence.
  - The reset screen has a state of its own for a link Better Auth refused,
    with the way to a new one.
  - A finished reset goes to sign-in, saying so. It used to open the garden.
- **A guest's action comes back to its control** (criterion 2).
  - **Expired action, loop fixed.** `/auth/intent` forwarded an expired token to
    `/auth/intent/resume`, which refused it and sent it back. A signed-in
    reader looped, and so did a guest right after signing in. Now an expired
    token returns to its page.
  - **Relative redirects.** `intent/start` and `intent/resume` now answer with
    relative `Location`s. `request.url` under `next start` says `localhost`,
    and an absolute redirect moved the reader to another origin, away from
    their language and session cookies. That is how the local proof first saw
    the language flip (criterion 6).
  - **Unprefixed listings accepted.** `/journals`, `/feed`, `/objects` and the
    other unprefixed listings are the canonical addresses since ADR-0029, and
    the contract now accepts them as return paths.
  - **Save, follow and comment come back focused.** A browser skips
    `autofocus` on an address with a fragment, and every resume address has
    one; React does not focus a node it hydrates. The engagement controls now
    focus themselves.
  - **`AuthIntentFocus` waits for the control.** It used to give up after
    eight frames, and on a community it focused the static stand-in that the
    streamed button then replaced. It now waits, re-focuses on replacement,
    and never takes focus back from the reader.
  - **Never the guest's stand-in.** A community's static shell draws the
    guest's join button with the member's intent attributes. Focused, it
    started signing in again when Enter was pressed. Guest triggers now carry
    `data-auth-intent-guest`, and `AuthIntentFocus` never picks one: a resumed
    page is only reached signed in.
  - **"Back to reading" goes to the page.** It used to be the resume route,
    which for a guest meant the sign-in screen again.
- **Writing survives a sign-in in another tab** (criterion 4). The composer's
  "sign in in a new tab" was never walked through to the end.
  - Signing in announced "another account" to every tab, so the composer
    whose session had ended was sent home with its words. ADR-0022 D6 reloads
    only for another account. The signal now names the account.
  - The new tab says where the words are, and after signing in it says to go
    back rather than opening an empty composer.
  - Nothing is written to local storage, session storage or IndexedDB.
- **Google errors.**
  - A provider refusal returns to the sign-in screen with its sentence. It
    used to return to the destination, which said nothing.
  - "Не вдалося розпочати вхід через Google" no longer prints `{provider}`.
- **The gate runner** hands both sides one auth key made for the run, as it
  already did the cron secret. Without it, `next start` signed with a random
  key of its own, and no proof could make a token the server accepts.

## Proof

`tests/auth-intent.spec.ts` (new, registered in the gate): 17/17 against
`next start`. Every sign-in goes through the screen. The gardeners are
written straight into the local database the way the owner fixture is (a
`user` row and a credential with Better Auth's own hash), not through the
rate-limited sign-up endpoint. The first full-gate run lost one of them to a
`429`.

1. **Save an entry, as a guest.**
   - The screen names the action, and "back to reading" is the entry.
   - Signing in lands on the entry with `authIntent=bookmark` and "Зберегти"
     focused.
   - Pressing it writes one active `engagement_bookmarks` row.
2. **Join a community.**
   - The mode switch carries `next`.
   - Signing in focuses the member's membership button, not the static
     stand-in.
   - Enter makes the membership `active`.
3. **Follow an object's passport.** Signing in returns to the passport with
   the follow button focused, and pressing it writes an active follow.
4. **A space.** The signed-out owner opens their own space from a bookmark,
   signs in and lands on it. Another member sent to that address gets the
   missing-record state, and the page contains nothing of the space.
5. **Global Write.** Signing in opens `/garden/new?authIntent=create_entry`.
6. **Off-origin return paths** (`https://`, `//`, `/\`, `/%2F%2F`):
   - nothing on the screen points to them;
   - `next` is `/garden`;
   - signing in lands on `/garden`.

   An intent with an off-origin `returnTo` gets no token, and its screen says
   `intent-invalid`.
7. **An expired action**, minted with the run's key twenty minutes in the past:
   - as a guest: sign-in for the page with `intent-expired`, and signing in
     lands on the page;
   - signed in, the same token reaches the page in a bounded number of
     requests.
8. **Already signed in.** Back from the page a sign-in opened shows "Ви вже
   ввійшли" with Continue and sign-out, and Continue goes on. A verification
   return says "Адресу підтверджено".
9. **A lost request.** The POST is aborted: an alert, the email and password
   kept, and the retry signs in.
10. **Pending.** The POST is held: `aria-busy`, "Входимо…", and a second press
    posts nothing. The refusal after it keeps the email and focuses it.
11. **Provider refusal, verification expired and reset done** each show their
    own sentence. The provider sentence is the email field's description, and
    it never shows the raw code.
12. **Reset.** A refused link gets its state and the way to a new one. A bogus
    token is refused inside the form with the same way out. The help form
    posts to its own page, never to the auth API from the browser, and
    answers with the same sentence.
13. **Session ended while writing.**
    - The composer's link opens a tab that says where the words are.
    - Signing in there says to go back and opens no composer.
    - The first tab is the same document (a marker set before survived) with
      the words.
    - Nothing is in local or session storage or IndexedDB.
    - Publish works and writes exactly one entry.
14. **A password manager.**
    - `username` and `current-password` are set, and a paste is not cancelled.
    - A silent fill (no `input` event) with a wrong password is refused, and
      the fill is still there afterwards.
    - The right fill signs in.
15. **BG and RU** (criterion 6). From an unprefixed entry, the sign-in screen
    is in the reader's language. Signing in returns to the unprefixed canonical
    entry in that language, and the cookie is unchanged.
16. **axe**, at 320 and 1440 px in UK, BG and RU, is clean on every screen
    and state (sign-in, sign-up, help, reset, reset refused, expired action,
    provider error), with no sideways scroll at 320 px.

Updated specs:
- `auth-screen.spec.ts` (9/9): a refused reset link is now the `expired`
  state;
- `auth-provider-retirement.spec.ts` (4/4) and `keyboard-sign-in.spec.ts`
  (2/2): the new frame;
- `communities`, `public-profile`, `journal-entry`, `entry-composer`,
  `entry-editing` and `accessibility` pass unchanged.

Unit tests:
- the actions (17): the user id on sign-in, the verification callback, the
  unverified state, the provider's error return, the rate-limited reset
  route, reset success and refusal;
- the intent redirect (7): the expired no-loop and invalid notice;
- relative `Location`s in `intent/start` and `resume`;
- the contract: unprefixed listings accepted, strangers still refused;
- `AuthIntentFocus`: a hidden copy skipped;
- the sign-in surface (27), help (6) and reset (6);
- `auth-intent-token`: the proof's minting helper verified by the real
  verifier, so the two cannot drift.

The whole local gate (`pnpm exec tsx scripts/run-browser-gate.ts`, 300
tests, final build): 299 passed and 1 skipped (the Google button: no client is
configured locally), none failed. Unit: 4,520 passed, and the design-token,
icon, component, browser-spec and settled-read guards are clean.

### Screenshots (`docs/redesign/2026-09-21/ove-504/`)

- `sign-in-intent-1280`
- `signed-in-1280`
- `returned-to-tab-1280`
- sign-in and help at 320 px in UK, BG and RU

## Not claimed

- **Rate limiting of the sign-in screen itself.** Measured on the gate build:
  Better Auth's HTTP endpoint answered 401, 401, 401, 429, 429, 429. Six wrong
  passwords through the screen's Server Action were all plain refusals.
  `auth.api` calls skip the HTTP router where the limit lives. This dates from
  when sign-in moved to Server Actions (OVE-455), before OVE-504, which neither
  widens nor closes it. It is filed separately. The reset request, which
  OVE-504 moved, keeps its limit.
- **An unverified address, walked in a browser.** Locally, sending the
  verification email fails (no mail provider), so Better Auth answers a
  generic error rather than `EMAIL_NOT_VERIFIED`. The state is proved by unit
  tests; production has the provider.
- **Pages without JavaScript.** A no-script reader sees no streamed content on
  any page (a known property). The forms are real endpoints before
  hydration, which `auth-screen.spec.ts` asserts.
- **A real screen-reader session** (OVE-478).
