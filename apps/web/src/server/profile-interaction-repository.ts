import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { parsePublicHandleSyntax } from "@/server/identity-policy";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PROFILE_REPORT_REASONS = [
  "spam",
  "harassment",
  "privacy",
  "impersonation",
  "other",
] as const;

export type ProfileReportReason = (typeof PROFILE_REPORT_REASONS)[number];
export type ProfileViewerState =
  | { kind: "owner" }
  | { kind: "blocked" }
  | { kind: "following" }
  | { kind: "not_following" }
  | { kind: "unavailable" };

export type ProfileInteractionResult =
  | "followed"
  | "unfollowed"
  | "blocked"
  | "unblocked"
  | "reported"
  | "unavailable";

interface ProfileInteractionTarget {
  userId: string;
  handle: string;
}

export async function getProfileViewerState(
  scope: RequestScope,
  rawHandle: string,
  executor: QueryExecutor = db,
): Promise<ProfileViewerState> {
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) return { kind: "unavailable" };

  const own = await buildOwnProfileHandleQuery(
    executor,
    scope,
    parsed.normalizedHandle,
  ).executeTakeFirst();
  if (own) return { kind: "owner" };

  const target = await buildProfileInteractionTargetQuery(
    executor,
    scope,
    parsed.normalizedHandle,
  ).executeTakeFirst();
  if (!target) return { kind: "unavailable" };

  const blocked = await buildProfileViewerBlockQuery(
    executor,
    scope,
    target.userId,
  ).executeTakeFirst();
  if (blocked) return { kind: "blocked" };

  const following = await buildProfileViewerFollowQuery(
    executor,
    scope,
    target.userId,
  ).executeTakeFirst();
  return { kind: following ? "following" : "not_following" };
}

export async function followProfile(
  scope: RequestScope,
  rawHandle: string,
  executor: QueryExecutor = db,
): Promise<ProfileInteractionResult> {
  const target = await resolveInteractionTarget(scope, rawHandle, executor);
  if (!target) return "unavailable";
  const blocked = await buildProfileViewerBlockQuery(
    executor,
    scope,
    target.userId,
  ).executeTakeFirst();
  if (blocked) return "unavailable";

  await buildUpsertProfileFollowQuery(executor, scope, target.userId).execute();
  return "followed";
}

export async function unfollowProfile(
  scope: RequestScope,
  rawHandle: string,
  executor: QueryExecutor = db,
): Promise<ProfileInteractionResult> {
  const target = await resolveInteractionTarget(scope, rawHandle, executor);
  if (!target) return "unavailable";
  await buildRemoveProfileFollowQuery(executor, scope, target.userId).execute();
  return "unfollowed";
}

export async function blockProfile(
  scope: RequestScope,
  rawHandle: string,
  database: Kysely<Database> = db,
): Promise<ProfileInteractionResult> {
  return database.transaction().execute(async (trx) => {
    const target = await resolveInteractionTarget(scope, rawHandle, trx);
    if (!target) return "unavailable";

    await buildUpsertProfileBlockQuery(trx, scope, target.userId).execute();
    await buildRemoveBlockedProfileFollowsQuery(
      trx,
      scope,
      target.userId,
    ).execute();
    await buildRemoveBlockedObjectFollowsQuery(
      trx,
      scope,
      target.userId,
    ).execute();
    return "blocked";
  });
}

export async function unblockProfile(
  scope: RequestScope,
  rawHandle: string,
  executor: QueryExecutor = db,
): Promise<ProfileInteractionResult> {
  const target = await resolveUnblockTarget(scope, rawHandle, executor);
  if (!target) return "unavailable";
  await buildRemoveProfileBlockQuery(executor, scope, target.userId).execute();
  return "unblocked";
}

export async function unblockProfileByBlockId(
  scope: RequestScope,
  rawBlockId: string,
  executor: QueryExecutor = db,
): Promise<ProfileInteractionResult> {
  const blockId = rawBlockId.trim();
  if (!UUID_PATTERN.test(blockId)) return "unavailable";

  const updated = await buildRemoveProfileBlockByIdQuery(
    executor,
    scope,
    blockId,
  ).executeTakeFirst();
  return updated ? "unblocked" : "unavailable";
}

export async function reportProfile(
  scope: RequestScope,
  rawHandle: string,
  rawReason: string,
  executor: QueryExecutor = db,
): Promise<ProfileInteractionResult> {
  const reason = normalizeProfileReportReason(rawReason);
  if (!reason) return "unavailable";
  const target = await resolveInteractionTarget(scope, rawHandle, executor);
  if (!target) return "unavailable";
  await buildUpsertProfileReportQuery(
    executor,
    scope,
    target.userId,
    reason,
  ).execute();
  return "reported";
}

export function normalizeProfileReportReason(
  value: string,
): ProfileReportReason | null {
  return PROFILE_REPORT_REASONS.includes(value as ProfileReportReason)
    ? (value as ProfileReportReason)
    : null;
}

export function buildProfileInteractionTargetQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  normalizedHandle: string,
) {
  return executor
    .selectFrom("user_public_profiles")
    .select(["user_id as userId", "handle"])
    .where("normalized_handle", "=", normalizedHandle)
    .where("profile_visibility", "=", "public")
    .where("profile_lifecycle_state", "=", "active")
    .where("removed_at", "is", null)
    .where("user_id", "!=", scope.userId);
}

