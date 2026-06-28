import { describe, expect, it } from "vitest";

import {
  buildPilotSmokeReadiness,
  type PilotSmokeCheck,
} from "./pilot-smoke-readiness";

const productionLikeEnv = {
  BETTER_AUTH_URL: "https://over-garden.vercel.app",
  PUBLIC_SITE_URL: "https://over-garden.vercel.app",
  BETTER_AUTH_SECRET: "auth-secret-that-must-not-leak",
  CATALOG_CURATOR_USER_IDS: "operator-user-id-that-must-not-leak",
  DATABASE_URL:
    "postgresql://overgarden:database-secret@db.example.com:5432/overgarden",
  DIRECT_URL:
    "postgresql://overgarden:direct-database-secret@db.example.com:5432/overgarden",
  DATABASE_SSL: "true",
  R2_ENDPOINT:
    "https://cb03b15042adc74edfe2d8201636300a.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "r2-access-key-that-must-not-leak",
  R2_SECRET_ACCESS_KEY: "r2-secret-that-must-not-leak",
  R2_FORCE_PATH_STYLE: "true",
  R2_QUARANTINE_BUCKET: "overgarden-quarantine",
  R2_PUBLIC_BUCKET: "overgarden-public",
  R2_PUBLIC_BASE_URL: "https://media.over.garden",
  MEILISEARCH_HOST: "https://meili.example.com",
  MEILISEARCH_API_KEY: "meili-secret-that-must-not-leak",
  MATCHING_SERVICE_URL: "https://matching.example.com",
  MATCHING_SERVICE_TOKEN: "matching-token-that-must-not-leak",
  VERCEL: "1",
  VERCEL_ENV: "production",
};

