import { randomUUID } from "node:crypto";

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";
import { MVP_LEARNING_POLICY_VERSION } from "@/lib/mvp-learning/policy";
import {
  buildForbiddenAnalyticsPropertyKeyScanQuery,
  buildMvpLearningReconcileReport,
  type MvpLearningReconcileReport,
} from "./reconcile";
import type { MvpLearningReport } from "./report";

const postgresIntegrationEnabled =
  process.env.OVE219_POSTGRES_INTEGRATION === "true";

type DatabaseConnection = (typeof import("@/db"))["db"];
type CountForbiddenAnalyticsPropertyKeys =
  typeof import("./reconcile").countForbiddenAnalyticsPropertyKeys;

class TestPostgresDialect implements Dialect {
  createDriver(): Driver {
    return new DummyDriver();
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}

const testDb = new Kysely<Database>({ dialect: new TestPostgresDialect() });

let db: DatabaseConnection;
let countForbiddenAnalyticsPropertyKeys: CountForbiddenAnalyticsPropertyKeys;
const fixtureUserIds: string[] = [];

function buildDeferredH6Report(
  decisionGate: MvpLearningReport["decisionGate"] = "insufficient",
): MvpLearningReport {
  return {
    policyVersion: MVP_LEARNING_POLICY_VERSION,
    policyDate: "2026-07-24",
    retentionPolicyVersion: "ove195.retention.v1",
    generatedAt: new Date("2026-08-01T12:00:00.000Z"),
    windowDays: 30,
    since: new Date("2026-07-02T12:00:00.000Z"),
    cohorts: {
      real_self_serve: {
        cohort: "real_self_serve",
        activatedGardeners: 4,
        h1RetainedGardeners: 4,
        h1Rate: 1,
        publishedGardeners: 4,
        publishedEntries: 8,
        publishRate: 1,
        sameObjectFollowUpEntries: 4,
        sameSessionRevisitFollowUps: 4,
      },
      real_closed_pilot: {
        cohort: "real_closed_pilot",
        activatedGardeners: 4,
        h1RetainedGardeners: 4,
        h1Rate: 1,
        publishedGardeners: 4,
        publishedEntries: 8,
        publishRate: 1,
        sameObjectFollowUpEntries: 4,
        sameSessionRevisitFollowUps: 4,
      },
    },
    exclusions: {
      founder_rehearsal: 0,
      production_smoke: 0,
      visual_fixture: 0,
      editorial_seed: 0,
      automated_bot: 0,
    },
    attributionOutbox: {
      pending: 0,
      processing: 0,
      failed: 0,
      dead: 0,
      attributed: 0,
      cancelled: 0,
    },
    unclassifiedEventCount: 0,
    unclassifiedActiveGardenerCount: 0,
    organicAcquisition: {
      status: "not_instrumented",
      decisionReady: false,
    },
    editorialPublicTrafficProxy: 12,
    decisionGate,
    notes: [],
  };
}

describe("MVP learning reconciliation (OVE-229)", () => {
  it("builds a database key scan that returns only an aggregate count", () => {
    const compiled =
      buildForbiddenAnalyticsPropertyKeyScanQuery().compile(testDb);
    const query = compiled.sql.toLowerCase();

    expect(query).toContain("jsonb_object_keys");
    expect(query).toContain("count(*)::int");
    expect(query).toContain("select distinct property_key.key");
    expect(query).not.toContain("analytics_events.owner_user_id");
    expect(query).not.toContain("analytics_events.properties ->>");
    expect(query).not.toContain("journal_entries");
  });

  it("fails closed when H6 is deferred, even with strong H1/H4 diagnostics", async () => {
    const reconcile = await buildMvpLearningReconcileReport({
      environment: "local",
      report: buildDeferredH6Report(),
      forbiddenPropertyKeyScanner: async () => 0,
    });

    expect(reconcile.ok).toBe(false);
    expect(reconcile.decisionGate).toBe("insufficient");
    expect(reconcile.propertyKeyScanStatus).toBe("ok");
  });

  it("returns a bounded degraded receipt when the property-key scan fails", async () => {
    const reconcile = await buildMvpLearningReconcileReport({
      environment: "local",
      report: buildDeferredH6Report(),
      forbiddenPropertyKeyScanner: async () => {
        throw new Error("simulated aggregate key scan timeout");
      },
    });

    expect(reconcile.ok).toBe(false);
    expect(reconcile.propertyKeyScanStatus).toBe("degraded");
    expect(reconcile.forbiddenFieldHits).toBe(0);
    expect(JSON.stringify(reconcile)).not.toContain("simulated");
  });

  it("permits reconciliation only for an explicit canonical ok gate", async () => {
    const reconcile = await buildMvpLearningReconcileReport({
      environment: "local",
      report: buildDeferredH6Report("ok"),
      forbiddenPropertyKeyScanner: async () => 0,
    });

    expect(reconcile.ok).toBe(true);
  });
});

describe.skipIf(!postgresIntegrationEnabled)(
  "MVP learning reconciliation PostgreSQL integration (OVE-229)",
  () => {
    beforeAll(async () => {
      ({ db } = await import("@/db"));
      ({ countForbiddenAnalyticsPropertyKeys } = await import("./reconcile"));
    });

    afterEach(async () => {
      for (const userId of fixtureUserIds.splice(0)) {
        await db
          .deleteFrom("analytics_events")
          .where("owner_user_id", "=", userId)
          .execute();
        await db.deleteFrom("user").where("id", "=", userId).execute();
      }
    });

    afterAll(async () => {
      await db.destroy();
    });

    it("scans a stored JSON key with one bounded aggregate query", async () => {
      const userId = randomUUID();
      fixtureUserIds.push(userId);
      await db
        .insertInto("user")
        .values({
          id: userId,
          email: `ove229-${randomUUID()}@example.test`,
          emailVerified: true,
          name: "OVE-229 reconcile fixture",
          updatedAt: new Date(),
        })
        .execute();
      await db
        .insertInto("analytics_events")
        .values({
          owner_user_id: userId,
          event_name: "entry_logged",
          properties: {
            actor_class: "real_self_serve",
            email_probe: "fixture",
          },
        })
        .execute();

      const startedAt = performance.now();
      const forbiddenFieldHits = await countForbiddenAnalyticsPropertyKeys(db);
      const durationMs = performance.now() - startedAt;
      const reconcile = await buildMvpLearningReconcileReport({
        environment: "local",
        executor: db,
      });

      const receipt: Pick<
        MvpLearningReconcileReport,
        "forbiddenFieldHits" | "propertyKeyScanStatus"
      > = {
        forbiddenFieldHits,
        propertyKeyScanStatus: "ok",
      };
      expect(forbiddenFieldHits).toBeGreaterThanOrEqual(1);
      expect(durationMs).toBeLessThanOrEqual(500);
      expect(reconcile.forbiddenFieldHits).toBeGreaterThanOrEqual(1);
      expect(reconcile.propertyKeyScanStatus).toBe("ok");
      expect(reconcile.ok).toBe(false);
      expect(JSON.stringify(receipt)).not.toContain("email");
      expect(JSON.stringify(receipt)).not.toContain("fixture");
    });
  },
);
