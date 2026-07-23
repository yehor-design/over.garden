import "server-only";

import type { Insertable, Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  CLOSED_PILOT_COHORT,
  DEFAULT_PILOT_INVITE_COHORT,
  type PilotInviteCohort,
} from "@/lib/garden/pilot-invite";
import { DEFAULT_PILOT_SEGMENT, type PilotSegment } from "@/lib/pilot/segments";

// Scoped repository for optional closed-pilot / founder-rehearsal cohort
// attribution (OVE-42 / OVE-193). Grants store only a user id, enum cohort,
// enum segment, and timestamps. After OVE-193 they are never a write-authorization
// dependency. No invite link, token, email, referrer, IP, user agent, or query
// string ever touches this table.

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type NewPilotInviteGrantRow = Insertable<Database["pilot_invite_grants"]>;

export function buildHasPilotWriteAccessQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("pilot_invite_grants")
    .select("user_id")
    .where("user_id", "=", userId)
    .limit(1);
}

export function buildGrantPilotWriteAccessQuery(
  executor: QueryExecutor,
  input: { userId: string; cohort: PilotInviteCohort; segment?: PilotSegment },
) {
  const row: NewPilotInviteGrantRow = {
    user_id: input.userId,
    cohort: input.cohort,
    segment: input.segment ?? DEFAULT_PILOT_SEGMENT,
  };

  return executor
    .insertInto("pilot_invite_grants")
    .values(row)
    .onConflict((oc) => oc.column("user_id").doNothing());
}

export function buildCountPilotWriteEligibleGardenersQuery(
  executor: QueryExecutor = db,
  cohort: PilotInviteCohort = CLOSED_PILOT_COHORT,
) {
  return executor
    .selectFrom("pilot_invite_grants")
    .where("cohort", "=", cohort)
    .select((eb) => eb.fn.countAll<string>().as("count"));
}

export function buildCountPilotWriteEligibleGardenersBySegmentQuery(
  executor: QueryExecutor = db,
  cohort: PilotInviteCohort = CLOSED_PILOT_COHORT,
) {
  return executor
    .selectFrom("pilot_invite_grants")
    .where("cohort", "=", cohort)
    .select(({ fn }) => ["segment", fn.count<string>("user_id").as("count")])
    .groupBy("segment")
    .orderBy("segment", "asc");
}

export async function hasPilotWriteAccess(userId: string): Promise<boolean> {
  if (!userId) return false;
  const row = await buildHasPilotWriteAccessQuery(
    db,
    userId,
  ).executeTakeFirst();
  return Boolean(row);
}

export function buildGetPilotInviteGrantQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("pilot_invite_grants")
    .select(["user_id", "cohort", "segment"])
    .where("user_id", "=", userId)
    .limit(1);
}

export async function getPilotInviteGrant(
  userId: string,
): Promise<{ cohort: PilotInviteCohort; segment: PilotSegment } | null> {
  if (!userId) return null;
  const row = await buildGetPilotInviteGrantQuery(db, userId).executeTakeFirst();
  if (!row) return null;
  return {
    cohort: row.cohort as PilotInviteCohort,
    segment: row.segment as PilotSegment,
  };
}

export async function grantPilotWriteAccess(
  userId: string,
  cohort: PilotInviteCohort = DEFAULT_PILOT_INVITE_COHORT,
  segment: PilotSegment = DEFAULT_PILOT_SEGMENT,
): Promise<void> {
  if (!userId) {
    throw new Error("A pilot write grant requires a user id.");
  }
  await buildGrantPilotWriteAccessQuery(db, {
    userId,
    cohort,
    segment,
  }).execute();
}

export async function countPilotWriteEligibleGardeners(
  executor: QueryExecutor = db,
  cohort: PilotInviteCohort = CLOSED_PILOT_COHORT,
): Promise<number> {
  const row = await buildCountPilotWriteEligibleGardenersQuery(
    executor,
    cohort,
  ).executeTakeFirst();
  return toCount(row?.count);
}

function toCount(value: string | number | bigint | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
