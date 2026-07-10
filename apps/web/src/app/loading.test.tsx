import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: vi.fn().mockResolvedValue("bg"),
}));

import Loading from "./loading";

describe("root loading state", () => {
  it("renders a localized, accessible state inside the shared shell content", async () => {
    const html = renderToStaticMarkup(await Loading());

    expect(html).toContain('data-site-shell-state="loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Зареждане на OverGarden");
    expect(html).toContain('data-slot="skeleton"');
  });
});
