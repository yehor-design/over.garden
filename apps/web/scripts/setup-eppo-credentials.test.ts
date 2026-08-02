import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  EPPO_LYPES_OPERATION_ID,
  type EppoApiAccessReceipt,
  type EppoOpenApiContract,
} from "./verify-eppo-api-access";
import {
  type EppoCredentialTarget,
  setupEppoCredentials,
} from "./setup-eppo-credentials";

const FIXTURE_CREDENTIAL = "eppo_fixture_credential_4fd9d606a6b74d9a";
const REPLACEMENT_CREDENTIAL = "eppo_fixture_replacement_4fd9d606a6b74d9a";

const CONTRACT: EppoOpenApiContract = {
  openApiDigest: createHash("sha256").update("fixture").digest("hex"),
  apiBaseUrl: "https://api.eppo.int/gd/v2",
  operationId: EPPO_LYPES_OPERATION_ID,
  operationPath: "/taxons/taxon/LYPES/overview",
  authHeader: "X-Api-Key",
};

function apiReceipt(): EppoApiAccessReceipt {
  return {
    ...CONTRACT,
    class: "verified",
    httpStatusClass: "2xx",
    latencyMs: 5,
    fingerprintPrefix: "a1b2c3d4e5f6",
  };
}

function targetFixture(
  existing?: string,
  runtime: () => Promise<EppoApiAccessReceipt> = async () => apiReceipt(),
): EppoCredentialTarget & {
  value?: string;
  writes: number;
  removes: number;
  targetLocks: number;
  targetReleases: number;
} {
  const target = {
    value: existing,
    writes: 0,
    removes: 0,
    targetLocks: 0,
    targetReleases: 0,
    async inspect() {
      return {
        canonical: target.value ? ("present" as const) : ("missing" as const),
        legacyAliasConfigured: false,
      };
    },
    async acquireTargetLock() {
      target.targetLocks += 1;
      return true;
    },
    async releaseTargetLock() {
      target.targetReleases += 1;
    },
    async readCurrentCredential() {
      return target.value ? Buffer.from(target.value, "utf8") : null;
    },
    async writeCredential(value: Buffer) {
      target.writes += 1;
      target.value = value.toString("utf8");
    },
    async removeCredential() {
      target.removes += 1;
      target.value = undefined;
    },
    verifyRuntime: runtime,
  };
  return target;
}

function dependencies(target: EppoCredentialTarget) {
  return {
    target,
    currentMainSha: async () => "a".repeat(40),
    inspectOpenApi: async () => CONTRACT,
    verifyCandidate: async () => apiReceipt(),
    now: () => 100,
  };
}

describe("EPPO credential setup", () => {
  it("prints a zero-secret plan before apply and never mutates the target", async () => {
    const target = targetFixture();
    const result = await setupEppoCredentials(
      {
        environment: "production",
        confirmEnvironment: "production",
        apply: false,
      },
      dependencies(target),
    );

    expect(result).toMatchObject({
      class: "plan_ready",
      operationId: EPPO_LYPES_OPERATION_ID,
      targetState: "missing",
    });
    expect(JSON.stringify(result)).not.toContain(FIXTURE_CREDENTIAL);
    expect(target.writes).toBe(0);
  });

  it("validates before one write and returns a redacted completed receipt", async () => {
    const target = targetFixture();
    const result = await setupEppoCredentials(
      {
        environment: "production",
        confirmEnvironment: "production",
        apply: true,
        credential: FIXTURE_CREDENTIAL,
      },
      dependencies(target),
    );

    expect(result).toMatchObject({ class: "completed", cleanup: "completed" });
    expect(JSON.stringify(result)).not.toContain(FIXTURE_CREDENTIAL);
    expect(target.writes).toBe(1);
    expect(target.value).toBe(FIXTURE_CREDENTIAL);
    expect(target.targetLocks).toBe(1);
    expect(target.targetReleases).toBe(1);
  });

  it("returns idempotent success without a duplicate write for the same key", async () => {
    const target = targetFixture(FIXTURE_CREDENTIAL);
    const result = await setupEppoCredentials(
      {
        environment: "production",
        confirmEnvironment: "production",
        apply: true,
        credential: FIXTURE_CREDENTIAL,
      },
      dependencies(target),
    );

    expect(result).toMatchObject({ class: "already_configured_and_verified" });
    expect(target.writes).toBe(0);
  });

  it("restores the prior target value if runtime verification fails", async () => {
    const target = targetFixture(REPLACEMENT_CREDENTIAL, async () => {
      throw new Error("runtime unavailable");
    });
    await expect(
      setupEppoCredentials(
        {
          environment: "production",
          confirmEnvironment: "production",
          apply: true,
          credential: FIXTURE_CREDENTIAL,
        },
        dependencies(target),
      ),
    ).rejects.toMatchObject({ code: "runtime_verification_failed" });
    expect(target.value).toBe(REPLACEMENT_CREDENTIAL);
    expect(target.writes).toBe(2);
  });

  it("removes a newly written key when runtime verification fails without a prior value", async () => {
    const target = targetFixture(undefined, async () => {
      throw new Error("runtime unavailable");
    });
    await expect(
      setupEppoCredentials(
        {
          environment: "production",
          confirmEnvironment: "production",
          apply: true,
          credential: FIXTURE_CREDENTIAL,
        },
        dependencies(target),
      ),
    ).rejects.toMatchObject({ code: "runtime_verification_failed" });
    expect(target.value).toBeUndefined();
    expect(target.removes).toBe(1);
    expect(target.targetReleases).toBe(1);
  });

  it("requires explicit production confirmation", async () => {
    await expect(
      setupEppoCredentials(
        {
          environment: "preview",
          confirmEnvironment: "preview",
          apply: false,
        },
        dependencies(targetFixture()),
      ),
    ).rejects.toMatchObject({ code: "invalid_environment" });
  });

  it("lets only one concurrent setup own the target mutation", async () => {
    const target = targetFixture();
    let releaseCandidate: (() => void) | undefined;
    const candidateWait = new Promise<void>((resolve) => {
      releaseCandidate = resolve;
    });
    const first = setupEppoCredentials(
      {
        environment: "production",
        confirmEnvironment: "production",
        apply: true,
        credential: FIXTURE_CREDENTIAL,
      },
      {
        ...dependencies(target),
        verifyCandidate: async () => {
          await candidateWait;
          return apiReceipt();
        },
      },
    );

    await expect(
      setupEppoCredentials(
        {
          environment: "production",
          confirmEnvironment: "production",
          apply: true,
          credential: REPLACEMENT_CREDENTIAL,
        },
        dependencies(target),
      ),
    ).resolves.toEqual({ class: "credential_setup_already_running" });

    releaseCandidate?.();
    await expect(first).resolves.toMatchObject({ class: "completed" });
    expect(target.writes).toBe(1);
  });

  it("does not write when another process owns the Vercel target lock", async () => {
    const target = targetFixture();
    target.acquireTargetLock = async () => false;

    await expect(
      setupEppoCredentials(
        {
          environment: "production",
          confirmEnvironment: "production",
          apply: true,
          credential: FIXTURE_CREDENTIAL,
        },
        dependencies(target),
      ),
    ).resolves.toEqual({ class: "credential_setup_already_running" });
    expect(target.writes).toBe(0);
    expect(target.targetReleases).toBe(0);
  });
});
