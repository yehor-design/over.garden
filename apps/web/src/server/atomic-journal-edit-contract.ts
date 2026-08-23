import "server-only";

import type { AtomicJournalEditFocalPoint } from "@/lib/garden/entry-contracts";
import type { ClaimedEphemeralPublicationMedia } from "@/server/media/ephemeral-publication-handoff";

export type AtomicJournalEditContractErrorCode =
  | "atomic_media_partition_mismatch"
  | "atomic_media_claim_mismatch"
  | "atomic_media_generation_mismatch"
  | "atomic_media_focal_mismatch";

export class AtomicJournalEditContractError extends Error {
  constructor(readonly code: AtomicJournalEditContractErrorCode) {
    super(code);
    this.name = "AtomicJournalEditContractError";
  }
}

export function isAtomicJournalEditPublicPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < "derivatives/a".length ||
    value.length > 1_024 ||
    !value.startsWith("derivatives/") ||
    /[\\?#\u0000-\u001f]/.test(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

export interface AtomicJournalEditCurrentMedia {
  mediaAssetId: string;
  generation: number;
  publicPath: string;
}

export interface AtomicJournalEditReplacement extends ClaimedEphemeralPublicationMedia {
  priorGeneration: number;
  priorPublicPath: string;
}

export function validateAtomicJournalEditMediaPlan(input: {
  currentMedia: readonly AtomicJournalEditCurrentMedia[];
  finalMediaAssetIds: readonly string[];
  retainedMediaAssetIds: readonly string[];
  removedMediaAssetIds: readonly string[];
  claimedMedia: readonly ClaimedEphemeralPublicationMedia[];
  focalPoints: readonly AtomicJournalEditFocalPoint[];
}): {
  replacements: AtomicJournalEditReplacement[];
  additions: ClaimedEphemeralPublicationMedia[];
} {
  const currentById = uniqueMap(
    input.currentMedia,
    (item) => item.mediaAssetId,
    "atomic_media_partition_mismatch",
  );
  if (
    [...currentById.values()].some(
      (item) =>
        !Number.isSafeInteger(item.generation) ||
        item.generation < 1 ||
        !isAtomicJournalEditPublicPath(item.publicPath),
    )
  ) {
    throw new AtomicJournalEditContractError("atomic_media_claim_mismatch");
  }
  const final = uniqueSet(
    input.finalMediaAssetIds,
    "atomic_media_claim_mismatch",
  );
  const retained = uniqueSet(
    input.retainedMediaAssetIds,
    "atomic_media_partition_mismatch",
  );
  const removed = uniqueSet(
    input.removedMediaAssetIds,
    "atomic_media_partition_mismatch",
  );

  if (
    [...retained].some((id) => removed.has(id)) ||
    !setsEqual(
      new Set([...retained, ...removed]),
      new Set(currentById.keys()),
    ) ||
    !setsEqual(
      retained,
      new Set([...currentById.keys()].filter((id) => final.has(id))),
    ) ||
    !setsEqual(
      removed,
      new Set([...currentById.keys()].filter((id) => !final.has(id))),
    )
  ) {
    throw new AtomicJournalEditContractError("atomic_media_partition_mismatch");
  }

  const claimedById = uniqueMap(
    input.claimedMedia,
    (item) => item.mediaAssetId,
    "atomic_media_claim_mismatch",
  );
  const requiredNewIds = new Set(
    [...final].filter((mediaAssetId) => !currentById.has(mediaAssetId)),
  );
  if (
    [...claimedById.keys()].some((id) => !final.has(id)) ||
    [...requiredNewIds].some((id) => !claimedById.has(id))
  ) {
    throw new AtomicJournalEditContractError("atomic_media_claim_mismatch");
  }

  const replacements: AtomicJournalEditReplacement[] = [];
  const additions: ClaimedEphemeralPublicationMedia[] = [];
  for (const media of input.claimedMedia) {
    const current = currentById.get(media.mediaAssetId);
    const expectedGeneration = current ? current.generation + 1 : 1;
    if (
      media.generation !== expectedGeneration ||
      media.publicPath !==
        `derivatives/${media.mediaAssetId}/${media.generation}.webp`
    ) {
      throw new AtomicJournalEditContractError(
        "atomic_media_generation_mismatch",
      );
    }
    if (current) {
      replacements.push({
        ...media,
        priorGeneration: current.generation,
        priorPublicPath: current.publicPath,
      });
    } else {
      additions.push(media);
    }
  }

  const focalById = uniqueMap(
    input.focalPoints,
    (item) => item.mediaAssetId,
    "atomic_media_focal_mismatch",
  );
  if (
    !setsEqual(new Set(focalById.keys()), final) ||
    [...focalById.values()].some(
      (item) =>
        !Number.isFinite(item.x) ||
        !Number.isFinite(item.y) ||
        item.x < 0 ||
        item.x > 1 ||
        item.y < 0 ||
        item.y > 1,
    )
  ) {
    throw new AtomicJournalEditContractError("atomic_media_focal_mismatch");
  }

  return { replacements, additions };
}

function uniqueMap<T>(
  items: readonly T[],
  keyFor: (item: T) => string,
  code: AtomicJournalEditContractErrorCode,
) {
  const result = new Map<string, T>();
  for (const item of items) {
    const key = keyFor(item);
    if (result.has(key)) throw new AtomicJournalEditContractError(code);
    result.set(key, item);
  }
  return result;
}

function uniqueSet(
  items: readonly string[],
  code: AtomicJournalEditContractErrorCode,
) {
  const result = new Set(items);
  if (result.size !== items.length) {
    throw new AtomicJournalEditContractError(code);
  }
  return result;
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}
