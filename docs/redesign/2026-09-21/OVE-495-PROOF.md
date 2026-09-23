# Passports, lineage inboxes and handoffs — OVE-495

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **Three tasks, three pages** (criterion 7).
  - Questions and claims are two tabs of one section
    (`garden/lineage/lineage-shell.tsx`, "Запитання · Заявки"). They used to
    point at each other with two buttons named after the other page.
  - An invitation stands alone, reached from its link.
  - Each page has one heading and one sentence saying what it is for.
- **The other gardener, by name** (criterion 7).
  - `server/lineage-identity.ts` reads the gardener's public profile: public,
    active, with a current handle. With a viewer, a block in either direction
    hides it.
  - Claims name the claimant, questions the asker, follows the owner, and an
    invitation its writer. Each is a name that opens the profile, with the
    handle beside it; with no public profile to show, "Садівник без
    публічного профілю". It used to be "Іншим садівником" everywhere.
  - The public lineage still reads no identity, and its privacy test is
    unchanged.
- **A relationship is a sentence with both names** (criteria 5, 12). It reads
  «Томат» походить від вашого «Томат», because related objects are usually
  named the same. It used to be "Заявлене походження Томат від Томат". Beneath
  each name are its variety and catalogue kind.
- **What an answer changes is said before it can be given, as the backend
  does it** (criteria 5, 8).
  - A confirmed claim shows on the public passport of the object that came
    from the other, only when both objects have public entries. Public lineage
    walks ancestry, from an object to its source.
  - Confirming also lets the two gardeners follow each other's object and ask
    questions, without contact details.
  - A declined claim shows nowhere, and the claimant's record says so.
  - An invitation never makes anything public.
  - No answer moves an object between gardens, and none can be changed
    afterwards: there is no mutation that would.
  - "Confirmed" is two gardeners' word, never a genetic test.
  - The first draft of this copy said a confirmed link appears "on both
    passports". The browser proof showed the source's passport never changes;
    the copy, the dialog and the passport's own description ("…and what grew
    from it") were corrected to match the backend.
- **Asked first, cancelled safely, read back** (criteria 8, 12).
  - Confirm and decline are `ConfirmSubmit`. The consequences are on the card
    for a reader without scripts, and the dialog restates them. Escape or
    Cancel writes nothing and returns focus to the button.
  - An answer lands on `/garden/lineage/claims?claim=…&result=done|stale`. The
    page reads that claim back (`getLineageClaimRecord`) and says what is
    stored now, in a notice that takes focus. The pressed control left with
    its card, and focus used to fall to the document.
  - A claim answered in another tab, or gone, is "not saved" with the reason.
    Nothing is written. It used to be a thrown error and the error page.
  - The decision functions throw a typed `LineageDecisionUnavailableError`, so
    an action tells "nothing to decide" from a failure.
- **Every invitation answer has its own sentence** (criterion 9).
  - `inspectLineageInviteToken` tells a valid, an expired and an invalid
    link apart. Only a verified signature can be expired.
  - The handoff route answers `lineage_invitation_expired` or
    `lineage_invitation_invalid`, and the page says which.
  - `getLineageInvitationClaimState` reads the record in any state and gives
    each its sentence: ready, withdrawn, answered by you (confirmed or
    declined), answered by another account, or your own invitation, which is
    for the other gardener. It used to be one sentence for everything:
    "недоступне, прострочене або вже опрацьоване".
  - **The writer could confirm their own invitation.** Nothing in the edge
    update or the schema stopped it: the update filtered on the token, the
    state and the erasure state, never on who answered. This was read from
    the query and the constraints; it was not exercised against the old code.
    `buildResolveLineageInvitationClaimEdgeQuery` now requires the answering
    account not to own the edge. The page shows its writer the "own" state
    with no controls.
  - An answer lands on `?result=done|stale` and is read back. The cookie is
    kept for its thirty minutes so the page can say "you confirmed" from the
    record. The token cannot be used twice, because the record is no longer
    pending.
  - **A newer link replaced nothing.** With an invitation cookie on the
    device, a second link's fragment never reached the server, and the page
    kept showing the first invitation. The handoff now runs beside a held
    invitation: it hides it, hands the new token off, and reloads.
  - The writer's provenance page says an expired link expired, instead of
    offering it to send again. An answered invitation no longer reads
    "Запрошення очікує".