export function buildOwnProfileHandleQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  normalizedHandle: string,
) {
  return executor
    .selectFrom("user_public_profiles")
    .select("user_id as userId")
    .where("user_id", "=", scope.userId)
    .where("normalized_handle", "=", normalizedHandle)
    .where("profile_lifecycle_state", "=", "active")
    .where("removed_at", "is", null);
}

export function buildProfileViewerBlockQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  targetUserId: string,
) {
  return executor
    .selectFrom("profile_blocks")
    .select("id")
    .where("block_state", "=", "active")
    .where((eb) =>
      eb.or([
        eb.and([
          eb("blocker_user_id", "=", scope.userId),
          eb("blocked_user_id", "=", targetUserId),
        ]),
        eb.and([
          eb("blocker_user_id", "=", targetUserId),
          eb("blocked_user_id", "=", scope.userId),
        ]),
      ]),
    )
    .limit(1);
}

export function buildProfileViewerFollowQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  targetUserId: string,
) {
  return executor
    .selectFrom("profile_follows")
    .select("id")
    .where("follower_user_id", "=", scope.userId)
    .where("target_user_id", "=", targetUserId)
    .where("follow_state", "=", "active")
    .limit(1);
}

export function buildUpsertProfileFollowQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  targetUserId: string,
) {
  const now = new Date();
  return executor
    .insertInto("profile_follows")
    .values({
      follower_user_id: scope.userId,
      target_user_id: targetUserId,
      follow_state: "active",
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["follower_user_id", "target_user_id"]).doUpdateSet({
        follow_state: "active",
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildRemoveProfileFollowQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  targetUserId: string,
) {
  return executor
    .updateTable("profile_follows")
    .set({ follow_state: "removed", updated_at: new Date() })
    .where("follower_user_id", "=", scope.userId)
    .where("target_user_id", "=", targetUserId)
    .returning("id");
}

export function buildUpsertProfileBlockQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  targetUserId: string,
) {
  const now = new Date();
  return executor
    .insertInto("profile_blocks")
    .values({
      blocker_user_id: scope.userId,
      blocked_user_id: targetUserId,
      block_state: "active",
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["blocker_user_id", "blocked_user_id"]).doUpdateSet({
        block_state: "active",
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildRemoveBlockedProfileFollowsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  targetUserId: string,
) {
  return executor
    .updateTable("profile_follows")
    .set({ follow_state: "removed", updated_at: new Date() })
    .where((eb) =>
      eb.or([
        eb.and([
          eb("follower_user_id", "=", scope.userId),
          eb("target_user_id", "=", targetUserId),
        ]),
        eb.and([
          eb("follower_user_id", "=", targetUserId),
          eb("target_user_id", "=", scope.userId),
        ]),
      ]),
    )
    .returning("id");
}

export function buildRemoveBlockedObjectFollowsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  targetUserId: string,
) {
  return executor
    .updateTable("engagement_follows")
    .set({ follow_state: "removed", updated_at: new Date() })
    .where("target_kind", "=", "lineage_object")
    .where((eb) =>
      eb.or([
        eb.and([
          eb("follower_user_id", "=", scope.userId),
          eb(
            "target_ref",
            "in",
            executor
              .selectFrom("plant_objects")
              .select(sql<string>`plant_objects.id::text`.as("id"))
              .where("owner_user_id", "=", targetUserId),
          ),
        ]),
        eb.and([
          eb("follower_user_id", "=", targetUserId),
          eb(
            "target_ref",
            "in",
            executor
              .selectFrom("plant_objects")
              .select(sql<string>`plant_objects.id::text`.as("id"))
              .where("owner_user_id", "=", scope.userId),
          ),
        ]),
      ]),
    )
    .returning("id");
}

export function buildRemoveProfileBlockQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  targetUserId: string,
) {
  return executor
    .updateTable("profile_blocks")
    .set({ block_state: "removed", updated_at: new Date() })
    .where("blocker_user_id", "=", scope.userId)
    .where("blocked_user_id", "=", targetUserId)
    .returning("id");
}

export function buildRemoveProfileBlockByIdQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  blockId: string,
) {
  return executor
    .updateTable("profile_blocks")
    .set({ block_state: "removed", updated_at: new Date() })
    .where("id", "=", blockId)
    .where("blocker_user_id", "=", scope.userId)
    .where("block_state", "=", "active")
    .returning("id");
}

export function buildUpsertProfileReportQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  targetUserId: string,
  reason: ProfileReportReason,
) {
  const now = new Date();
  return executor
    .insertInto("profile_reports")
    .values({
      reporter_user_id: scope.userId,
      target_user_id: targetUserId,
      report_reason: reason,
      report_state: "submitted",
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["reporter_user_id", "target_user_id"]).doUpdateSet({
        report_reason: reason,
        report_state: "submitted",
        updated_at: now,
      }),
    )
    .returning("id");
}

async function resolveInteractionTarget(
  scope: RequestScope,
  rawHandle: string,
  executor: QueryExecutor,
): Promise<ProfileInteractionTarget | null> {
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) return null;
  return (
    (await buildProfileInteractionTargetQuery(
      executor,
      scope,
      parsed.normalizedHandle,
    ).executeTakeFirst()) ?? null
  );
}

async function resolveUnblockTarget(
  scope: RequestScope,
  rawHandle: string,
  executor: QueryExecutor,
): Promise<ProfileInteractionTarget | null> {
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) return null;
  return (
    (await executor
      .selectFrom("user_public_profiles")
      .select(["user_id as userId", "handle"])
      .where("normalized_handle", "=", parsed.normalizedHandle)
      .where("user_id", "!=", scope.userId)
      .executeTakeFirst()) ?? null
  );
}
