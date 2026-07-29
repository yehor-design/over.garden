import { createHash } from "node:crypto";

import { z } from "zod";

import { containsPreciseLocationText } from "@/lib/privacy/precise-location-text";

import {
  LAUNCH_CORPUS_SHOT_LIST,
  type LaunchCorpusCoverBranch,
  type LaunchCorpusShotSpec,
} from "./shot-list";

export const LAUNCH_CORPUS_CONTENT_PACK_VERSION =
  "ove199.launch-corpus-content-pack.v1" as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const mediaSchema = z.object({
  file: z.string().min(1).max(500),
  sha256: z.string().regex(SHA256_PATTERN),
  role: z.enum(["inline", "cover_only"]),
  aspect: z.enum(["portrait", "landscape", "square"]),
  alt: z.string().min(10).max(500),
  caption: z.string().max(1_000).nullable().default(null),
  rightsBasis: z.enum(["founder_owned", "licensed"]),
  rightsHolder: z.string().min(2).max(200),
  provenanceReceiptFile: z.string().min(1).max(500),
  provenanceReceiptSha256: z.string().regex(SHA256_PATTERN),
});

const slotSchema = z.object({
  id: z.string().min(1).max(20),
  market: z.enum(["UA", "BG"]),
  sourceLanguage: z.enum(["uk", "bg"]),
  contentClass: z.literal("editorial"),
  byline: z.string().min(2).max(120),
  objectKind: z.enum(["plant", "animal"]),
  visibility: z.enum(["public", "private", "archived_410"]),
  coverBranch: z.enum([
    "no_media",
    "one_inline_auto_cover",
    "multi_explicit_non_first_cover",
    "cover_only_dedicated",
    "explicit_cover_stable_after_reorder",
    "private_one_inline",
    "archived_one_inline",
  ]),
  spaceLabel: z.string().min(3).max(120),
  objectLabel: z.string().min(2).max(120),
  catalogIdentity: z.string().min(2).max(200),
  title: z.string().min(10).max(160),
  body: z.string().min(80).max(20_000),
  entryDate: z.string().regex(ISO_DATE_PATTERN),
  reviewedBy: z.string().min(2).max(120),
  media: z.array(mediaSchema).max(11),
  explicitCoverMediaSha256: z.string().regex(SHA256_PATTERN).nullable(),
});

const dispositionSchema = z.object({
  targetHash: z.string().regex(SHA256_PATTERN),
  action: z.literal("reclassify_production_smoke_archive"),
  reviewedBy: z.string().min(2).max(120),
});

export const launchCorpusContentPackSchema = z.object({
  version: z.literal(LAUNCH_CORPUS_CONTENT_PACK_VERSION),
  issue: z.literal("OVE-199"),
  planDigest: z.string().regex(SHA256_PATTERN),
  slots: z.array(slotSchema).length(LAUNCH_CORPUS_SHOT_LIST.length),
  dispositions: z.array(dispositionSchema).length(4),
});

export type LaunchCorpusContentPack = z.infer<
  typeof launchCorpusContentPackSchema
>;

export interface LaunchCorpusContentPackValidation {
  ok: boolean;
  errors: string[];
  contentPackDigest: string | null;
  slotCount: number;
  mediaCount: number;
  publicSlotCount: number;
  privateSlotCount: number;
  archivedSlotCount: number;
}

export function validateLaunchCorpusContentPack(
  input: unknown,
): LaunchCorpusContentPackValidation {
  const parsed = launchCorpusContentPackSchema.safeParse(input);
  if (!parsed.success) {
    return emptyValidation(
      parsed.error.issues.map(
        (issue) => `schema:${issue.path.join(".")}:${issue.code}`,
      ),
    );
  }

  const pack = parsed.data;
  const errors: string[] = [];
  const slotsById = new Map(pack.slots.map((slot) => [slot.id, slot]));

  if (slotsById.size !== pack.slots.length) errors.push("duplicate_slot_id");

  for (const spec of LAUNCH_CORPUS_SHOT_LIST) {
    const slot = slotsById.get(spec.id);
    if (!slot) {
      errors.push(`missing_slot:${spec.id}`);
      continue;
    }
    validateSlotAgainstSpec(slot, spec, errors);
  }

  for (const slot of pack.slots) {
    if (!LAUNCH_CORPUS_SHOT_LIST.some((spec) => spec.id === slot.id)) {
      errors.push(`unknown_slot:${slot.id}`);
    }
    const privacyValues = [
      slot.spaceLabel,
      slot.objectLabel,
      slot.catalogIdentity,
      slot.title,
      slot.body,
      ...slot.media.flatMap((media) => [media.alt, media.caption ?? ""]),
    ];
    if (privacyValues.some(containsPreciseLocationText)) {
      errors.push(`precise_location:${slot.id}`);
    }
    if (privacyValues.some(containsTechnicalArtifactText)) {
      errors.push(`technical_artifact:${slot.id}`);
    }
  }

  const dispositionHashes = pack.dispositions.map((row) => row.targetHash);
  if (new Set(dispositionHashes).size !== dispositionHashes.length) {
    errors.push("duplicate_disposition_target");
  }

  const mediaCount = pack.slots.reduce(
    (count, slot) => count + slot.media.length,
    0,
  );
  return {
    ok: errors.length === 0,
    errors,
    contentPackDigest:
      errors.length === 0 ? digestLaunchCorpusContentPack(pack) : null,
    slotCount: pack.slots.length,
    mediaCount,
    publicSlotCount: countVisibility(pack, "public"),
    privateSlotCount: countVisibility(pack, "private"),
    archivedSlotCount: countVisibility(pack, "archived_410"),
  };
}

