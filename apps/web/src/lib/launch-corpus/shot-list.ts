/**
 * OVE-199 production seed shot-list (founder pack after sign-off).
 * Stable IDs for manifest disposition — not product UUIDs.
 */

export type LaunchCorpusShotVisibility = "public" | "private" | "archived_410";

export type LaunchCorpusCoverBranch =
  | "no_media"
  | "one_inline_auto_cover"
  | "multi_explicit_non_first_cover"
  | "cover_only_dedicated"
  | "explicit_cover_stable_after_reorder"
  | "private_one_inline"
  | "archived_one_inline";

export interface LaunchCorpusShotSpec {
  id: string;
  market: "UA" | "BG";
  sourceLanguage: "uk" | "bg";
  objectKind: "plant" | "animal";
  visibility: LaunchCorpusShotVisibility;
  coverBranch: LaunchCorpusCoverBranch;
  minPhotos: number;
  maxPhotos: number;
  notes: string;
}

export const LAUNCH_CORPUS_TOPOLOGY = {
  spaces: 2,
  objects: 4,
  journals: 14,
  markets: ["UA", "BG"] as const,
} as const;

export const LAUNCH_CORPUS_SHOT_LIST: readonly LaunchCorpusShotSpec[] = [
  {
    id: "UA-J01",
    market: "UA",
    sourceLanguage: "uk",
    objectKind: "plant",
    visibility: "public",
    coverBranch: "no_media",
    minPhotos: 0,
    maxPhotos: 0,
    notes: "No-media / no-cover public plant journal.",
  },
  {
    id: "UA-J02",
    market: "UA",
    sourceLanguage: "uk",
    objectKind: "plant",
    visibility: "public",
    coverBranch: "one_inline_auto_cover",
    minPhotos: 1,
    maxPhotos: 1,
    notes: "One landscape inline; automatic cover.",
  },
  {
    id: "UA-J03",
    market: "UA",
    sourceLanguage: "uk",
    objectKind: "plant",
    visibility: "public",
    coverBranch: "multi_explicit_non_first_cover",
    minPhotos: 3,
    maxPhotos: 3,
    notes: "Multi-block; explicit non-first portrait near-edge cover.",
  },
  {
    id: "UA-J04",
    market: "UA",
    sourceLanguage: "uk",
    objectKind: "animal",
    visibility: "public",
    coverBranch: "cover_only_dedicated",
    minPhotos: 1,
    maxPhotos: 3,
    notes: "Hive as animal; dedicated square cover-only.",
  },
  {
    id: "UA-J05",
    market: "UA",
    sourceLanguage: "uk",
    objectKind: "plant",
    visibility: "public",
    coverBranch: "explicit_cover_stable_after_reorder",
    minPhotos: 2,
    maxPhotos: 2,
    notes: "Explicit cover remains after one reorder.",
  },
  {
    id: "UA-J06",
    market: "UA",
    sourceLanguage: "uk",
    objectKind: "plant",
    visibility: "private",
    coverBranch: "private_one_inline",
    minPhotos: 1,
    maxPhotos: 1,
    notes: "Private; must stay out of feed/search.",
  },
  {
    id: "UA-J07",
    market: "UA",
    sourceLanguage: "uk",
    objectKind: "plant",
    visibility: "archived_410",
    coverBranch: "archived_one_inline",
    minPhotos: 1,
    maxPhotos: 1,
    notes: "Publish then archive to Gone/410.",
  },
  {
    id: "BG-J01",
    market: "BG",
    sourceLanguage: "bg",
    objectKind: "plant",
    visibility: "public",
    coverBranch: "no_media",
    minPhotos: 0,
    maxPhotos: 0,
    notes: "No-media / no-cover public plant journal.",
  },
  {
    id: "BG-J02",
    market: "BG",
    sourceLanguage: "bg",
    objectKind: "plant",
    visibility: "public",
    coverBranch: "one_inline_auto_cover",
    minPhotos: 1,
    maxPhotos: 1,
    notes: "One landscape inline; automatic cover.",
  },
  {
    id: "BG-J03",
    market: "BG",
    sourceLanguage: "bg",
    objectKind: "plant",
    visibility: "public",
    coverBranch: "multi_explicit_non_first_cover",
    minPhotos: 3,
    maxPhotos: 3,
    notes: "Multi-block; explicit non-first portrait cover.",
  },
  {
    id: "BG-J04",
    market: "BG",
    sourceLanguage: "bg",
    objectKind: "animal",
    visibility: "public",
    coverBranch: "cover_only_dedicated",
    minPhotos: 1,
    maxPhotos: 3,
    notes: "Animal; dedicated square cover-only.",
  },
  {
    id: "BG-J05",
    market: "BG",
    sourceLanguage: "bg",
    objectKind: "plant",
    visibility: "public",
    coverBranch: "explicit_cover_stable_after_reorder",
    minPhotos: 2,
    maxPhotos: 2,
    notes: "Explicit cover remains after one reorder.",
  },
  {
    id: "BG-J06",
    market: "BG",
    sourceLanguage: "bg",
    objectKind: "plant",
    visibility: "private",
    coverBranch: "private_one_inline",
    minPhotos: 1,
    maxPhotos: 1,
    notes: "Private; must stay out of feed/search.",
  },
  {
    id: "BG-J07",
    market: "BG",
    sourceLanguage: "bg",
    objectKind: "plant",
    visibility: "archived_410",
    coverBranch: "archived_one_inline",
    minPhotos: 1,
    maxPhotos: 1,
    notes: "Publish then archive to Gone/410.",
  },
] as const;

export function listFounderSeedShotIds(): string[] {
  return LAUNCH_CORPUS_SHOT_LIST.map((shot) => shot.id);
}
