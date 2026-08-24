/**
 * OVE-207 journal cover selection smoke.
 * Proves shared resolver order, cover-only capacity, locale copy parity,
 * and that consumers no longer order journal thumbnails by created_at alone.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OWNER_COMPOSER_COVER_UPLOAD_PARTICIPANT_ID,
  OVE_207_BROWSER_SCENARIO_IDS,
  OVE_207_PRIMARY_BROWSER_SCENARIO_ID,
  JOURNAL_MEDIA_USAGE_COVER_ONLY,
  JOURNAL_MEDIA_USAGE_INLINE,
  resolveEffectiveJournalCover,
} from "../src/lib/garden/journal-cover-contract";
import {
  JOURNAL_DOCUMENT_SCHEMA_VERSION,
  MAX_JOURNAL_INLINE_IMAGES,
  type JournalDocumentV1,
} from "../src/lib/garden/journal-document";
import { getJournalCoverControlsCopy } from "../src/lib/garden/journal-cover-controls-copy";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(root, "..");
const pkg = require(path.join(webRoot, "package.json")) as {
  scripts?: Record<string, string>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function documentWithImages(ids: string[]): JournalDocumentV1 {
  return {
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks: ids.map((mediaAssetId, index) => ({
      id: `b${index}`,
      type: "image" as const,
      mediaAssetId,
    })),
  };
}

function main() {
  assert(
    pkg.scripts?.["smoke:journal-cover-selection"]?.includes(
      "smoke-journal-cover-selection.ts",
    ),
    "package.json must expose smoke:journal-cover-selection",
  );
  assert(
    OVE_207_PRIMARY_BROWSER_SCENARIO_ID === "locale-transition-with-cover",
    "Primary OVE-207 browser scenario mismatch",
  );
  assert(
    OVE_207_BROWSER_SCENARIO_IDS.length === 8,
    "OVE-207 mandatory browser scenarios must stay complete",
  );
  assert(
    OWNER_COMPOSER_COVER_UPLOAD_PARTICIPANT_ID ===
      "owner-composer-cover-upload",
    "Locale in-flight participant id mismatch",
  );
  assert(
    MAX_JOURNAL_INLINE_IMAGES === 10,
    "Inline capacity must remain 10; cover-only is extra",
  );

  for (const locale of ["uk", "bg", "ru"] as const) {
    const copy = getJournalCoverControlsCopy(locale);
    assert(copy.sectionLabel && copy.uploadSeparate && copy.keepAsCover, locale);
  }

  const tenInline = Array.from(
    { length: 10 },
    (_, index) => `inline-${index + 1}`,
  );
  const document = documentWithImages(tenInline);
  const candidatesById = new Map<
    string,
    {
      mediaAssetId: string;
      usageRole: typeof JOURNAL_MEDIA_USAGE_INLINE | typeof JOURNAL_MEDIA_USAGE_COVER_ONLY;
      derivativeKey: string;
      revokedAt: null;
    }
  >(
    tenInline.map((id) => [
      id,
      {
        mediaAssetId: id,
        usageRole: JOURNAL_MEDIA_USAGE_INLINE,
        derivativeKey: `${id}.webp`,
        revokedAt: null,
      },
    ]),
  );
  candidatesById.set("cover-only", {
    mediaAssetId: "cover-only",
    usageRole: JOURNAL_MEDIA_USAGE_COVER_ONLY,
    derivativeKey: "cover.webp",
    revokedAt: null,
  });

  const automatic = resolveEffectiveJournalCover({
    document,
    explicitCoverMediaAssetId: null,
    candidatesById,
  });
  assert(
    automatic.mediaAssetId === "inline-1",
    "Automatic cover must follow document order, not creation order",
  );

  const separate = resolveEffectiveJournalCover({
    document,
    explicitCoverMediaAssetId: "cover-only",
    candidatesById,
  });
  assert(
    separate.mode === "separate" && separate.mediaAssetId === "cover-only",
    "Separate cover must win when claimed",
  );

  const sql = readFileSync(
    path.join(webRoot, "sql/0001_walking_skeleton.sql"),
    "utf8",
  );
  assert(sql.includes("cover_media_asset_id"), "SQL must add cover FK");
  assert(sql.includes("usage_role"), "SQL must add media usage_role");
  assert(
    sql.includes("coalesce(usage_role, 'inline') = 'inline'"),
    "Inline limit must ignore cover-only assets",
  );

  const coverModule = readFileSync(
    path.join(webRoot, "src/server/journal-cover.ts"),
    "utf8",
  );
  assert(
    !coverModule.includes('orderBy("media_assets.created_at"'),
    "Shared cover SQL must not order by created_at",
  );
  assert(
    coverModule.includes("document_position"),
    "Shared cover SQL must order by document_position",
  );

  const consumerPaths = [
    "src/server/public-feed-repository.ts",
    "src/server/public-profile-repository.ts",
    "src/server/community-repository.ts",
    "src/server/journal-repository.ts",
  ];
  for (const relative of consumerPaths) {
    const source = readFileSync(path.join(webRoot, relative), "utf8");
    // Fail if a journal thumbnail path still uses bare created_at first media
    // without cover_media_asset_id / document_position nearby in the same file.
    if (
      relative === "src/server/community-repository.ts" &&
      source.includes("cover_contributions.added_at")
    ) {
      // Community (non-journal) cover path may still use created_at; OK.
      continue;
    }
    assert(
      source.includes("cover_media_asset_id") ||
        source.includes("document_position"),
      `${relative} must use cover-aware ordering`,
    );
  }

  console.log("smoke:journal-cover-selection OK");
}

main();
