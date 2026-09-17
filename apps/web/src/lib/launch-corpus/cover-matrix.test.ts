import { describe, expect, it } from "vitest";

import {
  resolveEffectiveJournalCover,
  type JournalCoverCandidate,
} from "@/lib/garden/journal-cover-contract";
import type { JournalDocumentV1 } from "@/lib/garden/journal-document";
import { listLocalCoverMatrixBranchIds } from "@/lib/launch-corpus/cover-matrix";
import { localizeTopicLabel } from "@/lib/system-topic-labels";

function finalMedia(
  id: string,
  usageRole: "inline" | "cover_only" = "inline",
): JournalCoverCandidate {
  return {
    mediaAssetId: id,
    usageRole,
    derivativeKey: `der/${id}`,
    revokedAt: null,
    altText: `alt-${id}`,
    focalX: 0.5,
    focalY: 0.5,
    intrinsicWidth: 1200,
    intrinsicHeight: 800,
  };
}

describe("OVE-199 local cover matrix", () => {
  it("lists every required local branch id", () => {
    expect(listLocalCoverMatrixBranchIds().length).toBeGreaterThanOrEqual(15);
  });

  it("resolves no-media, auto, explicit, and cover-only branches", () => {
    const emptyDoc: JournalDocumentV1 = { schemaVersion: 1, blocks: [] };
    const none = resolveEffectiveJournalCover({
      document: emptyDoc,
      explicitCoverMediaAssetId: null,
      candidatesById: new Map(),
    });
    expect(none.source).toBe("none");

    const a = finalMedia("a");
    const b = finalMedia("b");
    const coverOnly = finalMedia("c", "cover_only");
    const multiDoc: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        { id: "p1", type: "paragraph", spans: [{ text: "one" }] },
        { id: "i1", type: "image", mediaAssetId: "a" },
        { id: "p2", type: "paragraph", spans: [{ text: "two" }] },
        { id: "i2", type: "image", mediaAssetId: "b" },
      ],
    };

    const auto = resolveEffectiveJournalCover({
      document: multiDoc,
      explicitCoverMediaAssetId: null,
      candidatesById: new Map([
        ["a", a],
        ["b", b],
      ]),
    });
    expect(auto.source).toBe("automatic_inline");
    expect(auto.mediaAssetId).toBe("a");

    const explicit = resolveEffectiveJournalCover({
      document: multiDoc,
      explicitCoverMediaAssetId: "b",
      candidatesById: new Map([
        ["a", a],
        ["b", b],
      ]),
    });
    expect(explicit.source).toBe("explicit_inline");
    expect(explicit.mediaAssetId).toBe("b");

    const separate = resolveEffectiveJournalCover({
      document: multiDoc,
      explicitCoverMediaAssetId: "c",
      candidatesById: new Map([
        ["a", a],
        ["b", b],
        ["c", coverOnly],
      ]),
    });
    expect(separate.source).toBe("separate");
    expect(separate.mediaAssetId).toBe("c");
  });

  it("localizes curated English topic stubs", () => {
    expect(localizeTopicLabel("bg", "plants", "Plants")).toBe("Растения");
    expect(localizeTopicLabel("uk", "animals", "Animals")).toBe("Тварини");
    // The sixth system topic is why there is one map and not two: the feed
    // carried its own five-slug copy, so a Russian reader's rail read
    // «Спостереження і догляд» among Russian labels.
    expect(localizeTopicLabel("ru", "observation-and-care", "Спостереження і догляд")).toBe(
      "Наблюдения и уход",
    );
  });
});
