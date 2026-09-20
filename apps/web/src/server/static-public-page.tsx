import "server-only";

import { cacheLife } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { staticReadsAreAvailable } from "@/server/public-prerender";

/**
 * A static page, or — when it cannot be one right now — the same page at
 * request time (ADR-0032 D4).
 *
 * A static page has no boundary above it (D6), which is what puts its content
 * in the first bytes. It is also what leaves it nowhere to go when it cannot
 * finish: `await connection()` outside a boundary is a **build error**, so the
 * two cases D4 is about — no database configured, and a read that failed —
 * would each fail `next build` instead of deferring. Measured on 2026-09-20: a
 * build with `DATABASE_URL` unset stopped at `/uk` with "Uncached data was
 * accessed outside of <Suspense>". That is every Vercel Preview. And a read
 * that rejects during `next build` aborts the prerender whether or not
 * anything catches it, so the build asks whether the database answers *before*
 * it reads (`staticReadsAreAvailable`).
 *
 * So the page is *attempted* as a static render. The attempt either returns the
 * page, or throws `StaticRenderDeferred` from one of the two helpers below —
 * before anything has been rendered, since a page's reads happen before its
 * first element. Only then does a boundary appear, around a second render of
 * the same function that waits for a request first. The shell that results
 * carries the fallback and a hole: no failure is cached, each reader's request
 * tries for itself, and a designed degraded state is drawn for that reader
 * only.
 *
 * It heals by itself. A shell with a hole and no cached read in it would have
 * no reason ever to be regenerated, so the deferred branch reads a clock with
 * a one-minute life; the next regeneration attempts the static render again.
 */
export type PublicRenderPhase = "static" | "request";

export class StaticRenderDeferred extends Error {
  constructor(readonly reason: "database_unavailable" | "read_failed") {
    super(`The static render was deferred to the request: ${reason}.`);
    this.name = "StaticRenderDeferred";
  }
}

/**
 * **There is no database to read** — none configured (every Vercel Preview),
 * or none answering while `next build` runs. Await it before the first read of
 * a static page.
 */
export async function deferStaticRenderWithoutDatabase(
  phase: PublicRenderPhase,
) {
  if (phase === "static" && !(await staticReadsAreAvailable())) {
    throw new StaticRenderDeferred("database_unavailable");
  }
}

/**
 * **A read failed.** Call it where a static page would otherwise settle the
 * failure into its degraded state: that state renders successfully, and a
 * successful render is a shell every reader gets until it is regenerated.
 */
export function deferStaticRenderAfterFailure(phase: PublicRenderPhase) {
  if (phase === "static") throw new StaticRenderDeferred("read_failed");
}

/**
 * A function a route awaits, not a component it returns: what comes back is
 * the page's own tree, so a test that renders a route still renders the page.
 */
export async function renderStaticPublicPage({
  render,
  fallback,
}: {
  /** The page. Its reads come before its first element, in both phases. */
  render: (phase: PublicRenderPhase) => Promise<ReactNode>;
  /** What the shell shows in the hole, when there is one. */
  fallback: ReactNode;
}): Promise<ReactNode> {
  try {
    return await render("static");
  } catch (error) {
    // `notFound()` and a redirect are answers, not failures.
    unstable_rethrow(error);
    if (!(error instanceof StaticRenderDeferred)) throw error;
  }

  await staticRenderRetryClock();
  return (
    <Suspense fallback={fallback}>
      <RequestTimePublicPage render={render} />
    </Suspense>
  );
}

async function RequestTimePublicPage({
  render,
}: {
  render: (phase: PublicRenderPhase) => Promise<ReactNode>;
}) {
  // Never resolves in a prerender, so nothing below it is part of a shell.
  await connection();
  return render("request");
}

/**
 * A cached value with a short life and no content: it exists to give a
 * deferred shell a time to be regenerated at. Its `expire` stays above five
 * minutes on purpose — below that Next treats a cache as request data and the
 * clock itself would become a hole.
 */
async function staticRenderRetryClock() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 3_600 });
  return true;
}
