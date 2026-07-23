import { describe, expect, it, vi } from "vitest";

import {
  MATCHING_RUNTIME_REQUIRED_HANDLERS,
  assertNoForbiddenMatchingRuntimeEvidence,
  buildMatchingRuntimeCapabilityEvidence,
  parseMatchingRuntimeCapabilityArgs,
  runMatchingRuntimeCapabilitySmoke,
  validateMatchingRuntimeCapabilityOptions,
} from "./matching-runtime-proof";

const expectedCommitSha = "a".repeat(40);
const expectedImageDigest = `sha256:${"b".repeat(64)}`;

const options = {
  baseUrl: "https://matching.over.garden",
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
      buildTimestamp: "2026-07-18T08:30:00Z",
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
      api: { status: "available" },
      postgres: { status: "available" },
      jobQueue: {
        status: "available",
        depthClass: "low",
        lagClass: "fresh",
      },
      meilisearch: { status: "available" },
      worker: { status: "available" },
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

describe("matching runtime smoke options", () => {
  it("parses and validates an exact release target", () => {
    expect(
      validateMatchingRuntimeCapabilityOptions(
        parseMatchingRuntimeCapabilityArgs([
          "--base-url",
          "https://matching.over.garden/",
          "--expected-commit",
          expectedCommitSha,
          "--expected-digest",
          expectedImageDigest,
        ]),
      ),
    ).toEqual(options);
  });

  it("rejects ambiguous or unsafe targets and release identifiers", () => {
    expect(() =>
      validateMatchingRuntimeCapabilityOptions({
        ...options,
        baseUrl: "http://matching.over.garden",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      validateMatchingRuntimeCapabilityOptions({
        ...options,
        baseUrl: "https://matching.over.garden/health",
      }),
    ).toThrow(/origin root/);
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
          api: "available",
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
    readiness.release.buildTimestamp = "2026-07-18T08:31:00Z";
    expect(() =>
      buildMatchingRuntimeCapabilityEvidence({
        options,
        capabilities: runtimeIdentity(),
        readiness,
      }),
    ).toThrow(/releases differ/);
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
  it("requests only the capability and readiness endpoints and returns redacted proof", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const body = url.endsWith("/capabilities")
        ? runtimeIdentity()
        : readyResponse();
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    });

    const evidence = await runMatchingRuntimeCapabilitySmoke(
      options,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([input]) => String(input)).sort()).toEqual(
      [
        "https://matching.over.garden/capabilities",
        "https://matching.over.garden/ready",
      ],
    );
    expect(evidence.leakCheck).toBe("passed");
  });

  it("fails closed on non-JSON or non-ready responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/ready")) {
        return new Response("degraded", {
          status: 503,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response(JSON.stringify(runtimeIdentity()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      runMatchingRuntimeCapabilitySmoke(options, fetchImpl),
    ).rejects.toThrow(/ready is not ready/);
  });
});
