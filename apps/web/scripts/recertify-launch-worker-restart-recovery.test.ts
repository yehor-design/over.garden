import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  OVE310_APPROVAL_DIGEST,
  OVE310_APPROVED_PLAN,
  OVE310_DIRECT_PROVIDER_TIMEOUT_MS,
  OVE310_JOURNAL_TASK_CONFIG,
  OVE310_RUNTIME_INSPECTION_SCRIPT,
  OVE310_WORKER_RESTART_SCRIPT,
  OVE310_WORKER_RECOVERY_TIMEOUT_MS,
  buildLaunchWorkerFailureReceipt,
  parseLaunchWorkerRecoveryCliArgs,
  parseRuntimeInspectionReadback,
  parseWorkerRestartReadback,
  runApprovedLaunchWorkerRecovery,
  settleLaunchWorkerRecoveryWithinDeadline,
  type LaunchWorkerRecoveryAdapter,
  type LaunchWorkerRecoveryBoundary,
  type LaunchWorkerRecoveryReceiptV1,
  type WorkerRestartVerification,
} from "./recertify-launch-worker-restart-recovery";
import {
  OVE306_JOURNAL_WORKER_TASK_CONFIG,
  type JournalWorkerCleanupReadback,
  type JournalWorkerVerification,
} from "./recertify-final-main-journal-worker";

const IMPLEMENTATION_SHA = "a".repeat(40);
const SAFE_BOUNDARY: LaunchWorkerRecoveryBoundary = {
  deploymentSha: IMPLEMENTATION_SHA,
  canaryCount: 0,
  ownerAccessClass: "task_owned_or_absent",
  evidenceClass: "closed_counts_and_booleans_only",
  workerCapabilityClass: "ready_exact_handlers",
  runtimeClass: "docker_compose_release",
  roleCount: 4,
  restartPolicyClass: "all_unless_stopped",
  runtimeHealthClass: "all_running_required_health_healthy",
  providerAttemptClass: "absent",
};
const SAFE_RESTART: WorkerRestartVerification = {
  restartCount: 1,
  targetClass: "matching_worker_only",
  workerRestartClass: "same_container_new_start",
  peerRolesClass: "unchanged",
  workerHealthClass: "healthy_after_restart",
  heartbeatClass: "fresh_exact_release",
};
const SAFE_JOURNAL: JournalWorkerVerification = {
  applyCount: 1,
  indexJobClass: "done_identifiers_only",
  publicDocumentClass: "public_safe_exact_shape",
  unindexJobClass: "done_identifiers_only",
  staleDocumentClass: "authoritative_absent",
  parityClass: "converged",
  responseClass: "http_410",
  tombstoneClass: "generic_content_free",
  robotsClass: "noindex_nofollow",
  publicEligibilityClass: "revoked",
  searchProjectionClass: "authoritative_absent",
  preciseLocationPresent: false,
  privateContentPresent: false,
  anotherOwnerEffects: 0,
};
const CLEAN: JournalWorkerCleanupReadback = {
  taskCanaryCount: 0,
  publicRoutePresent: false,
  searchDocumentPresent: false,
  anotherOwnerEffects: 0,
};

function options(mode: "plan" | "apply" = "apply") {
  return {
    mode,
    environment: "production" as const,
    implementationSha: IMPLEMENTATION_SHA,
    timeoutMs: OVE310_WORKER_RECOVERY_TIMEOUT_MS,
    ...(mode === "apply" ? { approvalDigest: OVE310_APPROVAL_DIGEST } : {}),
  };
}

function adapter(
  overrides: Partial<LaunchWorkerRecoveryAdapter> = {},
): LaunchWorkerRecoveryAdapter {
  let attempted = false;
  let saved: LaunchWorkerRecoveryReceiptV1 | null = null;
  return {
    acquireApplyLock: vi.fn(async () => "acquired" as const),
    releaseApplyLock: vi.fn(async () => undefined),
    readBoundary: vi.fn(async () => SAFE_BOUNDARY),
    readApplyAttempt: vi.fn(async () => attempted),
    claimApplyAttempt: vi.fn(async () => {
      if (attempted) return "already_claimed" as const;
      attempted = true;
      return "claimed" as const;
    }),
    restartWorker: vi.fn(async () => SAFE_RESTART),
    applyCanary: vi.fn(async () => SAFE_JOURNAL),
    cleanupCanary: vi.fn(async () => CLEAN),
    readReplayReceipt: vi.fn(async () => saved),
    writeReplayReceipt: vi.fn(async (receipt) => {
      saved = receipt;
    }),
    cancellationRequested: vi.fn(async () => false),
    ...overrides,
  };
}

