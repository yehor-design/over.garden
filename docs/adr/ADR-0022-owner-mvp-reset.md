# ADR-0022 — Owner MVP reset: online-only, everything public and indexable, cached public HTML, fast client media, in-product admin, minimal process

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decision owner:** founder/owner; recorded by the OVE-362 process-prune task
- **Linear:** project "SDD Slice 21 - Owner MVP Reset" (OVE-362 through OVE-373)
- **Supersedes:** the clauses listed under "Superseded clauses". Older ADRs
  remain immutable history and are not edited.

## Context

On 2026-09-02 the owner audited `main @ 842183b` against seven requirements
given earlier to the previous agent: no offline, no fail-closed model,
format-only media without metadata cleaning, SEO/AEO and speed first, admin
pages inside the product, and complete removal of voice dictation. The audit
found that the previous work was largely done in canon and partly in runtime:
offline was removed but left a retirement probe on every page; fail-closed was
removed from authorization but survived as a 150 ms metadata deadline, a
250 ms role deadline, a 3 s mutation admission, a client session gate, and a
precise-location text firewall; media was format-only but still resized and
re-derived; every public journal entry in production was `noindex` and absent
from the sitemap; admin lived in the account menu but its catalog page was hard
disabled on Vercel; voice dictation was untouched. A governance apparatus of
canon checkers, a task validator, a mutation registry, and browser matrices
cost 21 minutes per merge and a ritual per task.

The owner then took seven explicit decisions. This ADR records them as the
single current authority so later agents do not reconstruct the previous
posture from older documents.

## Decisions

### D1. No precise-location text firewall

The detector, its Python mirror, the shared corpus, the refusal on every write
path, the search-document drop, and the `noindex` rule for coordinate text are
removed completely. The region label choice on profiles, objects, and entries
(`region` / `hidden`) is a presentation preference and stays. The database
still has no field for precise coordinates.

### D2. Media: WebP only, no EXIF, fast client pipeline

- Every uploaded photo is converted to WebP in the browser. No server decodes,
  re-encodes, inspects, or cleans image bytes. EXIF is not carried into the
  WebP; that is a consequence of re-encoding, not a cleaning step.
- The browser codec is native-first (`createImageBitmap` with orientation and
  resize, native WebP encoding where the browser supports it), with the WASM
  path only as a fallback. An instant low-resolution preview is shown before
  the final encode completes.
- The browser produces the final artifact set per photo: 2560 px long edge at
  quality 85, plus 1280 px and 480 px variants and a tiny blur placeholder.
  Small photos are never upscaled. PNG and images with transparency are
  lossless.
- Public pages serve those variants directly from `media.over.garden` through
  `srcset`; no per-request image transformation runs on Vercel.
- One input limit of 50 MB applies to every photo path.
- The composer obtains one signed staging capability per session; each photo
  uploads straight to the Cloudflare Worker with no per-photo Vercel call.
- The staging lease is renewed while the composer tab is alive, up to two
  hours after the last activity; abandoned uploads are still reclaimed
  automatically. Nothing is written to the database before Publish.
- Promotion of variants at Publish runs in parallel. A weekly sweep deletes
  public objects older than seven days that no database row references.

### D3. Every live public page is indexable

`noindex` exists only for empty listing pages, the seven-day 410 tombstone of a
deleted entry, and signed-in workspace screens. The word-count, distinct-entity,
staleness, and quality-class threshold, the 150 ms metadata deadline, the
`journal_entries.public_noindex` column, and the private-profile toggle are
removed. Every profile is public. Every indexable page carries one canonical,
`hreflang` where real equivalents exist, and one JSON-LD graph. The sitemap
lists journal entries, profiles, communities, topics, and catalog pages with a
true `lastmod`.

### D4. Public HTML is cached with tags

The application uses Next.js Cache Components. Public content is cached and
tagged; the session-dependent header streams separately; publish, edit,
delete, profile and community mutations revalidate their tags, and deletion
expires the entry immediately. Workspace, account, auth, erasure, health, and
API routes remain uncached. Cloudflare remains DNS-only for the application
domain; Vercel's cache serves the pages. The rule "Cloudflare must not cache
HTML" and the blanket `private, no-store` header on every route are
superseded.

### D5. Admin is the product

Operator pages live in the account menu under the sealed owner role and work
in production: the Stable Registry Release Center, extension packs, and
editions have no Vercel-only disablement; long operations run as background
jobs with visible progress; `/health` is owner-only; `/api/health` answers a
minimal status for monitors. One owner is created by the CLI bootstrap; a role
grant UI is deferred.

