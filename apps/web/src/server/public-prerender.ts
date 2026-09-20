import "server-only";

import { cacheLife } from "next/cache";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { connection } from "next/server";

import { resolveDatabaseConnection } from "@/db/connection";
import { pingDatabase } from "@/server/health-repository";

/**
 * When a public page gives up being static (ADR-0032 D4).
 *
 * A public page is a static document: its reads are `use cache` reads, so its
 * content is part of the prerendered shell and paints from the first bytes.
 * Nothing about that needs a request — except where prerendering would be
 * wrong rather than merely impossible, which is what this module decides.
 *
 * Two kinds of page call it. One that renders **behind a boundary of its own**
 * (a `loading.tsx` beside it) can wait for a request wherever it likes, and
 * uses `deferWithoutDatabase` and `deferFailureToRequest`. A **static page has
 * no boundary above it** (D6), so waiting is a build error there; it goes
 * through `renderStaticPublicPage` in `static-public-page.tsx`, which asks
 * `staticReadsAreAvailable` and defers by returning a boundary instead.
 */

/**
 * The one param a dynamic public route hands `generateStaticParams`.
 *
 * Cache Components needs at least one sample to treat a dynamic route as one
 * it prerenders per address — without it an address's params are request data
 * and the page streams on every request. A real row would make the build need
 * a database, which a Preview does not have. So the sample is a spelling no
 * address can have — a handle starts with `@`, a slug and a number have no
 * underscore-only form — and the route renders nothing for it before it reads
 * anything. The proxy never lets it in from outside.
 */
export const STATIC_PARAMS_PLACEHOLDER = "__static_params__";

/** How long the build waits for the database to say it is there. */
const BUILD_PROBE_DEADLINE_MS = 3_000;

/**
 * Whether a static render may read the database right now.
 *
 * **No database is configured.** A Vercel Preview has no `DATABASE_URL` at
 * all, and a prerender that read one would fail the build on `ECONNREFUSED`
 * (2026-09-12, `/species`).
 *
 * **One is configured and does not answer, during `next build`.** A rejected
 * `use cache` read aborts a prerender *however the rejection is handled* — a
 * `try`/`catch` around it does not save the build. Measured on 2026-09-20: a
 * build against a closed port stopped at the first page that read. So the
 * build asks first, through a cached probe that cannot reject, and reads only
 * if the answer is yes. At run time nobody asks: a failed read there fails one
 * regeneration, the shell that was being served stays, and the page's own
 * `catch` defers (`deferFailureToRequest`, `deferStaticRenderAfterFailure`).
 *
 * Either way a build never needs a database, which is what let every build
 * before ADR-0032 succeed and is not something a faster page may cost.
 */
export async function staticReadsAreAvailable(): Promise<boolean> {
  if (resolveDatabaseConnection(process.env).source === "missing") return false;
  if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) return true;
  return databaseAnswersDuringBuild();
}

/**
 * Cached so that it is part of the prerender rather than a hole in it, and
 * short-lived so that a build restored from another build's cache asks again.
 * `expire` stays at five minutes: below that Next treats a cache as request
 * data, and the probe itself would be what fails the build.
 */
async function databaseAnswersDuringBuild(): Promise<boolean> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pingDatabase(),
      new Promise<boolean>((resolve) => {
        deadline = setTimeout(() => resolve(false), BUILD_PROBE_DEADLINE_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * For a page behind a boundary of its own, and for a static page's
 * `generateMetadata`: wait for the request when a static render may not read.
 * With a database that answers this is a no-op, and the read is prerendered.
 *
 * Call it before the first read. It replaces the unconditional `await
 * connection()` those used to open with, which is what made every public page
 * dynamic from its first line.
 */
export async function deferWithoutDatabase(): Promise<void> {
  if (!(await staticReadsAreAvailable())) await connection();
}

/**
 * **A read failed**, on a page behind a boundary of its own. A page settles a
 * failed read into a designed degraded state (ADR-0023) — and a degraded state
 * that renders *successfully* is a shell Next will happily cache and serve to
 * every reader, `noindex` included, until the read's `cacheLife` runs out. One
 * slow minute in the database would become an hour of "temporarily
 * unavailable" on an entry.
 *
 * So the `catch` that settles a failure awaits this first. During a prerender
 * it never resolves: the failure is left out of the shell, the page's boundary
 * keeps its fallback there, and each request retries the read for itself. At
 * request time it resolves at once and the degraded state renders for that
 * reader only. A failed `use cache` call is not stored, so the next
 * regeneration reads again and the shell heals on its own.
 *
 * Put `unstable_rethrow(error)` before it, as in every blanket `catch` on a
 * public page: Next signals its own control flow by throwing.
 */
export async function deferFailureToRequest(): Promise<void> {
  await connection();
}