describe("OVE-310 immutable plan and isolated task identity", () => {
  it("pins the exact approved effect and finite deadlines", () => {
    expect(
      createHash("sha256").update(OVE310_APPROVED_PLAN).digest("hex"),
    ).toBe(OVE310_APPROVAL_DIGEST);
    expect(OVE310_APPROVED_PLAN).toContain(
      "restart exactly the matching-worker container once",
    );
    expect(OVE310_APPROVED_PLAN).toContain("one-canary|cleanup-required");
    expect(OVE310_WORKER_RECOVERY_TIMEOUT_MS).toBe(180_000);
    expect(OVE310_DIRECT_PROVIDER_TIMEOUT_MS).toBe(30_000);
  });

  it("uses a task namespace, owner content, lock, and state prefix distinct from OVE-306", () => {
    expect(OVE310_JOURNAL_TASK_CONFIG.emailPrefix).toBe(
      "ove310-worker-recovery-",
    );
    expect(OVE310_JOURNAL_TASK_CONFIG).not.toEqual(
      OVE306_JOURNAL_WORKER_TASK_CONFIG,
    );
    expect(OVE310_JOURNAL_TASK_CONFIG.applyLockKey).not.toBe(
      OVE306_JOURNAL_WORKER_TASK_CONFIG.applyLockKey,
    );
    expect(OVE310_JOURNAL_TASK_CONFIG.statePrefix).not.toBe(
      OVE306_JOURNAL_WORKER_TASK_CONFIG.statePrefix,
    );
    expect(
      OVE310_JOURNAL_TASK_CONFIG.buildReplayNamespace(IMPLEMENTATION_SHA),
    ).not.toBe(
      OVE306_JOURNAL_WORKER_TASK_CONFIG.buildReplayNamespace(
        IMPLEMENTATION_SHA,
      ),
    );
  });
});