### D6. Sessions are server-authoritative, without client gates

The client session gate, the document-mutation admission and its signed
generations, the sign-out hardening, and the mutation registry are removed.
Every mutation carries the owner id the page was rendered for; a cookie that
now belongs to a different account is answered with "signed in as another
account, reload the page", a missing session with "session ended, sign in
again", and the composer keeps its unsaved text on screen in both cases.
Signing out in any tab reloads every open tab to the home page as a guest;
signing in as another account reloads every tab to the home page as that
account; unsaved composer text is lost by design. Better Auth's session cookie
cache is enabled.

### D7. Engineering-minimum process

CI runs lint, typecheck, tests, build, the generated-types check, and one
banned-dependency gate. The canon checkers and their classification files, the
Linear task standard and validator, the closeout ledger, parity reports, the
mutation registry audit, the browser accessibility, Core Web Vitals, and
typography matrices, the localization coverage registry, and the visual
fixtures are deleted. Typography uses `next/font/google` (Google Sans and Geist
Mono, fetched at build time and self-hosted from `/_next/static`). `AGENTS.md` is a
one-page guide and every task uses the half-page template it contains. There is
no nightly run.

### Voice dictation

The voice dictation control, the speech-recognition module, its copy, its
analytics property, its fixtures, scripts, tests, and documentation are
removed. The banned-dependency gate refuses `SpeechRecognition`.

## Superseded clauses

- ADR-0017: the returning-device retirement bridge and the banner that probes
  browser storage on every page. Its network-required success semantics stay.
- ADR-0018 §1: the transitional client-side gates that survived the
  serve-under-uncertainty cutover. §3: the measured indexability threshold,
  replaced by D3. §4 stays and is completed by D5.
- ADR-0019: the single-artifact wording ("the exact bytes are served"), the
  per-photo reservation through Vercel, the fixed 15-minute staging lease, and
  the codec parameters, all amended by D2. Its atomic Publish, private staging,
  and no-database-before-Publish rules stay.
- `AGENTS.md` (2026-08 version) hard rules 1 (precise-location text firewall),
  9 (indexability threshold), the "Cloudflare must not cache HTML" stack line,
  the Linear task standard requirement, and the canon-check workflow.
- `docs/TECH_STACK_DECISIONS.md` invariants 1 (text firewall), 8 (client gate
  wording), 10 (threshold), 11 (task standard), 12 (matrix gates).
- The July 2026 app-route `private, no-store` guardrail for public routes.

## Consequences

Faster pages for guests and members, organic discovery of every journal, a
composer that never loses photos while the tab is open, an owner who can run
the catalog from a phone, and a CI that answers in minutes. The accepted costs:
a gardener can publish coordinates in text; unsaved composer text is lost on
sign-out in another tab; a deleted entry may be served from a far CDN node for
a few seconds; one owner only. The decision is falsified if organic traffic
does not appear once journals are indexed, if cached pages leak one account's
header to another, or if the native codec produces visibly worse photos than
the WASM path on supported phones. On falsification, stop the responsible task
and supersede this ADR explicitly.

Measured (2026-09-03, OVE-371 production proof in the owner's desktop
Chrome): a 15.5 MB, 27 MP JPEG shows its 480 px preview 183 ms after the
drop and its final 2560 WebP at 575 ms; a 31.7 MB, 67.5 MP JPEG (above the
64 MP fallback ceiling, so native decoding only) shows the preview at 326 ms,
the final at 665 ms, and has its three objects staged at 3.15 s. The three
renditions serve from `media.over.garden` as immutable WebP with
`cf-cache-status: HIT` on the second GET. Public HTML shells answer
`x-vercel-cache: HIT`; the closeout receipt
(`docs/OWNER_MVP_RESET_PROOF_2026-09.md`) records the TTFBs.

## Rollout

OVE-362 (process) → OVE-363 (typography, fixtures) → OVE-364 (voice) →
OVE-365 (offline residue) → OVE-366 (location firewall) → OVE-367 (sessions,
proxy) → OVE-368 (indexability) → OVE-369 (cache) → OVE-370 (admin) →
OVE-371 (media codec, delivery) → OVE-372 (media session, lease) →
OVE-373 (closeout proof). Each task is one branch, one PR, green CI, merge.
