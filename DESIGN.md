# DESIGN.md — the OverGarden design system

Status: **authoritative**, from 2026-09-17. Supersedes the stub that used to sit
here. Decisions behind it: `docs/adr/ADR-0031-design-system-and-redesign.md`.

Read this page before changing any interface. It governs tokens, components,
layout, patterns, accessibility and content. Where it disagrees with an older
document, this page wins; where it disagrees with an ADR, the ADR wins and this
page is wrong and must be corrected.

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

1. **The photograph is the only colour that matters.** The interface is a
   near-neutral grey-green. Saturated colour is reserved for a single primary
   action, a state, or a photograph. A screen with two competing coloured areas
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

**Green — brand and primary action.** Hue 151, anchored on the existing
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
| `--og-green-700` | `oklch(0.390 0.105 151)` | `#005425` | **9.15** | primary fill, link  |
| `--og-green-800` | `oklch(0.320 0.085 151)` | `#013e1a` | 12.31    | link hover, pressed |
| `--og-green-900` | `oklch(0.262 0.065 151)` | `#042d13` | 15.11    | on-green text       |

`white on green-700` = **9.15:1**. The primary button clears AAA.

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
  text-link          --color-text-link            green-700
  text-link-hover    --color-text-link-hover      green-800

  border             --color-border               neutral-200   decorative
  border-control     --color-border-control       neutral-500   identifies a control
  border-strong      --color-border-strong        neutral-700
  focus-ring         --color-focus-ring           green-600

  action             --color-action               green-700
  action-hover       --color-action-hover         green-800
  action-subtle      --color-action-subtle        green-50
  action-subtle-text --color-action-subtle-text   green-700

  success/danger/warning/info  ×  -surface, -border, -text, -fill
```

Light theme only. **There is no dark theme.** ADR-0031 D2 removes the `.dark`
block, the four `dark:` utilities and the unbranded purple `--sidebar-primary`
that had survived from the shadcn default. Reintroducing dark mode is a new ADR
and a full pass over every component, not a pull request.

### 2.3 Space

4 px base. Only these steps exist.

`--space-0` 0 · `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 ·
`10` 40 · `12` 48 · `16` 64 · `20` 80 · `24` 96

Rules: gaps inside a component ≤ `space-4`; gaps between components in a section
`space-4`–`space-6`; gaps between sections `space-8`–`space-12`; the page's top
padding `space-8` on mobile, `space-12` above `md`. A value not on this scale
needs a token, not an arbitrary utility.

### 2.4 Radius

`--radius` is 10 px. Derived: `sm` 6 · `md` 8 · `lg` 10 · `xl` 14 · `2xl` 18 ·
`full` 9999.

Controls and inputs `md`. Cards and surfaces `lg`. Dialogs and sheets `xl`.
Chips, avatars and pills `full`. Media keeps `lg` and clips with
`overflow-hidden` so a photograph never squares off a rounded card.

### 2.5 Elevation

This is a **bordered** system, not a shadowed one — Linear, Notion and GitHub
are the reference. Shadow marks _what floats above the page_, and nothing else.

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
- **Measure.** Prose 60–75 characters. The reading column is 704 px; the
  composer canvas stays at its Notion-derived 708 px (ADR-0028).
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

Lucide, and only Lucide (`components.json` already fixes this). Sizes 16, 20, 24. Stroke 1.5 at 16/20, 2 at 24. An icon is `aria-hidden` when beside a label
and carries an accessible name when alone. **An icon-only control always has a
tooltip and an `aria-label` saying the same thing.**

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
revocation. Six permanent pieces of app art have none of that, and putting them
in the user-media bucket would make every tool that reasons about that bucket
learn an exception. Shipping them with the code also means a rollback rolls them
back, which an object in a bucket does not.

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

**A card's picture is 4:3 and bleeds to the card's edges**, which is the
Substack and Digg shape. It has a measured consequence beyond taste: at 375 px
the full-bleed 4:3 picture is 88,000 px² against the consent banner's 76,000,
so the _photograph_ is the page's largest contentful paint rather than a cookie
notice that arrives after hydration. A card whose picture is inset and 16:9 is
smaller than the banner, and principle 1 stops being true of the page a reader
actually measures. A **cover** at 16:9 is the entry page's hero, not a card's
picture.

### 2.11 Layering

`--z-base` 0 · `--z-sticky` 10 · `--z-rail` 20 · `--z-header` 30 ·
`--z-popover` 40 · `--z-overlay` 50 · `--z-toast` 60.

No other z-index values exist in the codebase.

---

## 3. Layout

### 3.1 Breakpoints

`sm` 40rem/640 · `md` 48rem/768 · `lg` 64rem/1024 · `xl` 80rem/1280 ·
`2xl` 96rem/1536. Mobile-first; a `max-width` query is a defect.

### 3.2 The shell

Three columns, the model confirmed across X, Substack, Threads, Digg, Circle and
Whop in the Mobbin references.

```
< lg          [ header 56 ]  [ content ]  [ tab bar 56 ]
lg → xl       [ rail 240 ]   [ content max 704 ]
≥ xl          [ rail 240 ]   [ content max 704 ]   [ context 300 ]
```

- **Left rail** (≥ lg, 240 px): brand → primary navigation with icon + label →
  the one primary action → account at the foot. Sticky, its own scroll. It is
  the `<header>` element itself, in its wide shape: one `banner` landmark at
  every width, and the primary action therefore cannot be rendered in a rail
  _and_ a header, which is how the product came to have two.