function containsTechnicalArtifactText(value: string): boolean {
  return /OVE-\d+|\bsmoke\b|\bfixture\b|\bsynthetic\b|\blorem\b|\bplaceholder\b|\btest harness\b/i.test(
    value,
  );
}

export function digestLaunchCorpusContentPack(
  pack: LaunchCorpusContentPack,
): string {
  return createHash("sha256")
    .update(stableJson(pack), "utf8")
    .digest("hex");
}

function validateSlotAgainstSpec(
  slot: LaunchCorpusContentPack["slots"][number],
  spec: LaunchCorpusShotSpec,
  errors: string[],
) {
  for (const field of [
    "market",
    "sourceLanguage",
    "objectKind",
    "visibility",
    "coverBranch",
  ] as const) {
    if (slot[field] !== spec[field]) {
      errors.push(`shot_contract:${spec.id}:${field}`);
    }
  }

  if (slot.media.length < spec.minPhotos || slot.media.length > spec.maxPhotos) {
    errors.push(`photo_count:${spec.id}`);
  }

  validateCoverBranch(slot, spec.coverBranch, errors);
}

function validateCoverBranch(
  slot: LaunchCorpusContentPack["slots"][number],
  branch: LaunchCorpusCoverBranch,
  errors: string[],
) {
  const inline = slot.media.filter((media) => media.role === "inline");
  const coverOnly = slot.media.filter((media) => media.role === "cover_only");
  const explicit = slot.explicitCoverMediaSha256;
  const explicitMedia = explicit
    ? slot.media.find((media) => media.sha256 === explicit)
    : null;

  if (new Set(slot.media.map((media) => media.sha256)).size !== slot.media.length) {
    errors.push(`duplicate_media:${slot.id}`);
  }
  if (explicit && !explicitMedia) errors.push(`unknown_cover:${slot.id}`);

  const invalid = (() => {
    switch (branch) {
      case "no_media":
        return slot.media.length !== 0 || explicit !== null;
      case "one_inline_auto_cover":
      case "private_one_inline":
      case "archived_one_inline":
        return inline.length !== 1 || coverOnly.length !== 0 || explicit !== null;
      case "multi_explicit_non_first_cover":
        return (
          inline.length !== 3 ||
          coverOnly.length !== 0 ||
          !explicitMedia ||
          explicitMedia.role !== "inline" ||
          explicitMedia.sha256 === inline[0]?.sha256
        );
      case "cover_only_dedicated":
        return (
          coverOnly.length !== 1 ||
          !explicitMedia ||
          explicitMedia.role !== "cover_only"
        );
      case "explicit_cover_stable_after_reorder":
        return (
          inline.length !== 2 ||
          coverOnly.length !== 0 ||
          !explicitMedia ||
          explicitMedia.role !== "inline"
        );
    }
  })();
  if (invalid) errors.push(`cover_branch:${slot.id}`);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function countVisibility(
  pack: LaunchCorpusContentPack,
  visibility: LaunchCorpusContentPack["slots"][number]["visibility"],
) {
  return pack.slots.filter((slot) => slot.visibility === visibility).length;
}

function emptyValidation(errors: string[]): LaunchCorpusContentPackValidation {
  return {
    ok: false,
    errors,
    contentPackDigest: null,
    slotCount: 0,
    mediaCount: 0,
    publicSlotCount: 0,
    privateSlotCount: 0,
    archivedSlotCount: 0,
  };
}
