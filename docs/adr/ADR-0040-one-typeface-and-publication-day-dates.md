# ADR-0040 — One typeface, and an entry is dated by the day it was published

- **Status:** Accepted (decisions 2026-09-25, SDD Slice 29 addendum 4). Recorded
  by `OVE-511` (29.01). Implemented by `OVE-534` (29.25, the typeface) and
  `OVE-535` (29.23, entry dates).
- **Date:** 2026-09-25
- **Decision owner:** founder/owner
- **Supersedes:**
  - ADR-0022 **D7**'s "Typography uses `next/font/google` (Google Sans and Geist
    Mono …)": Google Sans is the only web font. The single `next/font/google`
    wiring stands.
  - `DESIGN.md` §2.6's Geist Mono and its `--text-mono` row, and the
    "self-hosted Geist Mono" lines of `docs/TECH_STACK_DECISIONS.md` and
    `AGENTS.md`'s stack table, once `OVE-534` ships.
  - ADR-0028's "one visible owned destination, date and public visibility" at
    the top of the composer: the composer has no date.
  - `DESIGN.md` §5.11's "the date is the reader's own calendar date, not the
    server's UTC day" and "changing destination preserves … date", and
    §5.14's second «Опубліковано …» line on a backdated entry.
- **Relates to:** ADR-0029 D11 (`source_language` still sets `lang`; this
  decision never touches `lang`).

## Context

The owner's words on 2026-09-25:

- «шрифт в проєкті глобально має бути лише один і без змін на болгарський
  вигляд написання (без болгарської локалізації кирилиці)»;
- on Geist Mono: «його не має існувати в проєкті. Має бути лише Google Sans -
  основний і системний»;
- on the letterforms: «потрібно прибрати це перемикання, аби шрифт завжди
  залишався одним стилем без перемикання на болгарський вигляд кирилиці»;
- on dates: «Дата публікації записів ставиться автоматично для записів
  користувачів та яка конкретно є на момент публікації запису. Користувач не
  вводить дату при створенні записів.» — and for existing entries, «так, для
  старих записів теж ставимо дату публікації».

## Decision

### D1. Google Sans is the only typeface

- Google Sans (latin and cyrillic, normal and italic) is the one web font. The
  system font is allowed only as its fallback while it loads, and in the
  proxy's standalone status documents, which cannot load the app's hashed font
  files.
- Geist Mono does not exist in the project: not in the font wiring, not in CSS,
  not in any component. What it set — codes and identifiers included — is set in
  Google Sans, and digits that must line up use tabular figures.
- A CI guard fails if a second web font is declared or the mono face returns.

### D2. Cyrillic never takes Bulgarian letterforms

- Text marked `lang="bg"` keeps the same letterforms as Ukrainian and Russian.
  The font's language-specific alternates (OpenType `locl`) are switched off
  (`font-feature-settings: "locl" 0` on the root, repeated wherever an element
  sets its own `font-feature-settings`).
- `lang` attributes do not change: screen readers, search engines, hyphenation
  and spell-check rely on them.
- If an engine ignores the setting, the Bulgarian `locl` lookups are removed
  from a self-hosted subset of the font; that would change D7's wiring and is
  put to the owner first.

### D3. An entry's date is its publication day

- No composer has a date field, for a new entry or for an edit. Editing keeps
  the entry's date.
- The server sets `entry_date` to the publication moment's calendar day in
  `Europe/Kyiv` (Sofia shares the offset), from the same instant that sets
  `published_at`. An entry published at 00:30 in Kyiv or Sofia on 26 September
  is dated 26 September everywhere.
- Existing entries take their publication day too, by one reviewed data
  migration with the previous dates kept beside its receipt so it can be
  reversed.
- With the date and the publication day always equal, no card or page shows a
  second «Опубліковано …» line.
- A client that still sends a date is accepted and the value is ignored.
  JSON-LD `datePublished` stays `published_at`.

## Consequences

- One font file family is requested per page, and no layout shift is added.
- A backdated journal is no longer possible; the date is always "when this was
  written". Sorts and indexes stay on `entry_date`, which now follows
  publication order for every entry.
- The analytics property `is_backdated` loses its meaning and is removed.