- **Content**: 704 px maximum for reading and feeds; a catalogue grid or a table
  may use the full remaining width and says so explicitly.
- **Context rail** (≥ xl, 300 px): related, secondary, discardable. **Every
  screen must be complete without it.** It is never the only home of an action.
- **Mobile**: a 56 px header and a 5-slot bottom tab bar. The tab bar carries
  Feed, Catalogue, **New entry**, Journals and You. Authentication is not a tab;
  a signed-out visitor sees "You", which leads to sign-in. The bar does not
  render on the composer's own screen, where it would compete with the editor's
  gutter and its `/` menu.

  **New entry is the only slot with no visible label.** It is a filled circle
  carrying its name as `aria-label`: "Новий запис" is the widest label the
  product has and this is its narrowest column, and at 320 px it wrapped to two
  lines and spilled past the bar in all three languages. The other four are one
  line each at 320 px — measured, in `uk`, `bg` and `ru` — which is why the slot
  carries no horizontal padding: four pixels of it is the difference between
  "Дневници" on one line and on two.

The context rail opens from the header on mobile or not at all.

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

`apps/web/src/components/ui/` ships **7** primitives today, of which only
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
`Card` · `Surface` · `Separator` (exists) · `Tabs` · `Accordion` · `Table` ·
`ListRow` · `PageHeader` · `Section` · `Stack` utilities.

**Tier 3 — status and feedback.**
`Badge` · `Chip` / `FilterChip` · `Avatar` · `AvatarGroup` · `Tooltip` (exists) ·
`Toast` · `Callout` · `EmptyState` · `Skeleton` (exists) · `Spinner` ·
`ProgressBar` · `ErrorState` (ADR-0023 classes) · `Pagination`.

**Tier 4 — overlay.**
`Dialog` · `AlertDialog` (exists) · `Sheet` (exists, rewrite) · `Menu` (exists) ·
`Popover` · `CommandPalette`.

**Tier 5 — product.**
`EntryCard` · `OrganismCard` · `ProfileHeader` · `EngagementBar` (like, bookmark,
follow, comment — all Server Actions) · `MediaFigure` · `CatalogPicker`
(rewrite over `Combobox`) · `FilterBar` · `LocaleNotice` · `ConsentBanner`.

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

Three, everywhere, with the same names: `sm` 32 px · `md` 40 px · `lg` 48 px
control height. `md` is the default. **On touch, the hit target is 44 × 44 even
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

The current `/journals` screen is the anti-pattern: six `<select>`s stacked
above the results with an "Apply" button. Etsy, Walmart, Tripadvisor and
Selfridges all do the opposite, and so do we.

- Filters apply **on change**. There is no Apply button on desktop.
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
- Below `lg`, filters collapse into one "Filters (3)" button opening a sheet;
  the sheet has Apply and Clear because a sheet hides the results.
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
  announced nothing.
- **One `<form method="get">` with a real submit is still the mechanism.** The
  search control's own submit is that button; on-change is the enhancement
  layered over it. There is no `<noscript>` block and no submit that appears
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
  carrying the only copy of anything. Destructive outcomes get an Undo.
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

Target: **WCAG 2.2 level AA**, on every public and workspace screen. These are
checks, not aspirations.

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

| Page | LCP, applied | FCP | CLS | LCP, simulated | Before (`OVE-461`) |
| --- | --- | --- | --- | --- | --- |
| `/` | **1.90 s** | 1.88 s | 0 | 4.43 s | 5.44 s applied, 5.16 s simulated (production, 2026-09-19) |
| a journal entry | **1.65 s** | 1.60 s | 0 | 3.31 s | 4.29 s simulated |
| an organism card | **1.74 s** | 1.74 s | 0 | 3.97 s | measured on the desktop preset only |

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
| No primitive `--og-*` outside `globals.css`                                                               | `scripts/check-design-tokens.ts`   | `pnpm test`          |
| No raw `<input>/<select>/<textarea>` outside `ui/`                                                        | ESLint rule                        | `pnpm lint`          |
| No z-index literal                                                                                        | ESLint rule                        | `pnpm lint`          |
| Every `ui/` component has a test asserting role + accessible name                                         | `scripts/check-component-tests.ts` | `pnpm test`          |
| Axe has zero violations on the nine key screens                                                           | `tests/accessibility.spec.ts`      | `pnpm gates:browser` |
| Keyboard path through the primary flows                                                                   | `tests/accessibility.spec.ts`      | `pnpm gates:browser` |
| Contrast of every semantic pair                                                                           | `src/app/globals.test.ts`          | `pnpm test`          |
| A public page's heading and photograph are in the served bytes, and it reads with scripts off (ADR-0032) | `tests/static-documents.spec.ts`   | `pnpm gates:browser` |
| Every browser spec is run by something                                                                    | `scripts/check-browser-specs.ts`   | `pnpm test`          |

`apps/web/scripts/check-banned-dependencies.ts` is the model: mechanical, in CI,
and in `pnpm test`.

`pnpm gates` runs all eleven. Eight of them are fast and also run inside
`pnpm lint` and `pnpm test`, which is why they are there — a gate you only meet
in CI is a gate you meet too late. The other three need a production build, a
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
3. A new **pattern** needs a Mobbin reference to at least two products that
   solved it the same way, cited in the Linear task.
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
