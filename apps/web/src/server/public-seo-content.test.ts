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
import {
  listIndexableLocalizedAuthoredSitemapEntries,
  listLocalizedAnswerPages,
} from "./public-localized-content";
import { knowledgeCitationNumbers } from "@/lib/knowledge-citations";
import { SYSTEM_TOPIC_SLUGS } from "@/lib/system-topic-labels";

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
      expect(item.editorial.basis.length).toBeGreaterThan(0);
      expect(item.editorial.qualifications.length).toBeGreaterThan(0);
      expect(item.knowledge.objectKinds.length).toBeGreaterThan(0);
      expect(
        item.knowledge.evidence.topicSlugs.length +
          item.knowledge.evidence.catalogSlugs.length,
      ).toBeGreaterThan(0);
    }
  });

  it("rests gardening advice on sources and product help on the product (OVE-498)", () => {
    for (const item of [...listGuides(), ...listAnswerPages()]) {
      if (item.knowledge.subject === "gardening") {
        // Advice cites the works it rests on, each read on a date.
        expect(item.editorial.sources.length, item.slug).toBeGreaterThan(0);
        for (const source of item.editorial.sources) {
          expect(source.url).toMatch(/^https:\/\//u);
          expect(source.accessedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
          expect(source.language).toMatch(/^[a-z]{2}$/u);
        }
      } else {
        // Help with OverGarden claims no outside source for itself.
        expect(item.editorial.sources, item.slug).toEqual([]);
      }
      // Nothing says a product principle is the ground for advice.
      expect(JSON.stringify(item.editorial)).not.toMatch(
        /principle|proof-first|guidance/iu,
      );
    }
  });

  it("points every citation, in every language, at a source it has", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      for (const page of listLocalizedAnswerPages(locale)) {
        const cited = [
          page.conciseAnswer,
          ...page.causes,
          ...page.faqs.map((faq) => faq.answer),
        ].flatMap(knowledgeCitationNumbers);
        const sources = page.editorial.sources.length;
        for (const number of cited) {
          expect(number, `${locale} ${page.slug}`).toBeGreaterThanOrEqual(1);
          expect(number, `${locale} ${page.slug}`).toBeLessThanOrEqual(sources);
        }
        // And every source is cited: a list of works nobody's sentence rests
        // on would be decoration.
        expect(new Set(cited).size, `${locale} ${page.slug}`).toBe(sources);
        // What a machine reads carries no marks.
        expect(answerVisibleText(page).join(" ")).not.toMatch(/\[\d+\]/u);
      }
    }
  });

  it("points the gardeners' entries and related topics at topics the product creates", () => {
    // `watering-and-moisture`, `stress-and-recovery` and `care-checks` were
    // never created, so the pages counted nothing and said so (OG-UX-033).
    for (const item of [...listGuides(), ...listAnswerPages()]) {
      for (const slug of item.knowledge.evidence.topicSlugs) {
        expect(SYSTEM_TOPIC_SLUGS, `${item.slug}: ${slug}`).toContain(slug);
      }
      for (const related of item.knowledge.related) {
        if (related.kind === "topic") {
          expect(SYSTEM_TOPIC_SLUGS).toContain(related.slug);
        }
      }
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
