import "server-only";

import type { Insertable, Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  DEFAULT_PILOT_INVITE_COHORT,
  type PilotInviteCohort,
} from "@/lib/garden/pilot-invite";

// Scoped repository for closed-pilot write eligibility (OVE-42). Grants store
// only a user id, an enum cohort, and timestamps. No invite link, token, email,
// referrer, IP, user agent, or query string ever touches this table.

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
  input: { userId: string; cohort: PilotInviteCohort },
) {
  const row: NewPilotInviteGrantRow = {
    user_id: input.userId,
    cohort: input.cohort,
  };

  return executor
    .insertInto("pilot_invite_grants")
    .values(row)
    .onConflict((oc) => oc.column("user_id").doNothing());
}

export function buildCountPilotWriteEligibleGardenersQuery(
  executor: QueryExecutor = db,
) {
  return executor
    .selectFrom("pilot_invite_grants")
    .select((eb) => eb.fn.countAll<string>().as("count"));
}

export async function hasPilotWriteAccess(userId: string): Promise<boolean> {
  if (!userId) return false;
  const row = await buildHasPilotWriteAccessQuery(db, userId).executeTakeFirst();
  return Boolean(row);
}

export async function grantPilotWriteAccess(
  userId: string,
  cohort: PilotInviteCohort = DEFAULT_PILOT_INVITE_COHORT,
): Promise<void> {
  if (!userId) {
    throw new Error("A pilot write grant requires a user id.");
  }
  await buildGrantPilotWriteAccessQuery(db, { userId, cohort }).execute();
}

export async function countPilotWriteEligibleGardeners(
  executor: QueryExecutor = db,
): Promise<number> {
  const row =
    await buildCountPilotWriteEligibleGardenersQuery(executor).executeTakeFirst();
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
