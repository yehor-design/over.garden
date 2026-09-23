# The chrome's bundle diet — OVE-468

The exact tested and merged commits, CI runs and the production check are in
the authenticated Linear receipt.

## What changed

A guest opening a reading page used to download, parse and run code for
controls they never opened: the command palette's dialog and its search, the
narrow bar's sheet, the account menu, the sign-out question, Better Auth's
client, and the copy tables those pulled in. Now each of those arrives when its
control is pressed, and the press is kept.

- **One way for a control's code to arrive on the press**
  (`src/lib/use-on-demand-component.ts`, following the composer's editor).
  - The component is state, set when its module arrives. A press that lands
    before the code does is kept: the control is drawn open once it is here.
  - Until then the shell draws a stand-in with the same name, role and marker.
    It stays the same element while the code is on its way, so a keyboard
    reader's focus is not dropped. A `Suspense` fallback would have swapped it
    for a copy.
  - A failed download (a dropped connection, a deployment that replaced the
    chunk) leaves the stand-in as it was, and the next press asks again. It is
    never an error thrown into the page, which is what a rejected `React.lazy`
    or `next/dynamic` import is.
  - A pointer over the control or focus on it starts the download.
- **The command palette is two modules** (DESIGN.md §5.2).
  - `command-palette.tsx` keeps what has to exist before a press: the
    triggers, `⌘K` and `/`, whether the palette is open, and where focus
    returns.
  - `command-palette-dialog.tsx` is the rest — the search, the list, the live
    region, the recents — and arrives on the first press.
  - What the reader types between asking and the field existing is the query;
    the caret goes after it. `/` pressed again while it waits is the shortcut
    again, not a letter. Escape takes the request back. A failed download
    gives the keyboard back, rather than leaving the page typing into a
    palette that never came.
  - The whole page used to render inside the palette's `<Dialog>` root: a
    context above the page whose value changed when the palette opened. The
    dialog is now a sibling of the page, and the context the triggers read
    never changes (ADR-0032 D10).
- **The account menu and the narrow bar's sheet** are modules of their own
  (`site-shell-account-menu.tsx`, `site-shell-mobile-sheet.tsx`), mounted open
  on the first press.
- **Sign-out.** The question (`sign-out-confirmation.tsx`) and Better Auth's
  client arrive with the press; the client is fetched while the reader reads
  the question. The cross-tab session check asks for the client only when the
  tab is returned to.
- **Copy a client component reads, in small modules.** The analytics notice,
  the Meta consent, the global error page and the shell's sign-out read
  `trust-client-copy.ts`; `trust-surface-copy.ts` composes its sections from
  it, so each sentence exists once. Engagement counts read `public-count.ts`
  instead of the whole public-surface table. The copy was compared as JSON
  before and after, and is byte-identical.

## What the measurements say

**Target**, set from the first measurement. On main, the code in scope was:

- base-ui's overlay code: 180 kB raw;
- Better Auth's client: 30 kB raw;
- the copy tables the chrome pulled in: 155 kB raw.

Together that is about a third of the 1.16 MB parsed before `load`. The target
was to take it off that path: at least a quarter less script transferred
before `load` on each of the three pages.

**Script a guest downloads** (`pnpm measure:guest-script`, guest, local
production build). It covers every script before the page's `load`, and
executed bytes from V8 block coverage to idle. "Before" is main `6d0e2ff3`.

| Page | Before load, transferred | Before load, decoded | Executed to idle (V8 coverage) |
| --- | --- | --- | --- |
| `/` | 340.6 → 238.5 kB (−30.0 %) | 1156.5 → 811.0 kB (−29.9 %) | 545.1 → 400.7 kB (−26.5 %) |
| an entry | 343.1 → 241.8 kB (−29.5 %) | 1166.8 → 822.1 kB (−29.5 %) | 533.0 → 388.0 kB (−27.2 %) |
| an organism card | 342.2 → 240.4 kB (−29.7 %) | 1163.2 → 818.3 kB (−29.6 %) | 555.3 → 408.5 kB (−26.4 %) |

**What left the path** (`ove-468/bundle-composition.json`). Each chunk a page
fetched before `load` was mapped to the modules in it, using
`next experimental-analyze` for both builds (`ove-468/analyzer/`). The table
gives raw module bytes on `/`; the entry and the card read the same to within
a few kB.

| Origin | Before | After |
| --- | --- | --- |
| base-ui and floating-ui | 180.0 kB | 5.4 kB |
| copy tables, navigation and contracts in `src/lib` | 197.6 kB | 71.9 kB |
| Better Auth's client | 30.5 kB | 0 |
| the shell, auth and the palette | 44.7 kB | 46.1 kB |
| Phosphor icons | 71.3 kB | 70.1 kB |
| framework (Next, React, the router) | 530.4 kB | 530.3 kB |

**Lighthouse** (`pnpm measure:lighthouse`). CLI 13.5.0, default mobile
emulation, median of three per method, same machine, data and server port
(ADR-0032 D9):

| Page | LCP applied | LCP simulated | TTI applied | TTI simulated | CLS applied |
| --- | --- | --- | --- | --- | --- |
| `/` | 1.78 → 1.79 s | **4.11 → 3.38 s** | 3.04 → 3.05 s | **4.11 → 3.79 s** | 0.118 → 0.118 |
| an entry | 1.51 → 1.51 s | **3.76 → 3.22 s** | 1.51 → 1.51 s | **3.76 → 3.45 s** | 0 → 0 |
| an organism card | 1.76 → 1.76 s | **3.81 → 3.37 s** | 3.03 → 3.03 s | **3.97 → 3.78 s** | 0 → 0 |

The script Lighthouse saw fell from 383 to 280 kB on `/`, from 373 to 262 kB
on the entry and from 385 to 282 kB on the card. The simulated figures improve
on all three pages. Simulation charges LCP with every script that ran before
the paint, so it measures the bundle.

Applied LCP stays under 2.0 s, and CLS does not move. Two figures did not
improve:

- **Applied TTI did not move locally, and the reason is in the waterfall.**
  The local server is HTTP/1.1, so scripts queue on a few connections.
  React-dom's 73 kB chunk is the long pole of the first wave in both builds: it
  starts at 1.70 s and ends at 2.99 s. Hydration is one 53 ms task that begins
  when it lands, and TTI is the end of that task. The page's `load` event
  moved 0.48 s earlier (4.47 → 3.99 s on `/`) because what used to queue
  behind that chunk is gone. The framework chunk itself is not this task's to
  remove.
- **CLS 0.118 on the home fixture is a feed card** (`main > ol.grid > li`)
  that shifts in both builds. It is page content on this fixture; production's
  `/` measures CLS 0.

**On production, before release** (same method; `/`, `/@yehor/post/9`,
`/species/solanum-lycopersicum`), applied / simulated LCP was:

- `/`: 6.88 / 6.44 s;
- the entry: 3.13 / 7.30 s;
- the species card: 6.18 / 6.50 s.

Applied TTI was 6.02 s, 4.04 s and 5.59 s, and CLS was 0. The applied LCP
there is the photograph's load (`OVE-469`). The figures after release are in
the Linear receipt.

## The press is kept

`tests/on-demand-controls.spec.ts` is in the browser gate. Each control is
pressed after `load` and after React has adopted it, with every script
requested from that moment held back:

1. The page's own after-load requests (the router prefetching routes) are
   let settle and counted apart.
2. The test presses.
3. It proves the press asked for code of its own.
4. It proves nothing opened while that code was held (750 ms).
5. It releases the code, and the control opens.

| Control | Code the press asked for | Then |
| --- | --- | --- |
| `⌘K`, then `tom` typed while held | the dialog and the base-ui dialog chunk | opens with `tom`, focused; typing on gives `tomato` |
| `/`, pressed twice while held | the same two | opens empty — the second `/` was the shortcut; Escape closes it |
| the rail's search field | the same two | opens, the field focused |
| the narrow bar's menu, 375 px | the sheet and the dialog chunk it shares with the palette | opens with its links; Escape returns focus to the button |
| the account menu, signed in | its own chunks (three or four, by what the page had already prefetched) | opens with sign-out in it |
| sign-out, from that menu | the question, the alert dialog, Better Auth's client | the question opens; confirming signs out: `/api/auth/get-session` answers `null` and the shell offers sign-in |

The receipt, with each chunk by name, is
`ove-468/on-demand-controls-receipt.json`. Unit tests hold the download open
through the provider's `loadDialog` seam
(`command-palette-on-demand.test.tsx`). Each of their three claims — the
typed-ahead query, Escape taking the request back, the keyboard given back
after a failure — was seen red with the code under test disabled.

## Without JavaScript nothing changed

The same spec loads `/` with JavaScript disabled and finds:

- the narrow bar's menu button, named;
- the palette's two triggers, as links to `/journals`;
- the sign-in link.

The search link answers 200 with its heading.

Compared with production's served `/` (still main at the time), the palette
links and the sign-in links are byte-identical. The menu button keeps its name,
role, `aria-haspopup`, `aria-expanded`, marker and every class. What it no
longer carries is base-ui's own attributes (`data-slot="sheet-trigger"`,
`data-base-ui-click-trigger`, a generated `id`, `tabindex="0"`), which nothing
reads and which the real trigger brings when its code arrives.

