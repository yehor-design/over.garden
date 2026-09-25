# ADR-0035 — Creation is a stepper, the species comes from the standard base, and cultivars are the project's own list

- **Status:** Accepted (decisions 2026-09-25, SDD Slice 29 pieces 2 and 3 and
  addenda 1 and 2). Recorded by `OVE-511` (29.01). Implemented by `OVE-523`
  (the space stepper), `OVE-524` (the object stepper), `OVE-525` (species and
  cultivar in settings, the worker), `OVE-530` (the standard species base) and
  `OVE-531` («Сорти й породи»).
- **Date:** 2026-09-25
- **Decision owner:** founder/owner
- **Supersedes:**
  - ADR-0026 **D5**'s last sentence is kept and, for the first time, enforced:
    a gardener re-resolves their own object at any time. The `selected` lock
    that refused a change is removed (D5 below).
  - ADR-0026 **D6**, **reversed for cultivars and breeds**: "never a catalog
    card, never shown in other gardeners' lists" no longer holds for a
    cultivar or breed a gardener types; it becomes a shared entry (D4). "The
    worker … auto-links above threshold" is switched off for gardener objects
    (D6). An own **species** name stays a private label, as D6 said.
  - ADR-0026 **D7**: the species search offers the standard base only, by
    everyday names; the secondary "search the full catalogue" path leaves the
    form; the cultivar list is the project's own (D3, D4).
  - ADR-0026 **D14**'s rejection of "showing gardener-added names to other
    gardeners", for cultivars and breeds only.
  - `apps/web/sql/0055_ove387_labels_instead_of_provisional_cards.sql` retired
    gardener-created cards in favour of private labels. A cultivar or breed
    typed by a gardener is a shared entry again, owned by the project rather
    than by one gardener's object, and corrected by the owner after
    publication; `0055` stays history.
  - `DESIGN.md` §5.13's first-entry composer on the garden home, and the
    object and space setup flows of the redesign (`OVE-486`, `OVE-489`).
- **Relates to:** ADR-0034 (species pages publish from these choices), ADR-0036
  (the space photo), ADR-0022 D2 as amended by ADR-0037 (photos stay
  browser-made WebP), the owner's rule that gardener input publishes at once
  and is corrected afterwards.

## Context

On 2026-09-25 the owner asked how a gardener picks a species or cultivar
without knowing botany. A probe of the production picker that day answered it:
«полуниця» found a wheat cultivar, «болгарський перець» found «Бузок
перський», «курка» found a fish and then «Gallus gallus», «коза» and «кролик»
only Latin names, and garden strawberry had no species node at all. The problem
is vocabulary, not knowledge: people know "це помідор", and the catalogue
speaks botany.

