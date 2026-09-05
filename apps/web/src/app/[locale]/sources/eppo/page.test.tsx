import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  listPublicEppoSourcePage: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

vi.mock("@/lib/catalog-source/eppo-archive-gate", () => ({
  isEppoArchiveEnabled: mocks.enabled,
}));

vi.mock(
  "@/server/catalog-source/public-eppo-explorer-repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/server/catalog-source/public-eppo-explorer-repository")
      >();
    return {
      ...actual,
      listPublicEppoSourcePage: mocks.listPublicEppoSourcePage,
    };
  },
);

describe("localized EPPO source explorer page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.listPublicEppoSourcePage.mockResolvedValue({
      request: { kind: "plant", query: "sollc", cursor: null },
      records: [
        {
          eppoCode: "SOLLC",
          objectKind: "plant",
          displayName: "Tomato",
          scientificName: "Solanum lycopersicum",
          taxonomicRank: "Species",
          parentDisplayName: "Solanum",
          aliases: [],
          evidenceState: "source_record_not_approved",
          href: "/ru/sources/eppo/SOLLC",
          qualityClass: "partial",
          observedAt: "2026-08-28T10:00:00.000Z",
          source: {
            name: "EPPO Codes",
            url: "https://data.eppo.int/",
            license: "EPPO Codes Open Data Licence",
            licenseUrl: null,
            attribution: "EPPO Codes, EPPO Codes Open Data Licence.",
          },
        },
      ],
      nextCursor: null,
      qualityClass: "partial",
    });
  });

  it("shows the source-only distinction and mandatory credit for guests", async () => {
    const { default: Route } = await import("./page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({ locale: "ru" }),
        searchParams: Promise.resolve({ q: "sollc", kind: "plant" }),
      }),
    );

    expect(mocks.listPublicEppoSourcePage).toHaveBeenCalledWith(
      { kind: "plant", query: "sollc", cursor: null },
      "ru",
    );
    expect(html).toContain('data-eppo-archive="explorer"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain("Запись источника — не одобрено");
    expect(html).toContain("EPPO Codes");
    expect(html).toContain("Научное название");
    expect(html).toContain("Таксономический ранг");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("Одобрено Stable Registry");
  });
});
