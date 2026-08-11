import { randomUUID } from "node:crypto";

import { sql } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const postgresIntegrationEnabled =
  process.env.OVE219_POSTGRES_INTEGRATION === "true";

type Database = (typeof import("@/db"))["db"];
type EnqueueLearningAttributionIntent =
  typeof import("./attribution-outbox").enqueueLearningAttributionIntent;
type DrainLearningAttributionOutbox =
  typeof import("./attribution-outbox").drainLearningAttributionOutbox;
type GetMvpLearningReport = typeof import("./report").getMvpLearningReport;

let db: Database;
let enqueueLearningAttributionIntent: EnqueueLearningAttributionIntent;
let drainLearningAttributionOutbox: DrainLearningAttributionOutbox;
let getMvpLearningReport: GetMvpLearningReport;
const fixtureUserIds: string[] = [];

describe.skipIf(!postgresIntegrationEnabled)(
  "learning attribution outbox PostgreSQL integration (OVE-219)",
  () => {
    beforeAll(async () => {
      ({ db } = await import("@/db"));
      ({ enqueueLearningAttributionIntent, drainLearningAttributionOutbox } =
        await import("./attribution-outbox"));
      ({ getMvpLearningReport } = await import("./report"));
    });

    afterEach(async () => {
      for (const userId of fixtureUserIds.splice(0)) {
        await db
          .deleteFrom("analytics_events")
          .where("owner_user_id", "=", userId)
          .execute();
        await db
          .deleteFrom("learning_attribution_outbox")
          .where("user_id", "=", userId)
          .execute();
        await db
          .deleteFrom("learning_actor_attributions")
          .where("user_id", "=", userId)
          .execute();
        await db.deleteFrom("user").where("id", "=", userId).execute();
      }
    });

    afterAll(async () => {
      await db.destroy();
    });

    it("commits one bounded intent, leases it once under concurrent drains, and backfills post-response analytics", async () => {
      const userId = await createUserFixture();
      await db.transaction().execute(async (trx) => {
        await enqueueLearningAttributionIntent(trx, { userId });
      });
      await db
        .insertInto("analytics_events")
        .values({
          owner_user_id: userId,
          event_name: "entry_logged",
          properties: { entry_scope: "object" },
        })
        .execute();

      const outbox = await db
        .selectFrom("learning_attribution_outbox")
        .select(["id", "state"])
        .where("user_id", "=", userId)
        .executeTakeFirstOrThrow();
      expect(outbox).toMatchObject({
        state: "pending",
      });

      const [first, second] = await Promise.all([
        drainLearningAttributionOutbox(16, { outboxIds: [outbox.id] }),
        drainLearningAttributionOutbox(16, { outboxIds: [outbox.id] }),
      ]);
      expect(first.attributed + second.attributed).toBe(1);

      expect(
        await db
          .selectFrom("learning_attribution_outbox")
          .select(["attempts", "state", "last_error_class"])
          .where("id", "=", outbox.id)
          .executeTakeFirstOrThrow(),
      ).toMatchObject({
        attempts: 1,
        state: "attributed",
        last_error_class: null,
      });
      expect(
        await db
          .selectFrom("learning_actor_attributions")
          .select(["actor_class", "source"])
          .where("user_id", "=", userId)
          .executeTakeFirstOrThrow(),
      ).toMatchObject({
        actor_class: "real_self_serve",
        source: "self_serve_default",
      });
      expect(
        await db
          .selectFrom("analytics_events")
          .select("properties")
          .where("owner_user_id", "=", userId)
          .executeTakeFirstOrThrow(),
      ).toMatchObject({
        properties: { actor_class: "real_self_serve", entry_scope: "object" },
      });

      // The next response can arrive after the first consumer completed. It
      // advances the desired generation and must receive its own backfill.
      await db
        .insertInto("analytics_events")
        .values({
          owner_user_id: userId,
          event_name: "entry_logged",
          properties: { entry_scope: "general" },
        })
        .execute();
      await db.transaction().execute(async (trx) => {
        await enqueueLearningAttributionIntent(trx, { userId });
      });
      expect(
        await drainLearningAttributionOutbox(16, { outboxIds: [outbox.id] }),
      ).toMatchObject({ attributed: 1, remaining: 0 });
      expect(
        await db
          .selectFrom("learning_attribution_outbox")
          .select([
            "attempts",
            "state",
            "desired_generation",
            "applied_generation",
          ])
          .where("id", "=", outbox.id)
          .executeTakeFirstOrThrow(),
      ).toMatchObject({
        attempts: 1,
        state: "attributed",
        desired_generation: 2,
        applied_generation: 2,
      });
      expect(
        await db
          .selectFrom("analytics_events")
          .select("properties")
          .where("owner_user_id", "=", userId)
          .where("event_name", "=", "entry_logged")
          .where(sql<boolean>`properties ->> 'entry_scope' = 'general'`)
          .executeTakeFirstOrThrow(),
      ).toMatchObject({
        properties: {
          actor_class: "real_self_serve",
          entry_scope: "general",
        },
      });
    });

    it("reclaims an expired lease without duplicating durable attribution", async () => {
      const userId = await createUserFixture();
      await db.transaction().execute(async (trx) => {
        await enqueueLearningAttributionIntent(trx, { userId });
      });
      const outbox = await db
        .selectFrom("learning_attribution_outbox")
        .select("id")
        .where("user_id", "=", userId)
        .executeTakeFirstOrThrow();
      await db
        .updateTable("learning_attribution_outbox")
        .set({
          attempts: 1,
          locked_at: new Date(Date.now() - 181_000),
          locked_by: "expired-test-lease",
          state: "processing",
        })
        .where("id", "=", outbox.id)
        .execute();

      expect(
        await drainLearningAttributionOutbox(16, { outboxIds: [outbox.id] }),
      ).toMatchObject({ reclaimed: 1, attributed: 1 });
      expect(
        await db
          .selectFrom("learning_attribution_outbox")
          .select(["attempts", "state"])
          .where("id", "=", outbox.id)
          .executeTakeFirstOrThrow(),
      ).toMatchObject({ attempts: 2, state: "attributed" });
    });

    it("gives a new generation a fresh retry budget after dead-letter recovery", async () => {
      const userId = await createUserFixture();
      await db.transaction().execute(async (trx) => {
        await enqueueLearningAttributionIntent(trx, { userId });
      });
      const outbox = await db
        .selectFrom("learning_attribution_outbox")
        .select("id")
        .where("user_id", "=", userId)
        .executeTakeFirstOrThrow();
      await db
        .updateTable("learning_attribution_outbox")
        .set({
          attempts: 8,
          last_error_class: "max_attempts",
          state: "dead",
          terminalized_at: new Date(),
        })
        .where("id", "=", outbox.id)
        .execute();
      await db.transaction().execute(async (trx) => {
        await enqueueLearningAttributionIntent(trx, { userId });
      });
      expect(
        await db
          .selectFrom("learning_attribution_outbox")
          .select([
            "attempts",
            "state",
            "desired_generation",
            "terminalized_at",
          ])
          .where("id", "=", outbox.id)
          .executeTakeFirstOrThrow(),
      ).toMatchObject({
        attempts: 0,
        state: "pending",
        desired_generation: 2,
        terminalized_at: null,
      });
      await db
        .insertInto("analytics_events")
        .values({
          owner_user_id: userId,
          event_name: "entry_logged",
          properties: { ove219_force_transient: true },
        })
        .execute();
      await sql`
        create function ove219_force_transient_backfill_failure()
        returns trigger
        language plpgsql
        as $$
        begin
          if new.properties ? 'ove219_force_transient' then
            raise exception 'forced OVE-219 transient backfill failure';
          end if;
          return new;
        end;
        $$;
      `.execute(db);
      await sql`
        create trigger ove219_force_transient_backfill_failure
        before update on analytics_events
        for each row
        execute function ove219_force_transient_backfill_failure();
      `.execute(db);

      try {
        expect(
          await drainLearningAttributionOutbox(16, { outboxIds: [outbox.id] }),
        ).toMatchObject({ failed: 1, dead: 0 });
      } finally {
        await sql`
          drop trigger if exists ove219_force_transient_backfill_failure
          on analytics_events;
        `.execute(db);
        await sql`
          drop function if exists ove219_force_transient_backfill_failure();
        `.execute(db);
      }

      expect(
        await db
          .selectFrom("learning_attribution_outbox")
          .select(["attempts", "state", "last_error_class"])
          .where("id", "=", outbox.id)
          .executeTakeFirstOrThrow(),
      ).toMatchObject({
        attempts: 1,
        state: "failed",
        last_error_class: "transient",
      });
    });

    it("accepts the retained self-serve analytics alias", async () => {
      const userId = await createUserFixture();
      await db.transaction().execute(async (trx) => {
        await enqueueLearningAttributionIntent(trx, { userId });
      });
      const outbox = await db
        .selectFrom("learning_attribution_outbox")
        .select("id")
        .where("user_id", "=", userId)
        .executeTakeFirstOrThrow();
      await drainLearningAttributionOutbox(16, { outboxIds: [outbox.id] });
      await db
        .insertInto("analytics_events")
        .values({
          owner_user_id: userId,
          event_name: "entry_logged",
          properties: { actor_class: "self_serve" },
        })
        .execute();

      const report = await getMvpLearningReport({ executor: db });
      expect(report.unclassifiedEventCount).toBe(0);
      expect(report.unclassifiedActiveGardenerCount).toBe(0);
    });
  },
);

async function createUserFixture(): Promise<string> {
  const userId = randomUUID();
  fixtureUserIds.push(userId);
  await db
    .insertInto("user")
    .values({
      id: userId,
      email: `ove219-${randomUUID()}@example.test`,
      emailVerified: true,
      name: "OVE-219 local attribution fixture",
      updatedAt: new Date(),
    })
    .execute();
  return userId;
}
