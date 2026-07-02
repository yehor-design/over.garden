import { describe, expect, it } from "vitest";

import {
  buildPilotSmokeReadiness,
  type PilotSmokeCheck,
} from "./pilot-smoke-readiness";

const productionLikeEnv = {
  BETTER_AUTH_URL: "https://over.garden",
  PUBLIC_SITE_URL: "https://over.garden",
  BETTER_AUTH_SECRET: "auth-secret-that-must-not-leak",
  CATALOG_CURATOR_USER_IDS: "operator-user-id-that-must-not-leak",
  GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "google-secret-that-must-not-leak",
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
  PILOT_INVITE_SIGNING_SECRET: "pilot-invite-secret-that-must-not-leak",
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
    expect(serialized).not.toContain("google-client-id");
    expect(serialized).not.toContain("google-secret-that-must-not-leak");
    expect(serialized).not.toContain("database-secret");
    expect(serialized).not.toContain("direct-database-secret");
    expect(serialized).not.toContain("r2-access-key-that-must-not-leak");
    expect(serialized).not.toContain("r2-secret-that-must-not-leak");
    expect(serialized).not.toContain("meili-secret-that-must-not-leak");
    expect(serialized).not.toContain("matching-token-that-must-not-leak");
    expect(serialized).not.toContain("pilot-invite-secret-that-must-not-leak");
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

  it("blocks Vercel production smoke on the legacy vercel.app origin", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        PUBLIC_SITE_URL: "https://over-garden.vercel.app",
        BETTER_AUTH_URL: "https://over-garden.vercel.app",
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-29T00:00:00.000Z"),
    });
    const checks = readout.sections.flatMap((section) => section.checks);

    expect(readout.overall).toBe("blocked");
    expect(findCheck(checks, "public-site-url")).toMatchObject({
      severity: "fail",
      summary: expect.stringContaining("https://over.garden"),
    });
    expect(findCheck(checks, "better-auth-url")).toMatchObject({
      severity: "fail",
      summary: expect.stringContaining("https://over.garden"),
    });
  });

  it("blocks Vercel production smoke when canonical origins are only inferred", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        PUBLIC_SITE_URL: "https://over.garden",
        BETTER_AUTH_URL: undefined,
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-29T00:00:00.000Z"),
    });
    const checks = readout.sections.flatMap((section) => section.checks);

    expect(readout.overall).toBe("blocked");
    expect(findCheck(checks, "better-auth-url")).toMatchObject({
      severity: "fail",
      summary: expect.stringContaining("explicitly configured"),
    });
  });

  it("blocks deployed smoke when the auth secret is a local fallback", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        BETTER_AUTH_SECRET:
          "local-development-only-overgarden-better-auth-secret-fixed",
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-27T00:00:00.000Z"),
    });

    expect(readout.overall).toBe("blocked");
    expect(
      findCheck(
        readout.sections.flatMap((section) => section.checks),
        "better-auth-secret",
      ),
    ).toMatchObject({
      severity: "fail",
      summary: expect.stringContaining("local development fallback"),
    });
  });

  it("blocks deployed smoke when the auth secret is still a placeholder", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        BETTER_AUTH_SECRET:
          "ci-overgarden-better-auth-secret-change-before-deploy",
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-27T00:00:00.000Z"),
    });

    expect(readout.overall).toBe("blocked");
    expect(
      findCheck(
        readout.sections.flatMap((section) => section.checks),
        "better-auth-secret",
      ),
    ).toMatchObject({
      severity: "fail",
      summary: expect.stringContaining("placeholder-like"),
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
      summary: expect.stringContaining("production Linux"),
      evidence: expect.stringContaining("production droplet"),
    });
    expect(findCheck(checks, "worker-process-manager")?.summary).toContain(
      "Apple Container is not the droplet runtime",
    );
    expect(findCheck(checks, "worker-process-manager")?.evidence).not.toContain(
      "local Docker Desktop",
    );
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

  it("surfaces the invited-cohort invite loop as a redacted manual check", () => {
    const readout = buildPilotSmokeReadiness({
      env: productionLikeEnv,
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-29T00:00:00.000Z"),
    });
    const checks = readout.sections.flatMap((section) => section.checks);

    const cohort = findCheck(checks, "invited-cohort-loop");
    expect(cohort).toMatchObject({ severity: "manual" });
    expect(cohort?.summary).toContain("noindex");
    expect(cohort?.summary).toContain("source=invited-cohort");
    expect(cohort?.evidence).toContain("invited_cohort");
    expect(readout.smokeSteps.some((step) => step.includes("/join"))).toBe(
      true,
    );
    expect(readout.overall).toBe("ready");
  });

  it("blocks deployed smoke when the pilot invite signing secret is missing", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        PILOT_INVITE_SIGNING_SECRET: "",
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(
      findCheck(
        readout.sections.flatMap((section) => section.checks),
        "pilot-invite-signing-secret",
      ),
    ).toMatchObject({ severity: "fail" });
    expect(readout.overall).toBe("blocked");
  });

  it("requires manual admin role bootstrap proof without treating the legacy allowlist as primary auth", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        CATALOG_CURATOR_USER_IDS: "",
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-27T00:00:00.000Z"),
    });

    expect(readout.overall).toBe("ready");
    expect(
      findCheck(
        readout.sections.flatMap((section) => section.checks),
        "admin-role-access-model",
      ),
    ).toMatchObject({
      severity: "manual",
      summary: expect.stringContaining("admin_user_roles"),
    });
  });

  it("requires Google OAuth env in production and keeps provider proof manual", () => {
    const readyReadout = buildPilotSmokeReadiness({
      env: productionLikeEnv,
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-07-02T00:00:00.000Z"),
    });
    const readyChecks = readyReadout.sections.flatMap(
      (section) => section.checks,
    );

    expect(findCheck(readyChecks, "google-oauth-provider")).toMatchObject({
      severity: "manual",
      summary: expect.stringContaining("redirect mismatch"),
      evidence: expect.stringContaining(
        "https://over.garden/api/auth/callback/google",
      ),
    });
    expect(JSON.stringify(readyReadout)).not.toContain(
      "google-secret-that-must-not-leak",
    );
    expect(
      readyReadout.smokeSteps.some((step) => step.includes("Google OAuth")),
    ).toBe(true);

    const blockedReadout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
      },
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(
      findCheck(
        blockedReadout.sections.flatMap((section) => section.checks),
        "google-oauth-provider",
      ),
    ).toMatchObject({ severity: "fail" });
    expect(blockedReadout.overall).toBe("blocked");
  });

  it("accepts Vercel deployment URL as the effective public/auth URL outside production", () => {
    const readout = buildPilotSmokeReadiness({
      env: {
        ...productionLikeEnv,
        BETTER_AUTH_URL: undefined,
        PUBLIC_SITE_URL: undefined,
        VERCEL_URL: "over-garden-preview.vercel.app",
        VERCEL_ENV: "preview",
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
