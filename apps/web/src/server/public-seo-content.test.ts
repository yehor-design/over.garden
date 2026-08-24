import { describe, expect, it } from "vitest";

import {
  answerVisibleText,
  authoredContentEntityIds,
  getAnswerPage,
  getMarketLanding,
  listAnswerPages,
  listBlogPosts,
  listGuides,
  listAuthoredPublicContentSitemapCandidates,
  listMarketLandings,
  resolveAuthoredPublicSurfaceDiscovery,
} from "./public-seo-content";
import { listIndexableLocalizedAuthoredSitemapEntries } from "./public-localized-content";

describe("public SEO/AEO content foundation", () => {
  it("measures every authored candidate before sitemap admission", () => {
    const entries = listAuthoredPublicContentSitemapCandidates();
    const paths = entries.map((entry) => entry.path);

    expect(paths).toEqual([
      "/knowledge",
      "/bg/knowledge",
      "/ru/knowledge",
      "/blog",
      "/bg/blog",
      "/ru/blog",
      "/blog/ai-garden-advice-vs-real-garden-proof",
      "/bg/blog/ai-garden-advice-vs-real-garden-proof",
      "/ru/blog/ai-garden-advice-vs-real-garden-proof",
      "/guides/start-a-living-plant-record",
      "/bg/guides/start-a-living-plant-record",
      "/ru/guides/start-a-living-plant-record",
      "/answers/why-are-tomato-leaves-yellow",
      "/bg/answers/why-are-tomato-leaves-yellow",
      "/ru/answers/why-are-tomato-leaves-yellow",
      "/markets/ukraine",
      "/bg/markets/bulgaria",
      "/ru/markets/bulgaria",
    ]);
    expect(entries).toContainEqual({
      kind: "editorial_blog",
      locale: "uk",
      path: "/blog",
      lastModified: "2026-07-03T00:00:00.000Z",
      changeFrequency: "weekly",
      priority: 0.7,
    });
    expect(entries).toContainEqual({
      kind: "marketing_landing",
      locale: "bg",
      path: "/bg/markets/bulgaria",
      lastModified: "2026-07-03T00:00:00.000Z",
      changeFrequency: "monthly",
      priority: 0.65,
    });

    const admitted = listIndexableLocalizedAuthoredSitemapEntries();
    expect(admitted.length).toBeGreaterThan(0);
    expect(admitted.every((entry) => paths.includes(entry.path))).toBe(true);
    expect(admitted.map((entry) => entry.path)).toContain(
      "/answers/why-are-tomato-leaves-yellow",
    );
    expect(entries).toContainEqual({
      kind: "editorial_blog",
      locale: "uk",
      path: "/blog/ai-garden-advice-vs-real-garden-proof",
      lastModified: "2026-07-03T00:00:00.000Z",
      changeFrequency: "monthly",
      priority: 0.65,
    });
  });

  it("gives every authored guide and answer explicit editorial and evidence provenance", () => {
    for (const item of [...listGuides(), ...listAnswerPages()]) {
      expect(item.editorial).toMatchObject({
        synthetic: false,
        authoredLocale: "uk",
      });
      expect(item.editorial.updatedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.knowledge.objectKinds.length).toBeGreaterThan(0);
      expect(
        item.knowledge.evidence.topicSlugs.length +
          item.knowledge.evidence.catalogSlugs.length,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps the authored public content manifest free of private payload surfaces", () => {
    const serialized = JSON.stringify({
      blogPosts: listBlogPosts(),
      guides: listGuides(),
      answers: listAnswerPages(),
      markets: listMarketLandings(),
    });

    expect(serialized).not.toMatch(/owner[_ -]?user/i);
    expect(serialized).not.toMatch(/quarantine/i);
    expect(serialized).not.toMatch(/media[_ -]?key/i);
    expect(serialized).not.toMatch(/raw[_ -]?source/i);
    expect(serialized).not.toMatch(/source[_ -]?record/i);
    expect(serialized).not.toMatch(/latitude|longitude/i);
    expect(serialized).not.toMatch(/invite|token/i);
    expect(serialized).not.toContain("/admin");
    expect(serialized).not.toContain("/api/");
    expect(serialized).not.toContain("/journal/");
  });

  it("wires UA and BG market pages to the OVE-117 localization foundation handoff", () => {
    expect(getMarketLanding("ukraine")?.localizationHandoff).toEqual({
      locale: "uk",
      plannedPath: "/markets/ukraine",
      owningIssue: "OVE-117",
    });

    expect(getMarketLanding("bulgaria")?.localizationHandoff).toEqual({
      locale: "bg",
      plannedPath: "/bg/markets/bulgaria",
      owningIssue: "OVE-117",
    });
  });

  it("registers rich answer facts with the shared measured decision", () => {
    const answerPage = getAnswerPage("why-are-tomato-leaves-yellow");
    expect(answerPage).not.toBeNull();

    const discovery = resolveAuthoredPublicSurfaceDiscovery({
      consumerId: "localized_answer",
      canonicalPath: answerPage!.path,
      equivalentLocales: ["uk", "bg", "ru"],
      visibleText: answerVisibleText(answerPage!),
      distinctPublicEntityIds: authoredContentEntityIds(answerPage!.path),
      meaningfulContentAt: `${answerPage!.editorial.updatedDate}T00:00:00.000Z`,
      evaluatedAt: "2026-08-24T00:00:00.000Z",
    });

    expect(discovery.decision).toMatchObject({
      value: "indexable",
      reasons: [],
    });
  });
});
