import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  ABSENT_SCHEMA_SHAPE_DIGEST,
  APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
  APPROVED_ENVIRONMENT_BINDING_DIGEST,
  APPROVED_SCHEMA_SHAPE_DIGEST,
  RETIRED_RELATION,
  buildRetirementPlan,
  isApprovedProductionDatabaseTarget,
  parseOptions,
  type RetirementSnapshot,
} from "./retire-manual-pilot-learning";

const webRoot = path.resolve(".");
const repositoryRoot = path.resolve(webRoot, "../..");
const execFileAsync = promisify(execFile);

const retiredImplementationPaths = [
  "src/app/garden/pilot-learning/interviews/page.tsx",
  "src/app/garden/pilot-learning/interviews/actions.ts",
  "src/app/garden/pilot-learning/decision/page.tsx",
  "src/lib/pilot/interview-learning.ts",
  "src/server/founder-interview-access.ts",
  "src/server/founder-interview-repository.ts",
  "src/server/pilot-cohort-decision.ts",
  "src/server/pilot-cohort-decision-repository.ts",
] as const;

const matchingSnapshot: RetirementSnapshot = {
  tableExists: true,
  rowCount: 0,
  columnCount: 14,
  constraintCount: 20,
  incomingForeignKeyCount: 0,
  viewDependencyCount: 0,
  schemaShapeDigest: APPROVED_SCHEMA_SHAPE_DIGEST,
};