## React adopts every segment

`tests/static-documents.spec.ts` passes, including "React adopts every
segment the server streams, for a guest and for a gardener". Nothing that
became lazy is a provider above the page. The palette's context value is
created once, and its dialog is a sibling of the page, not its parent.

## What was not changed, and why

- **Phosphor's six weights.** Each glyph module carries all six, and the
  interface draws two (regular, and fill when selected). On `/`, the 26 glyphs
  fetched before `load` hold 47.7 kB of raw path data, 14.1 kB of it for the
  two weights in use — about 10 kB compressed. Stripping the other four means
  changing DESIGN.md §2.8's rule that each glyph is a narrow
  `@phosphor-icons/react/dist/ssr/<Glyph>` import. That rule is the owner's,
  and this task does not change it.
- **Next's server modules in the client** (15 kB transferred, 6 kB run).
  `next/navigation` bundles `unstable-rethrow`'s server variant, and the
  client page builds its params from `next/dist/server/request`. No module of
  ours imports a server API.
- **The consent notice's client stays eager.** It is drawn for a guest who
  has not decided, which is a control used before any press.
- **The framework** — react-dom, the router, React and the RSC client — is
  133 kB of the 238 kB left on `/`.

## Validation

- Unit and contract suite: 602 files, 5,264 passed, 29 existing skips. Every
  repository check (icons, design tokens, component tests, browser-spec
  registration, settled reads) passes, and lint passes with no warnings.
