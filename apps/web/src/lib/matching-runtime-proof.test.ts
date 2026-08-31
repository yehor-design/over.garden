import { describe, expect, it } from "vitest";

import {
  MATCHING_RUNTIME_REQUIRED_HANDLERS,
  assertNoForbiddenMatchingRuntimeEvidence,
  buildMatchingRuntimeCapabilityEvidence,
  parseMatchingRuntimeCapabilityArgs,
  runMatchingRuntimeCapabilitySmokeFromHeartbeat,
  validateMatchingRuntimeCapabilityOptions,
} from "./matching-runtime-proof";

const expectedCommitSha = "a".repeat(40);
const expectedImageDigest = `sha256:${"b".repeat(64)}`;

const options = {
  expectedCommitSha,
  expectedImageDigest,
};

function runtimeIdentity() {
  return {
    schemaVersion: "ove194.matchingRuntime.v1",
    service: "overgarden-matching",
    status: "available",
    release: {
      commitSha: expectedCommitSha,
      imageDigest: expectedImageDigest,
      schemaCompatibilityClass: "ove190.matching-schema.v1",
    },
    queue: {
      name: "matching",
      supportedHandlers: [...MATCHING_RUNTIME_REQUIRED_HANDLERS],
    },
  };
}

function readyResponse() {
  return {
    ...runtimeIdentity(),
    status: "ready",
    dependencies: {
      postgres: { status: "available" },
      jobQueue: {
        status: "available",
        depthClass: "low",
        lagClass: "fresh",
      },
      meilisearch: { status: "available" },
      worker: { status: "available", drainClass: "converging" },
      queueRecovery: {
        claimCompatible: "available",
        handlerCompatible: "available",
        unsupportedRetryingClass: "none",
        terminalCountClass: "empty",
        oldestDueAgeClass: "fresh",
      },
    },
  };
}

function heartbeatReadback() {
  return {
    heartbeat: {
      releaseCommitSha: expectedCommitSha,
      imageDigest: expectedImageDigest,
      schemaCompatibilityClass: "ove190.matching-schema.v1",
      supportedHandlers: [...MATCHING_RUNTIME_REQUIRED_HANDLERS],
      isFresh: true,
      drainClass: "converging" as const,
    },
    jobQueue: {
      status: "available" as const,
      depthClass: "low" as const,
      lagClass: "fresh" as const,
    },
    meilisearchStatus: "available" as const,
    queueRecovery: {
      claimCompatible: "available" as const,
      handlerCompatible: "available" as const,
      unsupportedRetryingClass: "none" as const,
      terminalCountClass: "empty" as const,
      oldestDueAgeClass: "fresh" as const,
    },
  };
}

describe("matching runtime smoke options", () => {
  it("parses and validates an exact release target", () => {
    expect(
      validateMatchingRuntimeCapabilityOptions(
        parseMatchingRuntimeCapabilityArgs([
          "--expected-commit",
          expectedCommitSha,
          "--expected-digest",
          expectedImageDigest,
        ]),
      ),
    ).toEqual(options);
  });

  it("refuses a base URL instead of silently ignoring it", () => {
    // Accepting a dead flag would let an operator runbook keep naming a service
    // that no longer exists and believe it was checked.
    expect(() =>
      parseMatchingRuntimeCapabilityArgs([
        "--base-url",
        "https://matching.over.garden",
      ]),
    ).toThrow(/--base-url is retired/);
  });

  it("rejects unsafe release identifiers", () => {
    expect(() =>
      validateMatchingRuntimeCapabilityOptions({
        ...options,
        expectedCommitSha: expectedCommitSha.toUpperCase(),
      }),
    ).toThrow(/lowercase 40-character SHA/);
    expect(() =>
      validateMatchingRuntimeCapabilityOptions({
        ...options,
        expectedImageDigest: "sha256:latest",
      }),
    ).toThrow(/lowercase sha256 digest/);
    expect(() =>
      parseMatchingRuntimeCapabilityArgs(["--unexpected", "secret"]),
    ).toThrow(/Unsupported/);
  });
});

describe("matching runtime capability evidence", () => {
  it("accepts only the exact release, six handlers, and ready dependency set", () => {
    expect(
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: runtimeIdentity(),
        readiness: readyResponse(),
      }),
    ).toEqual({
      schemaVersion: "ove194.matchingRuntimeCapabilitySmoke.v1",
      issue: "OVE-194",
      evidenceClass: "matching-runtime-capability-smoke",
      release: runtimeIdentity().release,
      queue: runtimeIdentity().queue,
      readiness: {
        status: "ready",
        dependencies: {
          postgres: "available",
          jobQueue: "available",
          meilisearch: "available",
          worker: "available",
          queueRecovery: "available",
        },
        queueDepthClass: "low",
        queueLagClass: "fresh",
        unsupportedRetryingClass: "none",
        terminalCountClass: "empty",
      },
      leakCheck: "passed",
    });
  });

  it("fails closed on a wrong release or a mismatch between endpoints", () => {
    const wrongCommit = runtimeIdentity();
    wrongCommit.release.commitSha = "c".repeat(40);
    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: wrongCommit,
        readiness: readyResponse(),
      }),
    ).toThrow(/expected SHA/);

    const readiness = readyResponse();
    readiness.release.imageDigest = `sha256:${"c".repeat(64)}`;
    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: runtimeIdentity(),
        readiness,
      }),
    ).toThrow(/does not match the expected digest|releases differ/);
  });

  it("requires the exact sorted set of all six worker handlers", () => {
    const missingHandler = runtimeIdentity();
    missingHandler.queue.supportedHandlers.pop();
    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: missingHandler,
        readiness: readyResponse(),
      }),
    ).toThrow(/required set/);

    const reordered = runtimeIdentity();
    reordered.queue.supportedHandlers.reverse();
    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: reordered,
        readiness: readyResponse(),
      }),
    ).toThrow(/required set/);
  });

  it("rejects degraded, unavailable, and unbounded readiness states", () => {
    const degraded = readyResponse();
    degraded.status = "degraded";
    degraded.dependencies.worker.status = "stale";
    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: runtimeIdentity(),
        readiness: degraded,
      }),
    ).toThrow(/degraded/);

    const unbounded = readyResponse();
    unbounded.dependencies.jobQueue.lagClass = "86400-seconds";
    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: runtimeIdentity(),
        readiness: unbounded,
      }),
    ).toThrow(/lag class is not bounded/);
  });

  it("rejects unknown fields instead of allowing accidental evidence growth", () => {
    const capabilities = {
      ...runtimeIdentity(),
      region: "eu-central",
    };
    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities,
        readiness: readyResponse(),
      }),
    ).toThrow(/incompatible field set/);
  });
});