- **A token never shows** (criterion 10). The fragment goes to an `httpOnly`
  cookie scoped to the claim page and is taken off the address. A guest's
  sign-in returns through the auth intent to the clean claim path, with no
  token in any URL, form or screenshot.
- **A question has one way to answer** (criterion 7).
  - There is no private reply, and a question carries no contact. The card
    offers an entry about the reader's exact object
    (`/garden/new?object=…`, OVE-486), which whoever follows it sees.
  - The card says who asked, about which object, and through which link, both
    ways round ("«Їхній» походить від вашого «…»" or the reverse).
  - Below the questions are the objects the reader follows, with their
    owners.
- **The passport** (criteria 1–4, 6, 11).
  - It leads with name, gardener and photograph, and the gardener line comes
    before the badges.
  - The catalogue stays a named secondary link.
  - Breadcrumbs are the gardener's (profile › objects › object). They used to
    run through the catalogue, as if a gardener's tomato were a page of the
    species.
  - An object with no confirmed lineage has no lineage block. For a guest the
    rail module is gone too; the owner still sees where to add provenance.
  - The lineage section describes itself truthfully: where the object came
    from. Each link is a sentence, this page's object is marked "(цей
    об'єкт)", and a caption says what "confirmed" means.
  - Its own gardener, signed in, gets "Новий запис про нього"
    (`/garden/new?object=…`) and "Відкрити в моєму саду" in a region that
    streams for them alone (`PassportOwnerBar`). A guest's static bytes and
    controls are unchanged.
  - Lineage actions stay inside the lineage section, below the history.
  - Canonical and legacy addresses, the static document and deleted-object
    behaviour are untouched.
- **"Порода" for an unmatched tomato.** `catalogKindSql` answers `breed` when
  the left-joined catalogue row is absent. The lineage queries now use
  `optionalCatalogKindSql`, which gives no kind. The same defect elsewhere in
  the product is filed as a follow-up task.

## Proof

`tests/lineage-handoffs.spec.ts` (new, registered in the gate) passes 9/9
against `next start`.
- Three synthetic gardeners are written into the local database.
- Related objects are named the same on purpose.
- Every sign-in goes through the screen and every decision through the
  page's own controls.
- Every outcome is read back from the database.

1. **A claim.**
   - The tabs mark "Заявки". The card's sentence names both «Томат ove495».
   - The claimant is linked by name, with the handle.
   - The reader's object opens its garden page. No catalogue kind is invented.
   - The consequences come before the buttons.
   - Escape closes the dialog, returns focus to the button, and the claim is
     still `proposed`.
   - Confirming lands on `?claim=…&result=done` with "Походження
     підтверджено" focused. The database shows the edge `confirmed`, one
     `confirm` audit row, and both objects with their owners.
   - The claimed object's public passport, read and cached before the
     answer, shows the link within the poll. The source's passport does not.
2. **Two tabs.**
   - One tab declines, and the outcome reads back.
   - The other tab, still showing the claim, confirms. It lands on
     `result=stale` with "Відповідь не збережено" and "Ви вже відхилили"
     (`role="alert"`, focused), and the edge stays `declined`.
   - The claimant's provenance page says "Походження відхилено".
3. **A question.**
   - It names the asker and says the link both ways.
   - Its answer link is `/garden/new?object=…`, and the composer opens on
     that object.
