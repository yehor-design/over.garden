import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "./manifest";
import {
  buildVisualFixtureKnowledgeCorpus,
  resolveVisualFixturePublicKnowledgeMode,
} from "./public-knowledge-scenarios";

const enabledEnv = {
  VISUAL_FIXTURES_ENABLED: "true",
  VISUAL_FIXTURES_TARGET: "local",
  VISUAL_FIXTURES_DATABASE: "overgarden_visual",
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1/overgarden_visual",
  R2_ENDPOINT: "http://127.0.0.1:9000",
  R2_PUBLIC_BASE_URL: "http://127.0.0.1:9000/overgarden",
};

describe("visual fixture public knowledge scenarios", () => {
  it.each(["corpus", "loading", "error", "unavailable"] as const)(
    "enables the %s state only in an isolated fixture environment",
    (mode) => {
      expect(
        resolveVisualFixturePublicKnowledgeMode(
          { __visualKnowledge: mode },
          enabledEnv,
        ),
      ).toBe(mode);
      expect(
        resolveVisualFixturePublicKnowledgeMode(
          { __visualKnowledge: mode },
          {},
        ),
      ).toBeNull();
    },
  );

  it("rejects unknown, repeated, and production state-forcing parameters", () => {
    expect(
      resolveVisualFixturePublicKnowledgeMode(
        { __visualKnowledge: "ready" },
        enabledEnv,
      ),
    ).toBeNull();
    expect(
      resolveVisualFixturePublicKnowledgeMode(
        { __visualKnowledge: ["loading", "error"] },
        enabledEnv,
      ),
    ).toBeNull();
    expect(
      resolveVisualFixturePublicKnowledgeMode(
        { __visualKnowledge: "corpus" },
        { ...enabledEnv, VERCEL_ENV: "production" },
      ),
    ).toBeNull();
  });

  it("adapts only gated manifest content into localized production contracts", () => {
    const corpus = buildVisualFixtureKnowledgeCorpus(
      VISUAL_FIXTURE_MANIFEST,
      "bg",
      (key) => `/fixture-media/${encodeURIComponent(key)}`,
    );

    expect(corpus.guides).toHaveLength(3);
    expect(corpus.answers).toHaveLength(3);
    expect(corpus.publicEntryIds.length).toBeGreaterThan(30);
    expect(corpus.topicSlugs).toEqual([
      "seasonal-care",
      "care-checks",
      "quiet-evidence",
      "watering-and-moisture",
      "stress-and-recovery",
      "season-preparation",
      "single-observation",
    ]);
    expect(corpus.guides[0]).toMatchObject({
      kind: "guide",
      slug: "visual-seasonal-observation",
      title: "Как да сравните две наблюдения без излишни предположения",
      editorial: { authoredLocale: "bg", synthetic: true },
      knowledge: {
        evidence: { topicSlugs: ["care-checks"], catalogSlugs: [] },
      },
    });
    expect(corpus.guides[0].media?.publicUrl).toContain("fixture-media");
    expect(
      corpus.answers.find(
        (answer) => answer.slug === "visual-long-recovery-answer",
      ),
    ).toMatchObject({
      kind: "aeo_answer",
      editorial: { authoredLocale: "bg", synthetic: true },
    });
    expect(JSON.stringify(corpus)).not.toMatch(
      /quarantine|ownerUserId|@visual-fixtures\.invalid/i,
    );
  });
});