describe("OVE-299 manual pilot learning retirement", () => {
  it("removes both route trees and every dedicated implementation owner", async () => {
    await Promise.all(
      retiredImplementationPaths.map(async (relativePath) => {
        await expect(
          access(path.join(webRoot, relativePath)),
        ).rejects.toThrow();
      }),
    );
  });

  it("keeps fresh bootstrap and upgrade history converged on table absence", async () => {
    const [bootstrapSql, migrationSql] = await Promise.all([
      readFile(path.join(webRoot, "sql/0001_walking_skeleton.sql"), "utf8"),
      readFile(
        path.join(webRoot, "sql/0020_ove299_remove_manual_pilot_learning.sql"),
        "utf8",
      ),
    ]);

    expect(bootstrapSql).not.toContain(
      "create table if not exists pilot_interview_learnings",
    );
    expect(migrationSql.trim()).toBe(
      "drop table if exists public.pilot_interview_learnings;",
    );
  });

  it("classifies the exact authorized zero-row production shape as code deployed", () => {
    const plan = buildRetirementPlan({
      environment: "production",
      implementationSha: "a".repeat(40),
      migrationDigest: "b".repeat(64),
      authorizationReceiptDigest: APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
      environmentBindingDigest: APPROVED_ENVIRONMENT_BINDING_DIGEST,
      routeAbsenceClass: "exact_404",
      snapshot: matchingSnapshot,
    });

    expect(plan).toMatchObject({
      version: 1,
      environment: "production",
      implementationSha: "a".repeat(40),
      tableExists: true,
      rowCount: 0,
      routeAbsenceClass: "exact_404",
      state: "code_deployed",
    });
    expect(plan.evidenceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(plan).sort()).toEqual(
      [
        "authorizationReceiptDigest",
        "columnCount",
        "constraintCount",
        "environment",
        "environmentBindingDigest",
        "evidenceDigest",
        "implementationSha",
        "incomingForeignKeyCount",
        "migrationDigest",
        "routeAbsenceClass",
        "rowCount",
        "schemaShapeDigest",
        "state",
        "tableExists",
        "version",
        "viewDependencyCount",
      ].sort(),
    );
  });

  it.each([
    ["nonzero rows", { rowCount: 1 }],
    ["incoming foreign key", { incomingForeignKeyCount: 1 }],
    ["view dependency", { viewDependencyCount: 1 }],
    ["schema drift", { schemaShapeDigest: "c".repeat(64) }],
  ])("fails closed on %s", (_label, drift) => {
    const plan = buildRetirementPlan({
      environment: "production",
      implementationSha: "a".repeat(40),
      migrationDigest: "b".repeat(64),
      authorizationReceiptDigest: APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
      environmentBindingDigest: APPROVED_ENVIRONMENT_BINDING_DIGEST,
      routeAbsenceClass: "exact_404",
      snapshot: { ...matchingSnapshot, ...drift },
    });

    expect(plan.state).toBe("failed");
    expect(plan.tableExists).toBe(true);
  });

  it("treats an already absent target as replay-safe completion", () => {
    const plan = buildRetirementPlan({
      environment: "production",
      implementationSha: "a".repeat(40),
      migrationDigest: "b".repeat(64),
      authorizationReceiptDigest: APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
      environmentBindingDigest: APPROVED_ENVIRONMENT_BINDING_DIGEST,
      routeAbsenceClass: "exact_404",
      snapshot: {
        tableExists: false,
        rowCount: 0,
        columnCount: 0,
        constraintCount: 0,
        incomingForeignKeyCount: 0,
        viewDependencyCount: 0,
        schemaShapeDigest: ABSENT_SCHEMA_SHAPE_DIGEST,
      },
    });

    expect(plan.state).toBe("already_completed");
  });

  it("emits a deterministic aggregate-only receipt", () => {
    const input = {
      environment: "production" as const,
      implementationSha: "a".repeat(40),
      migrationDigest: "b".repeat(64),
      authorizationReceiptDigest: APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
      environmentBindingDigest: APPROVED_ENVIRONMENT_BINDING_DIGEST,
      routeAbsenceClass: "exact_404" as const,
      snapshot: matchingSnapshot,
    };

    const first = buildRetirementPlan(input);
    const second = buildRetirementPlan(input);
    expect(first).toEqual(second);

    const serialized = JSON.stringify(first);
    expect(RETIRED_RELATION).toBe("public.pilot_interview_learnings");
    for (const forbidden of [
      "email",
      "password",
      "cookie",
      "token",
      "note",
      "userId",
      "connectionString",
      "latitude",
      "longitude",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("binds production execution to the approved database target", () => {
    expect(
      isApprovedProductionDatabaseTarget(
        "postgresql://redacted:redacted@overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com:25060/defaultdb?sslmode=require",
      ),
    ).toBe(true);
    expect(
      isApprovedProductionDatabaseTarget(
        "postgresql://redacted:redacted@127.0.0.1:5432/defaultdb",
      ),
    ).toBe(false);
    expect(
      isApprovedProductionDatabaseTarget(
        "postgresql://redacted:redacted@overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com:25060/other",
      ),
    ).toBe(false);
  });

  it("accepts the pnpm argument separator without weakening bounded input", () => {
    expect(
      parseOptions([
        "--",
        "--mode",
        "plan",
        "--environment",
        "production",
        "--implementation-sha",
        "a".repeat(40),
        "--route-absence-class",
        "exact_404",
      ]),
    ).toEqual({
      mode: "plan",
      environment: "production",
      implementationSha: "a".repeat(40),
      routeAbsenceClass: "exact_404",
      expectedPlanDigest: undefined,
    });
  });

  it.each([
    ["unknown option", ["--unknown", "value"]],
    ["duplicate option", ["--mode", "plan", "--mode", "apply"]],
    ["plan-only digest", ["--expected-plan-digest", "b".repeat(64)]],
  ])("rejects %s even with otherwise valid options", (_label, extra) => {
    expect(() =>
      parseOptions([
        "--mode",
        "plan",
        "--environment",
        "production",
        "--implementation-sha",
        "a".repeat(40),
        "--route-absence-class",
        "exact_404",
        ...extra,
      ]),
    ).toThrow("invalid_input");
  });

  it("takes an exclusive table lock before the destructive re-snapshot", async () => {
    const source = await readFile(
      path.join(webRoot, "scripts/retire-manual-pilot-learning.ts"),
      "utf8",
    );
    const lockIndex = source.indexOf(
      "lock table public.pilot_interview_learnings in access exclusive mode",
    );
    const snapshotIndex = source.indexOf(
      "const snapshot = await readSnapshot(client)",
      lockIndex,
    );

    expect(lockIndex).toBeGreaterThan(-1);
    expect(snapshotIndex).toBeGreaterThan(lockIndex);
  });

  it("leaves only declared retirement tombstones in current repository text", async () => {
    const allowed = new Set([
      "apps/web/sql/0020_ove299_remove_manual_pilot_learning.sql",
      "apps/web/scripts/retire-manual-pilot-learning.ts",
      "apps/web/scripts/retire-manual-pilot-learning.test.ts",
      "docs/runbooks/OVE_299_MANUAL_PILOT_LEARNING_RETIREMENT.md",
      "docs/mainline-closeout-ledger.json",
    ]);
    const { stdout: scan } = await execFileAsync(
      "git",
      [
        "grep",
        "-n",
        "-E",
        "/garden/pilot-learning/(interviews|decision)|pilot_interview_learnings|founder-interview|pilot-cohort-decision",
        "--",
        ".",
      ],
      { cwd: repositoryRoot },
    );
    const unexpected = scan
      .split("\n")
      .filter(Boolean)
      .filter((line) => ![...allowed].some((entry) => line.startsWith(entry)));

    expect(unexpected).toEqual([]);
  });
});