describe("OVE-310 plan and apply orchestration", () => {
  it("classifies the exact zero-canary production baseline without an effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedLaunchWorkerRecovery(
      options("plan"),
      proof,
    );

    expect(receipt).toMatchObject({
      environment: "production",
      implementationSha: IMPLEMENTATION_SHA,
      planDigest: OVE310_APPROVAL_DIGEST,
      authorizationDigest: OVE310_APPROVAL_DIGEST,
      canaryCountBefore: 0,
      applyCount: 0,
      resultClass: "zero_effect_plan",
      cleanupClass: "not_applicable",
      state: "code_deployed",
    });
    expect(proof.restartWorker).not.toHaveBeenCalled();
    expect(proof.applyCanary).not.toHaveBeenCalled();
    expect(proof.cleanupCanary).not.toHaveBeenCalled();
  });

  it.each([
    ["deployment", { deploymentSha: "f".repeat(40) }],
    ["canary count", { canaryCount: 1 }],
    ["owner", { ownerAccessClass: "another_owner" as const }],
    ["evidence", { evidenceClass: "unsafe" as const }],
    ["worker capability", { workerCapabilityClass: "unexpected" as const }],
    ["runtime", { runtimeClass: "unexpected" as const }],
    ["role count", { roleCount: 3 }],
    ["restart policy", { restartPolicyClass: "unexpected" as const }],
    ["runtime health", { runtimeHealthClass: "unexpected" as const }],
    ["provider attempt", { providerAttemptClass: "present" as const }],
  ])("refuses %s drift before restart or canary", async (_label, patch) => {
    const proof = adapter({
      readBoundary: vi.fn(async () => ({ ...SAFE_BOUNDARY, ...patch })),
    });

    const receipt = await runApprovedLaunchWorkerRecovery(options(), proof);

    expect(receipt).toMatchObject({
      resultClass: "refused",
      applyCount: 0,
      state: "failed",
    });
    expect(proof.restartWorker).not.toHaveBeenCalled();
    expect(proof.applyCanary).not.toHaveBeenCalled();
  });

  it("rejects approval drift before lock or effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedLaunchWorkerRecovery(
      { ...options(), approvalDigest: "f".repeat(64) },
      proof,
    );

    expect(receipt).toMatchObject({ resultClass: "refused", applyCount: 0 });
    expect(proof.acquireApplyLock).not.toHaveBeenCalled();
    expect(proof.restartWorker).not.toHaveBeenCalled();
  });

  it("orders one restart before one canary and proves cleanup twice", async () => {
    const order: string[] = [];
    const proof = adapter({
      acquireApplyLock: vi.fn(async () => {
        order.push("lock");
        return "acquired" as const;
      }),
      claimApplyAttempt: vi.fn(async () => {
        order.push("claim");
        return "claimed" as const;
      }),
      readBoundary: vi.fn(async () => {
        order.push("boundary");
        return SAFE_BOUNDARY;
      }),
      restartWorker: vi.fn(async () => {
        order.push("restart");
        return SAFE_RESTART;
      }),
      applyCanary: vi.fn(async () => {
        order.push("canary");
        return SAFE_JOURNAL;
      }),
      cleanupCanary: vi.fn(async () => {
        order.push("cleanup");
        return CLEAN;
      }),
      writeReplayReceipt: vi.fn(async () => {
        order.push("receipt");
      }),
      releaseApplyLock: vi.fn(async () => {
        order.push("unlock");
      }),
    });

    const receipt = await runApprovedLaunchWorkerRecovery(options(), proof);

    expect(receipt).toMatchObject({
      canaryCountBefore: 0,
      applyCount: 1,
      resultClass: "verified_worker_restart_recovery",
      cleanupClass: "authoritative_absent_twice",
      state: "cleaned",
    });
    expect(order).toEqual([
      "lock",
      "claim",
      "boundary",
      "restart",
      "canary",
      "cleanup",
      "cleanup",
      "receipt",
      "unlock",
    ]);
  });

  it.each([
    ["restart count", { restartCount: 0 }],
    ["target", { targetClass: "unexpected" as const }],
    ["worker transition", { workerRestartClass: "unexpected" as const }],
    ["peer roles", { peerRolesClass: "unexpected" as const }],
    ["worker health", { workerHealthClass: "unexpected" as const }],
    ["heartbeat", { heartbeatClass: "unexpected" as const }],
  ])(
    "fails closed after %s drift and never starts the canary",
    async (_label, patch) => {
      const proof = adapter({
        restartWorker: vi.fn(async () => ({ ...SAFE_RESTART, ...patch })),
      });

      const receipt = await runApprovedLaunchWorkerRecovery(options(), proof);

      expect(receipt).toMatchObject({
        applyCount: 1,
        resultClass: "failed",
        cleanupClass: "authoritative_absent_twice",
        state: "failed",
      });
      expect(proof.restartWorker).toHaveBeenCalledTimes(1);
      expect(proof.applyCanary).not.toHaveBeenCalled();
      expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
    },
  );

  it("fails closed after unsafe journal evidence and proves cleanup twice", async () => {
    const proof = adapter({
      applyCanary: vi.fn(async () => ({
        ...SAFE_JOURNAL,
        privateContentPresent: true,
      })),
    });

    const receipt = await runApprovedLaunchWorkerRecovery(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 1,
      resultClass: "failed",
      cleanupClass: "authoritative_absent_twice",
    });
    expect(proof.cleanupCanary).toHaveBeenCalledTimes(2);
  });

  it("returns a bounded loser without an effect when the apply lock is held", async () => {
    const proof = adapter({
      acquireApplyLock: vi.fn(async () => "contended" as const),
    });

    const receipt = await runApprovedLaunchWorkerRecovery(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 0,
      resultClass: "bounded_loser",
    });
    expect(proof.claimApplyAttempt).not.toHaveBeenCalled();
    expect(proof.restartWorker).not.toHaveBeenCalled();
  });

  it("returns already_cleaned on a completed replay without a second effect", async () => {
    const completed = await runApprovedLaunchWorkerRecovery(
      options(),
      adapter(),
    );
    const proof = adapter({
      readReplayReceipt: vi.fn(async () => completed),
    });

    const receipt = await runApprovedLaunchWorkerRecovery(options(), proof);

    expect(receipt).toMatchObject({
      applyCount: 0,
      resultClass: "already_cleaned",
      cleanupClass: "authoritative_absent_twice",
      state: "already_cleaned",
    });
    expect(proof.acquireApplyLock).not.toHaveBeenCalled();
    expect(proof.restartWorker).not.toHaveBeenCalled();
  });

  it("allows only one winner in a concurrent race", async () => {
    let locked = false;
    let effectCount = 0;
    const shared = {
      acquireApplyLock: vi.fn(async () => {
        if (locked) return "contended" as const;
        locked = true;
        return "acquired" as const;
      }),
      releaseApplyLock: vi.fn(async () => {
        locked = false;
      }),
      restartWorker: vi.fn(async () => {
        effectCount += 1;
        await Promise.resolve();
        return SAFE_RESTART;
      }),
    };
    const first = adapter(shared);
    const second = adapter(shared);

    const receipts = await Promise.all([
      runApprovedLaunchWorkerRecovery(options(), first),
      runApprovedLaunchWorkerRecovery(options(), second),
    ]);

    expect(receipts.map((receipt) => receipt.resultClass).sort()).toEqual([
      "bounded_loser",
      "verified_worker_restart_recovery",
    ]);
    expect(effectCount).toBe(1);
  });
});