- Two source-reading tests followed the account menu into its own module. The
  Facebook-retirement verifier pins a digest of `meta-marketing.tsx`, whose
  only change is where its copy is read from; it is repinned, as OVE-505 did.
- The gate's sign-in helpers now wait as long as Better Auth's limiter says
  (`tests/helpers/auth-rate-limit.ts`). Its window for sign-in and sign-up is
  three requests per address per ten seconds, and it slides with every request
  it lets through. With two workers, the old fixed 1.5 / 4 / 9 s schedule could
  land inside a fresh window on every try. One run failed that way twice:
  - a synthetic gardener's sign-up got 429 four times;
  - the owner's sign-in got 429 four times.
  The helpers now take `X-Retry-After`, add a jitter so the two workers do not
  retry in step, and allow six attempts. On CI one shard later lost
  `notification-activity.spec.ts` the same way, through a sign-in loop of its
  own with the old schedule. Five specs carried that loop, and all of them now
  sign in through the same `postPastRateLimit`.
- **Browser gate, three consecutive runs**, each on a database of its own,
  in CI's order (create, `bootstrap-db.ts`, build against it, the whole
  gate). Each run: 388 passed, 1 existing skip, no failures and no retries,
  in 8.6, 8.5 and 8.4 minutes. A fourth fresh run, after the sign-in loops
  were shared, passed the same way in 8.5 minutes.
- Two earlier runs, both on one long-lived local database, failed for reasons
  outside this change:
  - One failed on the limiter (above).
  - The other failed in the knowledge pages. Four full gates had published
    enough entries that:
    - the topic `plants` held a listable entry, so the answer grew a
      "related" section the spec does not expect;
    - the journals search's bounded fallback no longer held the fixture's
      entry.
  Neither happens on the fresh database CI gives every run.
