import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  launchCorpusContentPackSchema,
  validateLaunchCorpusContentPack,
  type LaunchCorpusContentPack,
  type LaunchCorpusContentPackValidation,
} from "@/lib/launch-corpus/content-pack";

export interface LaunchCorpusContentPackFileResult {
  pack: LaunchCorpusContentPack | null;
  validation: LaunchCorpusContentPackValidation;
}

export async function validateLaunchCorpusContentPackFile(
  packFile: string,
): Promise<LaunchCorpusContentPackFileResult> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(packFile, "utf8"));
  } catch (error) {
    return {
      pack: null,
      validation: emptyValidation(
        error instanceof SyntaxError ? "invalid_json" : "pack_unreadable",
      ),
    };
  }

  const validation = validateLaunchCorpusContentPack(input);
  if (!validation.ok) return { pack: null, validation };

  const pack = launchCorpusContentPackSchema.parse(input);
  const mediaErrors = await verifyMediaFiles(
    pack,
    path.dirname(path.resolve(packFile)),
  );
  return {
    pack: mediaErrors.length === 0 ? pack : null,
    validation: {
      ...validation,
      ok: mediaErrors.length === 0,
      errors: mediaErrors,
      contentPackDigest:
        mediaErrors.length === 0 ? validation.contentPackDigest : null,
    },
  };
}

async function verifyMediaFiles(
  pack: LaunchCorpusContentPack,
  packRoot: string,
) {
  const errors: string[] = [];
  for (const slot of pack.slots) {
    for (const media of slot.media) {
      const resolved = path.resolve(packRoot, media.file);
      const relative = path.relative(packRoot, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        errors.push(`media_path_escape:${slot.id}`);
        continue;
      }
      try {
        const bytes = await readFile(resolved);
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== media.sha256) errors.push(`media_digest:${slot.id}`);
      } catch {
        errors.push(`media_unreadable:${slot.id}`);
      }
      const provenanceResolved = path.resolve(
        packRoot,
        media.provenanceReceiptFile,
      );
      const provenanceRelative = path.relative(packRoot, provenanceResolved);
      if (
        provenanceRelative.startsWith("..") ||
        path.isAbsolute(provenanceRelative)
      ) {
        errors.push(`provenance_path_escape:${slot.id}`);
        continue;
      }
      try {
        const receipt = await readFile(provenanceResolved);
        const receiptDigest = createHash("sha256")
          .update(receipt)
          .digest("hex");
        if (receiptDigest !== media.provenanceReceiptSha256) {
          errors.push(`provenance_digest:${slot.id}`);
        }
      } catch {
        errors.push(`provenance_unreadable:${slot.id}`);
      }
    }
  }
  return errors.sort();
}

function emptyValidation(error: string): LaunchCorpusContentPackValidation {
  return {
    ok: false,
    errors: [error],
    contentPackDigest: null,
    slotCount: 0,
    mediaCount: 0,
    publicSlotCount: 0,
    privateSlotCount: 0,
    archivedSlotCount: 0,
  };
}
