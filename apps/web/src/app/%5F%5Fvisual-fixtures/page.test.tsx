import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVisualFixtureStatus: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  tryResolveVisualFixtureEnvironment: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/db", () => ({
  db: {},
}));

vi.mock("@/lib/visual-fixtures/environment", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/visual-fixtures/environment")>();
  return {
    ...original,
    tryResolveVisualFixtureEnvironment:
      mocks.tryResolveVisualFixtureEnvironment,
  };
});

vi.mock("@/server/visual-fixtures/repository", () => ({
  getVisualFixtureStatus: mocks.getVisualFixtureStatus,
}));

vi.mock("@/lib/storage", () => ({
  getPublicDerivativeUrl: (key: string) =>
    `/fixture-media/${encodeURIComponent(key)}`,
}));

describe("/__visual-fixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tryResolveVisualFixtureEnvironment.mockReturnValue({
      databaseHostClass: "loopback",
      databaseName: "overgarden",
      target: "local",
    });
    mocks.getVisualFixtureStatus.mockResolvedValue({
      version: "ove187-v2",
      expected: {
        actors: 4,
        profiles: 4,
        spaces: 5,
        catalogItems: 19,
        catalogNames: 29,
        objects: 30,
        lineagePendingIdentities: 1,
        lineageEdges: 1,
        entries: 80,
        topics: 7,
        topicSignals: 40,
        media: 16,
      },
      actual: {
        actors: 4,
        profiles: 4,
        spaces: 5,
        catalogItems: 19,
        catalogNames: 29,
        objects: 30,
        lineagePendingIdentities: 1,
        lineageEdges: 1,
        entries: 80,
        topics: 7,
        topicSignals: 40,
        media: 16,
      },
      seeded: true,
    });
  });

  it("returns not found without the explicit non-production environment gate", async () => {
    mocks.tryResolveVisualFixtureEnvironment.mockReturnValue(null);
    const { default: VisualFixtureIndexPage } = await import("./page");

    await expect(VisualFixtureIndexPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getVisualFixtureStatus).not.toHaveBeenCalled();
  });

  it("renders safe counts, real route scenarios, profiles, and all media aspects", async () => {
    const { default: VisualFixtureIndexPage, metadata } =
      await import("./page");
    const html = renderToStaticMarkup(await VisualFixtureIndexPage());

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(html).toContain('data-visual-fixture-index="true"');
    expect(html).toContain("Deterministic visual environment");
    expect(html).toContain("Fixture users");
    expect(html).toContain("Public profiles");
    expect(html).toContain("4");
    expect(html).toContain("30");
    expect(html).toContain("80");
    expect(html).toContain("Pending lineage");
    expect(html).toContain("Claimable edges");
    expect(html).toContain("Trusted topics");
    expect(html).toContain("Topic memberships");
    expect(html).toContain("15");
    expect(html).toContain('href="/?topic=seasonal-care"');
    expect(html).toContain('href="/?__visualFeed=loading"');
    expect(html).toContain('href="/knowledge?__visualKnowledge=corpus"');
    expect(html).toContain(
      'href="/guides/visual-seasonal-observation?__visualKnowledge=corpus"',
    );
    expect(html).toContain(
      'href="/ru/topics/care-checks?__visualKnowledge=corpus"',
    );
    expect(html).toContain("Long Cyrillic answer with evidence");
    expect(html).toContain('href="/journal/visual-fixture-');
    expect(html).toContain('href="/lineage/objects/18700003-');
    expect(html).toContain('href="/@demo_olena"');
    expect(html).toContain("Expected 404");
    expect(html).toContain("Expected 410");
    expect(html).toContain("Not-found UI · 200");
    expect(html).toContain("State coverage");
    expect(html).toContain("Living-object passport evidence");
    expect(html).toContain("public plant dense");
    expect(html).toContain("owner bee archived");
    expect(html).toContain("guest public");
    expect(html).toContain("desktop + 320");
    expect(html).toContain("Intent-aware authentication");
    expect(html).toContain("Comment · guest start");
    expect(html).toContain("Publish · permission recheck");
    expect(html).toContain("Bookmark · profile target");
    expect(html).toContain("Save · follow-up draft permission changed");
    expect(html).toContain("Seed draft and start");
    expect(html).toContain('href="/__visual-fixtures/intent/ove174-i001"');
    expect(html).toContain("authIntent=comment");
    expect(html).toContain("authIntent=create_object");
    expect(html).not.toContain('name="targetRef"');
    expect(html).toContain("Owner-only journals");
    expect(html).toContain("Archived journals");
    expect(html).toContain("Maximum-length copy");
    expect(html).toContain("Public journal without media");
    expect(html).toContain("Public journal with one image");
    expect(html).toContain("square");
    expect(html).toContain("landscape 4:3");
    expect(html).toContain("portrait 3:4");
    expect(html).toContain("wide 16:9");
    expect(html.match(/<img/g)).toHaveLength(16);
    expect(html.match(/loading="eager"/g)).toHaveLength(16);
    expect(html).not.toMatch(
      /@visual-fixtures\.invalid|owner_user_id|databaseName|quarantine_key|R2_ACCESS_KEY|postgresql:\/\//i,
    );
  });
});
