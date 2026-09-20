import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { GUEST_SITE_SHELL_SESSION_STATE } from "@/lib/site-shell-session-state";

const pathnameReads = vi.hoisted(() => ({ count: 0 }));

vi.mock("next/navigation", () => ({
  usePathname: () => {
    pathnameReads.count += 1;
    return "/bg/journals";
  },
}));

import {
  ShellPathnameRegion,
  ShellRegion,
  ShellSettledSessionRegion,
  ShellStateProvider,
} from "./shell-session";
import { SignedInOnly } from "./signed-in-only";

const GARDENER = {
  isAuthenticated: true,
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  hasOperatorAccess: false,
  sessionStore: "reachable" as const,
};

function region() {
  return (
    <ShellRegion
      render={({ pathname, session }) => (
        <p
          data-reader={session?.isAuthenticated ? "gardener" : "guest"}
          data-address={pathname ?? "unknown"}
        />
      )}
    />
  );
}

describe("what a static document knows about its reader (ADR-0032 D2, D3)", () => {
  it("carries the guest's rendering while the session is a pending promise", () => {
    // A promise that never settles is exactly what a prerender holds.
    const html = renderToStaticMarkup(
      <ShellStateProvider
        session={new Promise(() => undefined)}
        document="static"
      >
        {region()}
      </ShellStateProvider>,
    );

    expect(html).toContain('data-reader="guest"');
  });

  it("never reads the address on the server", () => {
    pathnameReads.count = 0;
    const html = renderToStaticMarkup(
      <ShellStateProvider
        session={GUEST_SITE_SHELL_SESSION_STATE}
        document="static"
      >
        {region()}
        <ShellPathnameRegion
          render={(pathname) => <i data-path={pathname ?? "unknown"} />}
        />
      </ShellStateProvider>,
    );

    // A boundary around `usePathname()` completes during Next's per-address
    // prerender and collides with the request-time resume; not calling it is
    // the only safe spelling.
    expect(pathnameReads.count).toBe(0);
    expect(html).toContain('data-address="unknown"');
    expect(html).toContain('data-path="unknown"');
  });

  it("reads the address at once in a request-time document, in the canonical spelling", () => {
    const html = renderToStaticMarkup(
      <ShellStateProvider session={GARDENER} document="request">
        {region()}
      </ShellStateProvider>,
    );

    expect(html).toContain('data-reader="gardener"');
    expect(html).toContain('data-address="/journals"');
  });

  it("draws what is not in the served HTML for a guest until the session is known", () => {
    const settled = (
      session: Parameters<typeof ShellStateProvider>[0]["session"],
      document: "static" | "request",
    ) =>
      renderToStaticMarkup(
        <ShellStateProvider session={session} document={document}>
          <ShellSettledSessionRegion
            render={(known) => (
              <b
                data-known={
                  known === null
                    ? "not-yet"
                    : known.isAuthenticated
                      ? "gardener"
                      : "guest"
                }
              />
            )}
          />
        </ShellStateProvider>,
      );

    expect(settled(new Promise(() => undefined), "static")).toContain(
      'data-known="not-yet"',
    );
    expect(settled(GARDENER, "request")).toContain('data-known="gardener"');
  });
});

describe("SignedInOnly", () => {
  const render = (
    session: Parameters<typeof ShellStateProvider>[0]["session"],
  ) =>
    renderToStaticMarkup(
      <ShellStateProvider session={session} document="static">
        <SignedInOnly guest={<span>guest</span>}>
          <span data-followed="true">followed</span>
        </SignedInOnly>
      </ShellStateProvider>,
    );

  it("draws the guest's rendering for a guest and for the static bytes", () => {
    expect(render(GUEST_SITE_SHELL_SESSION_STATE)).toContain("guest");
    expect(render(new Promise(() => undefined))).toContain("guest");
    expect(render(new Promise(() => undefined))).not.toContain("data-followed");
  });

  it("draws its children for a gardener", () => {
    expect(render(GARDENER)).toContain('data-followed="true"');
  });
});
