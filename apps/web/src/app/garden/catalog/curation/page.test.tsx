import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

describe("/garden/catalog/curation", () => {
  it("keeps the historical operator URL as a compatibility redirect", async () => {
    const { default: CatalogCurationPage } = await import("./page");

    CatalogCurationPage();

    expect(mocks.redirect).toHaveBeenCalledWith("/garden/catalog/registry");
  });
});
