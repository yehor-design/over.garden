import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { LearningAttributionOutboxCounts } from "./attribution-outbox";
import type {
  MvpLearningCohortSignals,
  MvpLearningOrganicAcquisition,
} from "./report";

const postgresIntegrationEnabled =
  process.env.OVE219_POSTGRES_INTEGRATION === "true";

type Database = (typeof import("@/db"))["db"];
type GetMvpLearningReport = typeof import("./report").getMvpLearningReport;
type EvaluateMvpLearningDecisionGate =
  typeof import("./report").evaluateMvpLearningDecisionGate;

let db: Database;
let getMvpLearningReport: GetMvpLearningReport;
let evaluateMvpLearningDecisionGate: EvaluateMvpLearningDecisionGate;
const fixtureUserIds: string[] = [];

const emptyOutbox: LearningAttributionOutboxCounts = {
  pending: 0,
  processing: 0,
  failed: 0,
  dead: 0,
  attributed: 0,
  cancelled: 0,
};

const selfServeSignals: MvpLearningCohortSignals = {
  cohort: "real_self_serve",
  activatedGardeners: 4,
  h1RetainedGardeners: 4,
  h1Rate: 1,
  publishedGardeners: 4,
  publishedEntries: 9,
  publishRate: 1,
  sameObjectFollowUpEntries: 4,
  sameSessionRevisitFollowUps: 4,
};

const deferredH6: MvpLearningOrganicAcquisition = {
  status: "not_instrumented",
  decisionReady: false,
};

describe("MVP learning report decision gate (OVE-229)", () => {
  beforeAll(async () => {
    ({ evaluateMvpLearningDecisionGate } = await import("./report"));
  });

  it("refuses a strategic green result while H6 is deliberately not instrumented", () => {
    expect(
      evaluateMvpLearningDecisionGate({
        selfServe: selfServeSignals,
        unclassifiedEventCount: 0,
        unclassifiedActiveGardenerCount: 0,
        attributionOutbox: emptyOutbox,
        organicAcquisition: deferredH6,
      }),
    ).toBe("insufficient");
  });

  it("keeps unclassified attribution above the deferred-H6 gate", () => {
    expect(
      evaluateMvpLearningDecisionGate({
        selfServe: selfServeSignals,
        unclassifiedEventCount: 1,
        unclassifiedActiveGardenerCount: 0,
        attributionOutbox: emptyOutbox,
        organicAcquisition: deferredH6,
      }),
    ).toBe("unclassified");
  });
});

describe.skipIf(!postgresIntegrationEnabled)(
  "MVP learning report PostgreSQL integration (OVE-229)",
  () => {
    beforeAll(async () => {
      ({ db } = await import("@/db"));
      ({ getMvpLearningReport } = await import("./report"));
    });

    afterEach(async () => {
      for (const userId of fixtureUserIds.splice(0)) {
        await db
          .deleteFrom("analytics_events")
          .where("owner_user_id", "=", userId)
          .execute();
        await db
          .deleteFrom("learning_actor_attributions")
          .where("user_id", "=", userId)
          .execute();
        await db
          .deleteFrom("journal_entries")
          .where("owner_user_id", "=", userId)
          .execute();
        await db
          .deleteFrom("plant_objects")
          .where("owner_user_id", "=", userId)
          .execute();
        await db
          .deleteFrom("spaces")
          .where("owner_user_id", "=", userId)
          .execute();
        await db.deleteFrom("user").where("id", "=", userId).execute();
      }
    });

    afterAll(async () => {
      await db.destroy();
    });

    it("uses one gardener, not two public entries, as the H4 numerator", async () => {
      const userId = randomUUID();
      const spaceId = randomUUID();
      const objectId = randomUUID();
      fixtureUserIds.push(userId);
      const firstPublishedAt = new Date("2039-07-10T12:00:00.000Z");
      const secondPublishedAt = new Date("2039-07-11T12:00:00.000Z");

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("user")
          .values({
            id: userId,
            email: `ove229-${randomUUID()}@example.test`,
            emailVerified: true,
            name: "OVE-229 report fixture",
            updatedAt: firstPublishedAt,
          })
          .execute();
        await trx
          .insertInto("spaces")
          .values({
            id: spaceId,
            owner_user_id: userId,
            display_name: "OVE-229 fixture space",
          })
          .execute();
        await trx
          .insertInto("plant_objects")
          .values({
            id: objectId,
            owner_user_id: userId,
            space_id: spaceId,
            display_name: "OVE-229 fixture object",
          })
          .execute();
        await trx
          .insertInto("learning_actor_attributions")
          .values({
            user_id: userId,
            actor_class: "real_self_serve",
            source: "self_serve_default",
          })
          .execute();
        await trx
          .insertInto("journal_entries")
          .values([
            {
              owner_user_id: userId,
              space_id: spaceId,
              plant_object_id: objectId,
              title: "First public OVE-229 fixture",
              body: "Public fixture body.",
              client_mutation_id: randomUUID(),
              visibility: "public",
              lifecycle_state: "active",
              content_class: "real_ugc",
              created_at: firstPublishedAt,
              updated_at: firstPublishedAt,
            },
            {
              owner_user_id: userId,
              space_id: spaceId,
              plant_object_id: objectId,
              title: "Second public OVE-229 fixture",
              body: "Second public fixture body.",
              client_mutation_id: randomUUID(),
              visibility: "public",
              lifecycle_state: "active",
              content_class: "real_ugc",
              created_at: secondPublishedAt,
              updated_at: secondPublishedAt,
            },
          ])
          .execute();
      });

      const report = await getMvpLearningReport({
        executor: db,
        now: new Date("2039-08-01T12:00:00.000Z"),
      });
      const cohort = report.cohorts.real_self_serve;

      expect(cohort.activatedGardeners).toBe(1);
      expect(cohort.publishedGardeners).toBe(1);
      expect(cohort.publishedEntries).toBe(2);
      expect(cohort.publishRate).toBe(1);
      expect(cohort.h1Rate).toBeGreaterThanOrEqual(0);
      expect(cohort.h1Rate).toBeLessThanOrEqual(1);
      expect(cohort.publishRate).toBeGreaterThanOrEqual(0);
      expect(cohort.publishRate).toBeLessThanOrEqual(1);
      expect(report.organicAcquisition).toEqual(deferredH6);
    });
  },
);