4. **An invitation**, written by its gardener on the provenance page.
   - Its writer opens it: "Це ваше запрошення", with no controls.
   - A guest sees only the way to sign in: no object, label or name on the
     page.
   - Signing in as the invitee returns to it with "Так, це я" focused and no
     token in the address.
   - Confirming lands on `result=done` with "Ви підтвердили походження"
     focused. The database shows the edge `confirmed`, the identity `claimed`
     by the invitee, and the object still Анна's; Богдан's object count is
     unchanged.
   - A third account opening the same link gets "На це запрошення вже
     відповіли".
   - The writer's record now reads "Походить від …", "Походження
     підтверджено", "прийнято".
5. **Expired, broken and missing links**, each with its own sentence.
   - The expired link is minted with the run's key, 31 days back.
   - The writer's page says the link no longer works and offers no link.
   - Nothing is answered.
6. **A lost race.** Another account answers first. The late acceptance lands
   on `result=stale` with "Відповідь не збережено. На це запрошення вже
   відповіли", and the identity stays claimed by the first account.
7. **A newer link** replaces the invitation the device holds.
8. **The passport.**
   - The guest sees the gardener's crumbs and no owner bar.
   - An unlinked object has no lineage block.
   - The static bytes carry the link and no owner region.
   - Its gardener gets the write to exactly that object; another gardener
     does not.
9. **axe** is clean in UK, BG and RU at 320 and 1280 px on the claims,
   questions and invitation pages, with no sideways scroll. That scan found a
   37 px overflow at 320 px, now fixed: a truncated label in a flex button
   could not shrink.

The helper that mints links (`tests/helpers/lineage-invite-token.ts`) is
verified by the real verifier in `src/server/lineage-invite-token.test.ts`, so
the two cannot drift.

Unit tests:
- the token's three states;
- the claim read-back query and its privacy;
- the self-answer guard in the edge update;
- the typed refusal, and the invitation states answered without storage;
- the handoff's codes, and the client's classification and replacement mode;
- the three pages, including every state, outcome, locale and the
  missing-relation failure;
- both action files: redirect, stale, unexpected failure and session refusal;
- the copy's parity, and distinct invitation sentences.

The full unit suite: 4,558 passed. The icon, design-token, component,
browser-spec, settled-read and address-literal guards are clean, and so is
lint.

The whole local gate (`pnpm exec tsx scripts/run-browser-gate.ts`, 309
tests):
- 307 passed.
- 1 skipped: the Google button, since no client is configured locally.
- 1 failed: `object-setup.spec.ts`, whose fixture got `429` from Better
  Auth's sign-up endpoint four times over. That is the gate's shared sign-up
  limit; this change's spec signs nobody up. The spec alone then passed 5/5.

A dead reader was removed after that build (`getLineageInvitationClaimPreview`,
unused once the page read the record's state). CI runs the gate on the final
head.

### Screenshots (`docs/redesign/2026-09-21/ove-495/`)

- `claims-1280`, `claim-confirm-dialog-1280`, `claim-confirmed-1280`,
  `claim-stale-1280`
- `questions-1280`
- `invitation-ready-1280`, `invitation-own-1280`, `invitation-expired-1280`,
  `invitation-refused-1280`
- `passport-lineage-1280`, `passport-owner-1280`
- claims, questions and invitation at 320 px in UK, BG and RU

## Not claimed

- **Production lineage decisions.** Proving them needs two real gardeners
  and real edges, and production checks are read-only. The production receipt
  covers the pages' signed-out and empty states, the guest passport and the
  owner's own pages.
- **A reply to a question.** There is no reply mechanism. The answer is an
  entry, and nobody is told that a question was answered.
- **Before hydration, beside a held invitation.** When a newer link is
  opened, the held invitation is visible until the page hydrates and hides
  it. A press in that moment answers the held one, which the page names.
- **The "breed" label and borderless secondary link-buttons elsewhere.**
  Fixed on these pages only; both are filed as follow-up tasks.
- **A real screen-reader session** (OVE-478).
