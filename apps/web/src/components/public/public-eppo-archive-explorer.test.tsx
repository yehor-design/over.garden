import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EppoArchiveNotFound } from "./public-eppo-archive-explorer";

describe("EppoArchiveNotFound", () => {
  it("keeps the 404 recovery scoped to the archive and the locale", () => {
    const html = renderToStaticMarkup(<EppoArchiveNotFound locale="bg" />);

    expect(html).toContain('id="main-content"');
    expect(html).toContain('data-eppo-archive-state="not_found"');
    expect(html).toContain("Безопасен публичен запис не е намерен.");
    expect(html).toContain("Опитайте отново");
    expect(html).toContain('href="/bg/sources/eppo"');
    expect(html).not.toContain("/catalog");
  });
});
