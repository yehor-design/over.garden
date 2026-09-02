import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicKnowledgeEvidence: vi.fn(),
}));

vi.mock("@/server/public-knowledge-evidence-repository", () => ({
  listPublicKnowledgeEvidence: mocks.listPublicKnowledgeEvidence,
}));

vi.mock("@/lib/storage", () => ({
  getPublicDerivativeUrl: (key: string) =>
    `/fixture-media/${encodeURIComponent(key)}`,
}));

import GuideRoute, {
  generateMetadata,
} from "../../[locale]/guides/[slug]/page";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/guides/[slug]", () => {
  it("renders a localized authored guide as a read-only public page", async () => {
    mocks.listPublicKnowledgeEvidence.mockResolvedValue(emptyEvidence());
    const html = renderToStaticMarkup(
      await GuideRoute({
        params: Promise.resolve({
          locale: "bg",
          slug: "start-a-living-plant-record",
        }),
      }),
    );

    expect(html).toContain("Как да започнете жив запис на растение");
    expect(html).toContain("Изберете едно растение");
    expect(html).toContain("Авторски материал");
    expect(html).toContain("Редакция OverGarden");
    expect(html).toContain("принципи за поверителност");
    expect(html).toContain("Опит от публични дневници");
    expect(html).toContain('data-site-shell-context="route-owned"');
    expect(html).toContain("/bg/knowledge");
    expect(html).not.toContain("/garden");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
  });

  it("uses indexable metadata for known guides", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({
          locale: "bg",
          slug: "start-a-living-plant-record",
        }),
      }),
    ).resolves.toMatchObject({
      title: "Как да започнете жив запис на растение | OverGarden",
      alternates: {
        canonical: "/bg/guides/start-a-living-plant-record",
        languages: {
          uk: "/guides/start-a-living-plant-record",
          bg: "/bg/guides/start-a-living-plant-record",
          ru: "/ru/guides/start-a-living-plant-record",
        },
      },
      robots: { index: true, follow: true },
    });
  });
});

function emptyEvidence() {
  return {
    items: [],
    totalCount: 0,
    hasMore: false,
    allEvidencePath: "/journals",
  };
}
