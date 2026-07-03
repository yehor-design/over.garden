import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicLineageGraphPage: vi.fn(),
}));

vi.mock("@/server/public-lineage-repository", () => ({
  getPublicLineageGraphPage: mocks.getPublicLineageGraphPage,
}));

const objectId = "00000000-0000-4000-8000-000000000101";
const sourceObjectId = "00000000-0000-4000-8000-000000000102";

describe("/lineage/objects/[objectId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicLineageGraphPage.mockResolvedValue({
      root: {
        plantObjectId: objectId,
        displayName: "Balcony tomato",
        objectKind: "plant",
        varietyText: "Red Cherry",
        varietyState: "selected",
        catalogKind: "plant_variety",
        catalogCanonicalName: "Red Cherry tomato",
        catalogPublicSlug: "red-cherry-tomato-0000000101",
        safeLocationLabel: "Region: Ukraine - Kyiv City",
      },
      nodes: [
        {
          plantObjectId: objectId,
          displayName: "Balcony tomato",
          objectKind: "plant",
          varietyText: "Red Cherry",
          varietyState: "selected",
          catalogKind: "plant_variety",
          catalogCanonicalName: "Red Cherry tomato",
          catalogPublicSlug: "red-cherry-tomato-0000000101",
          safeLocationLabel: "Region: Ukraine - Kyiv City",
        },
        {
          plantObjectId: sourceObjectId,
          displayName: "Seed mother",
          objectKind: "plant",
          varietyText: "Red Cherry",
          varietyState: "selected",
          catalogKind: "plant_variety",
          catalogCanonicalName: "Red Cherry tomato",
          catalogPublicSlug: "red-cherry-tomato-0000000101",
          safeLocationLabel: null,
        },
      ],
      edges: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          depth: 1,
          subjectPlantObjectId: objectId,
          sourcePlantObjectId: sourceObjectId,
          createdAt: new Date("2026-07-03T19:00:00.000Z"),
        },
      ],
      depthLimit: 5,
    });
  });

  it("marks lineage graph metadata as noindex through the public surface policy", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ objectId }),
    });

    expect(metadata.title).toBe("Balcony tomato lineage | OverGarden");
    expect(metadata.alternates?.canonical).toBe(`/lineage/objects/${objectId}`);
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("renders confirmed public-safe chains without private payload fields", async () => {
    const { default: PublicLineageObjectRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicLineageObjectRoute({
        params: Promise.resolve({ objectId }),
      }),
    );

    expect(mocks.getPublicLineageGraphPage).toHaveBeenCalledWith(objectId);
    expect(html).toContain("Lineage graph");
    expect(html).toContain("Confirmed provenance");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("Seed mother");
    expect(html).toContain("Red Cherry");
    expect(html).toContain("Region: Ukraine - Kyiv City");
    expect(html).toContain("/variety/red-cherry-tomato-0000000101");
    expect(html).not.toMatch(
      /journal body|quarantine|derivative|media key|ip_address|ipaddress|user_agent|useragent|user-agent|email|phone|coarse_region|location_visibility|coordinates|@private|https?:\/\//i,
    );
  });

  it("keeps missing lineage pages noindex", async () => {
    mocks.getPublicLineageGraphPage.mockResolvedValue(null);

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ objectId }),
    });

    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
