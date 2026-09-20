// @vitest-environment jsdom
import { Writable } from "node:stream";

import { act } from "@testing-library/react";
import {
  createContext,
  Suspense,
  use,
  useContext,
  useEffect,
  useState,
} from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToPipeableStream } from "react-dom/server.node";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnerScopeProvider, useOwnerScopeControl } from "@/components/auth/owner-scope";
import type { SiteShellSessionState } from "@/lib/site-shell-session-state";

vi.mock("next/navigation", () => ({
  usePathname: () => "/communities/observation-and-care",
}));

import {
  SiteShellContextRailOutlet,
  SiteShellContextRailProvider,
  SiteShellContextRailRegistration,
} from "./site-shell-context-rail";
import {
  ShellPathnameRegion,
  ShellSettledSessionRegion,
  ShellStateProvider,
  useSettledShellSession,
} from "./shell-session";

/**
 * ADR-0032 D10, as something that can fail.
 *
 * The page below is a boundary the server has not finished: its fallback is in
 * the HTML and its content is still on the way — every page that is not static
 * yet, and every request-time region inside one that is. React hydrates around
 * it and leaves it alone until the content arrives. **Unless something above it
 * changes**: then React cannot tell whether the content would have read the
 * change, gives the boundary up, and renders it on the client. The fallback
 * node in the document is replaced by a new one, and the segment the server
 * sends is thrown away when it lands.
 *
 * So the question each test asks is the one a browser would: after the chrome
 * has learned who is reading and where, *is the fallback in the document still
 * the node the server sent?*
 */

const GARDENER: SiteShellSessionState = {
  isAuthenticated: true,
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  hasOperatorAccess: false,
  sessionStore: "reachable",
};
const NEVER = new Promise<never>(() => undefined);
const RAIL_MODULES = [{ key: "rules", title: "Правила", items: [] }];

/**
 * Inside an element, as a page is inside the shell's content region. A pending
 * boundary at the very root holds the whole shell back instead: React cannot
 * know yet whether it will turn out to contain `<html>`.
 */
function PendingPage() {
  return (
    <div data-region="content">
      <Suspense fallback={<p data-page-fallback="true">…</p>}>
        <PageContent />
      </Suspense>
    </div>
  );
}

function PageContent(): React.ReactNode {
  return use(NEVER);
}

/** The shell of the HTML a server sends before a pending boundary completes. */
function renderShell(element: React.ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new Writable({
      write(chunk, _encoding, done) {
        html += Buffer.from(chunk).toString("utf8");
        done();
        // React flushes what is ready on its own schedule, not inside `pipe`.
        // The shell is whole once the pending boundary's end marker is out;
        // what would follow is its content, which this document never gets.
        if (!html.includes("<!--/$-->")) return;
        resolve(html);
        // The render is over as far as this document is concerned. Left
        // running, it shares its context providers with the client render
        // below and React says so on every one of them.
        queueMicrotask(() => stream.abort());
      },
    });
    const stream = renderToPipeableStream(element, {
      onShellReady() {
        stream.pipe(sink);
      },
      onShellError: reject,
      onError: reject,
    });
  });
}

async function hydrate(
  server: React.ReactElement,
  client: React.ReactElement,
) {
  // A document that is still arriving. In one that has finished loading React
  // treats a pending boundary as one the server failed to finish and renders
  // it on the client at once — which is jsdom's state, and would make every
  // assertion below pass or fail for a reason that is not this module.
  Object.defineProperty(document, "readyState", {
    configurable: true,
    get: () => "loading",
  });
  const container = document.createElement("div");
  document.body.append(container);
  container.innerHTML = await renderShell(server);
  const served = container.querySelector("[data-page-fallback]");
  expect(served, "the served HTML holds the page's fallback").not.toBeNull();

  const recoverable: unknown[] = [];
  await act(async () => {
    hydrateRoot(container, client, {
      onRecoverableError: (error) => recoverable.push(error),
    });
  });

  return { container, served, recoverable };
}

afterEach(() => {
  document.body.innerHTML = "";
  Reflect.deleteProperty(document, "readyState");
});

describe("what the chrome learns late does not disturb the page (ADR-0032 D10)", () => {
  it("publishes who is reading and where without React giving the page up", async () => {
    let settle: (value: SiteShellSessionState) => void = () => undefined;
    const clientSession = new Promise<SiteShellSessionState>((resolve) => {
      settle = resolve;
    });

    function Chrome({ session }: { session: Promise<SiteShellSessionState> }) {
      return (
        <ShellStateProvider session={session} document="static">
          <OwnerScopeProvider locale="uk" ownerUserId={null}>
            <OwnerFromSession />
            <SiteShellContextRailProvider>
              <PendingPage />
              <ShellPathnameRegion
                render={(pathname) => <i data-path={pathname ?? "unknown"} />}
              />
              <ShellSettledSessionRegion
                render={(known) => (
                  <b data-known={known?.isAuthenticated ? "gardener" : "guest"} />
                )}
              />
              <SiteShellContextRailOutlet fallback={<u data-rail="default" />} />
              <SiteShellContextRailRegistration modules={RAIL_MODULES} />
            </SiteShellContextRailProvider>
          </OwnerScopeProvider>
        </ShellStateProvider>
      );
    }

    function OwnerFromSession() {
      const settled = useSettledShellSession();
      const nameOwner = useOwnerScopeControl();
      useEffect(() => {
        if (settled) nameOwner(settled.ownerUserId);
      }, [nameOwner, settled]);
      return null;
    }

    const { container, served, recoverable } = await hydrate(
      <Chrome session={NEVER} />,
      <Chrome session={clientSession} />,
    );
    await act(async () => settle(GARDENER));

    // The chrome did learn all three…
    expect(container.querySelector("[data-path]")?.getAttribute("data-path")).toBe(
      "/communities/observation-and-care",
    );
    expect(container.querySelector("[data-known]")?.getAttribute("data-known")).toBe(
      "gardener",
    );
    expect(container.querySelector("[data-site-shell-context]")).not.toBeNull();
    // …and the page is still the server's, waiting for the server.
    expect(container.querySelector("[data-page-fallback]")).toBe(served);
    expect(recoverable).toEqual([]);
  });

  it("would not survive the same knowledge arriving as a context value", async () => {
    // The control: the shape this module used to have. If this ever stops
    // failing the way it does, React has changed and D10 can be reconsidered.
    const WhereContext = createContext<string | null>(null);
    let publish: (where: string) => void = () => undefined;

    function Chrome() {
      const [where, setWhere] = useState<string | null>(null);
      useEffect(() => {
        publish = setWhere;
      }, []);
      return (
        <WhereContext.Provider value={where}>
          <PendingPage />
          <Where />
        </WhereContext.Provider>
      );
    }

    function Where() {
      return <i data-path={useContext(WhereContext) ?? "unknown"} />;
    }

    const { container, served } = await hydrate(<Chrome />, <Chrome />);
    await act(async () => publish("/communities/observation-and-care"));

    expect(container.querySelector("[data-path]")?.getAttribute("data-path")).toBe(
      "/communities/observation-and-care",
    );
    expect(container.querySelector("[data-page-fallback]")).not.toBe(served);
  });
});
