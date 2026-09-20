import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  cacheLife: vi.fn(),
  staticReadsAreAvailable: vi.fn(async () => true),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/cache", () => ({ cacheLife: mocks.cacheLife }));
// Whether a static render may read is `public-prerender.test.ts`'s subject.
vi.mock("@/server/public-prerender", () => ({
  staticReadsAreAvailable: mocks.staticReadsAreAvailable,
}));
vi.mock("next/navigation", () => ({
  // Next's own control flow is rethrown; here it is an error carrying a digest.
  unstable_rethrow: (error: unknown) => {
    if (
      error instanceof Error &&
      "digest" in error &&
      String(error.digest).startsWith("NEXT_")
    ) {
      throw error;
    }
  },
}));

import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  type PublicRenderPhase,
} from "./static-public-page";

const FALLBACK = <main data-skeleton="true" />;

/** What the hole renders once a request arrives. */
async function renderTheHole(deferred: React.ReactNode) {
  const boundary = deferred as React.ReactElement<{
    children: React.ReactElement;
  }>;
  const hole = boundary.props.children;
  return (hole.type as (props: unknown) => Promise<React.ReactNode>)(
    hole.props,
  );
}

describe("a static page, or the same page at request time (ADR-0032 D4)", () => {
  beforeEach(() => {
    mocks.connection.mockClear();
    mocks.cacheLife.mockClear();
    mocks.staticReadsAreAvailable.mockReset();
    mocks.staticReadsAreAvailable.mockResolvedValue(true);
  });

  it("returns the page itself, with no boundary, when the static render finishes", async () => {
    const phases: PublicRenderPhase[] = [];
    const page = await renderStaticPublicPage({
      fallback: FALLBACK,
      render: async (phase) => {
        phases.push(phase);
        await deferStaticRenderWithoutDatabase(phase);
        return <main data-page="true" />;
      },
    });

    expect(renderToStaticMarkup(page)).toBe('<main data-page="true"></main>');
    expect(phases).toEqual(["static"]);
    // Nothing waited for a request: the page is part of the shell.
    expect(mocks.connection).not.toHaveBeenCalled();
  });

  it("without a database, leaves the fallback in the shell and renders at request time", async () => {
    mocks.staticReadsAreAvailable.mockResolvedValue(false);
    const phases: PublicRenderPhase[] = [];
    const render = async (phase: PublicRenderPhase) => {
      phases.push(phase);
      await deferStaticRenderWithoutDatabase(phase);
      return <main data-page={phase} />;
    };

    const deferred = await renderStaticPublicPage({ fallback: FALLBACK, render });

    // What a build writes into the shell: the skeleton, and no failure.
    expect(renderToStaticMarkup(deferred)).toBe(
      '<main data-skeleton="true"></main>',
    );
    // A shell with a hole is given a time to be regenerated at.
    expect(mocks.cacheLife).toHaveBeenCalledWith(
      expect.objectContaining({ revalidate: 60 }),
    );
    expect(renderToStaticMarkup(await renderTheHole(deferred))).toBe(
      '<main data-page="request"></main>',
    );
    // The request-time render waits for a request before anything else — and
    // the page was not rendered a second time until somebody asked for it.
    expect(mocks.connection).toHaveBeenCalled();
    expect(phases.filter((phase) => phase === "static")).toHaveLength(1);
    expect(phases.at(-1)).toBe("request");
    // At request time nobody asks: the reads run, and fail or succeed for
    // this reader.
    expect(mocks.staticReadsAreAvailable).toHaveBeenCalledTimes(1);
  });

  it("does not prerender a failed read: the degraded state is drawn for one reader", async () => {
    const render = async (phase: PublicRenderPhase) => {
      const feed = await Promise.reject(new Error("ECONNRESET")).catch(() => {
        deferStaticRenderAfterFailure(phase);
        return null;
      });
      return <main data-state={feed === null ? "error" : "ready"} />;
    };

    const deferred = await renderStaticPublicPage({ fallback: FALLBACK, render });

    expect(renderToStaticMarkup(deferred)).not.toContain("data-state");
    expect(renderToStaticMarkup(await renderTheHole(deferred))).toBe(
      '<main data-state="error"></main>',
    );
  });

  it("lets Next's own answers through, and an ordinary error with them", async () => {
    const notFound = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    await expect(
      renderStaticPublicPage({
        fallback: FALLBACK,
        render: async () => {
          throw notFound;
        },
      }),
    ).rejects.toBe(notFound);

    const broken = new Error("a bug, not a deferral");
    await expect(
      renderStaticPublicPage({
        fallback: FALLBACK,
        render: async () => {
          throw broken;
        },
      }),
    ).rejects.toBe(broken);
    expect(mocks.connection).not.toHaveBeenCalled();
  });
});
