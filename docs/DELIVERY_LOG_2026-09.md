# Delivery log — 1 to 5 September 2026

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

## 3 September — the workspace stops stranding readers

**Every page under `/garden/**` renders its own shell and turns failure into a
state** (`OVE-374`, ADR-0023). The trigger was concrete: the owner opened the
editions page in production before its migrations existed, the page threw a
Postgres `42P01`, and the reader was left on the garden home's loading skeleton
— the wrong page's skeleton — forever, with a `200` in the platform's log.

The obvious repair was `error.tsx`, and it does not work. Reproduced on
Next 16.2.11 and React 19.2.4 with `cacheComponents: true`: when a Server
Component throws while a postponed response is resumed, the HTML stream closes
with the Suspense boundary still pending, no completion instruction is written,
and React keeps the server fallback on screen. The boundary catches on a
client-side navigation and never on a hard load.

So failures became values. One shared vocabulary
(`apps/web/src/server/workspace-failure.ts`) settles every read into a bounded
class with a short digest; eleven pages became a synchronous shell plus streamed
sections; each surface got a `loading.tsx` that renders the same shell as its
page, so the fallback and the finished page agree and nothing jumps;
`garden/loading.tsx` — which had been standing in for every child route, which is
why the wrong skeleton appeared — is gone.

Two things were only learned by running it, and both are in the ADR:

- **A null session is not proof that nobody is signed in.** Better Auth swallows
  its own read failure and answers `null`, so every workspace page would have
  told a signed-in gardener to sign in during a database outage. A bearer of a
  session cookie who resolves to nobody now gets one liveness read, and an
  honest "unavailable" if that fails.
- **A refusal and an outage must not share a code path.** The admin gate
  collapsed every rejection onto "denied", which told the owner to audit
  permissions while the role table was simply unreachable.

Proof: `pnpm prove:workspace-resilience` against a local production build whose
`DATABASE_URL` points at a closed port — all eleven surfaces answer `200` with
their own heading and a `connection_unavailable` panel, and no Suspense boundary
is left standing (`docs/WORKSPACE_RESILIENCE_PROOF_2026-09.md`). Verified again
in a real Chromium DOM, signed in: zero visible skeletons on every surface, a
retry control and a reference code on each. Under 400 kbps / 400 ms latency and
4× CPU throttling the heading of every surface appears at first paint and does
not move by a single pixel when the data arrives.

Observability turned out to need two lines, not one. `src/instrumentation.ts`
covers what actually throws — but a page that renders its failure does not
throw, so `onRequestError` is never called for it, and when something does
throw, the error React forwards there is sanitized down to a digest with no
driver code attached (both measured against a production build). A settled
failure therefore records itself in `settleSection`, where the code is still in
hand. Verified on a closed-port production build: the panel on screen and the
`workspace_section_degraded` line in the log carried the same reference,
`16JQ1ET`.

## 4–5 September — the matching image release, repaired and made loud

