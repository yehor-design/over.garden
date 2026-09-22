# DESIGN.md — the OverGarden design system

Status: **authoritative**, amended 2026-09-21 for the complete product redesign. Supersedes the stub that used to sit
here. Decisions behind it: `docs/adr/ADR-0031-design-system-and-redesign.md`.

Read this page before changing any interface. It governs tokens, components,
layout, patterns, accessibility and content. Where it disagrees with an older
document, this page wins; where it disagrees with an ADR, the ADR wins and this
page is wrong and must be corrected.

The accepted target is now Threads-led, with a centered vc.ru shell, Airbnb
progressive setup and Phosphor interface icons. The executable IA and transition
contract is `docs/redesign/2026-09-21/INFORMATION_ARCHITECTURE.md`. The 2026-09-17
measurements below describe their dated baseline, not current whole-product
conformance. Foundation and surface tasks deliver this target incrementally;
this canon amendment alone changes no production interface.

This is not a mood board. Every rule here is written so that a reviewer can say
"yes" or "no" to a diff without a discussion. If a rule cannot be checked, it
does not belong here.

---

## 1. What we are building

OverGarden is a public gardening journal for Ukraine and Bulgaria. It has two
modes and one interface:

- **Reading.** Anyone, usually arriving from a search engine, on a phone,
  possibly on a slow connection, reading one gardener's first-hand account.
  Everything here is public and indexable.
- **Keeping.** A signed-in gardener writing entries about their own plants and
  animals, under `/garden/**`.

One shell serves both. A reader must never feel they are in an admin tool, and a
gardener must never feel they left the site to use one.

### 1.1 Principles

Each principle is stated so that its violation is visible in a diff.

1. **The photograph is the only colour that matters.** The interface is near-neutral with dark ink actions. Saturated colour is
   reserved for a meaningful status or a photograph. A screen with two competing coloured areas
   and no photograph is wrong.
2. **A control works before JavaScript does.** ADR-0024 D3. A public control is
   a `<form action={serverAction}>` or a link. Wrapping the action in a client
   closure is a defect, not a style choice.
3. **Every state is designed.** Empty, loading, partial, degraded, error,
   permission-denied and offline-ish are states with copy, not accidents.
   ADR-0023 makes this mandatory under `/garden/**`.
4. **Accessibility is a build gate, not a review note.** The checklist in §8 is
   enforced by lint, unit tests and a browser test. A screen that cannot be
   operated with a keyboard does not ship.
5. **One way to do each thing.** If two screens need the same behaviour, they
   import the same component. A second implementation is a bug report against
   the first.
6. **Nothing is invented on a page.** Colours, spacing, radii, shadows, motion
   and type come from tokens. A raw value in a component is a defect.

---

## 2. Token architecture

Two layers, and only two. This is the single most important structural rule in
the system.

```
  layer 1  primitive   --og-neutral-600      a colour that exists
  layer 2  semantic    --color-text-muted    a colour with a job
                           ↓
  components and pages use layer 2 only
```

- **Primitives** (`--og-*`) are raw ramps. They never appear in a component, a
  page, or a Tailwind utility. They exist so that semantics can be re-pointed.
- **Semantics** (`--color-*`, `--space-*`, `--radius-*`, `--text-*`, …) are what
  everything else consumes, through Tailwind's `@theme inline` bridge.

Both layers live in `apps/web/src/app/globals.css`. Nothing else defines a
token. `apps/web/components.json` keeps `baseColor: "neutral"`: it is input to
the `shadcn` CLI when a primitive is first scaffolded, never a source of
runtime colour, and every scaffolded file is rewritten against the semantic
layer before it lands.

**The rule:** a component may reference a semantic token. A component may not
reference a primitive, a hex value, an `oklch()` literal, or a Tailwind palette
utility (`bg-emerald-600`, `text-gray-500`). Today the repository has five such
utilities and five inline `style={{}}`; the target is zero of the first and only
computed geometry for the second. §10 says how this is enforced.

### 2.1 Colour primitives

All ramps are OKLCH. Contrast figures below are **measured**, not estimated:
computed in a browser against `#ffffff` unless stated, WCAG 2.x relative
luminance.

**Neutral — the interface.** Hue 150 at chroma 0.002–0.008: a grey that carries a
whisper of the product without ever reading as green.

| Token              | OKLCH                    | Hex       | Contrast on white | Allowed use                     |
| ------------------ | ------------------------ | --------- | ----------------- | ------------------------------- |
| `--og-neutral-0`   | `oklch(1 0 0)`           | `#ffffff` | —                 | page and card surface           |
| `--og-neutral-25`  | `oklch(0.990 0.002 150)` | `#fbfcfb` | 1.03              | raised surface                  |
| `--og-neutral-50`  | `oklch(0.976 0.003 150)` | `#f6f8f6` | 1.07              | sunken surface, rails           |
| `--og-neutral-100` | `oklch(0.955 0.004 150)` | `#eef1ef` | 1.14              | hover fill                      |
| `--og-neutral-200` | `oklch(0.917 0.005 150)` | `#e1e4e2` | 1.28              | **decorative** divider only     |
| `--og-neutral-300` | `oklch(0.863 0.006 150)` | `#cfd3d0` | 1.51              | disabled fill                   |
| `--og-neutral-400` | `oklch(0.715 0.007 150)` | `#a0a4a1` | 2.52              | disabled text, icon on fill     |
| `--og-neutral-500` | `oklch(0.585 0.008 150)` | `#797d79` | 4.18              | **control border**, placeholder |
| `--og-neutral-600` | `oklch(0.487 0.008 150)` | `#5c615d` | 6.32              | muted text                      |
| `--og-neutral-700` | `oklch(0.395 0.008 150)` | `#434844` | 9.34              | secondary text                  |
| `--og-neutral-800` | `oklch(0.285 0.007 150)` | `#282b28` | 14.32             | heading                         |
| `--og-neutral-900` | `oklch(0.205 0.006 150)` | `#151816` | 17.89             | body text                       |
| `--og-neutral-950` | `oklch(0.145 0.005 150)` | `#090b09` | 19.75             | inverse surface                 |

Two consequences you must not forget:

- **`neutral-500` is the floor for text at body size** (4.18 < 4.5). It is a
  border and placeholder colour. Muted text is `neutral-600`.
- **`neutral-200` cannot carry a control boundary.** At 1.28 it fails WCAG 2.2
  1.4.11 (3:1 for the boundary that identifies a component). An input, a
  checkbox, a select and a bordered button use `neutral-500`. `neutral-200` is
  for dividers _inside_ a surface, which identify nothing.

**Green — retained status ramp.** Hue 151, anchored on the existing
`oklch(0.39 0.105 151)`, which becomes `green-700`.

| Token            | OKLCH                    | Hex       | On white | Use                 |
| ---------------- | ------------------------ | --------- | -------- | ------------------- |
| `--og-green-50`  | `oklch(0.968 0.024 151)` | `#e9f9ec` | 1.09     | success surface     |
| `--og-green-100` | `oklch(0.930 0.048 151)` | `#d2f2d8` | 1.20     | selected chip       |
| `--og-green-200` | `oklch(0.872 0.072 151)` | `#b3e3bd` | 1.43     | chip border         |
| `--og-green-300` | `oklch(0.790 0.093 151)` | `#8ecc9c` | 1.86     | decoration          |
| `--og-green-400` | `oklch(0.680 0.110 151)` | `#61ac75` | 2.74     | decoration          |
| `--og-green-500` | `oklch(0.575 0.115 151)` | `#3d8c55` | 4.13     | non-text accent     |
| `--og-green-600` | `oklch(0.487 0.110 151)` | `#24713e` | 5.99     | focus ring, hover   |
| `--og-green-700` | `oklch(0.390 0.105 151)` | `#005425` | **9.15** | success fill       |
| `--og-green-800` | `oklch(0.320 0.085 151)` | `#013e1a` | 12.31    | link hover, pressed |
| `--og-green-900` | `oklch(0.262 0.065 151)` | `#042d13` | 15.11    | on-green text       |

`white on green-700` = **9.15:1** for success states. Primary actions use
neutral-900 (17.89:1), hover neutral-700 (9.34:1), and pressed neutral-950
(19.75:1). `globals.test.ts` recomputes contrast from the actual token values.

**Status ramps.** Each has a 50 (surface), 100 (border), and a text/fill step.

| Role    | Surface              | Text                         | Fill (white text)    | Measured             |
| ------- | -------------------- | ---------------------------- | -------------------- | -------------------- |
| success | `green-50`           | `green-700`                  | `green-700`          | text on surface 8.38 |
| danger  | `red-50` `#fff1f0`   | `red-700` `#a7111a` (7.67)   | `red-600` `#c91a23`  | white on fill 5.74   |
| warning | `amber-50` `#fff7e2` | `amber-700` `#9c5313` (5.74) | —                    | ink on surface 16.74 |
| info    | `blue-50` `#eef7ff`  | `blue-700` `#00529c` (7.82)  | `blue-600` `#0069c1` | white on fill 5.54   |

