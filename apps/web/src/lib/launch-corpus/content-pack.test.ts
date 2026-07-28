import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  LAUNCH_CORPUS_CONTENT_PACK_VERSION,
  digestLaunchCorpusContentPack,
  launchCorpusContentPackSchema,
  validateLaunchCorpusContentPack,
  type LaunchCorpusContentPack,
} from "./content-pack";
import { LAUNCH_CORPUS_SHOT_LIST } from "./shot-list";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildPack(): LaunchCorpusContentPack {
  return launchCorpusContentPackSchema.parse({
    version: LAUNCH_CORPUS_CONTENT_PACK_VERSION,
    issue: "OVE-199",
    planDigest: digest("plan"),
    slots: LAUNCH_CORPUS_SHOT_LIST.map((spec) => {
      const media = Array.from({ length: spec.minPhotos }, (_, index) => ({
        file: `media/${spec.id}-${index}.webp`,
        sha256: digest(`${spec.id}:media:${index}`),
        role:
          spec.coverBranch === "cover_only_dedicated" && index === 0
            ? "cover_only"
            : "inline",
        aspect:
          spec.coverBranch === "cover_only_dedicated"
            ? "square"
            : index === 0
              ? "landscape"
              : "portrait",
        alt: `Reviewed gardening photograph for ${spec.id}`,
        caption: null,
        rightsBasis: "founder_owned",
        rightsHolder: "OverGarden founder",
        provenanceReceiptFile: `provenance/${spec.id}-${index}.txt`,
        provenanceReceiptSha256: digest(`${spec.id}:provenance:${index}`),
      }));
      const explicitCoverMediaSha256 = (() => {
        if (spec.coverBranch === "cover_only_dedicated") {
          return media[0]?.sha256 ?? null;
        }
        if (spec.coverBranch === "multi_explicit_non_first_cover") {
          return media[1]?.sha256 ?? null;
        }
        if (spec.coverBranch === "explicit_cover_stable_after_reorder") {
          return media[1]?.sha256 ?? null;
        }
        return null;
      })();
      return {
        id: spec.id,
        market: spec.market,
        sourceLanguage: spec.sourceLanguage,
        objectKind: spec.objectKind,
        visibility: spec.visibility,
        coverBranch: spec.coverBranch,
        spaceLabel:
          spec.market === "UA" ? "Домашній сад" : "Домашна градина",
        objectLabel: spec.objectKind === "plant" ? "Томат" : "Кошер",
        catalogIdentity:
          spec.objectKind === "plant" ? "Solanum lycopersicum" : "Apis mellifera",
        title: `A first-hand growing journal ${spec.id}`,
        body:
          `This is an intentionally review-only local validation body for ${spec.id}. ` +
          "The production pack must replace it with reviewed founder first-hand content.",
        entryDate: "2026-07-20",
        reviewedBy: "Yehor",
        media,
        explicitCoverMediaSha256,
      };
    }),
    dispositions: Array.from({ length: 4 }, (_, index) => ({
      targetHash: digest(`target:${index}`),
      action: "reclassify_production_smoke_archive",
      reviewedBy: "Yehor",
    })),
  });
}

describe("OVE-199 launch corpus content pack", () => {
  it("accepts the exact 14-slot mirrored topology and returns a stable digest", () => {
    const pack = buildPack();
    const result = validateLaunchCorpusContentPack(pack);

    expect(result).toMatchObject({
      ok: true,
      errors: [],
      slotCount: 14,
      mediaCount: 18,
      publicSlotCount: 10,
      privateSlotCount: 2,
      archivedSlotCount: 2,
    });
    expect(result.contentPackDigest).toBe(digestLaunchCorpusContentPack(pack));
    expect(digestLaunchCorpusContentPack(structuredClone(pack))).toBe(
      result.contentPackDigest,
    );
  });

  it("fails closed on shot-list drift and duplicate disposition targets", () => {
    const pack = buildPack();
    pack.slots[0]!.sourceLanguage = "bg";
    pack.dispositions[1]!.targetHash = pack.dispositions[0]!.targetHash;

    expect(validateLaunchCorpusContentPack(pack)).toMatchObject({
      ok: false,
      contentPackDigest: null,
      errors: expect.arrayContaining([
        "shot_contract:UA-J01:sourceLanguage",
        "duplicate_disposition_target",
      ]),
    });
  });

  it("uses the authoritative location firewall without emitting content", () => {
    const pack = buildPack();
    pack.slots[0]!.body =
      "A sufficiently long first-hand journal body with unsafe coordinates 50.45010, 30.52340 that must be rejected before persistence.";

    const result = validateLaunchCorpusContentPack(pack);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("precise_location:UA-J01");
    expect(JSON.stringify(result)).not.toContain("50.45010");
  });

  it("rejects cover semantics that disagree with the canonical branch", () => {
    const pack = buildPack();
    const multi = pack.slots.find((slot) => slot.id === "UA-J03")!;
    multi.explicitCoverMediaSha256 = multi.media[0]!.sha256;

    expect(validateLaunchCorpusContentPack(pack).errors).toContain(
      "cover_branch:UA-J03",
    );
  });
});