describe("matching runtime evidence privacy boundary", () => {
  it.each([
    { nested: { databaseUrl: "redacted" } },
    { nested: { error: "unavailable" } },
    { nested: { payload: { kind: "journal_entry_index" } } },
    { nested: { ownerUserId: "redacted" } },
    { nested: { arbitraryRecordId: "redacted" } },
    { nested: { host: "redacted" } },
  ])("rejects recursive poison keys", (poison) => {
    expect(() =>
      assertNoForbiddenMatchingRuntimeEvidence(poison, "test response"),
    ).toThrow(/forbidden key/);
  });

  it.each([
    "https://private.example.invalid/path",
    "postgresql://redacted",
    "owner@example.invalid",
    "10.0.0.42",
    "db.internal",
    "host=private-db.internal dbname=overgarden",
    "123e4567-e89b-12d3-a456-426614174000",
    "Traceback: private details",
  ])("rejects recursive poison values", (poison) => {
    expect(() =>
      assertNoForbiddenMatchingRuntimeEvidence(
        { safe: ["available", { nested: poison }] },
        "test response",
      ),
    ).toThrow(/forbidden value/);
  });
});

describe("matching runtime HTTP smoke", () => {
  it("builds redacted proof from the heartbeat row without any HTTP call", async () => {
    const evidence = await runMatchingRuntimeCapabilitySmokeFromHeartbeat(
      options,
      async () => heartbeatReadback(),
    );

    expect(evidence.leakCheck).toBe("passed");
    expect(evidence.release.commitSha).toBe(expectedCommitSha);
    expect(evidence.readiness.dependencies).not.toHaveProperty("api");
  });

  it("reports a worker that has never written a heartbeat as never started", async () => {
    // The retired endpoints were the only signal that answered before a first
    // run. Collapsing that into `missing` would lose the distinction between
    // "no worker yet" and "a worker that should be here and is not".
    await expect(
      runMatchingRuntimeCapabilitySmokeFromHeartbeat(options, async () => ({
        ...heartbeatReadback(),
        heartbeat: null,
      })),
    ).rejects.toThrow(/dependency is unavailable|degraded/);

    const { buildRuntimeDocumentsFromHeartbeat } = await import(
      "./matching-runtime-proof"
    );
    const documents = buildRuntimeDocumentsFromHeartbeat(
      { ...heartbeatReadback(), heartbeat: null },
      options,
    );
    const readiness = documents.readiness as {
      dependencies: { worker: { status: string; drainClass: string } };
    };
    expect(readiness.dependencies.worker.status).toBe("never_started");
    expect(readiness.dependencies.worker.drainClass).toBe("unknown");
  });

  it("fails closed on a stale heartbeat rather than reporting ready", async () => {
    await expect(
      runMatchingRuntimeCapabilitySmokeFromHeartbeat(options, async () => {
        const readback = heartbeatReadback();
        return {
          ...readback,
          heartbeat: { ...readback.heartbeat!, isFresh: false },
        };
      }),
    ).rejects.toThrow(/dependency is unavailable|degraded/);
  });
});

describe("worker drain class", () => {
  it("refuses a readiness payload that omits the drain class", () => {
    // An absent field would read as healthy, and the whole reason the field
    // exists is that silence used to be indistinguishable from a drain failing
    // on every attempt.
    const readiness = readyResponse();
    delete (readiness.dependencies.worker as Record<string, unknown>).drainClass;

    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: runtimeIdentity(),
        readiness,
      }),
    ).toThrow(/incompatible field set/);
  });

  it("refuses a drain class outside the closed set", () => {
    const readiness = readyResponse();
    (readiness.dependencies.worker as Record<string, unknown>).drainClass =
      "available";

    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: runtimeIdentity(),
        readiness,
      }),
    ).toThrow(/drain class is not bounded/);
  });

  it("carries a failing drain through on an otherwise available worker", () => {
    // This is the case the column exists for: everything green except the one
    // thing that converges erasure and revocation.
    const readiness = readyResponse();
    (readiness.dependencies.worker as Record<string, unknown>).drainClass =
      "failing";

    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: runtimeIdentity(),
        readiness,
      }),
    ).not.toThrow();
  });
});
