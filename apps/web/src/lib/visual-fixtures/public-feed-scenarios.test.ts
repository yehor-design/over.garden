import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "./manifest";
import {
  filterVisualFixturePublicFeedTopics,
  resolveVisualFixturePublicFeedScenario,
} from "./public-feed-scenarios";

const LOCAL_ENV = {
  VISUAL_FIXTURES_ENABLED: "true",
  VISUAL_FIXTURES_TARGET: "local",
  VISUAL_FIXTURES_DATABASE: "overgarden",
  DATABASE_URL: "postgresql://overgarden:secret@localhost:5432/overgarden",
  R2_ENDPOINT: "http://localhost:9000",
  R2_PUBLIC_BASE_URL: "http://localhost:9000/overgarden-public",
  PUBLIC_SITE_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
} as const;

describe("visual fixture public-feed scenarios", () => {
  it("resolves only the explicit supported local visual state", () => {
    expect(
      resolveVisualFixturePublicFeedScenario(
        { __visualFeed: "loading" },
        LOCAL_ENV,
      ),
    ).toEqual({ mode: "loading", requestOverride: null, hideTopics: false });
    expect(
      resolveVisualFixturePublicFeedScenario(
        { __visualFeed: ["error", "loading"] },
        LOCAL_ENV,
      ),
    ).toBeNull();
    expect(
      resolveVisualFixturePublicFeedScenario(
        { __visualFeed: "unknown" },
        LOCAL_ENV,
      ),
    ).toBeNull();
  });

  it("maps pagination evidence to deterministic dense-topic cursors", () => {
    const pageTwo = resolveVisualFixturePublicFeedScenario(
      { __visualFeed: "page-2" },
      LOCAL_ENV,
    );
    const exhausted = resolveVisualFixturePublicFeedScenario(
      { __visualFeed: "exhausted" },
      LOCAL_ENV,
    );

    expect(pageTwo).toEqual({
      mode: "page-2",
      hideTopics: false,
      requestOverride: {
        cursor: {
          version: 1,
          ...VISUAL_FIXTURE_MANIFEST.feedEvidence.pageTwoCursor,
        },
        kind: "all",
        topic: VISUAL_FIXTURE_MANIFEST.feedEvidence.denseTopicSlug,
      },
    });
    expect(exhausted?.requestOverride?.cursor).toEqual({
      version: 1,
      ...VISUAL_FIXTURE_MANIFEST.feedEvidence.exhaustedCursor,
    });
  });

  it("can hide only the route-owned topic modules", () => {
    expect(
      resolveVisualFixturePublicFeedScenario(
        { __visualFeed: "context-empty" },
        LOCAL_ENV,
      ),
    ).toEqual({
      mode: "context-empty",
      requestOverride: {
        cursor: null,
        kind: "all",
        topic: VISUAL_FIXTURE_MANIFEST.feedEvidence.denseTopicSlug,
      },
      hideTopics: true,
    });
  });

  it("cannot activate when the fixture gate is disabled or production-like", () => {
    expect(
      resolveVisualFixturePublicFeedScenario(
        { __visualFeed: "error" },
        { ...LOCAL_ENV, VISUAL_FIXTURES_ENABLED: "false" },
      ),
    ).toBeNull();
    expect(
      resolveVisualFixturePublicFeedScenario(
        { __visualFeed: "error" },
        { ...LOCAL_ENV, VERCEL_ENV: "production" },
      ),
    ).toBeNull();
    expect(
      resolveVisualFixturePublicFeedScenario(
        { __visualFeed: "error" },
        { ...LOCAL_ENV, PUBLIC_SITE_URL: "https://over.garden" },
      ),
    ).toBeNull();
  });

  it("keeps the visual context rail deterministic without inventing topic rows", () => {
    const topics = [
      { slug: "care-checks", label: "Care", entryCount: 11 },
      { slug: "plants", label: "Plants", entryCount: 0 },
      { slug: "quiet-evidence", label: "Quiet", entryCount: 0 },
    ];

    expect(filterVisualFixturePublicFeedTopics(topics, LOCAL_ENV)).toEqual([
      topics[0],
      topics[2],
    ]);
    expect(
      filterVisualFixturePublicFeedTopics(topics, {
        ...LOCAL_ENV,
        VISUAL_FIXTURES_ENABLED: "false",
      }),
    ).toBe(topics);
  });
});
