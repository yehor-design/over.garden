import "server-only";

import { Kysely, sql, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  getMvpLearningReport,
  type MvpLearningReport,
} from "@/server/mvp-learning/report";
import { MVP_LEARNING_POLICY_VERSION } from "@/lib/mvp-learning/policy";
import { FORBIDDEN_ANALYTICS_PROPERTY_FRAGMENTS } from "@/server/mvp-learning/forbidden-fields";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const PROPERTY_KEY_SCAN_STATEMENT_TIMEOUT_MS = 450;

export type MvpLearningPropertyKeyScanStatus = "ok" | "degraded";
export type ForbiddenPropertyKeyScanner = (
  executor: QueryExecutor,
) => Promise<number>;

export interface MvpLearningReconcileReport {
  ok: boolean;
  policyVersion: typeof MVP_LEARNING_POLICY_VERSION;
  environment: "local" | "production";
  agreement: {
    selfServeActivated: number;
    unclassifiedEvents: number;
    attributionOutstanding: number;
    exclusionsTotal: number;
  };
  forbiddenFieldHits: number;
  propertyKeyScanStatus: MvpLearningPropertyKeyScanStatus;
  decisionGate: MvpLearningReport["decisionGate"];
  notes: string[];
}

export async function buildMvpLearningReconcileReport(input: {
  environment: "local" | "production";
  report?: MvpLearningReport;
  executor?: QueryExecutor;
  forbiddenPropertyKeyScanner?: ForbiddenPropertyKeyScanner;
}): Promise<MvpLearningReconcileReport> {
  const executor = input.executor ?? db;
  const build = async (snapshot: QueryExecutor, report: MvpLearningReport) =>
    buildMvpLearningReconcileReportFromSnapshot(input, report, snapshot);

  // Tests can provide both a completed aggregate report and a scanner fault
  // without opening a database connection. Every production path gets one
  // bounded, read-only snapshot for both the report and stored-key scan.
  if (input.report && input.forbiddenPropertyKeyScanner) {
    return build(executor, input.report);
  }

  return withMvpLearningReconcileSnapshot(executor, async (snapshot) => {
    const report =
      input.report ?? (await getMvpLearningReport({ executor: snapshot }));
    return build(snapshot, report);
  });
}

async function buildMvpLearningReconcileReportFromSnapshot(
  input: {
    environment: "local" | "production";
    forbiddenPropertyKeyScanner?: ForbiddenPropertyKeyScanner;
  },
  report: MvpLearningReport,
  executor: QueryExecutor,
): Promise<MvpLearningReconcileReport> {
  const exclusionsTotal = Object.values(report.exclusions).reduce(
    (sum, value) => sum + value,
    0,
  );

  let forbiddenFieldHits = 0;
  let propertyKeyScanStatus: MvpLearningPropertyKeyScanStatus = "ok";
  try {
    forbiddenFieldHits = await (
      input.forbiddenPropertyKeyScanner ?? countForbiddenAnalyticsPropertyKeys
    )(executor);
  } catch {
    propertyKeyScanStatus = "degraded";
  }
  const attributionOutstanding =
    report.attributionOutbox.pending +
    report.attributionOutbox.processing +
    report.attributionOutbox.failed +
    report.attributionOutbox.dead;

  const ok =
    report.decisionGate === "ok" &&
    forbiddenFieldHits === 0 &&
    propertyKeyScanStatus === "ok" &&
    report.policyVersion === MVP_LEARNING_POLICY_VERSION;

  return {
    ok,
    policyVersion: report.policyVersion,
    environment: input.environment,
    agreement: {
      selfServeActivated: report.cohorts.real_self_serve.activatedGardeners,
      unclassifiedEvents: report.unclassifiedEventCount,
      attributionOutstanding,
      exclusionsTotal,
    },
    forbiddenFieldHits,
    propertyKeyScanStatus,
    decisionGate: report.decisionGate,
    notes: [
      "Reconcile scans stored analytics property keys as an aggregate count only; it never returns a key or value.",
      "A property-key scan timeout or error is degraded and non-green without returning raw database errors.",
      "Headline continue/iterate/stop must refuse unless decisionGate is exactly ok.",
      ...report.notes,
    ],
  };
}

export function buildForbiddenAnalyticsPropertyKeyScanQuery() {
  return sql<{ forbiddenFieldHits: number }>`
    with forbidden_property_keys as (
      select distinct property_key.key
      from analytics_events
      cross join lateral jsonb_object_keys(analytics_events.properties) as property_key(key)
      where lower(property_key.key) like any(array[${sql.join(
        FORBIDDEN_ANALYTICS_PROPERTY_FRAGMENTS.map((fragment) =>
          sql.lit(`%${fragment}%`),
        ),
      )}])
    )
    select count(*)::int as "forbiddenFieldHits"
    from forbidden_property_keys
  `;
}

export async function countForbiddenAnalyticsPropertyKeys(
  executor: QueryExecutor = db,
): Promise<number> {
  const execute = async (snapshot: QueryExecutor) => {
    const result =
      await buildForbiddenAnalyticsPropertyKeyScanQuery().execute(snapshot);
    return toCount(result.rows[0]?.forbiddenFieldHits);
  };

  if (!(executor instanceof Kysely) || executor.isTransaction) {
    return execute(executor);
  }

  return executor.transaction().execute(async (snapshot) => {
    await sql
      .raw("set transaction isolation level repeatable read, read only")
      .execute(snapshot);
    await sql
      .raw(
        `set local statement_timeout = '${PROPERTY_KEY_SCAN_STATEMENT_TIMEOUT_MS}ms'`,
      )
      .execute(snapshot);
    return execute(snapshot);
  });
}

async function withMvpLearningReconcileSnapshot<T>(
  executor: QueryExecutor,
  reader: (snapshot: QueryExecutor) => Promise<T>,
): Promise<T> {
  if (!(executor instanceof Kysely) || executor.isTransaction) {
    return reader(executor);
  }

  return executor.transaction().execute(async (snapshot) => {
    await sql
      .raw("set transaction isolation level repeatable read, read only")
      .execute(snapshot);
    await sql
      .raw(
        `set local statement_timeout = '${PROPERTY_KEY_SCAN_STATEMENT_TIMEOUT_MS}ms'`,
      )
      .execute(snapshot);
    return reader(snapshot);
  });
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
