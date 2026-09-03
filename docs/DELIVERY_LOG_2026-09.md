# Delivery log — 1 to 3 September 2026

Status: dated receipt. Immutable once written; corrections are appended, not
rewritten. Current state lives in `docs/PROJECT_STATE.md`.

Forty pull requests landed on `main` in three days, from `d51b7a2` to `1c8d186`.
This page groups them by the decision they serve, so a reader can see why each
change exists without reading forty diffs. Every claim here has a receipt in the
linked document or in the Linear issue named beside it.

## 1 September — making the existing product honest

Before any reset, three defects were making the running product lie about
itself. Each was measured first and fixed second.

**Photos stopped reaching the journal** (`OVE-359`, PR #223). The staging
reservation was parsed by two pieces of code that had drifted apart, so a
photo could be staged and then refused at Publish. One shared wire contract now
owns the parse on both sides.

**A degraded workspace section was anonymous** (`OVE-360`, PRs #224, #226,
#229). When one of the four workspace reads failed, the page rendered an em
dash and the runtime log recorded a success, because the page itself answered
200. A bounded failure vocabulary — `permission_denied`, `schema_missing`,
`query_timeout`, `connection_unavailable`, `serialization_failure`, `unknown` —
now travels with the section and is rendered as a data attribute, never as copy.
Each section's deadline is derived from its own round-trip cost rather than a
shared guess. See `docs/GARDEN_WORKSPACE_SECTION_OBSERVABILITY.md`.

**Roughly one prefetch in three answered 503** (`OVE-361`, PRs #225, #236,
#237). Measured with a probe rather than assumed: navigation and static assets
were fine, only speculative prefetches failed. The first written explanation was
wrong and was corrected in the same window — the proxy already skips prefetches,
so the cause was connection exhaustion reached through a different path. See
`docs/PRODUCTION_PREFETCH_AVAILABILITY.md`.

**Infrastructure work in the same window.** Functions moved to `fra1` beside the
database (PRs #227, #228). The application pool was widened behind a connection
pooler, with the pooler proven to be a pooler before the cutover rather than
after (PRs #234, #235). A dead join left the inventory summary (#229), the
recent-entries read got its index (#230), the bootstrap script was repaired
(#231), the retention leader lock moved to a direct session because a
transaction pooler cannot hold it (#232), and the migration set was made safe to
re-apply (#233). R2 credential rotation was recorded (#222).

Receipts for all of these are in `docs/INFRASTRUCTURE_REGISTRY.md`.

## 2 September — the owner audit and seven decisions

The owner audited `main @ 842183b` against seven requirements given to a
previous agent. Four were done with residue, one was true in canon but not in
the runtime, one was not achieved in practice, and one had never started.

The outcome was seven decisions, recorded as **ADR-0022** and implemented as
Linear project "SDD Slice 21", issues `OVE-362` through `OVE-373`:

| Decision | What it settles |
| -- | -- |
| D1 | Delete the precise-location text firewall entirely |
| D2 | Media: WebP only, no EXIF, native-first browser codec, variants and placeholder, session capability with a renewable lease |
| D3 | Every live public page is indexable; `noindex` only for empty listings, the seven-day tombstone, and workspace screens |
| D4 | Public HTML is cached with tags and revalidated by the mutations that change it |
| D5 | Admin is the product: the Release Center runs in production under the sealed owner |
| D6 | Sessions are server-authoritative; no client gates or admission tokens |
| D7 | Engineering-minimum process: one CI, a one-page `AGENTS.md`, a banned-dependency gate |

Voice dictation was removed as a separate positive decision.

Delivered the same day: the process prune and ADR-0022 itself (`OVE-362`,
PR #238); typography through `next/font/google` and the deletion of the
visual-fixture subsystem (`OVE-363`, PR #239); voice dictation removed end to
end (`OVE-364`, PR #240); the offline residue removed (`OVE-365`, PRs #242,
#243); the location firewall deleted (`OVE-366`, PR #244); server-authoritative
sessions with cross-tab sign-out (`OVE-367`, PR #245); every live public page
made indexable with a chunked sitemap (`OVE-368`, PRs #246, #247); and Cache
Components enabled for the public pages (`OVE-369`, PR #248).

**A soft-404 class was found and fixed on the way.** Under Cache Components the
root `loading.tsx` streams a 200 shell before a page can call `notFound()`, so
unknown paths answered 200 with not-found UI. Unknown root segments and unknown
root files were repaired in the proxy (PRs #241, #243, #251, #252). The same
mechanism is why the workspace resilience work exists; see ADR-0023.

## 3 September — media, admin, closeout, and the production catch-up

**Admin that works in production** (`OVE-370`, PR #249). The deployment refusal
was removed from the three Stable Registry feature gates, the flags became kill
switches set in Vercel, `/health` became owner-only, and the operator menu gained
its links.

**Fast client media** (`OVE-371`, PRs #254, #255, #256). The browser now decodes
natively first and falls back to WASM only when it must: one 50 MiB source
limit, a 480 px preview from the decoded bitmap, then a 2560 primary WebP at
quality 85 with 1280 and 480 variants and a 16 px placeholder. Delivery is a
plain `<img srcset>` from `media.over.garden`; the Vercel image optimizer is
gone. Two defects surfaced in production and were fixed the same day: the
publish route compared receipts to photos one-to-one and refused a photo that
legitimately carried three, and an oversized drop reached the codec instead of
being refused with bounded copy.

Measured in the owner's desktop Chrome: a 15.5 MB, 27 MP JPEG shows its preview
183 ms after the drop and its final WebP at 575 ms; a 31.7 MB, 67.5 MP JPEG —
above the fallback ceiling, so native decoding only — shows the preview at
326 ms, the final at 665 ms, and stages all three objects at 3.15 s.

**Media session and lease** (`OVE-372`, PRs #257, #259). Per-photo reservations
were replaced by one session capability per composer, so adding a photo makes no
call to Vercel at all. The lease runs two hours and is renewed every five
minutes while the tab holds media; promotion runs with bounded concurrency; a
weekly cron sweeps orphaned objects. Proven in production by a composer left
open for forty minutes that published successfully. A CORS defect made the first
upload fail silently — the Worker's preflight did not admit the two dimension
headers — and was fixed and deployed the same day.

**Closeout** (`OVE-373`, PRs #258, #260). Documents were reconciled with the
runtime and a read-only proof script now checks all seven requirements against
production and writes `docs/OWNER_MVP_RESET_PROOF_2026-09.md`. All seven pass.

**The production schema catch-up.** The reviewed-migration applier gained an
inventory mode (PR #253), and the inventory revealed that production was far
behind the repository: the entire Stable Registry schema had never been applied,
along with the journal deletion columns that had been silently failing owner
deletes. Fifteen migrations were applied by hand under the owner's approval. The
applied state is now recorded in `docs/PRODUCTION_SCHEMA_STATE.md` so the gap
cannot go unnoticed again.

**The matching API was retired from the host** (`OVE-357` phase B, PR #261). The
repository half had merged on 31 August; the container, its Caddy route, and
`matching.over.garden` were removed on 3 September under an approved plan digest,
each step verified twice, with the worker healthy throughout. Worker liveness now
comes only from the heartbeat row. See `docs/MATCHING_API_RETIREMENT.md`.

## Corrections made in this window

Recorded because a wrong explanation that was quietly replaced is worse than one
that was named:

- The first prefetch-503 explanation blamed the proxy; the proxy already skips
  prefetches. Corrected in PR #237 before anything was built on it.
- A GitHub automation marked `OVE-357` Done when its phase A merged, while the
  host work had not started. It was moved back to In Progress the same minute
  and stayed there until the teardown actually ran.
- The closeout proof reported `srcset` as missing when it was present: React 19
  serialises the attribute as `srcSet` and the check was case-sensitive. The
  check now asks the CDN whether a photo has variants at all, so pre-migration
  photos are counted rather than failed (PR #260).
