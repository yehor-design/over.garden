import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  SiteShellContextRailModules,
  SiteShellContextRailOutlet,
  SiteShellContextRailProvider,
  SiteShellContextRailRegistration,
} from "./site-shell-context-rail";

describe("SiteShellContextRailModules", () => {
  it("supports multiple labeled facts linking to the same section anchor", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const html = renderToStaticMarkup(
      <SiteShellContextRailModules
        modules={[
          {
            key: "profile-kinds",
            title: "Kinds",
            items: [
              { href: "#profile-objects", label: "Plants", meta: "9" },
              { href: "#profile-objects", label: "Bee colonies", meta: "1" },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain("Plants");
    expect(html).toContain("Bee colonies");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("what a page puts in the rail (ADR-0032 D10)", () => {
  const MODULES = [
    {
      key: "kingdoms",
      title: "Царства",
      items: [{ href: "/catalog?kingdom=plantae", label: "Рослини", meta: "7" }],
    },
  ];

  it("draws the fallback in the served HTML: a page speaks from an effect", () => {
    const html = renderToStaticMarkup(
      <SiteShellContextRailProvider>
        <SiteShellContextRailRegistration modules={MODULES} />
        <SiteShellContextRailOutlet fallback={<p>default</p>} />
      </SiteShellContextRailProvider>,
    );

    expect(html).toContain("default");
    expect(html).not.toContain("Рослини");
  });

  it("reaches the outlet without rendering what sits beside it, and leaves with the page", async () => {
    let besideRenders = 0;
    function Beside() {
      besideRenders += 1;
      return null;
    }
    const beside = <Beside />;
    const tree = (registered: boolean) => (
      <SiteShellContextRailProvider>
        {beside}
        {registered ? (
          <SiteShellContextRailRegistration modules={MODULES} />
        ) : null}
        <SiteShellContextRailOutlet fallback={<p>default</p>} />
      </SiteShellContextRailProvider>
    );
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(tree(true));
    });

    expect(JSON.stringify(renderer!.toJSON())).toContain("Рослини");
    expect(besideRenders).toBe(1);

    await act(async () => renderer!.update(tree(false)));
    expect(JSON.stringify(renderer!.toJSON())).toContain("default");
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("Рослини");
    await act(async () => renderer!.unmount());
  });
});
