import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchPublicPalette: vi.fn(),
  connection: vi.fn(async () => undefined),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));

vi.mock("@/server/public-palette-search", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/public-palette-search")>();
  return { ...actual, searchPublicPalette: mocks.searchPublicPalette };
});

const READY = {
  query: "томат",
  groups: [
    {
      key: "journals",
      results: [
        {
          key: "journals",
          id: "journals:1",
          label: "Полив без календарної пастки",
          detail: "@yehor",
          href: "/@yehor/poliv",
          language: null,
        },
      ],
    },
  ],
};

async function get(url: string) {
  const { GET } = await import("./route");
  return GET(new Request(url));
}

describe("GET /api/public/search/palette", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("answers the grouped shape and never lets the answer be prerendered", async () => {
    mocks.searchPublicPalette.mockResolvedValue(READY);
    const response = await get(
      "https://over.garden/api/public/search/palette?q=%D1%82%D0%BE%D0%BC%D0%B0%D1%82&locale=uk",
    );

    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      query: "томат",
      state: "ready",
      groups: [{ key: "journals" }],
    });
    expect(response.headers.get("Server-Timing")).toMatch(/^total;dur=/u);
  });

  it("stays out of every shared cache", async () => {
    // The one caching exception in `AGENTS.md` rule 5 is the catalogue
    // typeahead under `/api/public/catalog/`. This is a different route with a
    // different job and it does not inherit that exception, however public its
    // data is.
    mocks.searchPublicPalette.mockResolvedValue(READY);
    const response = await get(
      "https://over.garden/api/public/search/palette?q=tomato",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers a short query without touching the database", async () => {
    const response = await get(
      "https://over.garden/api/public/search/palette?q=%D1%82",
    );
    expect(mocks.searchPublicPalette).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: "empty",
      groups: [],
    });
  });

  it("falls back to Ukrainian for a locale it does not recognise", async () => {
    mocks.searchPublicPalette.mockResolvedValue(READY);
    await get("https://over.garden/api/public/search/palette?q=tomato&locale=de");
    expect(mocks.searchPublicPalette).toHaveBeenCalledWith("tomato", {
      locale: "uk",
    });
  });

  it("answers 503 with a retry when the read fails, and says nothing else", async () => {
    mocks.searchPublicPalette.mockRejectedValue(
      new Error("private connection detail"),
    );
    const response = await get(
      "https://over.garden/api/public/search/palette?q=tomato",
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain('"state":"unavailable"');
    expect(body).not.toContain("private connection detail");
  });

  it("bounds the query it will accept at all", async () => {
    mocks.searchPublicPalette.mockResolvedValue(READY);
    const long = "т".repeat(500);
    await get(
      `https://over.garden/api/public/search/palette?q=${encodeURIComponent(long)}`,
    );
    const [query] = mocks.searchPublicPalette.mock.calls[0]!;
    expect((query as string).length).toBe(80);
  });
});
