import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SiteShellContextRailModules } from "./site-shell-context-rail";

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
