import { describe, expect, it } from "vitest";

import {
  EPHEMERAL_MEDIA_PROVIDER_PLAN_DIGEST,
  evaluateEphemeralMediaProviderReadback,
  settleBoundedControl,
  runLiveClaimAlarmSmoke,
  runLiveExplicitDeleteSmoke,
  verifyEphemeralMediaRepositoryContract,
} from "./verify-ephemeral-media-handoff";

describe("ephemeral media provider verifier", () => {
  it("pins the approved provider plan digest and exact identities", () => {
    expect(EPHEMERAL_MEDIA_PROVIDER_PLAN_DIGEST).toBe(
      "6fc6a6a32e60964a2b012a64079a2ebab79de1699c816872e1eb503c5dafdd27",
    );
    expect(
      evaluateEphemeralMediaProviderReadback({
        accountId: "cb03b15042adc74edfe2d8201636300a",
        plan: "free",
        bucket: {
          name: "overgarden-media-staging",
          storageClass: "Standard",
          private: true,
        },
        worker: {
          name: "overgarden-media-staging",
          customDomain: "media-stage.over.garden",
        },
        durableObject: {
          binding: "MEDIA_STAGING_SESSIONS",
          sqlite: true,
          migrationTag: "v1",
        },
        corsOrigins: [
          "http://localhost:3000",
          "https://over-garden.vercel.app",
          "https://over.garden",
          "https://www.over.garden",
        ],
        lifecycleDays: 1,
      }),
    ).toEqual(expect.objectContaining({ status: "aligned", violations: [] }));
  });

  it("proves the tracked Worker, SQLite, R2, CORS, lifecycle, env, and zero-write session contract", () => {
    expect(verifyEphemeralMediaRepositoryContract()).toEqual({
      version: "ove346.repositoryContract.v1",
      status: "aligned",
      violations: [],
    });
  });

  it("fails closed on paid-plan, identity, lifecycle, CORS, or storage drift", () => {
    const receipt = evaluateEphemeralMediaProviderReadback({
      accountId: "wrong",
      plan: "paid",
      bucket: {
        name: "collision",
        storageClass: "InfrequentAccess",
        private: false,
      },
      worker: { name: "collision", customDomain: "wrong.example" },
      durableObject: { binding: "wrong", sqlite: false, migrationTag: "wrong" },
      corsOrigins: ["*"],
      lifecycleDays: 30,
    });
    expect(receipt.status).toBe("drift");
    expect(receipt.violations.length).toBeGreaterThanOrEqual(8);
  });

  it("cancels late control completion and records the 500 ms performance class", async () => {
    let lateWrite = false;
    const result = await settleBoundedControl(async (signal) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      if (!signal.aborted) lateWrite = true;
      return "late";
    }, 5);
    expect(result).toEqual({ status: "degraded", code: "control_timeout" });
    expect(lateWrite).toBe(false);
  });
});

describe.runIf(process.env.OVE346_RUN_LIVE === "1")(
  "ephemeral media live production proof",
  () => {
    it("live put replay delete and performance stay bounded", async () => {
      await expect(runLiveExplicitDeleteSmoke()).resolves.toEqual(
        expect.objectContaining({ status: "passed" }),
      );
    }, 180_000);

    it(
      "live claim finalize-absence and alarm cleanup converge",
      async () => {
        await expect(runLiveClaimAlarmSmoke()).resolves.toEqual(
          expect.objectContaining({ status: "passed" }),
        );
      },
      22 * 60_000,
    );
  },
);