The same day the owner set the shape of creation — one question per screen,
like Airbnb and Typeform — and two rules that reverse earlier decisions: only
the gardener sets a species ("Ми не мусимо створювати щось автоматично замість
користувача"), and what a gardener types is published at once and corrected by
the owner afterwards ("не перед публікацією … я потім вже після публікації
буду «змінювати» введену користувачем назву сорту на правильну").

## Decision

### D1. Spaces and objects are created by full-screen steppers

- One question per screen, a progress bar («Крок N з M»), «Назад» / «Далі» and a
  close control. The pattern follows Airbnb and Typeform, drawn in Threads'
  visual language (`DESIGN.md` §5.24).
- **Space:** «Як називається простір?» → an optional photo with the crop and
  rotate editor (ADR-0036) → «Створити». The region question is removed; region
  stays hidden by default and can be changed in the space's settings.
- **Object, in order:**
  1. «Простір» — skipped when creation starts inside a space. A single space
     is preselected, and «Далі» and «Додати простір» still show. «Додати
     простір» runs the space stepper and returns with the new space selected.
  2. «Рослина чи тварина?»
  3. A photo — optional, with the crop and rotate editor. It can be added,
     replaced or removed later in the object's settings.
  4. «Вкажіть ім'я рослини» / «Вкажіть ім'я тварини» — required. Examples:
     «Бабусині помідори», «Рябка». The field is the object's own name («Ім'я»),
     never a species or a cultivar.
  5. «Вид» — defaults to «Не знаю». A searchable list (typeahead by the
     characters typed) over the standard base, with «Ввести свій варіант». Its
     search field shows an example: «Наприклад, помідор» / «Наприклад,
     курка».
  6. «Сорт» / «Порода» — unreachable until a species is chosen and «Далі»
     pressed; skipped with «Не знаю». After an own species variant it is a
     free-text field. Its own default is «Не знаю», with no hint text.
  7. The last step's button is «Додати».
- **Nothing is created for the gardener.** There is no default space. A
  gardener with no space who starts an object creates the space first, inside
  the stepper, and continues.
- **The combined space + object + first-entry form on «Мій сад» is deleted.**
  An empty «Мій сад» shows «Створити простір» and «Додати рослину чи тварину».

### D2. Only the gardener sets a species

- The species is what the gardener picks, or «Не знаю», or their own text.
  Nothing is inferred from the object's name, from a photo or from a label.
- Species and cultivar can be changed at any time in the object's settings,
  including back to «Не знаю».
- A species change resets the cultivar. A change of «Рослина / Тварина» resets
  both.
- Enter selects only a row the gardener highlighted; it never picks the first
  row by itself.
- Choosing or changing a species after publication publishes the new species
  page at once (ADR-0034 D4); the old page, left with no entries, is
  unpublished.

### D3. The standard species base

- A reviewed, versioned list of the plants and animals people grow or keep in
  Ukraine, Bulgaria and the neighbouring countries: garden crops, fruit and
  berries, herbs, flowers, houseplants, livestock, poultry, pets and exotic
  animals. **No cap**: "не обмежуйся 300 рослинами і 100 тваринами … якщо
  видів більше які можуть увійти в стандарт-базу то роби їх".
- Each row has the everyday name and search words in uk, bg and ru, the Latin
  name, and an exact link to its catalogue node reached by identifier (Wikidata
  → GBIF or Catalogue of Life), never by a name alone. Every field records its
  source; a row is confirmed by two independent sources or marked for review.
- Built by a re-runnable generator from open sources — the UA state register,
  Wikidata, Wikipedia pageviews and redirects reached through Wikidata sitelinks,
  Catalogue of Life, FAO DAD-IS — with each snapshot dated. Nothing is copied
  from a competitor.
- **The Bulgarian names are verified by the executor**, as the owner delegated
  ("Болгарські назви перевірятимеш ти. Я тобі довіряю."): confirmed when two
  independent Bulgarian sources agree, otherwise recorded with an evidence URL
  and marked single-source. None is guessed.
- **The species comes from the base only.** The rest of the catalogue stays in
  the database and is not offered in the form. A species outside the base is
  the gardener's own text.
- Its everyday names are what people see everywhere: the stepper, settings,
  «Рослини й тварини», species pages, «Каталог видів», titles and JSON-LD. The
  Latin name is secondary.
- Missing species nodes are created from Catalogue of Life (garden strawberry,
  roses), and orphan cultivars are attached to them.

### D4. The cultivar and breed list is the project's own

- The list offered for a species is the cultivars and breeds that objects of
  that species already use, plus what gardeners type. Registered cultivars no
  object uses are not offered.
- «Немає в списку» lets a gardener type a name. A name that matches nothing
  becomes a **shared entry**, offered to everyone at once; a matching name
  reuses the existing entry.
- It publishes at once, with no gate and no `noindex`; its page follows
  ADR-0034's rule.
- After an own species text, the cultivar is the gardener's own text too.
- The owner corrects entries after publication in «Сорти й породи» (D7).

### D5. The selected-state lock is removed

`variety_state = 'selected'` no longer refuses a change. The resolve path
accepts a new species, a new cultivar, own text or «Не знаю» from the object's
owner at any time.

### D6. Background reconciliation no longer links gardener objects

- The worker's auto-linking of gardener labels (the `label_link` apply branch
  of `0056`, the label-ladder rungs at ≥ 0.95) is switched off for gardener
  objects.
- The owner's queue loses its «прив'язати назву» (`label_link`) items: with
  nothing to apply, they are unanswerable questions.
- Catalogue node merges stay; they re-point `catalog_item_id` to the survivor.

### D7. «Сорти й породи» — the owner corrects after publication

- An owner-only page in the account menu listing the shared cultivar and breed
  entries, newest first.
- Per entry: confirm, correct the name, merge (with the registers' cultivars
  available to the owner), remove. Every change reaches every object and page
  using the entry, and a rename leaves a 308 from the old address.
- Nothing waits for it: an entry is public before the owner sees it.

## Consequences

- The species field needs no botany: «полуниця», «курка», «кабачок» find the
  right species first, in every language.
- A gardener's own species text never reaches another gardener. A gardener's
  cultivar name does, at once, and the owner is the corrector.
- A species outside the base is invisible to «Рослини й тварини» until the base
  grows. A read-only report of frequent own species texts feeds the next
  version.
- The typeahead's first cold animal query answered `503` on 2026-09-25; the
  object stepper's task fixes it.
- No metric is collected for any of this ("не потрібно вимірювати ці
  метрики").
