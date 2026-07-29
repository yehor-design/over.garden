import "server-only";

import { createHash } from "node:crypto";

import { db } from "@/db";
import type { RequestScope } from "@/server/request-scope";
import { archiveJournalEntry } from "@/server/journal-repository";

import type { LaunchCorpusContentPack } from "@/lib/launch-corpus/content-pack";
import { redactLaunchCorpusTargetId } from "./inventory";

export function deterministicLaunchCorpusUuid(key: string): string {
  const bytes = createHash("sha256")
    .update(`ove199.launch-corpus.v1:${key}`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function markLaunchCorpusEntryEditorial(input: {
  scope: RequestScope;
  entryId: string;
  slotId: string;
  sourceLanguage: "uk" | "bg";
  contentPackDigest: string;
}) {
  const expectedMutation = `ove199/${input.contentPackDigest}/${input.slotId}`;
  const row = await db
    .updateTable("journal_entries")
    .set({
      content_class: "editorial",
      source_language: input.sourceLanguage,
      updated_at: new Date(),
    })
    .where("id", "=", input.entryId)
    .where("owner_user_id", "=", input.scope.userId)
    .where("client_mutation_id", "=", expectedMutation)
    .where("visibility", "=", "private")
    .where("lifecycle_state", "=", "active")
    .returning(["id", "content_class", "source_language"])
    .executeTakeFirst();
  if (!row) {
    const existing = await db
      .selectFrom("journal_entries")
      .select(["id", "content_class", "source_language", "client_mutation_id"])
      .where("id", "=", input.entryId)
      .where("owner_user_id", "=", input.scope.userId)
      .executeTakeFirst();
    if (
      !existing ||
      existing.client_mutation_id !== expectedMutation ||
      existing.content_class !== "editorial" ||
      existing.source_language !== input.sourceLanguage
    ) {
      throw new Error(`Editorial classification refused for ${input.slotId}.`);
    }
  }
}

export async function applyExactLegacyDispositions(
  pack: LaunchCorpusContentPack,
) {
  const approved = new Set(pack.dispositions.map((row) => row.targetHash));
  const candidates = await db
    .selectFrom("journal_entries")
    .select(["id", "owner_user_id as ownerUserId", "content_class as contentClass", "visibility", "lifecycle_state as lifecycleState"])
    .where((eb) =>
      eb.or([
        eb.and([
          eb("content_class", "=", "real_ugc"),
          eb("visibility", "=", "public"),
          eb("lifecycle_state", "=", "active"),
        ]),
        eb.and([
          eb("content_class", "=", "production_smoke"),
          eb("lifecycle_state", "=", "archived"),
        ]),
      ]),
    )
    .execute();
  const exact = candidates.filter((row) => approved.has(redactLaunchCorpusTargetId(row.id)));
  if (exact.length !== approved.size) {
    throw new Error("Exact legacy disposition target set drifted.");
  }

  let mutated = 0;
  for (const target of exact) {
    if (target.lifecycleState === "archived" && target.contentClass === "production_smoke") continue;
    await archiveJournalEntry({ userId: target.ownerUserId }, { entryId: target.id });
    const updated = await db
      .updateTable("journal_entries")
      .set({ content_class: "production_smoke", source_language: null, updated_at: new Date() })
      .where("id", "=", target.id)
      .where("owner_user_id", "=", target.ownerUserId)
      .where("lifecycle_state", "=", "archived")
      .returning("id")
      .executeTakeFirst();
    if (!updated) throw new Error("Legacy target classification failed.");
    mutated += 1;
  }
  return { targetCount: exact.length, mutated };
}

export async function verifyAppliedLaunchCorpus(input: {
  pack: LaunchCorpusContentPack;
  contentPackDigest: string;
  ownerUserId: string;
}) {
  const entryExpectations = input.pack.slots.map((slot) => ({
    id: deterministicLaunchCorpusUuid(`${input.contentPackDigest}:entry:${slot.id}`),
    slot,
  }));
  const rows = await db.selectFrom("journal_entries")
    .select(["id", "content_class as contentClass", "source_language as sourceLanguage", "visibility", "lifecycle_state as lifecycleState", "space_id as spaceId", "plant_object_id as objectId"])
    .where("owner_user_id", "=", input.ownerUserId)
    .where("id", "in", entryExpectations.map((item) => item.id))
    .execute();
  if (rows.length !== entryExpectations.length) throw new Error("Launch corpus entry count mismatch.");
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const expected of entryExpectations) {
    const row = byId.get(expected.id);
    const stateMatches = row?.contentClass === "editorial" &&
      row.sourceLanguage === expected.slot.sourceLanguage &&
      (expected.slot.visibility === "private"
        ? row.visibility === "private" && row.lifecycleState === "active"
        : expected.slot.visibility === "public"
          ? row.visibility === "public" && row.lifecycleState === "active"
          : row.lifecycleState === "archived");
    if (!stateMatches) throw new Error(`Launch corpus state mismatch for ${expected.slot.id}.`);
  }
  if (new Set(rows.map((row) => row.spaceId)).size !== 2) throw new Error("Launch corpus space topology mismatch.");
  if (new Set(rows.map((row) => row.objectId)).size !== 4) throw new Error("Launch corpus object topology mismatch.");

  const mediaExpectations = input.pack.slots.flatMap((slot) =>
    slot.media.map((item) => ({
      id: deterministicLaunchCorpusUuid(`${input.contentPackDigest}:media:${item.sha256}`),
      archived: slot.visibility === "archived_410",
    })),
  );
  const mediaRows = await db.selectFrom("media_assets")
    .select(["id", "media_readiness_state as readiness", "quality_policy_version as qualityPolicy", "quality_class as qualityClass", "original_deleted_at as originalDeletedAt"])
    .where("owner_user_id", "=", input.ownerUserId)
    .where("id", "in", mediaExpectations.map((item) => item.id))
    .execute();
  if (mediaRows.length !== mediaExpectations.length) throw new Error("Launch corpus media count mismatch.");
  const mediaById = new Map(mediaRows.map((row) => [row.id, row]));
  for (const expected of mediaExpectations) {
    const row = mediaById.get(expected.id);
    const readinessOk = expected.archived
      ? row?.readiness === "public_ready" || row?.readiness === "invalidated"
      : row?.readiness === "public_ready";
    if (!row || !readinessOk || row.qualityPolicy !== "ove231.launch-media-quality.v1" || row.qualityClass !== "accepted" || !row.originalDeletedAt) {
      throw new Error("Launch corpus media readiness mismatch.");
    }
  }
  return {
    slots: rows.length,
    publicActive: input.pack.slots.filter((slot) => slot.visibility === "public").length,
    privateActive: input.pack.slots.filter((slot) => slot.visibility === "private").length,
    archivedGone: input.pack.slots.filter((slot) => slot.visibility === "archived_410").length,
    spaces: 2,
    objects: 4,
    media: mediaRows.length,
  };
}