describe("pilot smoke readiness", () => {
  it("keeps secret values out of operator readout output", () => {
    const readout = buildPilotSmokeReadiness({
      env: productionLikeEnv,
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-27T00:00:00.000Z"),
    });

    const serialized = JSON.stringify(readout);

    expect(serialized).not.toContain("auth-secret-that-must-not-leak");
    expect(serialized).not.toContain("operator-user-id-that-must-not-leak");
    expect(serialized).not.toContain("database-secret");
    expect(serialized).not.toContain("direct-database-secret");
    expect(serialized).not.toContain("r2-access-key-that-must-not-leak");
    expect(serialized).not.toContain("r2-secret-that-must-not-leak");
    expect(serialized).not.toContain("meili-secret-that-must-not-leak");
    expect(serialized).not.toContain("matching-token-that-must-not-leak");
  });

  it("blocks deployed smoke when local placeholders are still configured", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        PUBLIC_SITE_URL: "http://localhost:3000",
        BETTER_AUTH_URL: "http://localhost:3000",
        DATABASE_URL:
          "postgresql://overgarden:overgarden@localhost:5432/overgarden",
        DIRECT_URL:
          "postgresql://overgarden:overgarden@localhost:5432/overgarden",
        R2_ENDPOINT: "http://localhost:9000",
        R2_PUBLIC_BASE_URL: "http://localhost:9000/overgarden-public",
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-27T00:00:00.000Z"),
    });

    expect(readout.overall).toBe("blocked");
    expect(
      findCheck(
        readout.sections.flatMap((section) => section.checks),
        "database-config",
      ),
    ).toMatchObject({
      severity: "fail",
    });
    expect(
      findCheck(
        readout.sections.flatMap((section) => section.checks),
        "public-site-url",
      ),
    ).toMatchObject({
      severity: "warn",
    });
    expect(
      findCheck(
        readout.sections.flatMap((section) => section.checks),
        "r2-config",
      ),
    ).toMatchObject({
      severity: "warn",
    });
  });

  it("keeps journal search worker proof as a manual live smoke check", () => {
    const readout = buildPilotSmokeReadiness({
      env: productionLikeEnv,
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-27T00:00:00.000Z"),
    });

    expect(readout.overall).toBe("ready");
    expect(
      findCheck(
        readout.sections.flatMap((section) => section.checks),
        "journal-search-worker",
      ),
    ).toMatchObject({
      severity: "manual",
      summary: expect.stringContaining("journal_entry_index"),
    });
  });

  it("surfaces backup/PITR and worker recovery as explicit manual durability checks", () => {
    const readout = buildPilotSmokeReadiness({
      env: productionLikeEnv,
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-29T00:00:00.000Z"),
    });
    const checks = readout.sections.flatMap((section) => section.checks);

    const backup = findCheck(checks, "database-backup-pitr");
    expect(backup).toMatchObject({ severity: "manual" });
    expect(backup?.summary).toContain("UNVERIFIED-NEEDS-OPERATOR");

    expect(findCheck(checks, "worker-process-manager")).toMatchObject({
      severity: "manual",
    });
    expect(findCheck(checks, "worker-restart-recovery")).toMatchObject({
      severity: "manual",
      summary: expect.stringContaining("public-safe"),
    });

    // Manual durability work is explicit, but it does not by itself flip a
    // production-like environment out of the ready state.
    expect(readout.overall).toBe("ready");
  });

  it("never leaks the production cluster name or doctl tokens in durability evidence", () => {
    const readout = buildPilotSmokeReadiness({
      env: productionLikeEnv,
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-29T00:00:00.000Z"),
    });
    const serialized = JSON.stringify(readout);

    expect(serialized).not.toContain("overgarden-postgres-prod-fra1");
    expect(serialized).not.toContain("do-user-");
  });

  it("blocks deployed smoke when the explicit operator allowlist is missing", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        CATALOG_CURATOR_USER_IDS: "",
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-27T00:00:00.000Z"),
    });

    expect(readout.overall).toBe("blocked");
    expect(
      findCheck(
        readout.sections.flatMap((section) => section.checks),
        "catalog-curator-user-ids",
      ),
    ).toMatchObject({
      severity: "fail",
      summary: expect.stringContaining("fail closed"),
    });
  });

  it("accepts Vercel deployment URL as the effective public/auth URL", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        BETTER_AUTH_URL: undefined,
        PUBLIC_SITE_URL: undefined,
        VERCEL_URL: "over-garden-preview.vercel.app",
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-27T00:00:00.000Z"),
    });
    const checks = readout.sections.flatMap((section) => section.checks);

    expect(findCheck(checks, "public-site-url")).toMatchObject({
      severity: "pass",
    });
    expect(findCheck(checks, "better-auth-url")).toMatchObject({
      severity: "pass",
    });
  });

  it("blocks smoke when no explicit or Vercel deployment origin exists", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        BETTER_AUTH_URL: undefined,
        PUBLIC_SITE_URL: undefined,
        NEXT_PUBLIC_SITE_URL: undefined,
        VERCEL_URL: undefined,
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-27T00:00:00.000Z"),
    });
    const checks = readout.sections.flatMap((section) => section.checks);

    expect(readout.overall).toBe("blocked");
    expect(findCheck(checks, "public-site-url")).toMatchObject({
      severity: "fail",
    });
    expect(findCheck(checks, "better-auth-url")).toMatchObject({
      severity: "fail",
    });
  });

  it("treats missing search and worker env as degraded explicit state", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        MEILISEARCH_HOST: undefined,
        MEILISEARCH_API_KEY: undefined,
        MATCHING_SERVICE_URL: undefined,
        MATCHING_SERVICE_TOKEN: undefined,
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-27T00:00:00.000Z"),
    });
    const checks = readout.sections.flatMap((section) => section.checks);

    expect(findCheck(checks, "meilisearch-host")).toMatchObject({
      severity: "warn",
    });
    expect(findCheck(checks, "meilisearch-api-key")).toMatchObject({
      severity: "warn",
    });
    expect(findCheck(checks, "matching-service-url")).toMatchObject({
      severity: "warn",
    });
    expect(findCheck(checks, "matching-service-token")).toMatchObject({
      severity: "warn",
    });
    expect(readout.overall).toBe("degraded");
  });
});

function findCheck(checks: PilotSmokeCheck[], id: string) {
  const check = checks.find((candidate) => candidate.id === id);
  expect(check).toBeDefined();
  return check;
}