describe("OVE-310 bounded failure, receipts, and CLI", () => {
  it("settles a worker restart timeout without accepting a late result", async () => {
    vi.useFakeTimers();
    let late = false;
    const settled = settleLaunchWorkerRecoveryWithinDeadline(async (signal) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      late = true;
      return "late";
    }, 25);
    const expectation = expect(settled).rejects.toThrow("exceeded 25ms");
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
    await vi.runAllTimersAsync();
    expect(late).toBe(true);
    vi.useRealTimers();
  });

  it("emits only the approved closed receipt fields and redacts unsafe errors", () => {
    const receipt = buildLaunchWorkerFailureReceipt({
      environment: "production",
      implementationSha: IMPLEMENTATION_SHA,
      canaryCountBefore: 1,
      applyCount: 1,
      resultClass: "failed",
      cleanupClass: "uncertain",
      durationMs: 19,
      unsafeError: new Error(
        "cookie=secret token=secret user@example.com /journal/private",
      ),
    });

    expect(Object.keys(receipt).sort()).toEqual(
      [
        "version",
        "environment",
        "implementationSha",
        "planDigest",
        "authorizationDigest",
        "canaryCountBefore",
        "applyCount",
        "resultClass",
        "cleanupClass",
        "durationMs",
        "state",
        "evidenceDigest",
      ].sort(),
    );
    expect(JSON.stringify(receipt)).not.toMatch(
      /cookie|token|user@example|\/journal\/private/i,
    );
  });

  it("parses only the exact production plan/apply/status/cancel/cleanup modes", () => {
    const base = [
      "--environment",
      "production",
      "--confirm-environment",
      "production",
      "--implementation-sha",
      IMPLEMENTATION_SHA,
    ];
    expect(parseLaunchWorkerRecoveryCliArgs([...base, "--plan"])).toMatchObject(
      {
        mode: "plan",
        timeoutMs: 180_000,
      },
    );
    expect(
      parseLaunchWorkerRecoveryCliArgs([
        ...base,
        "--apply",
        "--approval-digest",
        OVE310_APPROVAL_DIGEST,
      ]),
    ).toMatchObject({ mode: "apply", approvalDigest: OVE310_APPROVAL_DIGEST });
    for (const mode of ["--status", "--cancel", "--cleanup"] as const) {
      expect(parseLaunchWorkerRecoveryCliArgs([...base, mode]).mode).toBe(
        mode.slice(2),
      );
    }
    expect(() =>
      parseLaunchWorkerRecoveryCliArgs([
        ...base,
        "--apply",
        "--approval-digest",
        "f".repeat(64),
      ]),
    ).toThrow("does not match OVE-310");
    expect(() =>
      parseLaunchWorkerRecoveryCliArgs([...base, "--plan", "--apply"]),
    ).toThrow("exactly one");
  });

  it("accepts only closed runtime and restart provider readbacks", () => {
    expect(
      parseRuntimeInspectionReadback(
        JSON.stringify({
          schemaVersion: "ove310.runtime-inspection.v1",
          runtimeClass: "docker_compose_release",
          roleCount: 4,
          restartPolicyClass: "all_unless_stopped",
          runtimeHealthClass: "all_running_required_health_healthy",
          providerAttemptClass: "absent",
        }),
      ),
    ).toEqual({
      runtimeClass: "docker_compose_release",
      roleCount: 4,
      restartPolicyClass: "all_unless_stopped",
      runtimeHealthClass: "all_running_required_health_healthy",
      providerAttemptClass: "absent",
    });
    expect(
      parseRuntimeInspectionReadback(
        JSON.stringify({
          schemaVersion: "ove310.runtime-inspection.v1",
          runtimeClass: "docker_compose_release",
          roleCount: 4,
          restartPolicyClass: "all_unless_stopped",
          runtimeHealthClass: "all_running_required_health_healthy",
          providerAttemptClass: "present",
        }),
      ).providerAttemptClass,
    ).toBe("present");
    expect(
      parseWorkerRestartReadback(
        JSON.stringify({
          schemaVersion: "ove310.worker-restart.v1",
          restartCount: 1,
          targetClass: "matching_worker_only",
          workerRestartClass: "same_container_new_start",
          peerRolesClass: "unchanged",
          workerHealthClass: "healthy_after_restart",
        }),
      ),
    ).toMatchObject({ restartCount: 1, targetClass: "matching_worker_only" });
    for (const unsafe of [
      '{"schemaVersion":"ove310.runtime-inspection.v1","roleCount":4,"runtimeClass":"docker_compose_release","restartPolicyClass":"all_unless_stopped","runtimeHealthClass":"all_running_required_health_healthy","providerAttemptClass":"absent","containerId":"secret"}',
      '{"schemaVersion":"ove310.worker-restart.v1","restartCount":2,"targetClass":"matching_worker_only","workerRestartClass":"same_container_new_start","peerRolesClass":"unchanged","workerHealthClass":"healthy_after_restart"}',
      "provider warning\n{}",
    ]) {
      expect(() =>
        unsafe.includes("worker-restart")
          ? parseWorkerRestartReadback(unsafe)
          : parseRuntimeInspectionReadback(unsafe),
      ).toThrow();
    }
  });

  it("keeps the remote effect statically scoped to one no-deps matching-worker restart", () => {
    const source = readFileSync(
      new URL("./recertify-launch-worker-restart-recovery.ts", import.meta.url),
      "utf8",
    );
    expect(source.match(/restart --no-deps matching-worker/g)).toHaveLength(1);
    expect(source).not.toMatch(/docker compose[^\n]+(?:down|rm|stop|kill)/);
    expect(source).toContain("flock -n");
    expect(source).toContain("timeout 20s");
    expect(OVE310_WORKER_RESTART_SCRIPT).toContain("set -o noclobber");
    expect(OVE310_WORKER_RESTART_SCRIPT).toContain(OVE310_APPROVAL_DIGEST);
    expect(OVE310_WORKER_RESTART_SCRIPT).toContain(
      '"matching-api" || "$ROLE" == "matching-worker"',
    );
    expect(OVE310_RUNTIME_INSPECTION_SCRIPT).toContain("providerAttemptClass");
    expect(OVE310_WORKER_RESTART_SCRIPT).not.toMatch(
      /(?:rm|unlink).+ove310-worker-recovery/,
    );
  });

  it("keeps both remote scripts valid bash programs", () => {
    for (const script of [
      OVE310_RUNTIME_INSPECTION_SCRIPT,
      OVE310_WORKER_RESTART_SCRIPT,
    ]) {
      const syntax = spawnSync("bash", ["-n"], {
        input: script,
        encoding: "utf8",
      });
      expect(syntax.status).toBe(0);
      expect(syntax.stderr).toBe("");
    }
  });

  it("documents immutable authorization, exact order, single-use, and cleanup", () => {
    const runbook = readFileSync(
      new URL(
        "../../../docs/runbooks/OVE_310_LAUNCH_WORKER_RESTART_RECOVERY.md",
        import.meta.url,
      ),
      "utf8",
    );
    expect(runbook).toContain(OVE310_APPROVED_PLAN);
    expect(runbook).toContain(OVE310_APPROVAL_DIGEST);
    expect(runbook).toContain("never run a second apply");
    expect(runbook).toContain("restart --no-deps matching-worker");
    expect(runbook).toContain("authoritative absence twice");
  });
});
