import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  calculateVisualFixtureManifestHash,
  validateVisualFixtureManifest,
  VISUAL_FIXTURE_MANIFEST,
  VISUAL_FIXTURE_MANIFEST_HASH,
  VISUAL_FIXTURE_MANIFEST_VERSION,
  VISUAL_FIXTURE_NAMESPACE,
} from "./manifest";

describe("visual fixture manifest", () => {
  it("contains the complete deterministic baseline", () => {
    expect(VISUAL_FIXTURE_MANIFEST_VERSION).toBe("ove187-v1");
    expect(VISUAL_FIXTURE_NAMESPACE).toBe("visual-fixtures/ove187-v1");
    expect(VISUAL_FIXTURE_MANIFEST.actors).toHaveLength(4);
    expect(VISUAL_FIXTURE_MANIFEST.spaces).toHaveLength(5);
    expect(VISUAL_FIXTURE_MANIFEST.objects).toHaveLength(30);
    expect(VISUAL_FIXTURE_MANIFEST.entries).toHaveLength(80);
    expect(VISUAL_FIXTURE_MANIFEST.media).toHaveLength(16);
    expect(VISUAL_FIXTURE_MANIFEST.topics).toHaveLength(3);
    expect(VISUAL_FIXTURE_MANIFEST.topicSignals).toHaveLength(15);
    expect(VISUAL_FIXTURE_MANIFEST.feedEvidence.pageSize).toBe(8);
    expect(validateVisualFixtureManifest(VISUAL_FIXTURE_MANIFEST)).toEqual([]);
  });

  it("covers plants, animals, bee colonies, languages, visibility, and lifecycle edges", () => {
    const kindCounts = Object.groupBy(
      VISUAL_FIXTURE_MANIFEST.objects,
      (object) => object.objectKind,
    );

    expect(kindCounts.plant).toHaveLength(18);
    expect(kindCounts.animal).toHaveLength(8);
    expect(kindCounts.bee_colony).toHaveLength(4);
    expect(
      new Set(VISUAL_FIXTURE_MANIFEST.entries.map((entry) => entry.locale)),
    ).toEqual(new Set(["uk", "bg", "ru"]));
    expect(
      VISUAL_FIXTURE_MANIFEST.entries.some(
        (entry) => entry.visibility === "private",
      ),
    ).toBe(true);
    expect(
      VISUAL_FIXTURE_MANIFEST.entries.some(
        (entry) => entry.lifecycleState === "archived",
      ),
    ).toBe(true);
    expect(
      VISUAL_FIXTURE_MANIFEST.entries.filter(
        (entry) => entry.publicGoneAt !== null,
      ),
    ).toHaveLength(1);
  });

  it("crosses real density thresholds and includes empty, typical, dense, and gone routes", () => {
    const entriesByObject = Object.groupBy(
      VISUAL_FIXTURE_MANIFEST.entries,
      (entry) => entry.objectId,
    );
    const emptyObject = VISUAL_FIXTURE_MANIFEST.objects.find(
      (object) => !entriesByObject[object.id],
    );
    const denseObject = VISUAL_FIXTURE_MANIFEST.objects.find(
      (object) => (entriesByObject[object.id]?.length ?? 0) >= 12,
    );
    const densePublicEntries = denseObject
      ? (entriesByObject[denseObject.id] ?? []).filter(
          (entry) =>
            entry.visibility === "public" &&
            entry.lifecycleState === "active" &&
            entry.publicGoneAt === null,
        )
      : [];
    const scenarioKinds = new Set(
      VISUAL_FIXTURE_MANIFEST.scenarios.map((scenario) => scenario.kind),
    );

    expect(emptyObject).toBeDefined();
    expect(denseObject).toBeDefined();
    expect(densePublicEntries).toHaveLength(10);
    expect(
      densePublicEntries.some(
        (entry) => entry.title.length > 100 && entry.body.includes("\n\n"),
      ),
    ).toBe(true);
    expect(scenarioKinds).toEqual(
      new Set([
        "fixture-index",
        "public-journal-active",
        "public-journal-gone",
        "public-journal-missing",
        "public-object-empty",
        "public-object-typical",
        "public-object-dense",
        "public-profile",
        "media-gallery",
        "public-feed-empty",
        "public-feed-typical",
        "public-feed-dense",
        "public-feed-loading",
        "public-feed-error",
        "public-feed-pagination",
        "public-feed-exhausted",
        "public-feed-context-empty",
      ]),
    );
    expect(
      VISUAL_FIXTURE_MANIFEST.scenarios.find(
        (scenario) => scenario.kind === "public-object-empty",
      ),
    ).toMatchObject({
      expectedStatus: 200,
      expectedUiState: "not_found",
    });
  });

  it("makes every required visual edge state explicit at its real data boundary", () => {
    const objectSpaceIds = new Set(
      VISUAL_FIXTURE_MANIFEST.objects.map((object) => object.spaceId),
    );
    const emptySpaces = VISUAL_FIXTURE_MANIFEST.spaces.filter(
      (space) => !objectSpaceIds.has(space.id),
    );
    const coverageKinds = new Set(
      VISUAL_FIXTURE_MANIFEST.stateCoverage.map((state) => state.kind),
    );

    expect(emptySpaces).toHaveLength(1);
    expect(
      VISUAL_FIXTURE_MANIFEST.entries.some(
        (entry) => entry.entryDate === "2026-07-10",
      ),
    ).toBe(true);
    expect(
      VISUAL_FIXTURE_MANIFEST.entries.some(
        (entry) => entry.title.length === 140,
      ),
    ).toBe(true);
    expect(
      VISUAL_FIXTURE_MANIFEST.entries.some(
        (entry) => entry.body.length === 2000,
      ),
    ).toBe(true);
    expect(coverageKinds).toEqual(
      new Set([
        "empty-space",
        "empty-object",
        "today-journal",
        "owner-only-journal",
        "archived-journal",
        "maximum-copy",
        "no-media-journal",
        "one-media-journal",
        "media-gallery",
        "feed-empty",
        "feed-typical",
        "feed-dense",
        "feed-loading",
        "feed-error",
        "feed-pagination",
        "feed-exhausted",
        "feed-context-empty",
      ]),
    );
    expect(
      VISUAL_FIXTURE_MANIFEST.stateCoverage.find(
        (state) => state.kind === "owner-only-journal",
      ),
    ).toMatchObject({ access: "owner", path: null });
    expect(
      VISUAL_FIXTURE_MANIFEST.stateCoverage.find(
        (state) => state.kind === "maximum-copy",
      )?.path,
    ).toMatch(/^\/journal\//);
  });

  it("uses deterministic reusable raster metadata across four aspect ratios", () => {
    const aspectCounts = Object.groupBy(
      VISUAL_FIXTURE_MANIFEST.media,
      (media) => media.aspect,
    );

    expect(aspectCounts.square).toHaveLength(4);
    expect(aspectCounts.landscape_4_3).toHaveLength(4);
    expect(aspectCounts.portrait_3_4).toHaveLength(4);
    expect(aspectCounts.wide_16_9).toHaveLength(4);
    for (const media of VISUAL_FIXTURE_MANIFEST.media) {
      expect(media.derivativeKey).toMatch(
        /^visual-fixtures\/ove187-v1\/[a-z0-9-]+\.png$/,
      );
      expect(media.localPath).toMatch(
        /^test\/visual-fixtures\/media\/[a-z0-9-]+\.png$/,
      );
      expect(media.altText.length).toBeGreaterThan(20);
    }
  });

  it("binds each image to a semantically matching object and exercises exact one-media plus gallery cards", () => {
    const entriesById = new Map(
      VISUAL_FIXTURE_MANIFEST.entries.map((entry) => [entry.id, entry]),
    );
    const objectsById = new Map(
      VISUAL_FIXTURE_MANIFEST.objects.map((object) => [object.id, object]),
    );
    const animalFiles = /cat|goats|dog|animal-yard/;
    const beeFiles = /bee|apiary|queen|hive/;

    const mediaByEntry = Object.groupBy(
      VISUAL_FIXTURE_MANIFEST.media,
      (media) => media.entryId,
    );
    const mediaCounts = Object.values(mediaByEntry).map(
      (items) => items?.length ?? 0,
    );

    expect(mediaCounts.filter((count) => count === 3)).toHaveLength(1);
    expect(mediaCounts.some((count) => count === 1)).toBe(true);
    expect(Math.max(...mediaCounts)).toBe(3);

    for (const media of VISUAL_FIXTURE_MANIFEST.media) {
      const entry = entriesById.get(media.entryId);
      const object = entry ? objectsById.get(entry.objectId) : undefined;
      const expectedKind = beeFiles.test(media.fileName)
        ? "bee_colony"
        : animalFiles.test(media.fileName)
          ? "animal"
          : "plant";

      expect(entry?.visibility).toBe("public");
      expect(entry?.lifecycleState).toBe("active");
      expect(object?.objectKind).toBe(expectedKind);
    }
  });

  it("provides honest mixed feed density, trusted-topic thresholds, and stable cursor anchors", () => {
    const objectsById = new Map(
      VISUAL_FIXTURE_MANIFEST.objects.map((object) => [object.id, object]),
    );
    const eligibleEntries = VISUAL_FIXTURE_MANIFEST.entries
      .filter(
        (entry) =>
          entry.visibility === "public" &&
          entry.lifecycleState === "active" &&
          entry.publicGoneAt === null &&
          entry.publishedAt !== null,
      )
      .toSorted(
        (left, right) =>
          right.publishedAt!.localeCompare(left.publishedAt!) ||
          left.id.localeCompare(right.id),
      );
    const firstPageKinds = new Set(
      eligibleEntries
        .slice(0, VISUAL_FIXTURE_MANIFEST.feedEvidence.pageSize)
        .map((entry) => objectsById.get(entry.objectId)?.objectKind),
    );
    const signalsByTopic = Object.groupBy(
      VISUAL_FIXTURE_MANIFEST.topicSignals,
      (signal) => signal.topicId,
    );
    const topicsBySlug = new Map(
      VISUAL_FIXTURE_MANIFEST.topics.map((topic) => [topic.slug, topic]),
    );
    const typicalTopic = topicsBySlug.get(
      VISUAL_FIXTURE_MANIFEST.feedEvidence.typicalTopicSlug,
    );
    const denseTopic = topicsBySlug.get(
      VISUAL_FIXTURE_MANIFEST.feedEvidence.denseTopicSlug,
    );
    const emptyTopic = topicsBySlug.get(
      VISUAL_FIXTURE_MANIFEST.feedEvidence.emptyTopicSlug,
    );

    expect(firstPageKinds).toEqual(new Set(["plant", "animal", "bee_colony"]));
    expect(signalsByTopic[typicalTopic!.id]).toHaveLength(4);
    expect(signalsByTopic[denseTopic!.id]!.length).toBeGreaterThan(
      VISUAL_FIXTURE_MANIFEST.feedEvidence.pageSize,
    );
    expect(signalsByTopic[emptyTopic!.id]).toBeUndefined();
    expect(VISUAL_FIXTURE_MANIFEST.feedEvidence.pageTwoCursor).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      publishedAt: expect.stringMatching(/Z$/),
    });
    expect(VISUAL_FIXTURE_MANIFEST.feedEvidence.exhaustedCursor).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      publishedAt: expect.stringMatching(/Z$/),
    });
  });

  it("binds every media row to an EXIF-free project raster with matching dimensions and digest", async () => {
    for (const media of VISUAL_FIXTURE_MANIFEST.media) {
      const buffer = await readFile(path.join(process.cwd(), media.localPath));
      const metadata = await sharp(buffer).metadata();
      const digest = createHash("sha256").update(buffer).digest("hex");

      expect(metadata.format).toBe("png");
      expect(metadata.width).toBe(media.width);
      expect(metadata.height).toBe(media.height);
      expect(metadata.exif).toBeUndefined();
      expect(digest).toBe(media.sha256);
    }
  });

  it("contains no credentials, exact-location fields, production origins, or filler copy", () => {
    const serialized = JSON.stringify(VISUAL_FIXTURE_MANIFEST);

    expect(serialized).not.toMatch(
      /password|access[_-]?token|refresh[_-]?token|session[_-]?token|latitude|longitude|coordinates|gps|https:\/\/over\.garden|lorem ipsum/i,
    );
    for (const actor of VISUAL_FIXTURE_MANIFEST.actors) {
      expect(actor.email).toMatch(/@visual-fixtures\.invalid$/);
    }
    expect(
      new Set(VISUAL_FIXTURE_MANIFEST.entries.map((entry) => entry.body)).size,
    ).toBe(VISUAL_FIXTURE_MANIFEST.entries.length);
  });

  it("varies copy length and rhythm across short, normal, multiline, and long records", () => {
    const titles = VISUAL_FIXTURE_MANIFEST.entries.map((entry) => entry.title);
    const bodies = VISUAL_FIXTURE_MANIFEST.entries.map((entry) => entry.body);

    expect(titles.some((title) => title.length < 70)).toBe(true);
    expect(titles.some((title) => title.length > 100)).toBe(true);
    expect(bodies.some((body) => body.length < 180)).toBe(true);
    expect(
      bodies.some((body) => body.length >= 220 && body.length <= 500),
    ).toBe(true);
    expect(bodies.some((body) => body.length > 800)).toBe(true);
    expect(
      bodies.filter((body) => body.includes("\n\n")).length,
    ).toBeGreaterThan(10);
  });

  it("computes a stable SHA-256 hash from canonical manifest data", () => {
    expect(VISUAL_FIXTURE_MANIFEST_HASH).toMatch(/^[a-f0-9]{64}$/);
    expect(calculateVisualFixtureManifestHash(VISUAL_FIXTURE_MANIFEST)).toBe(
      VISUAL_FIXTURE_MANIFEST_HASH,
    );
  });
});
