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
    expect(VISUAL_FIXTURE_MANIFEST_VERSION).toBe("ove187-v7");
    expect(VISUAL_FIXTURE_NAMESPACE).toBe("visual-fixtures/ove187-v7");
    expect(VISUAL_FIXTURE_MANIFEST.actors).toHaveLength(8);
    expect(VISUAL_FIXTURE_MANIFEST.profiles).toHaveLength(8);
    expect(VISUAL_FIXTURE_MANIFEST.profileFollows).toHaveLength(9);
    expect(VISUAL_FIXTURE_MANIFEST.profileBlocks).toHaveLength(1);
    expect(VISUAL_FIXTURE_MANIFEST.profileReports).toHaveLength(1);
    expect(VISUAL_FIXTURE_MANIFEST.spaces).toHaveLength(10);
    expect(VISUAL_FIXTURE_MANIFEST.objects).toHaveLength(30);
    expect(
      VISUAL_FIXTURE_MANIFEST.lineageEvidence.pendingIdentities,
    ).toHaveLength(1);
    expect(VISUAL_FIXTURE_MANIFEST.lineageEvidence.edges).toHaveLength(1);
    expect(VISUAL_FIXTURE_MANIFEST.entries).toHaveLength(81);
    expect(VISUAL_FIXTURE_MANIFEST.objectMentions).toHaveLength(2);
    expect(VISUAL_FIXTURE_MANIFEST.media).toHaveLength(16);
    expect(VISUAL_FIXTURE_MANIFEST.topics).toHaveLength(7);
    expect(VISUAL_FIXTURE_MANIFEST.topicSignals).toHaveLength(40);
    expect(VISUAL_FIXTURE_MANIFEST.catalogItems).toHaveLength(19);
    expect(VISUAL_FIXTURE_MANIFEST.catalogNames.length).toBeGreaterThan(19);
    expect(VISUAL_FIXTURE_MANIFEST.feedEvidence.pageSize).toBe(8);
    expect(
      VISUAL_FIXTURE_MANIFEST.intentEvidence.scenarios.length,
    ).toBeGreaterThanOrEqual(19);
    expect(
      VISUAL_FIXTURE_MANIFEST.journalEntryEvidence.scenarios.length,
    ).toBeGreaterThanOrEqual(15);
    expect(validateVisualFixtureManifest(VISUAL_FIXTURE_MANIFEST)).toEqual([]);
  });

  it("backs OVE-183 with multi-actor social utility and safety states", () => {
    const evidence = VISUAL_FIXTURE_MANIFEST.socialEvidence;
    const states = new Set(
      evidence.scenarios.map((scenario) => scenario.state),
    );
    const actorBookmarkCounts = Object.groupBy(
      evidence.bookmarks.filter((bookmark) => bookmark.state === "active"),
      (bookmark) => bookmark.ownerUserId,
    );
    const actorWishlistCounts = Object.groupBy(
      evidence.wishlistItems,
      (item) => item.ownerUserId,
    );

    expect(evidence.commentPageSize).toBe(8);
    expect(evidence.feedPageSize).toBe(12);
    expect(evidence.notificationPageSize).toBe(12);
    expect(evidence.bookmarkPageSize).toBe(12);
    expect(evidence.comments).toHaveLength(24);
    expect(evidence.follows).toHaveLength(8);
    expect(evidence.bookmarks).toHaveLength(16);
    expect(evidence.commentReports).toHaveLength(2);
    expect(evidence.notificationReceipts).toHaveLength(2);
    expect(evidence.notificationPreferences).toHaveLength(2);
    expect(evidence.wishlistItems).toHaveLength(14);
    expect(states).toEqual(
      new Set([
        "zero",
        "one",
        "page",
        "page-plus-one",
        "nested-long-moderated",
        "closed",
        "blocked",
        "dense",
        "grouped",
        "individual",
        "empty",
      ]),
    );
    expect(
      evidence.comments.filter((comment) => comment.parentCommentId),
    ).toHaveLength(4);
    expect(
      evidence.comments.some((comment) => comment.body.length === 600),
    ).toBe(true);
    expect(new Set(evidence.comments.map((comment) => comment.state))).toEqual(
      new Set(["active", "deleted", "reported", "removed"]),
    );
    expect(
      actorBookmarkCounts[evidence.actorRoles.denseCollectionActorId]?.length,
    ).toBeGreaterThan(12);
    expect(
      actorWishlistCounts[evidence.actorRoles.denseCollectionActorId]?.length,
    ).toBeGreaterThan(12);
    expect(
      actorBookmarkCounts[evidence.actorRoles.emptyCollectionActorId],
    ).toBeUndefined();
    expect(evidence.transitions.map((transition) => transition.action)).toEqual(
      expect.arrayContaining([
        "comment",
        "reply",
        "follow",
        "bookmark",
        "delete",
        "report",
        "block",
        "notification_receipt",
      ]),
    );
    expect(
      evidence.scenarios.every(
        (scenario) =>
          scenario.viewportTargets[0] === "desktop" &&
          scenario.viewportTargets[1] === "mobile-320",
      ),
    ).toBe(true);
    expect(JSON.stringify(evidence)).not.toMatch(
      /@visual-fixtures\.invalid|password|latitude|longitude|coordinates|quarantine|push_payload|email_payload/i,
    );
  });

  it("backs OVE-182 with complete first-object and next-update form states", () => {
    const evidence = VISUAL_FIXTURE_MANIFEST.creationEvidence;
    const first = evidence.scenarios.filter(
      (scenario) => scenario.flow === "first-entry",
    );
    const next = evidence.scenarios.filter(
      (scenario) => scenario.flow === "follow-up",
    );
    const states = new Set(
      evidence.scenarios.map((scenario) => scenario.state),
    );

    expect(evidence.scenarios).toHaveLength(20);
    expect(first).toHaveLength(11);
    expect(next).toHaveLength(9);
    expect(new Set(first.map((scenario) => scenario.objectKind))).toEqual(
      new Set(["plant", "animal", "bee_colony"]),
    );
    expect(states).toEqual(
      new Set([
        "minimum",
        "optional",
        "provisional",
        "unknown-long",
        "media",
        "draft",
        "publish",
        "backdated",
        "privacy",
        "offline",
        "error",
        "cancel",
        "duplicate",
      ]),
    );
    expect(
      first.every((scenario) => scenario.path.startsWith("/garden?")),
    ).toBe(true);
    expect(
      next.every((scenario) =>
        scenario.path.startsWith(`/garden/objects/${scenario.objectId}?`),
      ),
    ).toBe(true);

    for (const scenario of evidence.scenarios) {
      expect(scenario.ownerActorId).toMatch(/^[0-9a-f-]{36}$/);
      expect(scenario.viewportTargets).toEqual(["desktop", "mobile-320"]);
      expect(scenario.entryDate).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(scenario.startPath).toBe(scenario.path);
      expect(scenario.clientMutationId).toBe(`${scenario.id}-mutation`);
      expect(scenario.expectedSpaceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(scenario.expectedObjectId).toMatch(/^[0-9a-f-]{36}$/);
      expect(scenario.expectedEntryId).toMatch(/^[0-9a-f-]{36}$/);
      expect(scenario.resetOwnedEntryIds).toEqual([scenario.expectedEntryId]);
      expect(scenario.postSavePath === null).toBe(
        !scenario.expectedServerWrite,
      );

      if (scenario.flow === "first-entry") {
        expect(scenario.spaceId).toBeNull();
        expect(scenario.objectId).toBeNull();
        expect(scenario.preconditionEntryIds).toEqual([]);
        expect(scenario.resetOwnedSpaceIds).toEqual([scenario.expectedSpaceId]);
        expect(scenario.resetOwnedObjectIds).toEqual([
          scenario.expectedObjectId,
        ]);
      } else {
        expect(scenario.spaceId).toBe(scenario.expectedSpaceId);
        expect(scenario.objectId).toBe(scenario.expectedObjectId);
        expect(scenario.preconditionEntryIds.length).toBeGreaterThanOrEqual(0);
        expect(scenario.resetOwnedSpaceIds).toEqual([]);
        expect(scenario.resetOwnedObjectIds).toEqual([]);
      }
    }

    expect(JSON.stringify(evidence)).not.toMatch(
      /email|password|token|latitude|longitude|coordinate|quarantine|household|property[_ -]?id/i,
    );
  });

  it("backs OVE-181 with private empty, sparse, typical, dense, and recoverable workspace states", () => {
    const evidence = VISUAL_FIXTURE_MANIFEST.workspaceEvidence;
    const byState = new Map(
      evidence.scenarios.map((scenario) => [scenario.state, scenario]),
    );
    const dense = byState.get("dense");
    const empty = byState.get("empty");
    const sparse = byState.get("sparse");
    const serialized = JSON.stringify(evidence);

    expect(evidence.inventoryPreviewSize).toBe(8);
    expect(evidence.spacePreviewSize).toBe(4);
    expect(evidence.recentLimit).toBe(8);
    expect(new Set(byState.keys())).toEqual(
      new Set([
        "guest",
        "empty",
        "sparse",
        "typical",
        "dense",
        "offline",
        "loading",
        "partial-error",
        "error",
      ]),
    );
    expect(empty).toMatchObject({
      expectedSpaceCount: 0,
      expectedObjectCount: 0,
      expectedRecentCount: 0,
      draftCount: 0,
    });
    expect(sparse).toMatchObject({
      expectedSpaceCount: 1,
      expectedObjectCount: 1,
      expectedRecentCount: 1,
    });
    expect(dense?.expectedSpaceCount).toBeGreaterThanOrEqual(5);
    expect(dense?.expectedSpaceCount).toBeGreaterThan(4);
    expect(dense?.expectedObjectCount).toBeGreaterThan(10);
    expect(dense?.expectedPlantCount).toBeGreaterThan(0);
    expect(dense?.expectedAnimalCount).toBeGreaterThan(0);
    expect(dense?.expectedBeeColonyCount).toBeGreaterThan(0);
    expect(dense?.expectedSpaceIds).toHaveLength(
      dense?.expectedSpaceCount ?? 0,
    );
    expect(dense?.expectedObjectIds).toHaveLength(
      dense?.expectedObjectCount ?? 0,
    );
    expect(byState.get("offline")).toMatchObject({
      online: false,
      draftCount: 2,
      queuedCount: 1,
      failedCount: 1,
    });
    expect(serialized).not.toMatch(
      /@visual-fixtures\.invalid|email|password|token/i,
    );
  });

  it("backs OVE-180 profiles with exact object-first public evidence and privacy states", () => {
    const evidence = VISUAL_FIXTURE_MANIFEST.profileEvidence;
    const byId = new Map(
      evidence.scenarios.map((scenario) => [scenario.id, scenario]),
    );
    const dense = byId.get("gardener-dense");
    const long = VISUAL_FIXTURE_MANIFEST.profiles.find(
      (profile) => profile.handle === "visual_profile_with_long_namex",
    );

    expect(evidence.objectPreviewSize).toBe(6);
    expect(evidence.objectLimit).toBe(12);
    expect(evidence.journalPreviewSize).toBe(8);
    expect(evidence.journalLimit).toBe(16);
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.contentState)),
    ).toEqual(new Set(["empty", "typical", "dense", "long"]));
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.access)),
    ).toEqual(new Set(["guest", "authenticated-non-owner", "owner"]));
    expect(
      evidence.scenarios.filter((scenario) => scenario.expectedStatus === 404),
    ).toHaveLength(3);
    expect(dense?.expectedPublicObjectCount).toBeGreaterThan(6);
    expect(dense?.expectedPublicEntryCount).toBeGreaterThan(8);
    expect(dense?.expectedObjectIds.length).toBeLessThanOrEqual(12);
    expect(dense?.expectedJournalEntryIds.length).toBeLessThanOrEqual(16);
    expect(dense).toMatchObject({
      expectedFollowerCount: 3,
      expectedFollowingCount: 1,
      expectedAvatar: true,
    });
    expect(long?.handle).toHaveLength(30);
    expect(long?.displayName).toHaveLength(80);
    expect(long?.bio).toHaveLength(600);
    expect(long?.relationshipVisibility).toBe("hidden");
    expect(
      evidence.scenarios.find((scenario) => scenario.id === "empty-guest"),
    ).toMatchObject({
      expectedPublicObjectCount: 0,
      expectedPublicEntryCount: 0,
      expectedAvatar: false,
    });

    for (const scenario of evidence.scenarios) {
      expect(scenario.viewportTargets).toEqual(["desktop", "mobile-320"]);
      expect(scenario.expectedObjectIds).toHaveLength(
        Math.min(scenario.expectedPublicObjectCount, 12),
      );
      expect(scenario.expectedJournalEntryIds).toHaveLength(
        Math.min(scenario.expectedPublicEntryCount, 16),
      );
    }

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toMatch(
      /@visual-fixtures\.invalid|email|quarantine|latitude|longitude|precise/i,
    );
  });

  it("backs OVE-179 with real object and multi-object journal chapter edges", () => {
    const evidence = VISUAL_FIXTURE_MANIFEST.journalEntryEvidence;
    const byId = new Map(
      evidence.scenarios.map((scenario) => [scenario.id, scenario]),
    );
    const spaceEntry = VISUAL_FIXTURE_MANIFEST.entries.find(
      (entry) => entry.entryScope === "space",
    );

    expect(spaceEntry).toMatchObject({ objectId: null, visibility: "public" });
    expect(
      VISUAL_FIXTURE_MANIFEST.objectMentions.filter(
        (mention) => mention.journalEntryId === spaceEntry?.id,
      ),
    ).toHaveLength(2);
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.access)),
    ).toEqual(new Set(["guest", "authenticated-reader", "owner"]));
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.contextKind)),
    ).toEqual(new Set(["object", "space"]));
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.contentLength)),
    ).toEqual(new Set(["short", "normal", "long"]));
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.mediaState)),
    ).toEqual(
      new Set(["none", "square", "portrait", "landscape", "mixed-gallery"]),
    );
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.expectedStatus)),
    ).toEqual(new Set([200, 404, 410]));
    expect(byId.get("space-multi-object")?.expectedMentionCount).toBe(2);
    expect(byId.get("chronology-first")?.expectedNewer).toBe(false);
    expect(byId.get("chronology-last")?.expectedOlder).toBe(false);
    expect(byId.get("owner-controls")?.ownerActorId).toBeTruthy();

    for (const scenario of evidence.scenarios) {
      expect(scenario.viewportTargets).toEqual(["desktop", "mobile-320"]);
      expect(scenario.path).toMatch(/^\/(?:bg\/|ru\/)?journal\//);
    }
  });

  it("covers every auth intent and edge state through opaque fixture routes", () => {
    const scenarios = VISUAL_FIXTURE_MANIFEST.intentEvidence.scenarios;
    const actions = new Set(scenarios.map((scenario) => scenario.action));
    const states = new Set(scenarios.map((scenario) => scenario.state));

    expect(actions).toEqual(
      new Set([
        "comment",
        "bookmark",
        "follow",
        "report",
        "block",
        "claim",
        "create_object",
        "create_entry",
        "save",
        "publish",
      ]),
    );
    expect(states).toEqual(
      new Set([
        "guest",
        "already_authenticated",
        "cancel",
        "expired",
        "invalid",
        "deleted_410",
        "now_private",
        "insufficient_permission",
        "draft_retained",
      ]),
    );
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(
      scenarios.length,
    );

    for (const scenario of scenarios) {
      expect(scenario.id).toMatch(/^ove174-i\d{3}$/);
      expect(scenario.startPath).toBe(
        `/__visual-fixtures/intent/${scenario.id}`,
      );
      expect(scenario.startPath).not.toContain("?");
      expect(scenario.returnTo.startsWith("/")).toBe(true);
      expect(scenario.resumePath).toContain(`authIntent=${scenario.action}`);
      expect(scenario.viewportTargets).toEqual(["desktop", "mobile-320"]);
    }

    const serialized = JSON.stringify(scenarios);
    expect(serialized).not.toMatch(
      /password|person@|private journal body|invite token|latitude|longitude|media key|session/i,
    );
    expect(
      scenarios.find((scenario) => scenario.id === "ove174-i008"),
    ).toMatchObject({ expectedStatus: 404 });
    const claimScenario = scenarios.find(
      (scenario) => scenario.id === "ove174-i004",
    );
    expect(claimScenario).toMatchObject({
      action: "claim",
      returnTo: "/garden/lineage/invitations/claim",
    });
    expect(claimScenario?.target).toBeUndefined();
    expect(
      scenarios.find((scenario) => scenario.id === "ove174-i018"),
    ).toMatchObject({
      action: "bookmark",
      target: { kind: "profile", ref: "demo_olena" },
      returnTo: "/@demo_olena",
    });
    expect(
      scenarios
        .filter((scenario) => scenario.state === "draft_retained")
        .map((scenario) => scenario.draftKind),
    ).toEqual(["first_entry", "first_entry", "follow_up_entry"]);
    expect(
      scenarios.find((scenario) => scenario.id === "ove174-i019"),
    ).toMatchObject({
      action: "save",
      expectedStatus: 404,
      draftKind: "follow_up_entry",
    });
    expect(
      scenarios.find((scenario) => scenario.id === "ove174-i020"),
    ).toMatchObject({
      action: "report",
      target: { kind: "profile", ref: "demo_olena" },
    });
    expect(
      scenarios.find((scenario) => scenario.id === "ove174-i021"),
    ).toMatchObject({
      action: "block",
      target: { kind: "profile", ref: "demo_olena" },
    });
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

  it("backs OVE-175 catalog thresholds with real synthetic taxonomy rows", () => {
    const catalogById = new Map(
      VISUAL_FIXTURE_MANIFEST.catalogItems.map((item) => [item.id, item]),
    );
    const publiclyVisibleObjectIds = new Set(
      VISUAL_FIXTURE_MANIFEST.entries
        .filter(
          (entry) =>
            entry.visibility === "public" &&
            entry.lifecycleState === "active" &&
            entry.publicGoneAt === null &&
            entry.publishedAt !== null,
        )
        .map((entry) => entry.objectId),
    );
    const visibleObjects = VISUAL_FIXTURE_MANIFEST.objects.filter((object) =>
      publiclyVisibleObjectIds.has(object.id),
    );
    const countCatalogGroups = (
      objectKind: "plant" | "animal" | "bee_colony",
      catalogKind: "plant_variety" | "species" | "breed",
    ) =>
      new Set(
        visibleObjects
          .filter((object) => object.objectKind === objectKind)
          .flatMap((object) => {
            const item = object.catalogItemId
              ? catalogById.get(object.catalogItemId)
              : undefined;
            return item?.catalogKind === catalogKind &&
              (item.status === "seeded" || item.status === "confirmed")
              ? [item.id]
              : [];
          }),
      ).size;

    expect(
      new Set(VISUAL_FIXTURE_MANIFEST.catalogItems.map((item) => item.source)),
    ).toEqual(new Set(["visual_fixture"]));
    expect(countCatalogGroups("plant", "species")).toBe(7);
    expect(countCatalogGroups("animal", "breed")).toBe(6);
    expect(countCatalogGroups("bee_colony", "breed")).toBe(1);
    expect(
      visibleObjects.filter((object) => {
        const item = object.catalogItemId
          ? catalogById.get(object.catalogItemId)
          : undefined;
        return object.objectKind === "animal" && item?.status === "rejected";
      }),
    ).toHaveLength(1);
    expect(
      visibleObjects.filter(
        (object) =>
          object.objectKind === "plant" &&
          (object.varietyState === "free_text" ||
            object.varietyState === "user_added"),
      ),
    ).toHaveLength(5);
    expect(
      VISUAL_FIXTURE_MANIFEST.catalogItems.some(
        (item) => item.status === "rejected",
      ),
    ).toBe(true);
    expect(
      VISUAL_FIXTURE_MANIFEST.catalogItems.some(
        (item) => item.canonicalName.length > 60,
      ),
    ).toBe(true);
    expect(
      new Set(VISUAL_FIXTURE_MANIFEST.catalogNames.map((name) => name.locale)),
    ).toEqual(new Set(["uk", "bg", "ru", "en", "la"]));
  });

  it("backs OVE-177 knowledge routes with exact synthetic evidence and edge states", () => {
    const knowledge = VISUAL_FIXTURE_MANIFEST.knowledgeEvidence;
    const entryIds = new Set(
      VISUAL_FIXTURE_MANIFEST.entries.map((entry) => entry.id),
    );
    const objectIds = new Set(
      VISUAL_FIXTURE_MANIFEST.objects.map((object) => object.id),
    );
    const mediaIds = new Set(
      VISUAL_FIXTURE_MANIFEST.media.map((item) => item.id),
    );

    expect(knowledge.guides).toHaveLength(3);
    expect(knowledge.answers).toHaveLength(3);
    expect(knowledge.topics.length).toBeGreaterThanOrEqual(4);
    expect(new Set(knowledge.topics.map((topic) => topic.state))).toEqual(
      new Set(["zero", "one", "dense", "typical"]),
    );
    expect(
      new Set(knowledge.topics.flatMap((topic) => topic.objectKinds)),
    ).toEqual(new Set(["plant", "animal", "bee_colony"]));
    expect(
      [...knowledge.guides, ...knowledge.answers].map(
        (content) => content.evidence.expectedEntryIds.length,
      ),
    ).toEqual(expect.arrayContaining([0, 1, 8, 11]));

    for (const content of [...knowledge.guides, ...knowledge.answers]) {
      expect(content.path).toBe(`/${content.kind}s/${content.slug}`);
      expect(content.editorial.synthetic).toBe(true);
      expect(content.editorial.source).toMatch(/synthetic.*not expert/i);
      expect(content.evidence.expectedEntryIds).toHaveLength(
        content.evidence.expectedCount,
      );
      expect(
        content.evidence.expectedEntryIds.every((id) => entryIds.has(id)),
      ).toBe(true);
      expect(
        content.evidence.expectedObjectIds.every((id) => objectIds.has(id)),
      ).toBe(true);
      expect(Object.keys(content.translations).sort()).toEqual([
        "bg",
        "ru",
        "uk",
      ]);
      if (content.mediaId) expect(mediaIds.has(content.mediaId)).toBe(true);
    }

    const longAnswer = knowledge.answers.find(
      (answer) => answer.slug === "visual-long-recovery-answer",
    );
    expect(longAnswer?.translations.uk.conciseAnswer.length).toBeGreaterThan(
      400,
    );
    expect(
      longAnswer?.translations.uk.proofDetails.length,
    ).toBeGreaterThanOrEqual(5);
    expect(longAnswer?.translations.uk.faqs.length).toBeGreaterThanOrEqual(4);
    expect(
      [...knowledge.guides, ...knowledge.answers].some(
        (content) => content.mediaId,
      ),
    ).toBe(true);
    expect(
      VISUAL_FIXTURE_MANIFEST.scenarios.find(
        (scenario) => scenario.kind === "public-knowledge-answer-unavailable",
      ),
    ).toMatchObject({ expectedStatus: 200, expectedUiState: "not_found" });
  });

  it("backs OVE-176 journal discovery with exact ordered query evidence", () => {
    const evidence = VISUAL_FIXTURE_MANIFEST.journalDirectoryEvidence;
    const byId = new Map(evidence.queries.map((query) => [query.id, query]));
    const allExpectedSlugs = new Set(
      evidence.queries.flatMap((query) => query.expectedOrderedPublicSlugs),
    );
    const ineligiblePublicSlugs = VISUAL_FIXTURE_MANIFEST.entries.flatMap(
      (entry) =>
        entry.publicSlug &&
        (entry.visibility !== "public" ||
          entry.lifecycleState !== "active" ||
          entry.publicGoneAt !== null ||
          entry.publishedAt === null)
          ? [entry.publicSlug]
          : [],
    );

    expect(evidence.pageSize).toBe(8);
    expect(new Set(evidence.authoredLocales)).toEqual(
      new Set(["uk", "bg", "ru"]),
    );
    expect(new Set(evidence.safeRegionCodes)).toEqual(
      new Set(["UA-30", "BG-22", "BG-23"]),
    );
    expect(evidence.hiddenRegionEntryCount).toBeGreaterThan(0);
    expect(byId.get("default")?.expectedCount).toBeGreaterThanOrEqual(24);
    expect(byId.get("default")?.expectedOrderedPublicSlugs).toHaveLength(8);
    expect(byId.get("page-two")?.expectedOrderedPublicSlugs).toHaveLength(8);
    expect(byId.get("page-size-minus-one")).toMatchObject({
      expectedCount: 7,
    });
    expect(
      byId.get("page-size-minus-one")?.expectedOrderedPublicSlugs,
    ).toHaveLength(7);
    expect(byId.get("page-size")).toMatchObject({ expectedCount: 8 });
    expect(byId.get("page-size")?.expectedOrderedPublicSlugs).toHaveLength(8);
    expect(byId.get("page-size-plus-one")).toMatchObject({ expectedCount: 9 });
    expect(
      byId.get("page-size-plus-one")?.expectedOrderedPublicSlugs,
    ).toHaveLength(8);
    expect(byId.get("combined-safe-filters")?.expectedCount).toBeGreaterThan(0);
    expect(byId.get("zero-results")).toMatchObject({
      expectedCount: 0,
      expectedOrderedPublicSlugs: [],
    });
    expect(byId.get("corrected-query")?.expectedCount).toBeGreaterThan(0);
    expect(byId.get("reset")?.expectedOrderedPublicSlugs).toEqual(
      byId.get("default")?.expectedOrderedPublicSlugs,
    );
    expect(
      byId.get("exhausted")?.expectedOrderedPublicSlugs.length,
    ).toBeGreaterThan(0);
    expect(
      byId.get("exhausted")?.expectedOrderedPublicSlugs.length,
    ).toBeLessThanOrEqual(evidence.pageSize);
    for (const query of evidence.queries) {
      expect(query.path).toMatch(/^\/(?:bg\/|ru\/)?journals(?:\?|$)/);
      expect(query.path).toContain("__visualJournals=corpus");
      expect(new Set(query.expectedOrderedPublicSlugs).size).toBe(
        query.expectedOrderedPublicSlugs.length,
      );
    }
    for (const slug of ineligiblePublicSlugs) {
      expect(allExpectedSlugs).not.toContain(slug);
    }
  });

  it("crosses real density thresholds and includes empty, typical, dense, and gone routes", () => {
    const entriesByObject = Object.groupBy(
      VISUAL_FIXTURE_MANIFEST.entries,
      (entry) => entry.objectId ?? "space",
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
        "public-object-long-name",
        "public-object-animal",
        "public-object-bee-colony",
        "public-object-provisional",
        "public-object-unknown",
        "public-object-mixed-history",
        "public-object-gone",
        "public-object-missing",
        "owner-object-empty",
        "owner-object-dense",
        "owner-object-animal",
        "owner-object-archived",
        "public-profile-empty",
        "public-profile-typical",
        "public-profile-dense",
        "public-profile-long",
        "public-profile-private",
        "public-profile-removed",
        "public-profile-blocked",
        "owner-profile-preview",
        "owner-workspace-guest",
        "owner-workspace-empty",
        "owner-workspace-sparse",
        "owner-workspace-typical",
        "owner-workspace-dense",
        "owner-workspace-offline",
        "owner-workspace-loading",
        "owner-workspace-partial-error",
        "owner-workspace-error",
        "media-gallery",
        "public-feed-empty",
        "public-feed-typical",
        "public-feed-dense",
        "public-feed-loading",
        "public-feed-error",
        "public-feed-pagination",
        "public-feed-exhausted",
        "public-feed-context-empty",
        "public-catalog-empty",
        "public-catalog-zero-results",
        "public-catalog-sparse",
        "public-catalog-page-size-minus-one",
        "public-catalog-page-size",
        "public-catalog-page-size-plus-one",
        "public-catalog-pagination",
        "public-catalog-combined-filters",
        "public-catalog-search-alias",
        "public-catalog-unavailable",
        "public-catalog-loading",
        "public-catalog-error",
        "public-catalog-variety",
        "public-catalog-species",
        "public-catalog-breed",
        "public-journal-directory-default",
        "public-journal-directory-page-size-minus-one",
        "public-journal-directory-page-size",
        "public-journal-directory-page-size-plus-one",
        "public-journal-directory-pagination",
        "public-journal-directory-combined-filters",
        "public-journal-directory-zero-results",
        "public-journal-directory-corrected-query",
        "public-journal-directory-loading",
        "public-journal-directory-error",
        "public-journal-directory-exhausted",
        "public-knowledge-hub-default",
        "public-knowledge-hub-filtered",
        "public-knowledge-hub-zero-results",
        "public-knowledge-hub-loading",
        "public-knowledge-hub-error",
        "public-knowledge-guide-dense",
        "public-knowledge-guide-empty",
        "public-knowledge-answer-long",
        "public-knowledge-answer-unavailable",
        "public-knowledge-topic-zero",
        "public-knowledge-topic-one",
        "public-knowledge-topic-dense",
      ]),
    );
    expect(
      VISUAL_FIXTURE_MANIFEST.scenarios.find(
        (scenario) => scenario.kind === "public-object-empty",
      ),
    ).toMatchObject({
      expectedStatus: 404,
    });
  });

  it("declares exact OVE-178 passport evidence across kind, identity, access, media, density, and lifecycle", () => {
    const evidence = VISUAL_FIXTURE_MANIFEST.passportEvidence;
    const byId = new Map(
      evidence.scenarios.map((scenario) => [scenario.id, scenario]),
    );

    expect(evidence.timelinePreviewSize).toBe(5);
    expect(evidence.maxPublicTimeline).toBe(40);
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.objectKind)),
    ).toEqual(new Set(["plant", "animal", "bee_colony"]));
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.identityState)),
    ).toEqual(new Set(["confirmed", "provisional", "unknown"]));
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.access)),
    ).toEqual(new Set(["guest-public", "signed-in-owner"]));
    expect(
      new Set(evidence.scenarios.map((scenario) => scenario.mediaState)),
    ).toEqual(new Set(["none", "cover", "gallery"]));
    expect(
      byId.get("public-plant-dense")?.expectedTimelineEntryIds,
    ).toHaveLength(10);
    expect(byId.get("public-plant-long-name")?.path).toContain(
      "18700003-0000-4000-8000-000000000017",
    );
    expect(
      byId.get("owner-plant-dense")?.expectedTimelineEntryIds,
    ).toHaveLength(13);
    expect(byId.get("owner-empty")?.expectedTimelineEntryIds).toEqual([]);
    expect(byId.get("public-unpublished")?.expectedStatus).toBe(404);
    expect(byId.get("public-gone")?.expectedStatus).toBe(410);
    expect(byId.get("public-bee-mixed-history")?.expectedTimelineCount).toBe(1);

    for (const scenario of evidence.scenarios) {
      expect(scenario.path).toContain(scenario.objectId);
      expect(scenario.expectedTimelineCount).toBe(
        scenario.expectedTimelineEntryIds.length,
      );
      expect(new Set(scenario.expectedTimelineEntryIds).size).toBe(
        scenario.expectedTimelineEntryIds.length,
      );
      expect(scenario.viewportTargets).toEqual(["desktop", "mobile-320"]);
      expect(JSON.stringify(scenario)).not.toMatch(
        /title|body|email|coordinate|latitude|longitude|quarantine|derivativeKey/i,
      );
    }
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

    expect(emptySpaces.length).toBeGreaterThanOrEqual(2);
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
        /^visual-fixtures\/ove187-v7\/[a-z0-9-]+\.png$/,
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
      const object = entry?.objectId
        ? objectsById.get(entry.objectId)
        : undefined;
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
          entry.entryScope === "object" &&
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
        .map((entry) =>
          entry.objectId
            ? objectsById.get(entry.objectId)?.objectKind
            : undefined,
        ),
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
