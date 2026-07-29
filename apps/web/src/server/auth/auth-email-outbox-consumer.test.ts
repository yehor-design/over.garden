import { randomUUID } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const sendAuthPasswordResetEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/resend-auth-email-delivery", () => ({
  sendAuthPasswordResetEmail,
}));

const localIntegrationEnabled = process.env.OVE241_LOCAL_INTEGRATION === "true";

type Database = (typeof import("@/db"))["db"];
type EqualizePasswordResetAdmission =
  typeof import("./auth-email-outbox").equalizePasswordResetAdmission;
type DrainAuthEmailOutbox =
  typeof import("./auth-email-outbox-consumer").drainAuthEmailOutbox;

let db: Database;
let equalizePasswordResetAdmission: EqualizePasswordResetAdmission;
let drainAuthEmailOutbox: DrainAuthEmailOutbox;
const fixtureUserIds: string[] = [];
const fixtureVerificationIds: string[] = [];

describe.skipIf(!localIntegrationEnabled)(
  "auth email outbox local Postgres integration",
  () => {
    beforeAll(async () => {
      ({ db } = await import("@/db"));
      ({ equalizePasswordResetAdmission } =
        await import("./auth-email-outbox"));
      ({ drainAuthEmailOutbox } = await import("./auth-email-outbox-consumer"));
    });

    afterEach(async () => {
      sendAuthPasswordResetEmail.mockReset();

      for (const verificationId of fixtureVerificationIds.splice(0)) {
        await db
          .deleteFrom("verification")
          .where("id", "=", verificationId)
          .execute();
      }
      for (const userId of fixtureUserIds.splice(0)) {
        await db.deleteFrom("user").where("id", "=", userId).execute();
      }
    });

    afterAll(async () => {
      await db.destroy();
    });

    it("creates one eligible receipt, sends it once under concurrent drains, and does not enqueue absent or social-only addresses", async () => {
      const credential = await createAccountFixture("credential");
      const social = await createAccountFixture("google");
      sendAuthPasswordResetEmail.mockResolvedValue(undefined);

      const outboxBefore = await countOutboxRows();
      await equalizePasswordResetAdmission(credential.email);
      await equalizePasswordResetAdmission(social.email);
      await equalizePasswordResetAdmission(
        `absent-${randomUUID()}@example.test`,
      );
      expect(await countOutboxRows()).toBe(outboxBefore);

      const credentialVerificationId = await createResetVerification(
        credential.userId,
      );
      const socialVerificationId = await createResetVerification(social.userId);
      const absentVerificationId = await createResetVerification(randomUUID());
      fixtureVerificationIds.push(
        credentialVerificationId,
        socialVerificationId,
        absentVerificationId,
      );

      const outbox = await findOutboxForVerification(credentialVerificationId);
      expect(await countOutboxRows()).toBe(outboxBefore + 1);
      expect(outbox.verification_id).toMatch(/^[0-9a-f-]{36}$/i);

      const [first, second] = await Promise.all([
        drainAuthEmailOutbox(16, { outboxIds: [outbox.id] }),
        drainAuthEmailOutbox(16, { outboxIds: [outbox.id] }),
      ]);

      expect(first.sent + second.sent).toBe(1);
      expect(sendAuthPasswordResetEmail).toHaveBeenCalledOnce();
      expect(await outboxState(outbox.id)).toMatchObject({
        attempts: 1,
        state: "sent",
      });
    });

    it("retries a safe failure, reclaims an expired lease, and blocks delivery after credential removal", async () => {
      const retryable = await createEligibleOutbox();
      sendAuthPasswordResetEmail.mockRejectedValueOnce(
        new Error("provider failure"),
      );

      const firstDrain = await drainAuthEmailOutbox(16, {
        outboxIds: [retryable.outboxId],
      });
      expect(firstDrain.failed).toBe(1);
      expect(await outboxState(retryable.outboxId)).toMatchObject({
        attempts: 1,
        state: "failed",
        last_error_class: "provider_transient",
      });

      await db
        .updateTable("auth_email_outbox")
        .set({ available_at: new Date(Date.now() - 1_000) })
        .where("id", "=", retryable.outboxId)
        .execute();
      sendAuthPasswordResetEmail.mockResolvedValue(undefined);
      expect(
        (
          await drainAuthEmailOutbox(16, {
            outboxIds: [retryable.outboxId],
          })
        ).sent,
      ).toBe(1);
      expect(await outboxState(retryable.outboxId)).toMatchObject({
        attempts: 2,
        state: "sent",
      });

      const staleLease = await createEligibleOutbox();
      await db
        .updateTable("auth_email_outbox")
        .set({
          attempts: 1,
          locked_at: new Date(Date.now() - 181_000),
          locked_by: "expired-test-lease",
          state: "processing",
        })
        .where("id", "=", staleLease.outboxId)
        .execute();
      const reclaimed = await drainAuthEmailOutbox(16, {
        outboxIds: [staleLease.outboxId],
      });
      expect(reclaimed).toMatchObject({ reclaimed: 1, sent: 1 });
      expect(await outboxState(staleLease.outboxId)).toMatchObject({
        attempts: 2,
        state: "sent",
      });

      const revoked = await createEligibleOutbox();
      await db
        .deleteFrom("account")
        .where("userId", "=", revoked.userId)
        .where("providerId", "=", "credential")
        .execute();
      sendAuthPasswordResetEmail.mockClear();
      const cancelled = await drainAuthEmailOutbox(16, {
        outboxIds: [revoked.outboxId],
      });
      expect(cancelled.cancelled).toBe(1);
      expect(sendAuthPasswordResetEmail).not.toHaveBeenCalled();
      expect(await outboxState(revoked.outboxId)).toMatchObject({
        state: "cancelled",
      });
    });
  },
);

async function createAccountFixture(providerId: "credential" | "google") {
  const userId = randomUUID();
  const email = `ove241-${randomUUID()}@example.test`;
  fixtureUserIds.push(userId);

  await db
    .insertInto("user")
    .values({
      id: userId,
      email,
      emailVerified: true,
      name: "OVE-241 synthetic recovery fixture",
      updatedAt: new Date(),
    })
    .execute();
  await db
    .insertInto("account")
    .values({
      accountId: `${providerId}:${userId}`,
      id: randomUUID(),
      password: providerId === "credential" ? "synthetic-hash" : null,
      providerId,
      updatedAt: new Date(),
      userId,
    })
    .execute();

  return { email, userId };
}

async function createEligibleOutbox() {
  const credential = await createAccountFixture("credential");
  const verificationId = await createResetVerification(credential.userId);
  fixtureVerificationIds.push(verificationId);
  const outbox = await findOutboxForVerification(verificationId);
  return { outboxId: outbox.id, userId: credential.userId };
}

async function createResetVerification(value: string) {
  const verification = await db
    .insertInto("verification")
    .values({
      id: randomUUID(),
      identifier: `reset-password:${randomUUID()}`,
      value,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      updatedAt: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return verification.id;
}

async function findOutboxForVerification(verificationId: string) {
  return await db
    .selectFrom("auth_email_outbox")
    .select(["auth_email_outbox.id", "auth_email_outbox.verification_id"])
    .where("auth_email_outbox.verification_id", "=", verificationId)
    .executeTakeFirstOrThrow();
}

async function countOutboxRows() {
  const row = await db
    .selectFrom("auth_email_outbox")
    .select((expressionBuilder) =>
      expressionBuilder.fn.countAll<number>().as("count"),
    )
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

async function outboxState(id: string) {
  return await db
    .selectFrom("auth_email_outbox")
    .select(["attempts", "last_error_class", "state"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
