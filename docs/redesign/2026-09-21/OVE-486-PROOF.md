# One entry composer — OVE-486

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- `components/garden/entry-composer.tsx` replaces the object follow-up
  composer and the space composer: one component for every "New entry" into an
  existing space or object. The first-entry composer stays for the first-run
  path that creates a destination and its entry atomically.
- `/garden/new` is the global Write (`SITE_SHELL_COMPOSER_PATH`). With nothing
  chosen, the owned-destination picker is the first question and has focus, so
  a recent destination is one activation; a pick moves focus into the text with
  no Continue step. `?object=` / `?space=` open it with the destination named
  (read by ownership; an unreadable one opens the picker). `returnTo` is where
  Close goes. A gardener with no object yet gets the two ways to have one
  (object setup, or the first-entry composer). On a phone it is a composer
  route: no tab bar under the keyboard.
- Contextual: the object page and a space's journal render the same component
  with their destination named.
- **Where, when, who**: destination, the observation date and a "Public after
  publishing" badge sit above the text. The date starts as the server's day and
  becomes the reader's local calendar date on mount unless they have set it —
  the UTC day is still yesterday in Kyiv and Sofia until 02:00–03:00.
- **Changing destination keeps everything**: text, date, title, photos and
  cover live above the destination; a space's mention list is kept only while
  the space is the same.
- **Space entries**: the server requires one to twelve of the space's own
  objects, so the composer asks (searchable checklist over
  `/api/garden/destinations?space=`, a new filter) and a space with none offers
  "Add a plant or animal" to that space instead of failing on Publish. This is
  the existing server contract, unchanged.
- **Title**: optional to edit; the suggestion stands in when the reader did not
  write one, because the server requires a title.
- **Ended session**: a publish refused with `session_required` (or carrying an
  auth-intent URL) no longer leaves the page; the composer says the entry was
  not published and offers sign-in in a new tab, and Publish works again from
  the same text.
- Every "New entry"/Write resumes here after sign-in (`create_entry` →
  `/garden/new`); the auth-intent grammar now allows `/garden/new`,
  `/garden/spaces/new` and `/garden/objects/new`.
- `redesign-baselines.spec.ts`: the OVE-486 expected-failure annotation is gone;
  the global Write is asserted to be `/garden/new`.

## Proof

`tests/entry-composer.spec.ts` (registered), outcomes read from the database:

1. Global Write from `/garden` (UK): Write (activation 1) → `/garden/new`, the
   picker focused; "Томат" typed, the greenhouse tomato chosen (activation 2,
   typing counted apart) → focus in the text; text written; destination changed
   to the balcony tomato — the text kept; axe WCAG 2.2 AA clean; Publish → the
   balcony tomato's page; exactly one `object` entry on the balcony tomato.
2. Space note at 390 px (BG): destination named, no picker, no tab bar;
   Publish without a mention is asked, not sent (0 rows); one mention ticked;
   a **double click** on Publish → exactly one `space` entry with that one
   mention.
3. Ended session (RU): cookies cleared mid-writing; Publish shows the
   session-ended notice with a sign-in link in a new tab; still on
   `/garden/new` with the text; 0 rows.
4. No objects yet: the two actions; then the object page renders the same
   composer with the object named and no picker.

Also green locally: `redesign-baselines`, `site-shell`, `garden-workspace`,
`journal-notion-composer`, `owned-destinations`; `pnpm test` 564 files /
4,339 tests; lint and typecheck.

## Not claimed

The first-entry composer is not merged into this component: it creates a
destination and its first entry atomically, which the IA transaction table
keeps as its own path. No real screen-reader session (OVE-478).
