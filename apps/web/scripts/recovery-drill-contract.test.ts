import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireRecoveryLock,
  classifyProtectedIdentityTransition,
  pollUntil,
  RECOVERY_STATE_FILE,
  readSafeRecoveryDiagnostic,
  readRecoveryState,
  releaseRecoveryLock,
  requestRecoveryCancellation,
  writeRecoveryState,
  writeSecretFile,
  type RecoveryStateReceipt,
} from "../src/server/restore-readiness/runtime";

const RECEIPT: RecoveryStateReceipt = {
  issue: "OVE-230",
  generation: "generation-a",
  state: "planned",
  planDigest: "a".repeat(64),
  implementationSha: "b".repeat(40),
  targetNameClass: "overgarden-pitr-drill-20260728",
  pid: process.pid,
  updatedAtUtc: "2026-07-28T10:00:00.000Z",
  cancelRequested: false,
};

afterEach(async () => {
  await releaseRecoveryLock();
  await rm(RECOVERY_STATE_FILE, { force: true });
});

describe("OVE-230 recovery drill runtime", () => {
  it("is single-flight and state writes remain readable", async () => {
    await acquireRecoveryLock(RECEIPT);
    await expect(acquireRecoveryLock(RECEIPT)).rejects.toThrow(
      "already running",
    );
    await writeRecoveryState({ ...RECEIPT, state: "provider_source_bound" });
    expect((await readRecoveryState()).state).toBe("provider_source_bound");
  });

  it("classifies a provider absence poll timeout", async () => {
    await expect(
      pollUntil({
        read: async () => "still_present",
        done: (value) => value === "absent",
        timeoutMs: 5,
        intervalMs: 1,
        timeoutClass: "provider absence poll timeout",
      }),
    ).rejects.toThrow("provider absence poll timeout");
  });

  it("keeps restore status command and restore cancel command responsive", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{}, 1000)"], {
      stdio: "ignore",
    });
    await writeRecoveryState({ ...RECEIPT, pid: child.pid ?? 0 });
    const before = performance.now();
    expect((await readRecoveryState()).state).toBe("planned");
    const cancelled = await requestRecoveryCancellation();
    expect(cancelled.state).toBe("cancelled");
    expect(performance.now() - before).toBeLessThan(2_000);
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  });

  it("writes credentials only to a mode-0600 task file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ove230-secret-"));
    const file = path.join(directory, "secret.env");
    try {
      await writeSecretFile(file, "secret-value");
      expect(await readFile(file, "utf8")).toBe("secret-value");
      const { mode } = await import("node:fs/promises").then((fs) =>
        fs.stat(file),
      );
      expect(mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("extracts only the allowlisted recovery stage and error code", () => {
    expect(
      readSafeRecoveryDiagnostic(
        'ignored {"recoveryBootstrapStage":"application_schema","errorCode":"23514"}',
      ),
    ).toEqual({ stage: "application_schema", code: "23514" });
    expect(
      readSafeRecoveryDiagnostic(
        '{"recoveryBootstrapStage":"application-schema","errorCode":"secret value"}',
      ),
    ).toBeNull();
  });

  it("allows only additive plant identities before row-level classification", () => {
    const before = {
      authUsers: new Set(["user-a"]),
      journalEntries: new Set(["journal-a"]),
      mediaAssets: new Set(["media-a"]),
      plantObjects: new Set(["plant-a"]),
    };
    expect(
      classifyProtectedIdentityTransition(before, {
        ...before,
        plantObjects: new Set(["plant-a", "plant-backfill"]),
      }),
    ).toEqual(["plant-backfill"]);
    try {
      classifyProtectedIdentityTransition(before, {
        ...before,
        journalEntries: new Set(["journal-a", "journal-new"]),
      });
      throw new Error("expected journal identity drift refusal");
    } catch (error) {
      expect(error).toMatchObject({ code: "JOURNAL_DRIFT" });
    }
    try {
      classifyProtectedIdentityTransition(before, {
        ...before,
        plantObjects: new Set(["plant-replacement"]),
      });
      throw new Error("expected plant removal refusal");
    } catch (error) {
      expect(error).toMatchObject({ code: "PLANT_REMOVED" });
    }
  });
});
