# Production prefetch availability

Status: measured decision
Owner: OVE-361
Instrument: `apps/web/scripts/probe-production-prefetch-availability.ts`
Measured: 2026-09-01

## What was observed

A browser session on the production workspace recorded roughly one in three
speculative navigation prefetch requests answering `503`, while every document
navigation and every hashed static asset in the same page load answered `200`.
The same path answered `200` on one attempt and `503` on another within a single
load.

Two facts bounded that observation immediately:

- The deployment's own runtime log for a two-hour window covering the session
  recorded **only success statuses**, so no application invocation produced a
  `503`. The status came from a layer in front of the application.
- Every hashed static asset answered `200`, which excludes a general edge
  outage.

That was one session. A ratio taken from one session is not a rate, and the
session was authenticated while the obvious control group was not, so the two
were never comparable.

## What was measured

Three runs against `https://over.garden`, sampling two request classes over the
same nine public paths — three locales (`/ru`, `/ua`, `/bg`) times three public
sections (root, `/feed`, `/knowledge`) — so no locale can dominate the sample.

| Run | Concurrency | Sample per class | Navigation | Prefetch |
| -- | -- | -- | -- | -- |
| 1 | 3 | 45 | `200` ×45 | `200` ×45 |
| 2 | 18 | 36 | `200` ×36 | `200` ×36 |
| 3 | 32 | 36 | `200` ×36 | `200` ×36 |

**234 observations, zero non-success statuses.** The slowest single response
across all three runs was 1656 ms, well inside the 10000 ms budget.

The `prefetch` class carries the App Router's own speculative headers, `RSC: 1`
and `Next-Router-Prefetch: 1`.

## What the measurement decides

**Burst concurrency alone does not produce the class.** The strongest live
hypothesis was that a browser's hover burst is wider and more concurrent than a
sequential control group, and that the `503` was a bounded response to it. Runs
2 and 3 raised the ceiling to 18 and then to 32 and produced `200` every time.
That hypothesis is refuted for the public surface.

**The public reading surface is not implicated.** Nine public paths across three
locales, in both request classes, answered `200` in every observation.

## What is deliberately left open

The one difference the probe does not sample is the **authenticated** rendering
path. The original observation carried a session; this probe never
authenticates, because using a person's session is outside what this issue
authorizes. Every remaining explanation therefore lies on that side of the line:
the class was not a property of the public surface, of the prefetch request
shape, or of burst concurrency at any tested ceiling.

The browser also appends a build-derived `_rsc` query parameter to a real
prefetch. The probe does not fabricate one, because an invented token would
measure a cache miss rather than the surface. That limitation is recorded in
every receipt.

**No repair is proposed here, and none should be, until the class is reproduced
on the authenticated path.** A repair scoped from this measurement alone would
be aimed at a surface the measurement just cleared.

## Running it

```bash
cd apps/web
pnpm exec tsx scripts/probe-production-prefetch-availability.ts --mode verify --repeats 5
```

```bash
# widen the burst to test the concurrency hypothesis; the ceiling is bounded at 32
cd apps/web
pnpm exec tsx scripts/probe-production-prefetch-availability.ts --mode verify --repeats 4 --concurrency 18
```

`--mode plan` issues no request at all. The probe uses safe methods only,
refuses anything else outright, and records status classes, counts, and
durations — never a cookie, capability, session identifier, journal body,
coordinate, owner identifier, or user agent.
