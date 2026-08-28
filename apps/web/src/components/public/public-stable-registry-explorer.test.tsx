import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicStableRegistryNotFound } from "./public-stable-registry-explorer";

describe("PublicStableRegistryNotFound", () => {
  it("keeps the 404 recovery scoped to the public registry surface and locale", () => {
    const html = renderToStaticMarkup(
      <PublicStableRegistryNotFound locale="bg" surface="catalog" />,
    );

    expect(html).toContain('id="main-content"');
    expect(html).toContain('data-stable-registry-state="not_found"');
    expect(html).toContain("Безопасен публичен запис не е намерен.");
    expect(html).toContain("Опитайте отново");
    expect(html).toContain('href="/bg/catalog"');
  });
});
