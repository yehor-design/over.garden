# ADR-0037 — Gardeners' photographs illustrate species pages, as the catalogue's own copies

- **Status:** Accepted (decisions 2026-09-25, SDD Slice 29 piece 9). Recorded by
  `OVE-511` (29.01). Implemented by `OVE-528` (29.18), after the terms of use
  (`OVE-526`, ADR-0038) that grant the licence it rests on, and with the share
  image picker of `OVE-522` («Каталог видів»).
- **Date:** 2026-09-25
- **Decision owner:** founder/owner
- **Supersedes:**
  - ADR-0022 **D2**, one clause: "No server decodes, re-encodes, inspects, or
    cleans image bytes" stays true, and a server may now **copy** the bytes of
    a published photograph into the catalogue's own storage. A byte copy is not
    processing. What stays: no server-side re-encode, resize or inspection,
    and the WebP variants are made in the browser.
  - ADR-0021's promise, carried into `MVP_RETENTION_RULES` and the
    first-publication notice v6, that a deleted entry's photos become
    unreachable within seven days: a catalogue copy outlives the entry until an
    approved erasure request (D3).
  - ADR-0026 **D9**'s "no reference photograph is invented" (`DESIGN.md` §5.18)
    — the species page now shows gardeners' own photographs as a collage.
- **Relates to:** ADR-0034 D5 and D7 (the species page and its share image),
  ADR-0038 (the licence and the complaint procedure).

## Context

Species pages had no photograph of their own: the catalogue has none, and a
reference image from Wikimedia would need a per-file licence and an external
origin. The owner decided on 2026-09-25 that the photographs gardeners publish
illustrate the species they wrote about, under a licence the terms of use
grant, and that the catalogue keeps them even after an entry is deleted.

## Decision

### D1. The collage

- A species page shows, under its text, a collage of the latest photographs
  added to the species: entry photos and object photos of objects whose chosen
  species is this one, cultivars and breeds included. They are small photo
  cards, scattered and overlapping (`DESIGN.md` §5.27).
- Up to 6 on a phone and 10 on a desktop. Each carries «@автор» and opens its
  entry, or the author's profile once the entry is gone.
- No part labels (leaf, flower, fruit) and no filters: the "only confirmed
  species" and "no people in frame" filters were rejected ("зайвий
  функціонал, не робимо цього"). A person in a photo is handled by an erasure
  request.

### D2. The share image

A species page's `og:image` is the photograph the owner picks in «Каталог
видів», and the newest photograph of the species until they pick one.

### D3. The catalogue keeps its own copies

- When a photograph joins a species, the server copies its published variants
  into the catalogue's storage and records the copy, its author and its source
  entry in its own table. It never decodes or re-encodes them.
- Deleting the entry does not remove the copy. The copy is removed only by an
  erasure request the operator approves (the existing `/erasure` flow); a valid
  GDPR request is fulfilled within a month.
- The table is listed in `erasure-schema-coverage.ts`, and account erasure
  reaches it.
- After the entry is gone, attribution points to the author's profile.

### D4. It rests on the terms of use

The licence to use published photographs as catalogue illustrations is in the
terms of use (ADR-0038), mandatory and without opt-out. This work goes live
only with them.

## Consequences

- A species page shows what people actually keep, in the photographs they took.
- The storage holds a second copy of every catalogue photograph; the weekly
  orphan sweep must not treat a catalogue copy as an orphan.
- The first-publication notice and the privacy policy say plainly that
  catalogue copies persist after an entry is deleted.