**Every push to `main` failed the matching image release for eight days, and
the failure said nothing** (PR #282). From `2d58ca5` at 23:11 UTC on
27 August to `8ed5531` at 20:09 UTC on 4 September, seventy-eight consecutive
runs of `matching-image.yml` built and published a correct image and then
refused to seal it. Every log ended at `docker pull` followed by
`Process completed with exit code 1`. The fix commit counts seventy-six; two
more pushes failed while it was being written.

The seal step demanded, as six literals, the handler set the built container
had to report. `stable_registry_foundation_build` joined the queue manifest in
the first failing commit and two more Stable Registry kinds followed, so every
image answered nine. The gate was `jq -e '…' >/dev/null`: `-e` exits 1 for a
false filter, and the redirect discarded the one word it would have printed.
The five label checks before it were bare `[[ … ]]` tests, mute by the same
construction; they happened to pass.

The set is derived now and restated nowhere.
`apps/web/src/server/job-queue-manifest.ts` is the single declaration. The seal
step reads it from the commit being released through the generated Python
module, compares it with what the built container answers, and seals it into
`release.json`; the host release script holds the running container to the set
its own artifact sealed; the contract test derives it as well and refuses any
handler name written into the workflow or the release script. Every gate in
the step prints what it expected and what it got.

**A red run nobody reads is not a signal** (PRs #283, #286). The release runs
after merge, so it can never be a required check on a pull request.
`release-health.yml` asks once a day, at 07:10 UTC, whether the newest
completed release on `main` succeeded and whether every scheduled cron path in
the deployed build answers the method Vercel Cron sends; it fails when either
is false. One red run in the Actions list, instead of one per push.

Verified on 5 September: the five releases since the repair, `f467fb8` through
`db49bdb`, each ran the seal and the upload to success (the prune step keeps
only the newest artifact, 181 MB), and both `release-health` dispatches
passed. The one construct left in the workflow that could still fail without a
word, `test -x` on the host release script, now says why. GitHub notifies
whoever triggered a failed run, so each of the seventy-eight failures produced
its own notice; every one of them describes a run that completed before
20:22 UTC on 4 September, and nothing since is red.

**The registry received every candidate before it was verified** (PR #288).
The repair kept the original order — push to GHCR, then pull the digest back
and verify it — so each of the seventy-eight refused images had already been
published under a release-shaped tag, and a public, immutable registry holds
seventy-eight images that are not releases. The workflow builds the candidate
onto the runner now and verifies its id, its platform (`linux/amd64`, declared
once as `RELEASE_PLATFORM`), every label, and the handler set the released
commit declares; only then does the one `docker push` run. The registry digest
is read back, resolved through the registry, and the image it serves is proved
to be the one verified before `capabilities` is sealed with the real digest.
The handler set is compared as the exact sequence the generated contract
declares, both sides through one serialiser; the contract test pins the order
(verify, then publish, then seal), refuses `push: true`, and refuses a handler
name in any quoting; `release.json` records the platform.

Proved before merge by dispatching the changed workflow from its branch against
the head of `main`. The first dispatch (run 33954389410) refused the candidate
on a string comparison of two JSON serialisers — Python's `", "` against jq's
`","` — inside "Verify the candidate on the runner", before any push, so the
refused image never reached the registry: the order the rewrite exists to keep,
observed on its first run. The second dispatch (run 33954619247) verified,
published, and sealed in 6m04s, with the registry digest resolved back to the
verified image id.

**Production runs the current worker** (PRs #289, #290). Installing the
sealed release of `4d8cf9a` on the droplet found the next two defects, each
visible only by deploying. Preflight refused the candidate with every
dependency available: `queueRecovery.handlerCompatible` compared the
candidate's handler set with the heartbeat row, which the incumbent worker
writes, so a release that changes the set could never pass and no host state
could satisfy it. Preflight no longer requires that field and still reports
it; readiness after activation keeps requiring it, because by then the row is
the candidate's own. The next release, `26ed3d1`, passed preflight and then
restarted on every loop: `record_drain_outcome` wrote a bare NULL into
`case when $2 is null`, psycopg binds parameters server-side, and Postgres
could not type it. The release script restored `003a0da` on its own within its
readiness wait, as designed. The function had been written on 31 August and
this was its first execution against a database; every test mocked the
connection. The placeholder is typed now, and
`services/matching/tests/test_runtime_database.py` builds a disposable database
from the four Better Auth tables and every versioned migration and runs the
worker's own functions against it — heartbeat, drain outcome, state read,
`LISTEN`, claim, wake, a full drain pass — in CI and in the release path alike;
against the pre-fix runtime it fails with the production error. `63ce91d` then
installed, passed preflight, and activated at about 09:50 UTC: `status` reads
ready, the previous pointer holds `003a0da` for rollback, and both production
proofs (`smoke:matching-queue-health`, `smoke:matching-runtime-capabilities`)
answer ready with the nine-handler set. They were run with `.env.local` set
aside, because `vercel env run` lets it shadow the production database, and
with the database host class confirmed as DigitalOcean-managed first. Freed on
the droplet to pass the capacity gate: two July transfer copies, two August
remediation copies in `/tmp`, rotated journals, and the apt cache; no installed
release was removed, and the host's release script and heartbeat excerpt were
brought up to the repository's copies with the old ones kept beside them.

**The registry holds only sealed releases** (owner approval, 2026-09-05). Of
866 package versions, 208 tagged images were sealed releases and 412 untagged
versions were their platform and attestation manifests. The 82 tagged images
no successful run produced — the 78 of the red window and four from the
budget-freeze day, 23 July — and their 164 child manifests were deleted, each
child attributed by reading its parent's manifest rather than by timestamp;
620 remain. `gh` needed `read:packages` and `delete:packages`, granted by the
owner in a browser.

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
