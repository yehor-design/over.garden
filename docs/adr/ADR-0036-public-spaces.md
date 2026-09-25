# ADR-0036 — A space has a photo, a public page and the engagement an object has

- **Status:** Accepted (decisions 2026-09-25, SDD Slice 29 addendum 3).
  Recorded by `OVE-511` (29.01). Implemented by `OVE-523` (the space photo,
  with the shared crop editor), `OVE-532` (the public space page and its
  engagement) and `OVE-533` (the profile's «Простори» tab).
- **Date:** 2026-09-25
- **Decision owner:** founder/owner
- **Supersedes:**
  - ADR-0029 **D9** (the address map): it gains a row. A space is
    `/@{handle}/spaces/{slug}`, with no locale and a Latin name, like an object
    passport. `spaces` joins `objects` and `post` as a reserved entry name.
  - The engagement target kinds fixed by the like, comment, bookmark and follow
    CHECKs: `space` joins them.
  - `DESIGN.md` §5.13's "a space is a place with a page" — the page was the
    gardener's own, in the workspace; it now also has a public twin.
- **Relates to:** ADR-0034 D13 («Показати ще»), ADR-0035 D1 (the space
  stepper), ADR-0038 (a space page is reportable), ADR-0029 D8 (a slug is
  frozen at publish; a rename answers 308).

## Context

Until 2026-09-25 a space was a private grouping in «Мій сад»: its plants and
animals had public passports and its entries were public, but the space itself
had no photo and no public page. The owner's words, the same evening:

- «степ додавання фото при створенні простору, адже простір також має бути з
  фото, але фото не обов'язкове і його можна додати потім в налаштуваннях
  простору»;
- «простори також, на рівні з об'єктами мають бути публічними і їх мають
  бачити інші користувачі, а не лише власник. А також, простори мають мати
  коментарі»;
- «інші користувачі також мають мати можливість коментувати простори інших
  користувачів, підписуватись на простори, і тд».

«На рівні з об'єктами» is read as the same publication rule, the same kind of
address and the same engagement set an object passport already has: like,
bookmark, follow and the comment thread (`PublicEngagementPanel` for a
`lineage_object` target). «І тд» is read as that set.

## Decision

### D1. The space photo

- The space stepper has an optional photo step after the name, with the same
  crop and rotate editor objects use (`DESIGN.md` §5.25). The photo is
  browser-made WebP like every other (ADR-0022 D2).
- A space without a photo gets one later in its settings, where it can also be
  replaced or removed.

### D2. The public space page

- Address `/@{handle}/spaces/{slug}`: an ASCII Latin slug made from the space
  name the way passports get theirs, frozen at publication; a rename writes
  slug history and the old address answers one 308. No locale prefix and no
  `hreflang`: it is gardener content (ADR-0029 D10).
- It exists while the space has at least one public entry — its own, or one
  about any of its objects. With none, the address answers 404; the proxy
  decides 200, 308 or 404 before the shell streams (ADR-0029 D3).
- It shows the name, the photo as its cover, the region only if the gardener
  chose to show it, a link to the gardener's profile, the plants and animals
  that have a public passport, and the space's public entries, newest first,
  with «Показати ще».
- Indexable, in the sitemap while published, JSON-LD of what is visible,
  `og:image` the space photo.

### D3. Engagement

- Other gardeners comment on a space, like it, bookmark it and follow it — the
  same panel and controls a passport shows, none of them hydration-only
  (ADR-0024 D3).
- A follower's «Стрічка» includes the followed space's new public entries.
  Comments reach the space's gardener in «Події» and the owner's comment
  moderation. A bookmark appears in «Закладки».
- Comments publish at once and are moderated afterwards.
- Space deletion and account erasure remove the space's engagement rows and
  follows.

### D4. The profile lists spaces

The public profile has Threads' tabs «Записи · Простори · Об’єкти», with no
counts. Spaces are two-column cards like Pinterest boards; a space without a
photo gets a collage of its plants' and animals' photos. Plants and animals
are rows like Greg's plant list: the photo, the name, the species and cultivar
in everyday words, then the space. Newest-written first, «Показати ще» after
20. A guest never sees an empty tab (`DESIGN.md` §5.30).

## Consequences

- A space is a first-class public thing: it can be linked, followed and
  reported.
- Object passports and entry pages link a space's name to its page, and the
  gardener's own space page in «Мій сад» links to its public page.
- A region the gardener did not choose to show is never on a space page, the
  same guarantee a passport gives.
