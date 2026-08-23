import { describe, expect, it } from "vitest";

import {
  isAtomicJournalEditPublicPath,
  validateAtomicJournalEditMediaPlan,
} from "./atomic-journal-edit-contract";

const RETAINED = "00000000-0000-4000-8000-000000000101";
const REPLACED = "00000000-0000-4000-8000-000000000102";
const REMOVED = "00000000-0000-4000-8000-000000000103";
const ADDED = "00000000-0000-4000-8000-000000000104";

describe("atomic journal edit media contract", () => {
  it.each([
    ["derivatives/opaque.webp", true],
    [`derivatives/${RETAINED}/2.webp`, true],
    ["https://attacker.invalid/file.webp", false],
    ["derivatives/../../private", false],
    ["derivatives/asset.webp?capability=secret", false],
    ["derivatives\\attacker.invalid\\asset.webp", false],
  ])("bounds canonical public path %s", (value, expected) => {
    expect(isAtomicJournalEditPublicPath(value)).toBe(expected);
  });

  it("partitions the exact current set and admits only generation-fenced replacements and additions", () => {
    const plan = validateAtomicJournalEditMediaPlan({
      currentMedia: [
        current(RETAINED, 2),
        current(REPLACED, 4),
        current(REMOVED, 1),
      ],
      finalMediaAssetIds: [REPLACED, RETAINED, ADDED],
      retainedMediaAssetIds: [RETAINED, REPLACED],
      removedMediaAssetIds: [REMOVED],
      claimedMedia: [claimed(REPLACED, 5), claimed(ADDED, 1)],
      focalPoints: [
        { mediaAssetId: RETAINED, x: 0.5, y: 0.5 },
        { mediaAssetId: REPLACED, x: 0.25, y: 0.75 },
        { mediaAssetId: ADDED, x: 1, y: 0 },
      ],
    });

    expect(plan.replacements).toEqual([
      expect.objectContaining({
        mediaAssetId: REPLACED,
        priorGeneration: 4,
        priorPublicPath: `derivatives/${REPLACED}/4.webp`,
      }),
    ]);
    expect(plan.additions).toEqual([
      expect.objectContaining({ mediaAssetId: ADDED, generation: 1 }),
    ]);
  });

  it.each([
    {
      name: "does not let retained and removed sets omit a current media row",
      patch: { removedMediaAssetIds: [] },
      code: "atomic_media_partition_mismatch",
    },
    {
      name: "does not let an unclaimed new identity enter the final document",
      patch: { claimedMedia: [claimed(REPLACED, 5)] },
      code: "atomic_media_claim_mismatch",
    },
    {
      name: "does not accept a skipped replacement generation",
      patch: {
        claimedMedia: [claimed(REPLACED, 7), claimed(ADDED, 1)],
      },
      code: "atomic_media_generation_mismatch",
    },
    {
      name: "does not accept missing focal state for a final media identity",
      patch: {
        focalPoints: [
          { mediaAssetId: RETAINED, x: 0.5, y: 0.5 },
          { mediaAssetId: REPLACED, x: 0.25, y: 0.75 },
        ],
      },
      code: "atomic_media_focal_mismatch",
    },
  ])("$name", ({ patch, code }) => {
    const base = {
      currentMedia: [
        current(RETAINED, 2),
        current(REPLACED, 4),
        current(REMOVED, 1),
      ],
      finalMediaAssetIds: [REPLACED, RETAINED, ADDED],
      retainedMediaAssetIds: [RETAINED, REPLACED],
      removedMediaAssetIds: [REMOVED],
      claimedMedia: [claimed(REPLACED, 5), claimed(ADDED, 1)],
      focalPoints: [
        { mediaAssetId: RETAINED, x: 0.5, y: 0.5 },
        { mediaAssetId: REPLACED, x: 0.25, y: 0.75 },
        { mediaAssetId: ADDED, x: 1, y: 0 },
      ],
    };

    expect(() =>
      validateAtomicJournalEditMediaPlan({ ...base, ...patch }),
    ).toThrowError(expect.objectContaining({ code }));
  });
});

function current(mediaAssetId: string, generation: number) {
  return {
    mediaAssetId,
    generation,
    publicPath: `derivatives/${mediaAssetId}/${generation}.webp`,
  };
}

function claimed(mediaAssetId: string, generation: number) {
  return {
    mediaAssetId,
    generation,
    sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    sizeBytes: 1_024,
    width: 800,
    height: 600,
    publicPath: `derivatives/${mediaAssetId}/${generation}.webp`,
  };
}
