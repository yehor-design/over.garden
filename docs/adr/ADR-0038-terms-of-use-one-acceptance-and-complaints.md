# ADR-0038 — Terms of use accepted once, up front, and a complaint procedure anyone can use

- **Status:** Accepted (decisions 2026-09-25, SDD Slice 29 piece 8). Recorded by
  `OVE-511` (29.01). Implemented by `OVE-526` (29.16). The texts are drafted by
  the executor, approved by the owner, and reviewed by a lawyer before launch;
  until that review, `MVP_LEGAL_COPY_STATUS` and `docs/PROJECT_STATE.md` say it
  is pending.
- **Date:** 2026-09-25
- **Decision owner:** founder/owner
- **Supersedes:**
  - The first-publication disclosure as a gate: the checkbox at a gardener's
    first publish (`requiresFirstPublicationDisclosure`, version
    `first-publication-v6`, receipts of migration `0079`) is removed. The `0079`
    receipts stay as historical evidence and are no longer required.
  - The single consent question of `AnalyticsConsentNotice`: analytics and
    marketing become two separate choices.
  - `MVP_RETENTION_RULES`' promise that a deleted entry's photos become
    unreachable, for catalogue copies (ADR-0037 D3).
  - `/first-publication-disclosure` as a document: its content moves into the
    terms and the privacy policy, and the address answers one 308.
- **Relates to:** ADR-0032 D7 (the consent notice is drawn before paint),
  ADR-0036 and ADR-0037 (space pages and catalogue photographs are reportable),
  ADR-0024 D3 (the report form works without JavaScript).

## Context

Overgarden had no terms of use (found 2026-09-25). The only legal surfaces
were the privacy notice, the first-publication disclosure, erasure and
support. Nothing granted Overgarden a licence over gardeners' photographs, and
a public service with user content that reaches Bulgaria owes terms with its
moderation rules under the EU Digital Services Act. The owner decided the
terms must exist («в такому випадку їх треба створити»), that accepting them
is the condition of using the product, and that after that one acceptance the
product asks for nothing more: «Користувач відразу погоджується з усіма
умовами і більше не стикається з підтвердженнями в процесі використання
продукту».

## Decision

### D1. Three documents

`/terms`, `/privacy` (rewritten) and `/cookies`, in uk, bg and ru, each with a
version and a date. The terms include who Overgarden is and its contact, a
minimum age, what may be published and how moderation works, the complaint
procedure, the photo licence (D3), erasure by request within one month, and
account deletion. The privacy policy says what is public — entries, object
passports, space pages with their photos, comments — and how long things are
kept, catalogue copies included. The cookie rules separate necessary cookies
from analytics (GA4, GTM, Clarity) and marketing (Meta).

### D2. One mandatory acceptance, up front

- Email sign-up has one unticked, required checkbox linking the three
  documents; the server refuses sign-up without it, and the receipt is written
  with the account.
- After a first Google sign-in, and for any signed-in account without a
  receipt for the current versions — existing accounts included, at their next
  signed-in visit — an acceptance screen comes before any workspace page.
  Declining signs the person out.
- Every signed-in write refuses without a current receipt: server actions and
  `/api` routes, not only the page redirect.
- A new version of any document asks once more. Nothing else asks: the
  first-publication checkbox goes.
- Reading public pages never requires acceptance. Guests and search engines
  cannot accept anything, and blocking reading would end the public model.

### D3. The photo licence

Publishing a photograph grants Overgarden a non-exclusive, royalty-free licence
to use it as an illustration on species pages and their share images, with
«@автор» attribution. It is mandatory, with no opt-out. It survives deleting
the entry and ends when an erasure request is approved.

### D4. Cookies are two separate choices

- Analytics and marketing are separate, unticked switches, on the acceptance
  screen and in the guest banner. Rejecting is as easy as accepting. Consent to
  non-essential cookies is never bundled into accepting the terms (GDPR Art.
  7(2) and 7(4), ePrivacy Art. 5(3), CJEU Planet49).
- GA4, GTM and Clarity load only after «Аналітика»; Meta only after
  «Маркетинг».
- The choice can be changed at any time from the footer, the phone menu and
  account settings; withdrawing is as easy as giving.
- The guest banner stays drawn before paint (ADR-0032 D7).

### D5. The complaint procedure

- Anyone, with or without an account, can report a public entry, a space page,
  a tag page, a profile, an object passport or a catalogue photograph (DSA
  Art. 16). Comments are reported through the existing comment moderation under
  the same rules.
- The report form asks for a reason from a short list, an explanation, the
  address (filled in), a name and an email, and a good-faith statement. It is
  rate-limited and works without JavaScript.
- The reporter gets a confirmation and later the decision by email.
- Reports land on one owner page beside comment moderation. The owner keeps,
  removes or hides the content, and every decision is recorded.
- A removal sends the author a statement of reasons (DSA Art. 17): what was
  restricted, the facts, the ground in the terms or the law, that no automation
  was used, and how to contest it.
- Reports and statements are covered by the erasure rules.

## Consequences

- A gardener meets the rules once and then never again until they change.
- The composer loses its first-publication step.
- Moderation stays after the fact: gardener content publishes at once, and the
  complaint procedure is how the owner learns what to take down.
- Questions for the lawyer are carried by the task: an EU representative (GDPR
  Art. 27, DSA Art. 13), the minimum age, and whether the licence reaches
  photos published before it existed.
