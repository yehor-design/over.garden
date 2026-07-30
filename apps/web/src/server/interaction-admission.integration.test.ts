import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  configureInteractionAdmissionTransaction,
  consumeInteractionQuota,
  utcDayWindow,
} from "./interaction-admission";

const hasLocalDatabase = Boolean(process.env.DATABASE_URL);
const createdUserIds: string[] = [];

afterEach(async () => {
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop()!;
    await db.deleteFrom("user").where("id", "=", id).execute();
  }
});

describe.skipIf(!hasLocalDatabase)(
  "OVE-237 interaction admission integration",
  () => {
    it("admits no more than the atomic quota limit under concurrent transactions", async () => {
      const userId = randomUUID();
      createdUserIds.push(userId);
      const now = new Date("2026-07-30T03:00:00.000Z");
      const window = utcDayWindow(now);

      await db
        .insertInto("user")
        .values({
          id: userId,
          name: "OVE-237 local test",
          email: `ove237-${userId}@local.invalid`,
          emailVerified: true,
        })
        .execute();

      const attempts = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          db.transaction().execute(async (trx) => {
            await configureInteractionAdmissionTransaction(trx);
            await consumeInteractionQuota(trx, {
              actorUserId: userId,
              policy: "comment_root_global",
              scope: "global",
              limit: 3,
              windowStartedAt: window.startedAt,
              expiresAt: window.expiresAt,
            });
          }),
        ),
      );

      expect(
        attempts.filter((attempt) => attempt.status === "fulfilled"),
      ).toHaveLength(3);
      expect(
        attempts.filter((attempt) => attempt.status === "rejected"),
      ).toHaveLength(5);

      const stored = await db
        .selectFrom("interaction_quota_windows")
        .select("used_count")
        .where("actor_user_id", "=", userId)
        .where("quota_policy", "=", "comment_root_global")
        .executeTakeFirstOrThrow();
      expect(stored.used_count).toBe(3);
    });
  },
);