**Warning has no white-on-fill variant.** `white on amber-600` is 3.22 and fails
for text. A warning is a surface with ink text and an `amber-600` accent edge,
never a filled amber button with white text.

### 2.2 Semantic colour

Components use these names and no others.

```
  surface            --color-surface              neutral-0
  surface-sunken     --color-surface-sunken       neutral-50
  surface-raised     --color-surface-raised       neutral-25
  surface-hover      --color-surface-hover        neutral-100
  surface-inverse    --color-surface-inverse      neutral-950

  text               --color-text                 neutral-900
  text-heading       --color-text-heading         neutral-800
  text-secondary     --color-text-secondary       neutral-700
  text-muted         --color-text-muted           neutral-600
  text-disabled      --color-text-disabled        neutral-400
  text-on-fill       --color-text-on-fill         neutral-0
  text-link          --color-text-link            neutral-900
  text-link-hover    --color-text-link-hover      neutral-700

  border             --color-border               neutral-200   decorative
  border-control     --color-border-control       neutral-500   identifies a control
  border-strong      --color-border-strong        neutral-700
  focus-ring         --color-focus-ring           neutral-900

  action             --color-action               neutral-900
  action-hover       --color-action-hover         neutral-700
  action-subtle      --color-action-subtle        neutral-100
  action-subtle-text --color-action-subtle-text   neutral-900

  success/danger/warning/info  ×  -surface, -border, -text, -fill
```

Light theme only. **There is no dark theme.** ADR-0031 D2 removes the `.dark`
block, the four `dark:` utilities and the unbranded purple `--sidebar-primary`
that had survived from the shadcn default. Reintroducing dark mode is a new ADR
and a full pass over every component, not a pull request.

`--color-action-pressed` maps to neutral-950. Selection also has an accessible
state and never relies on color. Native selection uses action/on-fill; the
caret follows text. Forced colors preserve system focus outlines and selected
state underlines.

### 2.3 Space

4 px base. Only these steps exist.

`--space-0` 0 · `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 ·
`10` 40 · `12` 48 · `16` 64 · `20` 80 · `24` 96

Rules: gaps inside a component ≤ `space-4`; gaps between components in a section
`space-4`–`space-6`; gaps between sections `space-8`–`space-12`; the page's top
padding `space-8` on mobile, `space-12` above `md`. A value not on this scale
needs a token, not an arbitrary utility.

### 2.4 Radius

`--radius` is 12 px. Derived: `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `2xl` 28 ·
`full` 9999.

Controls and inputs `md`. Cards and surfaces `lg`. Dialogs and sheets `xl`.
Chips, avatars and pills `full`. Media keeps `lg` and clips with
`overflow-hidden` so a photograph never squares off a rounded card.

### 2.5 Elevation

Threads is the principal reference for restrained light surfaces and author-first
reading. Separation uses spacing and subtle borders; not every post is a boxed card. Shadow marks _what floats above the page_, and nothing else.

| Level | Token              | Value                                                           | Used by                                              |
| ----- | ------------------ | --------------------------------------------------------------- | ---------------------------------------------------- |
| 0     | —                  | none                                                            | cards, rails, page sections. Separation is a border. |
| 1     | `--shadow-popover` | `0 1px 2px oklch(0 0 0 / 0.04), 0 4px 12px oklch(0 0 0 / 0.08)` | menu, popover, tooltip, combobox list                |
| 2     | `--shadow-overlay` | `0 8px 32px oklch(0 0 0 / 0.12)`                                | dialog, sheet, command palette                       |

A card does not get a shadow on hover. Hover changes `--color-surface-hover` and
nothing else.

### 2.6 Typography

Google Sans (latin + cyrillic, normal + italic) and Geist Mono (latin +
cyrillic), both through `next/font/google` in `apps/web/src/app/fonts.ts`. This
is the only typography wiring (ADR-0022 D7). (`AGENTS.md` said `next/font/local`
until 2026-09-17; the code has always been `next/font/google`, and the page was
corrected rather than the code.)

| Token             | Size / line-height | Weight                  | Use                                     |
| ----------------- | ------------------ | ----------------------- | --------------------------------------- |
| `--text-display`  | 40 / 44            | 700                     | public entry title, organism card title |
| `--text-h1`       | 32 / 38            | 700                     | page title                              |
| `--text-h2`       | 24 / 30            | 600                     | section                                 |
| `--text-h3`       | 19 / 26            | 600                     | card title, subsection                  |
| `--text-h4`       | 16 / 22            | 600                     | list-row title, label heading           |
| `--text-body-lg`  | 18 / 29            | 400                     | reading column prose                    |
| `--text-body`     | 16 / 24            | 400                     | interface default                       |
| `--text-body-sm`  | 14 / 20            | 400                     | secondary, dense rows                   |
| `--text-caption`  | 13 / 18            | 400                     | metadata, timestamps                    |
| `--text-overline` | 12 / 16            | 600, +0.04em, uppercase | eyebrow labels                          |
| `--text-mono`     | 14 / 22            | 400                     | codes, identifiers, EPPO/COL ids        |

Below `md`, `display` is 30/36 and `h1` is 26/32. Nothing else changes.

**Rules.**

- Interface text is **never** below 13 px. `--text-overline` at 12 px is
  uppercase metadata only, never a sentence.
- **Measure.** Prose targets 60–75 characters. Reading and composition share a responsive
  content cap of 704 px; the historical 708 px canvas/56 px gutter is superseded
  by ADR-0028 D3 as amended. Mobile controls must not consume a fixed text gutter.
- **Sentence case everywhere** except `--text-overline`. No Title Case buttons.
- **Cyrillic budget.** Ukrainian and Bulgarian run 10–15 % longer than English
  and Russian longer still. Every label must survive +40 % without truncating or
  wrapping to three lines. Nothing in the interface is a fixed-width label.
- Numerals are tabular (`font-variant-numeric: tabular-nums`) in any column of
  counts, dates or measurements.

### 2.7 Motion

| Token                | Value                          | Use                           |
| -------------------- | ------------------------------ | ----------------------------- |
| `--duration-instant` | 80 ms                          | hover, focus, colour          |
| `--duration-fast`    | 140 ms                         | menu, tooltip, chip           |
| `--duration-base`    | 200 ms                         | popover, accordion, sheet     |
| `--duration-slow`    | 280 ms                         | dialog, page-level transition |
| `--ease-out`         | `cubic-bezier(0.2, 0, 0, 1)`   | entering                      |
| `--ease-in`          | `cubic-bezier(0.4, 0, 1, 1)`   | leaving                       |
| `--ease-spring`      | `cubic-bezier(0.2, 0, 0, 1.2)` | one, deliberate, emphasis     |

Motion animates `opacity` and `transform` only. Never `height`, `width`, `top`
or `left`. Nothing moves more than 16 px on entry. There is no decorative,
looping or parallax motion anywhere in the product.

`prefers-reduced-motion: reduce` collapses every duration to 0.01 ms — already
implemented in `globals.css` and it stays.

### 2.8 Icons

Phosphor, and only Phosphor, for interface icons (owner decision 2026-09-21).
Use regular weight at 16/20/24 px (`--size-icon-sm/md/lg`), with fill only for
selected navigation, like and bookmark states. The typed `components/icons`
entry point owns defaults and decorative accessibility. Consumers import the named
local module (for example `@/components/icons/Heart`), not its runtime barrel, so
unrelated glyphs cannot enter a route through wrapper initialization. Each glyph uses a
narrow `@phosphor-icons/react/dist/ssr/<Glyph>` import. No provider or runtime
whole-library lookup. The semantic map and package version are recorded in
`docs/redesign/2026-09-21/ove-477/icon-inventory.json`.
Icons beside text are decorative; icon-only controls have accessible names and
matching supplementary tooltips. Real brand marks/favicons and author-authored
emoji in persisted documents are content, not competing interface icon families.
Do not rewrite persisted callout emoji or document schema to replace an editor
control. Server-rendered icons use server-compatible narrow imports. OVE-477
migrated existing Lucide consumers and the scaffold configuration; the old import
inventory is a migration baseline, not permission for new mixed families.

### 2.9 Illustration

3D rendered objects, used sparingly, in the Airbnb / Digg / Remote manner
confirmed in the Mobbin references: one object, centred, in an empty state or a
first-run card. Never as page decoration, never more than one per viewport.

Sizes: 96 px in a card, 144 px in a page-level empty state, 180 px maximum.
Always a `<img>` with `alt=""` — the heading beside it carries the meaning.
Served as WebP, never as inline SVG; where the files live is below.

