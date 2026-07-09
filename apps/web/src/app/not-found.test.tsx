import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: vi.fn().mockResolvedValue("bg"),
}));

import NotFound from "./not-found";

describe("public not-found page", () => {
  it("uses the selected interface locale for a public missing route", async () => {
    const html = renderToStaticMarkup(await NotFound());

    expect(html).toContain('lang="bg"');
    expect(html).toContain("Страницата не е намерена");
    expect(html).toContain("Към OverGarden");
  });
});
