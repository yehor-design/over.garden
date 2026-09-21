# ADR-0031 — One design system, and the redesign that delivers it

- **Status:** Accepted (decisions 2026-09-17). Execution is SDD Slice 28
  (`OVE-439`–`OVE-459`). Slice 27 is the address law (ADR-0029) and is
  delivered.
- **Date:** 2026-09-17
- **Decision owner:** founder/owner
- **Supersedes:** the `DESIGN.md` stub, which declared itself void and told the
  reader to "read the components". `DESIGN.md` is now the authoritative canon.
  It also supersedes ADR-0022 D7 only in scope — the typography wiring it named
  is unchanged and is now written down rather than left implicit.
- **Relates to:** ADR-0023 (a workspace page settles failure into a designed
  state), ADR-0024 D3 (a public control may not depend on hydration),
  ADR-0026 D9 (the organism card's section order and its indexability rule),
  ADR-0028 (the composer's Notion shape and the 708 px canvas),
  ADR-0029 (addresses; a redesign never changes a permalink),
  `docs/INTERFACE_LOCALE_CONTRACT.md` (markets and locales).

## Amendment — complete product redesign, 2026-09-21

Accepted by the owner, implemented as decisions by OVE-475; runtime work remains
in OVE-476–OVE-506, with OVE-478 last. This amendment overrides conflicting
2026-09-17 clauses below, which retain their historical explanation.

- D3: Threads (Meta) is the primary light visual grammar. vc.ru supplies a
  centered three-column group and applicable feed/topic/conversation patterns.
  Airbnb supplies progressive creation with one active question and editable
  completed answers. Use the observed links in the execution contract.
- D4: one centered max-1280px group: 208px navigation, fluid max-704px main,
  optional 280px context and 24px gaps; desktop and mobile navigation follow
  INFORMATION_ARCHITECTURE.md. My garden owns spaces and objects; Explore owns
  catalogue/reference/community/knowledge discovery. Rails never stretch to the
  opposite viewport edges. Historical widths are not acceptance constraints.
- D8: the owner explicitly authorizes new screens, moving functions and radical
  regrouping for this redesign. No repeat product approval is required for the
  route/function matrix. Existing security/data/public-address laws remain.
- D9: WCAG 2.2 AA requires automated AND manual evidence. Earlier single-page
  measurements are not evidence of current whole-product conformance.
- D10: Thiings selection across the collection is reaffirmed without a purchase
  or license-review gate. The recorded provider facts and existing no-credit
  owner decision remain; no fictitious license receipt is created.
- D11: the fixed 708px composer and 56px gutter are superseded by ADR-0028 D3's
  responsive amendment; document blocks, accessibility and persistence stay.
- D13: Phosphor replaces Lucide for all interface controls, including editor and
  owner tools. Real brand marks and authored emoji are content exceptions.
- D14: prioritize acknowledged writing to the correct owned space/object, not
  minimum clicks with a hidden default. Contextual launch 1 activation; global
  recent destination open+select 2; typing/media/Publish counted separately.

Source/transition authority: `../redesign/2026-09-21/INFORMATION_ARCHITECTURE.md`,
`../redesign/2026-09-21/EXECUTION_CONTRACT.md`, and the dated audit. Hypotheses
are not claimed user-research results. OVE-475 ships the decision and executable
wireflow model, not a claim that all new production behavior already exists.

## Context

The interface was never designed. It accreted across twenty-six slices, each of
which solved its own problem correctly and left its own arrangement behind. An
audit on 2026-09-17, against production and against the repository, found a
split that had not been named before.

**The token layer is in better shape than anyone assumed.** Across the whole of
`apps/web/src` there are **five** hard-coded colour utilities and **five**
inline `style={{}}`. Of ninety "arbitrary" Tailwind values, all but a handful
are `data-[state=…]` selectors. Semantics are honest: one `<main>`, a working
skip link, cards as `<article>`, zero images without `alt`, zero form controls
without a label, zero targets below 24 px. Contrast was measured on `/journals`
and **zero pairs fail AA**. (A first measurement reported 102 failures; it was
parsing `lab()` output as RGB. The corrected measurement, run through a canvas,
is the one above. The false result is recorded here because a redesign
justified by an invented problem would have been worse than no redesign.)

**The component layer barely exists.** `components/ui/` holds seven primitives.
Only `Button` is genuinely adopted, at 78 imports; the next is `Skeleton` at
eight, and three of the seven have a single call site. Meanwhile **fifty files
reach for a raw `<input>`, `<select>` or `<textarea>`**. There is no `Input`,
`Select`, `Field`, `Checkbox`, `Card`, `Badge`, `Tabs`, `Dialog`, `Toast`,
`Avatar`, `EmptyState` or `Pagination`. Every screen that needs one of those
builds it again, inline, slightly differently.

That is the whole diagnosis. The product does not need to be repainted; it
needs the layer between tokens and pages that it never had.

The audit also found interface defects that a design system alone would not fix,
and that the redesign must not paper over:

1. **Two languages on one page.** A Ukrainian-content page renders Bulgarian
   chrome, a language control, and a "this page is available in your language"
   banner. `docs/INTERFACE_LOCALE_CONTRACT.md` says the Ukraine market renders
   no language control at all. This is a contract violation, visible to anyone,
   and it gets its own task rather than being absorbed into a restyle.
2. **Filters are a form.** `/journals` stacks six `<select>`s above the results
   behind an "Apply" button.
3. **Search is an icon.** There is no palette and no keyboard entry to search.
4. **Mobile is broken in three ways.** The brand block clips mid-header, a
   floating circular control sits half off the right edge of every page, and the
   bottom tab bar spends a slot on "Sign in" while the product's central action —
   writing an entry — has no place on a phone at all.
5. **There is no footer.** No `contentinfo` landmark exists, and `/privacy`,
   `/support` and `/first-publication-disclosure` are linked from nowhere.
6. **Two `aside` and two `nav` landmarks are unnamed.**
7. **Dark mode is declared and dead.** A full `.dark` token block exists, four
   `dark:` utilities consume it, there is no theme provider and no toggle, and
   the block still carries shadcn's default purple `--sidebar-primary` — a
   colour that belongs to no part of this product.

Pattern research was done through Mobbin, and only through Mobbin, before any
decision below. The three-column shell was confirmed across X, Substack,
Threads, Digg, Circle and Whop; the filter model across Etsy, Walmart,
Tripadvisor and Selfridges; the command palette across Databricks, Evernote,
Vapi, Mintlify and v0; the field-and-description form across Plain, Twenty,
Gorgias and Workable; the 3D-object empty state across Remote, Digg, Gamma and
Xero.

## Decisions

**D1 — One canon, two token layers.** `DESIGN.md` is authoritative for tokens,
components, layout, patterns, accessibility and content. Tokens are primitive
(`--og-*`, raw ramps) and semantic (`--color-*`, `--space-*`, …). Components and
pages consume semantics only. A primitive outside `globals.css` is a defect, and
a gate fails on it.

**D2 — Light theme only.** The `.dark` block, the four `dark:` utilities and the
purple `--sidebar-primary` are removed. A half-implemented theme is worse than
none: it makes every component's correctness unverifiable. Reintroducing dark
mode is a new ADR plus a full pass, not a pull request.

**D3 — Neutral interface, photographs carry the colour.** The reference set is
Linear, Notion and GitHub for interface behaviour and restraint, and Airbnb for
how a 3D object earns its place. The interface neutral is hue 150 at chroma
0.002–0.008 — grey with a whisper of the product. Green stays as the primary
action and brand, anchored on the existing `oklch(0.39 0.105 151)`, which
becomes `green-700` and measures 9.15:1 against white.

**D4 — Three columns, and a mobile bar that carries the product's verb.**
Rail 240 / content 704 / context 300, with the context rail always optional and
never the only home of an action. On mobile: a 56 px header and a five-slot tab
bar — Feed, Catalogue, **New entry**, Journals, You. Authentication is not a
tab.

The clipped floating control turned out not to be the product's: `OVE-443`
measured it on production as Vercel's toolbar feedback button, injected at the
edge for a browser carrying the `__vercel_toolbar` cookie. No reader sees it and
no change here removes it; `DESIGN.md` §3.2 records the measurement.

**D5 — The component layer is the deliverable.** Fifty files stop hand-rolling
form controls. The inventory and the component contract in `DESIGN.md` §4 are
binding: `variant` / `size` / `tone`, ref forwarding, real elements, no data
fetching, a test asserting role and accessible name.

**D6 — Filters apply on change, and live in the URL.** Chips for what is active,
a visible result count, sort as its own right-aligned control, "Clear all", and
a sheet with Apply below `lg` because a sheet hides the results. Every filtered
view is linkable.

**D7 — One command palette, and the crawlable pages stay.** `⌘K` opens grouped
search over journals, organisms, gardeners, communities and actions. It is an
enhancement layered over `/journals` and the catalogue, which remain full
no-JavaScript pages with plain links. Search discovery outranks palette
convenience (ADR-0022 D3).

**D8 — Information architecture is in scope, including new screens.** Merging
and regrouping what exists is ordinary redesign work. A genuinely new
owner-facing surface still requires the owner's approval before it appears in a
menu — twice already a surface nobody asked for had to be removed.

**D9 — WCAG 2.2 AA is a build gate.** The checklist in `DESIGN.md` §8 is
enforced by ESLint rules, a token contrast unit test, component role-and-name
tests, and `@axe-core/playwright` over the key screens with zero violations.
A screen that cannot be driven by keyboard does not ship.

**D10 — Illustrations come from `thiings.co`, with the licence position
recorded.** The owner chose `thiings.co` on 2026-09-17, was shown the licence
terms, and reaffirmed the choice. The terms say a free download is personal and
non-commercial with attribution required, that commercial use needs a paid
licence ($49 indie / $199 business, lifetime), and that no tier permits
redistributing the icons as standalone assets. OverGarden is commercial, so the
free tier does not cover it. This is the owner's decision and the owner's risk,
and it is written down here rather than left as an assumption for whoever reads
the code next.

**Amended the same day, and `DESIGN.md` §2.9 is the record.** The paragraph
below originally attached a third condition — visible attribution in the
footer — and was wrong about what the owner had decided. Their position,
reaffirmed twice on 2026-09-17, is the free tier **and no attribution
anywhere**, the footer included. That is their decision and their risk, and it
is written down rather than left for whoever reads the code next. `OVE-443`
built the footer without the credit, and `site-shell.test.tsx` fails if one
appears.

Two conditions attach, in `DESIGN.md` §2.9: the icons are never republished as
downloadable assets, which is the term that binds at every tier; and the
illustration stays a component prop with the files in one directory behind one
manifest, so that buying the indie licence or moving to `3dicons.co` (CC0)
remains a one-directory change. Nothing is blocked: empty states ship with
illustrations from the start.

**D11 — Nothing here relaxes an existing constraint.** ADR-0024 D3 still holds:
a redesigned public control is a Server Action on a real endpoint, and a client
closure around it is a defect. ADR-0023 still holds: a `/garden/**` section
settles its failure into a designed state and never awaits a `@/server/*` read
outside `settleSection`. ADR-0029 still holds: a redesign never changes a
permalink. ADR-0028's 708 px composer canvas is unchanged.

**D12 — Delivered flow by flow, foundation first, no feature flag.** Tokens,
then primitives, then the shell, then each flow. Each task ships a whole page
family end to end and leaves no screen half-converted. There is no
"redesign mode" toggle: a flag would double every state in a system whose whole
point is that each state is designed once.

## Consequences

- Twenty-one tasks, sequenced, in SDD Slice 28. The first four are foundation
  and unblock everything else; the rest are page families and can be reordered
  by value.
- Fifty files change control markup. That is a large diff with a small blast
  radius: the controls keep their names, their Server Actions and their
  endpoints, and the component tests assert exactly that.
- The locale defect (context, item 1) is fixed as its own task, before the
  screens around it are redesigned, so that the fix is provable rather than
  buried in a restyle.
- Dark mode disappears from the codebase. Anyone who wants it back reads this
  page first.
- `DESIGN.md` becomes a file that fails CI when it is wrong, because its rules
  are gates. It is cheaper to change the canon than to work around it.
