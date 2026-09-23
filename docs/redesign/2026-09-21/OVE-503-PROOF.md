# The account's pages — OVE-503

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **Three pages, one row of links between them** (criterion 1). Before, one
  page held the handle, the profile fields, the preview, the sign-in methods,
  sign-out and the blocked list, in that order (OG-UX-024). Now:
  - **Публічний профіль** (`/garden/profile`) is the public identity alone;
  - **Налаштування** (`/account/settings`, new) holds the interface language,
    the blocked list and your data;
  - **Вхід і безпека** (`/account/security`, new) holds the sign-in methods
    and sign-out.

  A row of links (`account/account-sections.tsx`) names the current page, and
  the account menu's settings group offers Налаштування, Вхід і безпека,
  Приватність and Видалення даних. Every capability the old page had is kept.
- **How others see you, first; the public address, after** (criteria 2 and 4).
  - A sentence above the form names the page it writes to
    (`over.garden/@handle`, seen by anyone). Each field says who sees it
    ("Видно всім: у профілі й над кожним вашим записом.").
  - The region says it is only ever a region, and a city only its country.
  - The address is its own form below the profile's. Before anything is saved,
    it lists what a new address changes:
    - the profile moves, and its old address stops working;
    - links to entries and objects redirect to the new address;
    - the old handle is never reused;
    - the next change is 30 days away.
- **Old entry links follow a rename** (ADR-0029, amended 2026-09-23). ADR-0029
  left "one prefix rule" for the day handles could change. Handles can change
  now, and the rule did not exist, so every `/@old/post/n` would have
  answered 404 after a rename. Now, when a numbered entry is not found:
  - the proxy asks the registry whether the handle was retired, and by whom;
  - it answers one 308 to `/@new/post/n` when that entry is live
    (`resolveRetiredPublicHandle`, `resolveMovedHandleEntry`);
  - the lookup happens only on a miss, and the old profile stays a 410.
- **A form answers in place** (criterion 4). The profile form used to redirect
  to `?status=…`. The App Router keys a page by its search parameters, so the
  editor was mounted again and a refused display name came back as the stored
  one, with the gardener's words gone. The browser proof found this; the unit
  render cannot.
  - The form now holds `useActionState` itself, as the handle form does.
  - A refused field keeps its words, is focused, and carries its own error.
  - A save says "Профіль збережено." inside the form.
  - The button says "Зберігаємо…" and refuses a second press while one is on
    its way.
  - The progressive-form guard checks both forms directly (a bare reference
    and the owner id).
- **Every region in the reader's language** (criterion 3). The region list and
  the preview used English ("Bulgaria - Varna Province"); they now use
  `getLocalizedCoarseRegionOptions`. The avatar's fallback description is also
  the reader's word, not "Profile photo".
- **Labels and keyboards** (criterion 5):
  - every field has a visible label and a wired description;
  - the display name has `autocomplete="nickname"`;
  - the handle has `autocomplete="off"`, because it is an address, not how
    anyone signs in;
  - nothing blocks paste or a password manager.
- **The preview is optional and read-only.** It is the profile's header, drawn
  from the form, behind a closed disclosure with nothing in it that acts. The
  workspace read no longer loads the whole public profile (every entry, object
  and photograph) or the blocked list to draw it.
- **Settings:**
  - the interface language, one real form per language, re-rendering in place;
  - the blocked list and its undo;
  - privacy, and the erasure request described as what it is: "Його розглядає
    оператор; сам запит нічого не видаляє".

  The block description says only what a block does, in both directions: you
  and they do not see each other's profiles and comments. A block and an
  unblock are confirmed on this page.
- **The owner's menu** (criterion 6) is the same menu with one more group,
  shown only to the sealed owner.

## Proof

`tests/account-settings.spec.ts` (new, registered in the gate), against
`next start` and the local database. Two members, one with a published entry.

1. The profile page:
   - the row of pages, with the current one marked;
   - "Як вас бачать інші" before "Публічна адреса";
   - each field's accessible description;
   - every region in Ukrainian, none in English;
   - no sign-in methods or blocked list;
   - the preview closed, and nothing in it acts.
2. A bio saves alone: "Профіль збережено." in the form, the address unchanged,
   the text kept. The database changed `bio` and nothing else.
3. A refused display name (a bidirectional control character):
   `aria-invalid`, focused, the typed value kept, its own error, and nothing
   saved.
4. A taken handle and a malformed one: the handle's own `role="alert"` status,
   the field focused and `aria-invalid`, the typed value kept, the handle
   unchanged in the database.
5. Settings:
   - a seeded block is listed; its undo answers "Профіль розблоковано." and
     the row is no longer active;
   - the data section describes the request;
   - choosing Български re-renders the page in Bulgarian (`aria-pressed`),
     then Українська brings it back.
6. Security: the methods panel and sign-out; no public field.
7. The menu:
   - a member sees Налаштування, Вхід і безпека, Приватність and Видалення
     даних, and no owner group;
   - the sealed owner sees the same four and the owner group.
8. A rename through the form:
   - "Адресу змінено." and the new address on the page;
   - `/@old/post/n` answers **308** to `/@new/post/n` and opens it;
   - `/@old` answers **410**, and `/@new` answers 200.
9. UK, BG and RU at 320 px: all three pages reflow with axe clean (nine scans).
10. Signed out: both pages ask for sign-in with `next=` set to themselves.

10/10 on the final build.

**Hard-load failure** (`scripts/prove-account-pages-partial-failure.ts`, run
alone against `next start`; receipt
`docs/redesign/2026-09-21/ove-503/account-pages-partial-failure-receipt.json`):
- **Settings** with `profile_blocks` locked: `200`; the blocked list settles as
  `query_timeout` with its retry; the three language buttons and both data
  links render; no skeleton left. After the lock is released, the retry lists
  the blocked profile.
- **Security** with `account` locked: `200`; the methods settle as
  `query_timeout`; sign-out stays usable; no skeleton left.
- `passed: true`.

The whole local gate (`pnpm exec tsx scripts/run-browser-gate.ts`, 283
tests):
- 281 passed and 1 skipped (the Google button: no client is configured
  locally).
- 1 failed: `owned-destinations.spec.ts`, whose synthetic sign-up hit Better
  Auth's rate limit four times (`429`). Run alone on the final build, it
  passed 2/2.

Unit:
- the editor (15);
- the profile page;
- the settings (5) and security (4) pages;
- the actions: the profile form answers `{ status }` and does not redirect;
  unblock returns to settings;
- the proxy (the 308 for a retired handle, and no extra read on a hit);
- the registry query;
- the shell's menu groups;
- the progressive-form guard, with the stateful editor forms checked directly.

`tests/google-account-linking.spec.ts` was updated to `/account/security`. It
runs outside the gate and CI, by its own script, on the local-infra
`overgarden` database with a mail provider. It could not run in this checkout:
that database predates the entry-number migration, and the environment has no
mail provider, so its sign-up answers 500. Its bounded-failure half is covered
by the proof script above. Its linking half depends on the panel's callback,
which follows the page's own address. The panel itself only moved.

### Screenshots (`docs/redesign/2026-09-21/ove-503/`)

`profile-editor-1440`, `account-settings-bg-1440`, `account-security-1440`,
the 320 px pages in BG and RU, and both partial-failure screens.

## Not claimed

- **Account deletion as a self-service action.** Erasure stays a reviewed
  request (OVE-505).
- **New sign-in methods.** The panel is the same panel, moved.
- **A real screen-reader session** (OVE-478).