**Source: `thiings.co`.** Decided by the owner on 2026-09-17, after the licence
position below was put to them, and reaffirmed twice the same day.

What the licence actually says, verbatim from `thiings.co/terms`: a free
download is for "Personal and non-commercial use", "Attribution required";
commercial use needs a paid licence ($49 indie / $199 business, lifetime); and
**no tier** permits reselling or redistributing the icons "as standalone
assets". OverGarden is a commercial product, so the free tier does not cover
its use.

**The owner's position, 2026-09-17: the free tier, and no attribution.** The
product carries no credit to `thiings.co` anywhere, including the footer. That
is their call and their risk; this page records it so that it stays a known
position rather than an assumption someone inherits, and so that nobody spends
an afternoon re-deriving a rule the product does not follow. An earlier draft of
this section required the credit; it was wrong about what had been decided.

Two rules survive that decision, and they are not optional:

1. **Never republish them as assets.** They are referenced from a page; they are
   never offered as a download, a pack, a sprite sheet, an archive or an API,
   and no route lists the directory. That prohibition is the one term that binds
   at every tier, including the paid ones, and no reading of the free tier
   excuses it.
2. **Keep the swap cheap.** The illustration stays a component prop and the
   files stay in one directory with one manifest,
   `apps/web/src/lib/illustrations.ts`. Buying the $49 indie licence, moving to
   [3dicons.co](https://3dicons.co/) (CC0 — commercial, no attribution), or
   dropping the set must be a one-directory change, not a hunt through
   components. `illustrations.test.ts` fails if any other file names a path.

**Where the files live.** `apps/web/public/illustrations/*.webp`, 360 × 360 —
twice the 180 px maximum, so the largest declared size stays sharp on a 2×
display and no size needs a second file. They are served by the CDN as plain
static WebP, never through the Vercel image optimizer, which ADR-0022 D2 bans.

They are deliberately **not** in the media bucket. That pipeline exists for a
gardener's photographs: a staging worker, an atomic publish, retention, and
revocation. Permanent pieces of app art have none of that, and putting them
in the user-media bucket would make every tool that reasons about that bucket
learn an exception. Shipping them with the code also means a rollback rolls them
back, which an object in a bucket does not.

**Redesign placement contract (2026-09-21).** `Illustration` is the shared
decorative renderer used by `EmptyState` and creation introductions. Use
`resolveIllustrationRole` for first garden, space setup, object setup, no entries,
no results and setup success. These purpose names are stable; the selected art
can change without rewriting screens. The collection is open to additional
selections, not a restricted shortlist. Source URLs, download/revalidation dates,
dimensions, bytes and SHA-256 are in
`docs/redesign/2026-09-21/ove-479/asset-manifest.json`.

Retain each source's optical padding and transparent background, contain the
whole square without cropping, add no colored medallion, outline or animation,
and never stretch it into a hero. A page uses at most one illustration; the
review contact sheet is deliberately a comparison, not a page template.
The renderer reserves 96/144 CSS pixels, uses lazy loading and async decoding,
and each 360px WebP stays below 40KB. No art is required for understanding or
acting: the adjacent heading, explanation and action stand on their own.

The no-results asset is available for a dedicated discovery introduction or
unfiltered search miss. A filtered list keeps §5.4's text, active filters and
clear action, without an illustration. Error, erasure, destructive confirmation,
permission denial and pending states never borrow cheerful setup art. Show
setup-success art only after an acknowledged server success; it must not imply
an unsaved form is durable. Never use any illustration in an organism/photo slot.

### 2.10 Photography

Photographs are the product. They keep the rules already in production
(ADR-0022 D2, `docs/MEDIA_LIFECYCLE.md`): browser-made WebP at 2560 / 1280 /
480 with a 16 px placeholder, plain `<img srcset>` from `media.over.garden`, no
server-side processing and no Vercel image optimizer.

Design rules on top of that: aspect ratios are 16:9 (cover), 4:3 (card), 1:1
(avatar, thumbnail) and `auto` (in prose). The first two are **tokens** —
`--aspect-cover` and `--aspect-card`, so `aspect-cover` and `aspect-card` are
utilities; 1:1 is Tailwind's own `aspect-square`, and `aspect-[4/3]` is exactly
the arbitrary value §10's gate 2 rejects. Every image reserves its box with
`aspect-ratio` so nothing shifts. Subject-aware cropping uses the existing focal
point. A photograph never has a coloured overlay; if text must sit on one, it
sits on a `neutral-950 / 0.55` scrim, measured to clear 4.5:1.

**Photo size follows the reading task.** Feed authorship/context precedes media.
Use natural or bounded aspect-ratio variants appropriate to portrait, landscape,
and multi-image posts. Reserve dimensions, keep focal points and preserve priority
for the true first-screen image. Do not inflate a photograph merely to make it
larger than a consent notice in the LCP calculation. The older mandatory 4:3
full-bleed rule is superseded; existing aspect tokens remain available for cards
whose job genuinely needs a uniform image box.

**A page shows a photograph once, where its author put it.** A cover is a crop
for the places that need a uniform box — a card, a feed, `og:image` — and since
the composer became Notion-shaped a photograph *is* a block of the entry's
document, usually the first. So an entry whose story opens with its cover drew
that photograph twice, one directly under the other, and the gallery at the
foot repeated the rest (found on production 2026-09-20, `OVE-471`). The rule:
**a photograph the story already shows is never shown again by the page around
it**, and a cover uploaded on its own — in no block — is the one a page still
draws as its hero. Uncropped in the story is the right way round: a portrait
photograph is never letterboxed on its own page to make a box tidy, which is
also what Medium and Substack do with a lead image.

**A card's photograph is described by the gardener, or it is decorative**
(OG-UX-029, `OVE-487`). On a card the photograph sits beside the entry's own
linked title, so an `alt` that repeats the title makes a screen reader say it
twice and describes nothing. `publicCardMediaAltText` gives a card the
caption the gardener wrote — "Жовті плями на нижньому листі" is an
observation the title does not make — and `alt=""` when there is none. The
entry's own page keeps `publicMediaAltText` (caption, else the title), where
the photograph is the content rather than a preview of it.

### 2.11 Layering

`--z-base` 0 · `--z-sticky` 10 · `--z-rail` 20 · `--z-header` 30 ·
`--z-popover` 40 · `--z-overlay` 50 · `--z-toast` 60.

No other z-index values exist in the codebase.

The consent notice is chrome, not a toast: it sits at `--z-header`. It is on
every page until the reader answers it (ADR-0032 D7), so anything the reader
opens — a menu, a popover, a sheet, a dialog — must be above it; at `--z-toast`
it covered the language menu's options (`OVE-473`).

---

## 3. Layout

### 3.1 Breakpoints

`sm` 40rem/640 · `md` 48rem/768 · `lg` 64rem/1024 · `xl` 80rem/1280 ·
`2xl` 96rem/1536. Mobile-first; a `max-width` query is a defect.

### 3.2 The shell

Navigation, reading and useful secondary context occupy one centered grid,
not two rails pinned to viewport edges. Initial design geometry (OverGarden's
choice, not measured vc.ru dimensions): max group 1280 px; left rail 208 px;
main minmax(0,704px); right context 280 px; two 24 px gaps, 20 px outer gutters.
The 1280px outer frame includes two 20px paddings; its inner grid is 1240px.
Use semantic tokens for these values. At >=1280 px all three columns fit. At 1024–1279 px
use the centered two-column group (maximum 976 px including gutters) without
the optional context; below 1024 px
use one column, compact header and bottom navigation. Essential information and
actions never live only in a rail. No horizontal page overflow at 320 CSS px.
An empty context rail renders no landmark or placeholder. The wide grid keeps
its context track reserved so late page context cannot shift the reading column.

The brand wordmark is 48 px high (`h-12`) from the desktop breakpoint
(`lg`, 64rem), with proportional width; below it the wordmark stays 28 px high.

Desktop primary destinations: Feed, Explore, My garden, Activity. New entry is
one persistent action. Saved reading, wishlist, public profile, settings and
sealed-owner tools belong to account utilities. Explore keeps Catalogue,
Communities and Knowledge as understandable destinations, not extra permanent
rail roots. `/catalog` remains a direct/crawlable destination; no URL move is
required just to label its entrance Explore.

Mobile has Feed, Explore, New entry, My garden, Activity; account is in the
header. New entry may use a named 44 px icon control while all navigation
items have short visible labels. A guest can navigate public destinations and
gets a real sign-in intent for protected actions. Hide ordinary bottom nav only
inside full-height composition, which supplies Close/Back and focus recovery.
See the IA document for exact UK/BG/RU labels and active-route rules.

The context rail may disappear when no useful context exists. A modal's frame
never replaces its full-page direct-link fallback. The shell migration is
OVE-481; preserved public address and static-document contracts take priority.

**The floating circular control clipped at the right edge of every page is not
the product's.** Measured on production on 2026-09-17: it is Vercel's toolbar
feedback button, injected at the edge for any browser carrying the
`__vercel_toolbar` cookie, from `vercel.live/_next-live/feedback/feedback.js`.
The served HTML contains no reference to it and neither does this repository, so
a reader never sees it and there is nothing here to delete. It goes by turning
the toolbar off, not by a change to the shell.

### 3.3 Landmarks

Exactly one `<header>` at top level (`banner`), one `<main>`, one `<footer>`
(`contentinfo`, which the product did not have at all until `OVE-443`), and
**every** `<nav>` and `<aside>` carries an `aria-label`. Two unlabelled
`complementary` landmarks, which is what the site shipped before that, is a
defect.

The `<main>` is the **page's**, never the shell's. The shell renders the region
it goes in (`#main-content`, the skip link's target) and would otherwise give
every page two.

The footer carries the four links nothing else linked — the catalogue, `/privacy`,
`/support`, `/first-publication-disclosure` — and the one language control of
§6. It does **not** carry a `thiings.co` credit; §2.9 records why.

The skip link is the first focusable element and is visible on focus.

### 3.4 Page header

Every page opens with the same block: optional breadcrumb → `h1` → one sentence
of description → optional actions, right-aligned above `md`. It is a component,
not a per-page arrangement.

---

## 4. Components

### 4.1 The inventory

The historical 2026-09-17 baseline had **7** primitives in `apps/web/src/components/ui/`, of which only
`Button` is genuinely adopted (78 imports), while **50 files reach for a raw
`<input>`, `<select>` or `<textarea>`**. That gap is the redesign's real work.

Required, in build order:

**Tier 0 — foundation.** `Box` wrappers are not a thing here; Tailwind is the
layout engine.

**Tier 1 — form and action.**
`Button` (rewrite) · `IconButton` · `ButtonGroup` · `Link` · `Input` ·
`Textarea` · `Select` · `Combobox` · `Checkbox` · `Radio` · `RadioCard` ·
`Switch` · `Field` (label + description + error + required, the one wrapper every
control sits in) · `Fieldset` · `SearchInput` · `FileDrop`.

Two more shipped with them, because the rule "no raw `<input>` outside `ui/`"
cannot hold without them. `HiddenField` is the payload a form carries to its
Server Action — about seventy of them, since `formData` is the only channel a
browser without JavaScript has (ADR-0024 D3); it has no role, no label and
nothing to style. `Spinner` is tier 3 by rank but `Button`'s loading state needs
it, so it was built first.

**Tier 2 — surface and structure.**
`Card` · `Surface` · `Separator` (exists) · `Tabs` · `TabLinks` · `Accordion` ·
`Table` · `ListRow` · `PageHeader` · `Section` · `Stack` utilities.

`TabLinks` is the same strip when each tab is an **address** rather than a
panel: it ships in `tabs.tsx`, shares `tabTriggerClass` so the two cannot drift
apart, and renders a named `<nav>` of links with `aria-current="page"`. A
`tablist` whose tabs navigate announces a tab and delivers a page, which is a
lie a screen reader cannot recover from.

**Tier 3 — status and feedback.**
`Badge` · `Chip` / `FilterChip` · `Avatar` · `AvatarGroup` · `Tooltip` (exists) ·
`Toast` · `Callout` · `EmptyState` · `Skeleton` (exists) · `Spinner` ·
`ProgressBar` · `ErrorState` (ADR-0023 classes) · `Pagination`.

**Tier 4 — overlay.**
`Dialog` · `AlertDialog` (exists) · `ConfirmSubmit` · `Sheet` (exists, rewrite) ·
`Menu` (exists) · `Popover` · `CommandPalette`.

`ConfirmSubmit` is how §4.4's rule and ADR-0024 D3 hold at once. A destructive
action lives behind an `AlertDialog` that names the object; a control may not
depend on hydration to do its job; and a dialog *is* hydration. So it renders a
real `<button type="submit">` inside the form — which posts before the bundle
runs — and, once hydrated, intercepts the press and opens the dialog instead.
The dialog's confirm sits in a portal and submits by `form={id}`. **Hydration
adds the confirmation; it never takes away the action.**

**Tier 5 — product.**
`EntryCard` · `OrganismCard` · `ProfileHeader` · `EngagementBar` (like, bookmark,
follow, comment — all Server Actions) · `MediaFigure` · `CatalogPicker`
(rewrite over `Combobox`) · `FilterBar` · `LocaleNotice` · `ConsentBanner` ·
`JournalShortcutSheet` · `UnpublishedWorkGuard`.

The last two are the composer's, and §5.11 says what they are for. Neither is a
`ui/` primitive: one is generated from the editor's own rule modules, the other
knows what "unpublished" means in this product.

### 4.2 The component contract

Every component in `ui/` obeys all of this:

1. **Props**: `variant` (what it is), `size` (how big), `tone` (which semantic
   colour). No `color`, no `className` hacks that re-specify a token.
2. `className` is accepted and merged last through `cn()`, for layout only.
3. It forwards `ref` and spreads the rest onto the real DOM element, so
   `aria-*`, `data-*` and `id` always work.
4. It renders a real element: a button is a `<button>`, a link is an `<a>`.
   `asChild` exists for the one case where composition is needed.
5. **It carries no data fetching, no routing, no business rule.**
6. It is authored as a Server Component unless it needs state, and `"use client"`
   appears as late in the tree as possible.
7. It has a `.test.tsx` next to it asserting its accessible name, role, keyboard
   behaviour and disabled semantics.

### 4.3 Sizes

Three action sizes: `sm` 32 px · `md` 44 px · `lg` 48 px. Form fields keep
their 40 px default; primary actions and default icon buttons provide 44 px
without depending on invisible hit padding. `md` is the default. **On touch, the hit target is 44 × 44 even
when the visual control is 32** — extend with padding or a pseudo-element, never
by growing the visual.

### 4.4 Button

| Variant     | Fill            | Text                 | Border           | Use                           |
| ----------- | --------------- | -------------------- | ---------------- | ----------------------------- |
| `primary`   | `action`        | `text-on-fill`       | none             | the one action of the screen  |
| `secondary` | `surface`       | `text`               | `border-control` | everything beside it          |
| `subtle`    | `action-subtle` | `action-subtle-text` | none             | low-emphasis, in-context      |
| `ghost`     | transparent     | `text-secondary`     | none             | toolbars, rails, cards        |
| `danger`    | `danger-fill`   | `text-on-fill`       | none             | destructive confirmation only |

**One `primary` per screen region.** Two primaries side by side is a defect. A
destructive action is never `primary`; it is `danger` and it lives behind an
`AlertDialog` that names the object being destroyed.

Loading: the button keeps its width, swaps the label for a spinner, sets
`aria-busy` and stays focusable. It never disappears and never resizes.

---

## 5. Patterns

### 5.1 Filters

Six equally loud `<select>`s above the results was the anti-pattern the audit
found (OG-UX-010/011). Every public listing now has **three tiers**, in one
component, `FilterBar` (`OVE-482`):

1. **Search** — the widest control, scoped to the listing it sits on and never
   merged with the owned-destination search of the composer.
2. **Modes** — the listing's one primary split (plants / animals, a kingdom),
   as plain links with `aria-current="page"`. It lives here and nowhere else.
3. **Filters (n)** — every secondary facet behind one button that states how
   many are applied. At every width it opens one labelled panel: a bottom
   sheet below `lg`, a side panel above it. The panel is a native `popover`,
   so it opens, closes and submits with the bundle absent.

The panel is a **draft**. Nothing changes until "Show results"; **Close**
(named Close, never Reset), Escape and a tap outside discard the draft and
leave the committed view exactly as it was. **Clear filters** removes the
secondary facets and keeps the query, the mode and the sort. "Clear all",
beside the chips, is the only control that also clears the query. An empty
filtered result offers Clear filters, not a reset that erases the words typed.

- A chip that changes what a list shows is a `<button type="submit">` inside a
  `<form method="get">`, never a link. `aria-pressed` is what tells a reader
  whether a filter is on, it is valid on a button and an **ARIA error on a
  link**, and a GET form is the browser's own mechanism, so the press works
  before hydration and the result lands in the URL. The crawlable path to the
  same view is a plain anchor elsewhere on the page — the feed's is in the
  context rail.
- Active filters appear as removable chips above the results, with "Clear all"
  when more than one is set.
- The result count is always visible and updates with the filters.
- Sort is a separate control, right-aligned, never mixed in with filters.
- Sort is the one control besides a mode that applies on change.
- A hydrated change shows "Updating results…" as a status while it is on its
  way; a slow search, an empty result, a degraded search and a failure are four
  different states and each keeps the query.
- Every filter is in the URL, in the vocabulary of
  `src/lib/public-listing-filters.ts`: **one query parameter per facet, named
  for the facet, repeated for multi-select, plus `sort` and `page`; absent
  means unset.** No packed or encoded composite parameter. A filtered view is
  linkable and survives reload and Back.
- Results update in an `aria-live="polite"` region announcing the new count —
  and **the change has to be a client navigation for that to happen at all.**
  A plain anchor or a form submit replaces the document, and a live region that
  arrives with a fresh document announces nothing. So a hydrated filter change
  goes through the router, and a chip's removal is a `Link` rather than an
  `<a>`: both keep a real href for the unhydrated case and keep the DOM for the
  announcement. Measured, after a chip built as a plain anchor silently
  announced nothing. The exception is a listing whose query views are `/q`
  twins (ADR-0032): it navigates the document so Proxy picks the route tree,
  and its new count arrives in the served bytes of the new page, next to the
  results heading, rather than being announced into the old one.
- **Two sibling `<form method="get">`s are the mechanism.** The bar's form
  carries the search, the sort, the mode and the *committed* facets as hidden
  fields, so a search never drops a filter; the panel's form carries the draft
  facets plus the committed query, mode and sort, so applying never drops a
  search. The router or a document navigation is the enhancement over both.
  There is no `<noscript>` block and no submit that appears
  and then vanishes on hydration — the first risks a mismatch inside an element
  the browser parses as text, the second flashes a control at every reader.

### 5.2 Search

One `CommandPalette`, opened by `⌘K` / `Ctrl+K`, by the header control, and by
`/` when focus is not in a text field. Grouped results, in this order: Journals,
Organisms, Gardeners, Communities, Actions. Keyboard hints in the footer. Recent
searches when the query is empty.

The palette is an enhancement. `/journals` and the catalogue remain full,
crawlable, no-JavaScript search pages, and the rail keeps a plain link to each.
A palette that replaced them would take 114,669 pages out of the index, which
is the opposite of what the product is for (ADR-0022 D3).

Four rules that are the whole of it, each one a test:

- **One dialog, however many triggers.** The rail draws a search field and the
  narrow bar an icon; mounting the component twice gave the document two
  dialogs, two comboboxes and two `⌘K` listeners, so `⌘K` opened both. The
  provider is mounted once and the triggers read it from context.
- **`/` must not steal a keystroke.** It opens the palette only when focus is
  outside a text field, and "text field" means an `<input>`, a `<textarea>`
  **and** a `contenteditable` — the composer is the third, so a rule that
  checked the first two would make the editor swallow every `/` a gardener
  typed.
- **The live region announces the settled query, not the keystroke.** One
  debounce feeds both the read and the count, so the number a reader hears is
  the number they can see. A count that re-announces on every letter is worse
  than no count at all.
- **The arrows move a pointer, not focus.** The list is a `listbox` driven by
  `aria-activedescendant` and focus never leaves the field, which is what lets
  a screen reader read the active option while the reader keeps typing. The
  index is flat over the groups in order, so Down at the end of one group
  reaches the next.

### 5.3 Forms

Grounded in the Plain, Twenty, Gorgias and Workable references.

- `Field` wraps every control: visible label above, optional description below
  the label, control, error below the control.
- **Labels are always visible.** A placeholder is not a label, and placeholder
  text is `neutral-500` — which means it is never the only carrier of meaning.
- Mark **optional** fields, not required ones, when most are required. Do the
  reverse when most are optional. Never mark both.
- Validate on submit, and on blur only after the field has already failed once.
- An error is `red-700` text below the control, the control gets
  `aria-invalid` and `aria-describedby`, and the first invalid control takes
  focus on submit.
- A form-level error is a `Callout` with `role="alert"` above the fields, and it
  names what to do next, not what went wrong internally.
- A form that changes server state is a Server Action on a real endpoint
  (ADR-0024 D3). No exceptions on public pages.
- A **password field** carries a show/hide control whose _accessible name_
  changes with its state — "show password" becomes "hide password". A name that
  never changes leaves a screen-reader user pressing a button whose effect they
  cannot hear. It degrades to a plain password field before hydration, which is
  the right way round.
- A **third-party sign-in button** follows that party's identity rules, not this
  system's: Google's require the four-colour mark, permitted wording, a 40 px
  minimum and clear space beside the mark, and the provider's name is never
  translated. The colour gate stands down for that one file by path, because a
  trademark is the one colour that must never be re-pointed.

### 5.4 Empty, loading, error

| State                   | Shape                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **Empty (nothing yet)** | illustration slot · `h3` sentence · one muted line · one primary action                              |
| **Empty (no results)**  | no illustration · "Nothing matched" · the active filters as chips · "Clear filters"                  |
| **Loading**             | skeleton matching the real layout's boxes, never a spinner on a page                                 |
| **Partial / degraded**  | the section renders its settled failure class with a reason, a reference code and a Retry (ADR-0023) |
| **Error**               | `ErrorState`: what happened in one sentence, what to do, the digest, a Retry                         |
| **Signed out**          | the real page behind it where possible, with one `Callout` and one link to `/auth/sign-in`           |

A skeleton must not outlive its data by design: a section that can fail settles
into a failure class instead of a permanent skeleton — the framework defect in
ADR-0023 is still unfixed upstream and this rule is what protects readers from it.

### 5.5 Overlays

- **Dialog** for a decision that needs the page's context kept. Focus trapped,
  `Esc` closes, focus returns to the trigger, background inert.
- **Sheet** below `lg` for anything that would have been a dialog, and for
  filters. Bottom-anchored, drag-to-dismiss optional, same focus rules.
- **Menu** for a list of actions on one object. Never for navigation between
  pages when a rail exists.
- **Toast** for the outcome of a completed action, `role="status"`, 5 s, never
  carrying the only copy of anything. Offer Undo only where the actual server lifecycle supports it; deletion has no invented restore promise.
- An overlay never opens another overlay. `base-ui` closes a controlled,
  trigger-less menu with reason `sibling-open` when a submenu opens inside it
  (found in Slice 26) — so menus are flat.

### 5.6 Engagement

Like, bookmark, follow and comment are Server Actions on a form with a real
endpoint. They are optimistic **after** hydration and correct before it. The
control's accessible name states the action and the count
("Like, 12 likes" / "Liked, 13 likes"), and the count lives in an
`aria-live="polite"` region.

### 5.7 Profiles and tabs

A profile is content, not a dashboard (ADR-0031 D4). `ProfileHeader` is the one
shape: picture, name, handle, one line of bio, the facts that are not counts,
the counts, and **one** action — the rest belong in a menu.

- **A count of zero is omitted rather than printed.** A row of zeros tells a
  visitor only that nothing is happening, and the empty state below already
  says it in words. A count that is *hidden* — a gardener who does not publish
  their relationships — is omitted too, and the page says so in a sentence
  instead of printing a blank.
- **A tab's selection lives in the URL.** A view a reader cannot share or
  reload back into is a view that forgot what it was for, so the selected tab
  is a search parameter and the server decides which panel is open on the
  first paint. `replace`, not `push`: a tab is a view of one page, and filling
  the Back button with tab changes makes Back stop meaning "the page I came
  from".
- **The press is applied before the address is.** The obvious shape — read the
  parameter back out of the router and let that be the state — was measured in
  a browser and is wrong: the parameter is read on the server, so between the
  press and the answer an arrow key moved focus to a tab that stayed
  `aria-selected="false"`. The component holds the selection and adopts a
  `selectedId` that changes underneath it.
- **Every panel is rendered, whichever tab is open.** `Tabs` hides the others
  rather than dropping them, so a crawler still reads a gardener's entries
  whatever `?tab=` says.
- **A public route carries only the parameters it declares.** The author-scoped
  rewrite rebuilds the search string from `lib/interface-route-policy.ts`, so a
  new parameter that is not registered there never reaches the page: the
  address changes and the view does not.

### 5.8 One listing per thing

A product with two listings over one graph has two of everything: two result
cards, two facet vocabularies, two canonicals, two indexing decisions — and a
reader who never learns they are the same thing. The catalogue had exactly
that, and closing it (`OVE-451`) fixed four rules worth keeping:

- **One address, and the name is the one the product already uses.** The menu
  says *Каталог*, the schema says `catalog_items`, the owner's tools live at
  `/garden/catalog`; the public listing is `/catalog`. An address that
  under-describes what it holds — `/species` listing breeds — is a name a
  reader has to translate.
- **A merged entrance is a `308`, never a deletion.** Every address the
  product has published keeps answering, and it lands on the *view* it meant:
  `/objects` listed the organisms gardeners here keep, so it lands on that
  filter of the catalogue rather than on the whole of it (ADR-0029 D8).
- **A named view is a facet, not a second page.** `?grown=1` is a view of one
  listing with one canonical. Two pages over one query is how the duplicate
  started.
- **The redirect is decided before the 404s.** An address whose directory has
  gone is exactly the shape the unknown-segment and section-root blocks answer
  404 for, so a merge that adds its redirect below them turns a published
  address into a 404 — which is what the first draft of this did.

### 5.9 Articles and reference pages

Everything the product publishes that is not a gardener's entry — the blog,
the guides, the answers, the market landings, and the legal and support pages
— is one article shape, and every index over them is one hub shape.

- **The article is `OVE-449`'s reading column, reused.** 704 px at 18/29, one
  byline row, one `MediaFigure`, and the same contents rail above `xl`. A
  reference page differs from an entry in what it says, not in how wide its
  lines are.
- **A section heading is a real heading with a real id.** The rail links to
  them, a screen reader lists them, and a reader can share one. A bold
  paragraph is none of those things.
- **A reference page with no photograph is type and space** (ADR-0031 D3).
  There is no decorative illustration slot on an article: a cover is a real
  photograph or it is absent.
- **Legal copy gets structure, never edits.** Headings, a contents list and a
  measure a person can read are design decisions. The wording of a disclosure
  is a legal one, and `src/lib/privacy/disclosures.test.ts` is what stops the
  two being confused.
- **An instrumented path is a contract.** Nine paths carry the product's only
  analytics. A redesign may change everything on them and must change none of
  their addresses; the set is enumerated in
  `src/app/google-analytics.test.tsx` so a move fails there first.

### 5.10 A count of zero is not a fact

Every surface that counts something owes its reader the same discipline, and
the community card is where the product failed it most plainly: the one
community on the site rendered `0 Записи · 0 Живі об'єкти · 0 Учасники` as its
entire footer, spending the most valuable row on the card to say that nothing
was happening.

- **Omit the nought, and say what the thing is instead.** A count of zero is
  the absence of a fact, not a fact; `communityFacts` returns what a community
  *has*, and a community with nothing yet gets one badge that is true of it.
  The same rule governs a profile's counts and a listing's facets.
- **"Nothing yet" and "nothing matched" are different screens** (§5.4). The
  first is one `empty-first-run` with one action — not a filter bar over
  nothing, a heading with a nought beside it and an empty picker stacked on
  each other. The second is the filters the reader set and a way to clear them,
  with no illustration.
- **An empty state must not become an indexable thin page** (ADR-0022 D4). An
  empty listing is one of the three places `noindex` is allowed, and a redesign
  that makes emptiness look better must not make it look indexable.
- **A rule a reader is asked to follow is on the page.** The community's rules
  of participation lived in a section marked `xl:hidden`, so above `xl` — where
  the context rail took them — the community's own page carried no rules at
  all, and the widest reader was the one told least. A rail is a *second* home
  for something, never its only one.
- **Membership is not a roster.** A community shows the people writing in it,
  which they published by publishing; who merely joined is theirs, and the
  product has no disclosure covering a list of them.

### 5.11 The composer, where nothing is durable

The composer is the one screen in the product where the reader's work exists
only in the tab they are looking at. ADR-0022 D3 forbids a draft, an offline
queue and any durable browser state; ADR-0028 preserves the document/block model
with the responsive geometry amended in D3. These contracts are kept,
and the consequences belong on the screen rather than in the reader's memory.

- **Say the value, never only the fill.** The cover controls used to mark the
  chosen mode by rendering one button `primary` — colour alone (WCAG 1.4.1),
  announced to nobody, and two of the four buttons dispatched the same mode.
  The section now prints "Обрано: <the photograph's own name>" and every toggle
  carries `aria-pressed`. The same goes for the focal point, which said its
  coordinates in `aria-valuetext` and to nobody else.
- **A thumbnail is named, not instructed.** The label under a photograph is the
  photograph — "Фото 2" — and the action stays on the control. The selected one
  gets a word, not a hue.
- **Leaving warns once, in the product's own dialog.** `beforeunload` covers a
  reload, a close and an address typed into the bar, and none of the ways a
  reader actually leaves: a press on a link in the shell is a client-side
  navigation that fires no unload event at all, and the composer simply
  unmounted. `UnpublishedWorkGuard` watches clicks in the capture phase, stops
  only a same-origin link that leads somewhere else, and re-issues the
  navigation the reader pressed once they have chosen. It asks **once**.
- **The input rules are on the screen.** `## `, `[x] `, `~~` and the rest were
  discoverable only by a reader who already knew Markdown. The shortcut sheet
  lists every rule and every key — and **generates every row from the module
  that implements it**, because a shortcut sheet that has gone stale teaches a
  key that does nothing.
- **One composer, one explicit destination.** A contextual Write opens in one
  activation with the exact object/space. A global launch with multiple choices
  opens the all-owned-destinations picker immediately; selection goes straight
  to writing. Changing destination preserves in-memory text, media and date.
  It is `components/garden/entry-composer.tsx`, at `/garden/new` for the
  global Write and inline on an object's page and a space's journal
  (`OVE-486`). The date is the reader's own calendar date, not the server's UTC
  day; a space entry asks which of the space's own objects it mentions, because
  the server requires one to twelve; and a publish refused for an ended session
  keeps the text and offers sign-in in a new tab rather than navigating away.
- **One readable responsive canvas.** Use the main content cap and fluid inner
  padding. Keep advanced block controls in a focusable menu on narrow screens;
  the old fixed 56 px gutter must not steal writing space. Slash commands and
  drag handles are enhancements, never the only accessible controls. Below
  `sm` the gutter is gone and the text has the whole width (`OVE-487`).
- **The tools sit under the text, and none of them takes the caret.** One row
  of ordinary buttons (`lexical-journal/journal-composer-tools.tsx`, a
  labelled group, not a toolbar of every mark): Photo, bold, italic, a
  bulleted list, and every block in the registry behind one "Block" menu —
  each block with its Phosphor glyph, the same record the slash menu and the
  gutter read. A pointer press never moves the selection; a keyboard press
  acts on the selection Lexical still holds and puts the caret back. The
  first line's placeholder invites writing and does not name the slash key;
  later empty lines still do. The shortcut sheet ends the row on `sm` and up.
- **A photograph says where it is, in words, and every control names it.**
  Photo takes several files at once and puts them where the caret is, never
  over a selected block or selected words. Each photograph says its step —
  read on this device, compressed to WebP on this device, sent to temporary
  storage — and "ready" means ready to publish, never uploaded or published.
  Its controls are always on the screen (a phone has no hover): Up, Down,
  Retry, Replace, Cover (`aria-pressed`) and Remove, each named with the
  photograph — "Прибрати: Фото 2 — Жовті плями на нижньому листі". Beside
  Publish one line counts them all, and Publish with a failed photograph sends
  nothing and takes the reader to its Retry. The caption field is the
  photograph's description and its `alt`; its placeholder asks for what the
  photograph shows, not for the post again.
- **The cover is a question only once there is a photograph.** A plain note
  never meets the cover section; the first photograph brings it, and a cover
  of its own (in no block) keeps it. There is no separate "optional photo"
  section: photographs are added to the story.
- **Creation has two explicit transactions.** Standalone Create acknowledges an
  empty entity; nested first-entry creation stages the proposed destination in
  memory and commits destination plus first entry atomically at Publish. Failure
  is not a saved draft or a saved object. See the IA transaction table.

### 5.12 The owner's queue

Three surfaces the owner sits at for an hour — the decision queue, the sources
and comment moderation — and the rules that make an hour bearable.

- **A shortcut the page does not print is a shortcut only its author has.**
  The queue's keys were one sentence of prose; they are a `<kbd>` against each
  action now, and both the legend and the binding read `shortcut-keys.ts`, so
  the list on screen cannot gain or lose a key the handler does not.
- **A confirmation belongs to one decision.** The queue's "confirm this merge"
  link carried neither the filter nor the item, so confirming a merge on the
  fifth card re-rendered the first with the confirmation already granted — and
  a merge moving fifty-one gardeners' objects was applied to whatever happened
  to be at the top. A grant now names its item, and a grant that does not name
  the decision on screen is no grant.
- **Name the count, not the rule.** "More than fifty" is the threshold; what
  the owner is deciding about is *this* many objects.
- **An owner surface is still the product.** Comment moderation rendered its
  three controls as `review`, `dismiss`, `remove` — the enum, in English, on a
  page the product otherwise keeps in three languages — and its rows as
  `journal_entry · spam · submitted`. An operator page has fewer readers, not
  lower standards.
- **The closure form is gone, not deprecated.** `OwnerScopedActionForm`
  wrapped a `(formData)` action in a client closure, which React answers with
  `action="javascript:throw …"`; thirty-three owner controls across seventeen
  files silently did nothing until the bundle ran. Slice 28 converted them all
  and deleted the shape. A form that cannot be imported cannot be reached for.

---

## 6. Language and locale

The `docs/INTERFACE_LOCALE_CONTRACT.md` contract stands, in its current form:
the interface language is the reader's on every address, **both markets offer
all three languages**, and the market decides only which one a reader who has
chosen nothing starts in.

**This section said the opposite until 2026-09-17** — Ukraine as a
Ukrainian-only market with no language control — and described a production
defect anyone could see: Ukrainian content under Bulgarian chrome, with a banner
offering the reader the language they were already reading. Both are gone. The
rule that outlived them: **a redesigned screen must never ship a mixed-language
chrome.** The design rules that follow:

- Interface strings and content strings are two different things on screen.
  Content is never restyled to look translated.
- `lang` is set on any element whose text is in a different language from the
  document — a scientific name, a quoted source, a Bulgarian entry inside a
  Ukrainian feed. A _species'_ canonical name is `lang="la"`; a variety's or a
  breed's is a cultivar name in somebody's language and is left unmarked.
- **Exactly one** language control per rendered document, in either market,
  offering all three languages. Zero is a defect and two is a defect, and that
  includes the raw `404`/`410` lifecycle HTML and the global error fallback,
  which drew none for the Ukraine market until `OVE-446`. It lives in the
  footer (§3.3).
- There is **no** locale notice. It compared the reader's language with the
  route's and offered the reader their own, which made sense only while an
  unprefixed address was always Ukrainian.
- A cross-locale link is a plain anchor, never a prefetching router link:
  `proxy.ts` cannot tell a prefetch from a visit, so hovering an option once
  rewrote the reader's saved language (ADR-0024 D4).

---

## 7. Content and voice

- Sentence case for every label, heading, button and menu item.
- Buttons say the verb and its object: "Publish entry", not "Submit", not "OK".
- Errors say what to do next. No codes in the sentence; the reference code sits
  beneath in `--text-mono`.
- Never "Are you sure?" alone. An `AlertDialog` names the object and the
  consequence: "Delete the entry 'Tomato — Sep 1'? The public page answers 410
  for seven days, then goes."
- No exclamation marks, no "Oops", no first-person plural apology.
- Numbers, dates and units are localised; scientific names never are.

---

## 8. Accessibility — the gate

Target: **WCAG 2.2 level AA**, on every public and workspace screen. Automated
checks cover a subset; manual keyboard, screen-reader, contrast, reflow and
error-recovery proof are required. Passing a mechanical gate is not a claim of
whole-product conformance. The 2026-09-21 audit explicitly records untested states.

**Colour and contrast**

- Text ≥ 4.5:1; large text (≥ 24 px, or ≥ 18.66 px bold) ≥ 3:1.
- Any boundary that identifies a control, and any meaningful icon, ≥ 3:1.
- Colour is never the only signal: a status carries an icon or a word too.

**Keyboard**

- Every interactive element reachable and operable by keyboard, in DOM order.
- Focus visible on everything: 2 px `focus-ring` outline, 2 px offset, at
  **full strength**. Never `outline: none` without an equal replacement.

  **How this was broken for the whole product, and what makes it stay fixed.**
  Tailwind v4 compiles `outline-none` to `--tw-outline-style: none` and every
  `focus-visible:outline-*` to `outline-style: var(--tw-outline-style)`. A
  control carrying both — thirty-seven places did, `Button`, `IconButton`,
  `Input`, `Checkbox`, `Radio`, `Switch`, `Tabs`, `Accordion`, `Dialog`,
  `Popover`, `Link`, `Chip`, `Pagination`, `ListRow`, `CommandPalette` and
  `ErrorState` among them — resolved its ring to `outline-style: none` and drew
  **nothing**, while reporting `outline-width: 2px` and a set colour. The ring
  was also `focus-ring/50` from shadcn's default, which measures about 2.0:1
  over white and fails 1.4.11's 3:1 even where it did draw. Nothing caught
  either: axe does not test focus visibility, and the browser gate asserted
  `outlineWidth !== "0px"`, which was true throughout. `globals.css` now
  carries one **unlayered** `*:focus-visible { --tw-outline-style: solid }`,
  which wins over `@layer utilities` whatever a component writes, and the gate
  asserts the width, the style and the colour on every control a keyboard walk
  reaches.

- No keyboard trap. `Esc` closes every overlay. Focus returns to the trigger.
- Skip link first. Roving tabindex in tab lists, menus and toolbars.

**Structure**

- Exactly one `h1`; heading levels never skip.
- One `main`, one `banner`, one `contentinfo`; every `nav` and `aside` named.
- Lists are lists, tables are tables with `<caption>` and scoped headers.
- `aria-current="page"` on the active navigation item.

**Forms** — as §5.3, plus: no `autofocus` on a page load, `autocomplete` on every
personal-data field, and an input's purpose identified (WCAG 1.3.5).

**Targets** — WCAG 2.2 2.5.8: minimum 24 × 24 CSS px, and 44 × 44 on touch for
anything in a bar, rail or card footer.

**Motion** — §2.7. Nothing auto-plays, nothing flashes more than three times a
second.

**Dynamic content** — every asynchronous result announces itself once, in a
polite live region. Never `role="alert"` for a routine success.

**Zoom and reflow** — usable at 320 px width and at 400 % zoom with no
two-dimensional scrolling; text spacing overrides (WCAG 1.4.12) do not clip.

**What the product already gets right, and must not lose:** a working skip link,
one `main`, cards as `<article>`, zero images without `alt`, zero unlabelled
controls, zero targets under 24 px, and **zero contrast failures at AA** on
`/journals` as measured on 2026-09-17.

---

## 9. Performance, which is accessibility

The public pages are the product's distribution. Budgets per public page:

- LCP ≤ 2.0 s on slow 4G with a 4× CPU slowdown, measured as below; CLS ≤ 0.02;
  INP ≤ 200 ms.
- No layout shift from an image, a font or a late banner — every box is
  reserved, the consent banner included.

**A public page is a static document** (ADR-0032). Its heading, its words and
its photograph are in the served bytes, outside every `<div hidden>`; only who
is reading arrives at request time, into regions whose fallback is the guest's
working control. That is what makes the LCP budget reachable, and it is a rule
about every page that will ever be added here, not a tuning of three:

- A page reads neither `searchParams` nor the session. A query string renders
  from the listing's twin under `/q`; a gardener's view of a page is a
  `SignedInOnly` or a request-time region *below* the content.
- No `loading.tsx` and no `Suspense` above a page's content. React puts any
  boundary's content larger than 12.8 kB into a hidden segment, fallback first,
  and reveals a late one no sooner than 300 ms after first paint.
- The LCP element is never inside a boundary, and never arrives with hydration:
  the consent notice is in the bytes and drawn by CSS from what `<html>` says
  before first paint.
- A failed read is never prerendered.
- **The largest photograph on the first screen is never lazy.** A lazy image is
  not requested until layout has found it near the viewport, which is after the
  stylesheet: 2.9 s on production's organism card, whose first gardener
  photograph was its LCP element (`OVE-470`). A page's first photograph is
  `priority` — eager, a high fetch priority, a preload in `<head>` — and in a
  listing that is its **first photograph** within the first two cards
  (`src/lib/media/first-photograph.ts`), not its first card, which may be words
  only. Every other photograph is lazy and names no priority: the browser
  already asks for a lazy image outside the viewport at its lowest, and raises
  one it finds inside — a blanket `fetchpriority="low"` changes nothing for the
  first and takes that rescue from the second. **Whatever draws the first
  photograph carries this**, including the entry's story when it opens with one
  and the page therefore draws no cover of its own (§2.10): removing a hero is
  not allowed to cost the page its LCP element.
- **Nothing above a page changes by itself** (ADR-0032 D10). What the chrome
  learns after the document is served — the address, who is reading, what a
  page puts in the rail — lives in a store (`src/lib/value-store.ts`) and is
  read by the region that needs it. As a context value, or as state in the
  shell, it reaches every boundary React has not hydrated yet, and one whose
  content is still on its way is thrown away and rendered on the client: a
  second, later LCP, and the page's `<main>` in the document twice. A
  transition does not prevent it.

**How it is measured.** Lighthouse **CLI**, a production build, three runs,
median, throttling **applied** (`--throttling-method=devtools`). The simulated
figure is recorded beside it and is not the gate: simulation charges LCP with
every script that evaluated before the paint *on the unthrottled trace*, which
on a loopback server is all of them whatever the document does.

A "before" and an "after" share their environment, their data and their
method, and the number that counts is production's. A local build with a light
fixture measures the architecture and nothing else.

| Page | Local build, fixture data: LCP applied / simulated | **Production**: LCP applied / simulated (2026-09-20) | Production before (2026-09-19) |
| --- | --- | --- | --- |
| `/` | 1.90 s / 4.43 s | **5.74 s** / 6.36 s | 5.47 s / 5.16 s |
| a journal entry | 1.65 s / 3.31 s | **4.40 s** / 4.27 s | — |
| an organism card | 1.74 s / 3.97 s | **6.17 s** / 6.28 s — it was 7.05 s / 5.87 s while its first photograph was lazy (`OVE-470`) | — |

**The budget is not met on production** (`OVE-469`). The static document took
React's start-up out of the path — the LCP element's render delay there is
7–36 ms, CLS 0 — and what remains is the photograph's *load*: 3.7–5.0 s for a
92 kB cover that shares the link with 330 kB of script, 106 kB of fonts and then
890 kB of below-the-fold photographs.

Read both columns knowing which way each leans. The local build is HTTP/1.1 —
six connections, which order the requests the way a priority would — and its
fixture is light; production is HTTP/2, thirty requests at once, and `devtools`
throttling shares the link between *requests* whatever their priority, so the
stylesheet arrives at 2.99 s where a server that sends by priority would have
sent it first. And under this method a 92 kB photograph cannot make 2.0 s even
alone on the link (asked for at 0.69 s + 562 ms of emulated latency + 92 kB at
184 kB/s ≈ 1.9 s, before there is a stylesheet to paint it with): the budget
needs the LCP photograph near 40 kB. No photograph on production has a `srcset`
yet — all of them predate the variants — and between the ladder's 480 and 1280
there is no rung for a phone, which at 412 px and a pixel ratio of 1.75 asks for
721 px and is handed 1280.

The simulated figure is what 337 kB of script on a public reading page costs,
and it is the next thing to pay down — the rule below is not yet true of the
shell, whose palette, sheet and sign-out dialog all ship to a guest.

- No component ships a client bundle to a public reading page unless it must.
- The composer is the one heavy surface and it is workspace-only.

---

## 10. Enforcement

A rule that is not enforced is a suggestion. Each of these lands with the slice
that needs it.

| Rule                                                                                                      | Gate                               | Runs in              |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------- |
| No Tailwind palette utility, no hex, no `oklch()` in a component                                          | ESLint rule                        | `pnpm lint`          |
| No arbitrary value except a `data-*`/`has-*`/`[&…]` selector, a property list, or a `calc()` over a token | ESLint rule                        | `pnpm lint`          |
| Phosphor-only controls, narrow SSR imports, explicit brand exceptions | `scripts/check-interface-icons.ts` | `pnpm test`, `pnpm gates` |
| No primitive `--og-*` outside `globals.css`                                                               | `scripts/check-design-tokens.ts`   | `pnpm test`          |
| No raw `<input>/<select>/<textarea>` outside `ui/`                                                        | ESLint rule                        | `pnpm lint`          |
| No z-index literal                                                                                        | ESLint rule                        | `pnpm lint`          |
| Every `ui/` component has a test asserting role + accessible name                                         | `scripts/check-component-tests.ts` | `pnpm test`          |
| Axe has zero violations on the nine key screens                                                           | `tests/accessibility.spec.ts`      | `pnpm gates:browser` |
| Keyboard path through the primary flows                                                                   | `tests/accessibility.spec.ts`      | `pnpm gates:browser` |
| Contrast of every semantic pair                                                                           | `src/app/globals.test.ts`          | `pnpm test`          |
| A public page's heading and photograph are in the served bytes, and it reads with scripts off (ADR-0032) | `tests/static-documents.spec.ts`   | `pnpm gates:browser` |
| The largest photograph on the first screen is never `loading="lazy"`, at a phone's width and a desk's    | `tests/static-documents.spec.ts`   | `pnpm gates:browser` |
| An entry whose story opens with its cover shows that photograph once, and asks for it at once            | `tests/journal-entry.spec.ts`      | `pnpm gates:browser` |
| Every browser spec is run by something                                                                    | `scripts/check-browser-specs.ts`   | `pnpm test`          |
| A `/garden/**` render path settles every `@/server/*` read (ADR-0023)                                     | `scripts/check-workspace-settled-reads.ts` | `pnpm test`  |

`apps/web/scripts/check-banned-dependencies.ts` is the model: mechanical, in CI,
and in `pnpm test`.

`pnpm gates` runs all fourteen. Nine of them are fast and also run inside
`pnpm lint` and `pnpm test`, which is why they are there — a gate you only meet
in CI is a gate you meet too late. The other five need a production build, a
server and a database, so they live in the browser gate; putting them in
`pnpm test` would take it from fifteen seconds to minutes and nobody would run
it while editing.

**The browser gate is one list, run one way.** `scripts/browser-gate-specs.ts`
holds it; `scripts/run-browser-gate.ts` seals the owner account, starts `next
start` and runs the list against it; `pnpm gates:browser` and CI's Browser
proof job both call that runner and spell no list of their own. There used to
be two lists, in a YAML string and a `package.json` string, and seven specs
were in neither — the proofs of five finished redesign tasks among them. Run
for the first time on 2026-09-20 they found `/journals` scrolling sideways at
320 px in Bulgarian and Russian, a catalogue that was not complete without its
context rail, and three assertions a later merge had made false. **A proof
nobody runs is not a proof**, and `pnpm check:browser-specs` fails on a spec in
`tests/` that is in neither the gate nor `DEDICATED_BROWSER_SPECS`.

### 10.1 Adding a gate

1. **Write the rule so a machine can answer it.** If two reasonable people can
   disagree about whether a diff violates it, it is a review note, not a gate.
2. **Put it where it is cheapest.** A lexical rule is an ESLint selector in
   `apps/web/eslint.config.mjs`; a rule that needs the file tree is a script
   beside `check-banned-dependencies.ts`; a rule about what a reader gets is a
   Playwright spec against a production build.
3. **Make it fail loudly.** Print the path, the line, and what to write
   instead. A step that ends at `exit code 1` with no output cost this
   repository days of guessing, and that is not a style preference.
4. **Observe it red.** Add a file to `apps/web/scripts/design-gate-fixtures/`
   that violates the rule on purpose, and a case in
   `scripts/check-design-gates.test.ts` that runs the real gate over it and
   asserts the failure — including the message. A gate that has never been seen
   fail is indistinguishable from a gate that cannot fail.
5. **Prove it passes on a clean tree.** The same test asserts the clean fixture
   is silent. A rule that flags correct code is not shippable, however right it
   is in principle.
6. **Add the row above**, and wire it into `pnpm gates` and
   `.github/workflows/ci.yml`.

---

## 11. Changing this document

1. A new **token** needs a reason no existing token covers, a measured contrast
   figure, and an entry in §2.
2. A new **component** needs two real call sites. One call site is a page-local
   component, not a system component.
3. A new **pattern** needs an observed reference and an explicit transfer
   rationale, or a labeled product hypothesis with a scenario proof. The owner
   has accepted Threads/vc.ru/Airbnb; do not add unrelated references just to
   satisfy an arbitrary example count. Canonical Mobbin links live in the
   execution contract.
4. A change that contradicts an ADR needs the ADR amended first.

Research for this system was gathered through Mobbin. Patterns cited above come
from, among others:
[X](https://mobbin.com/screens/2f5725c8-aef0-4c57-b31c-13173382a96a),
[Substack](https://mobbin.com/screens/119fd075-65f4-4818-a0c3-5be5d8e684b5),
[Threads](https://mobbin.com/screens/c590c987-4b98-4f8f-b26a-55f34c7a21ac),
[Digg](https://mobbin.com/screens/0df278a1-0f2e-41cd-8918-06aa7bb05b40),
[Etsy](https://mobbin.com/screens/72bcca52-c3f3-47f5-a7fa-183224b7d319),
[Walmart](https://mobbin.com/screens/e5b26e43-246d-41ee-939f-a8da5a935a8f),
[Tripadvisor](https://mobbin.com/screens/3a5ba9a6-ffb0-4e4b-9a13-d44572aae25d),
[Databricks](https://mobbin.com/screens/f5257ee3-002b-47b2-8d04-f825ba22dc4d),
[Plain](https://mobbin.com/screens/31ea3346-fcc6-4742-a0dd-de13fa6cd720),
[Twenty](https://mobbin.com/screens/4ff8ef07-dd4e-4e98-9678-f0a6ce5ec6e7),
[Cal.com](https://mobbin.com/screens/65afa205-c915-462a-9f1a-14341c04893c),
[Remote](https://mobbin.com/screens/33bb4d3b-441a-43d0-b694-51de065708a5).

### Foundation verification artifacts

`pnpm components:render` creates interactive UK/BG/RU specimens from real UI
components and production CSS under ignored `test-results/component-specimens/`.
They show default, pending, disabled and error states, 16/20/24px glyphs, tabs,
menus, dialogs, sheets, status and empty states. These are local proof artifacts,
never product navigation or production routes. Registered browser proof in
`component-specimens.spec.ts` covers narrow/wide keyboard operation, dialog focus
return, reduced motion and forced colors. Product browser gates still verify
integration.
