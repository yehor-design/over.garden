import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildRuntimeDocumentsFromHeartbeat,
  MATCHING_RUNTIME_REQUIRED_HANDLERS,
  parseMatchingRuntimeCapabilityArgs,
  runMatchingRuntimeCapabilitySmokeFromHeartbeat,
  type MatchingRuntimeHeartbeatReadback,
} from "@/lib/matching-runtime-proof";

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

function repoPath(relative: string): string {
  return path.join(REPO_ROOT, relative);
}

function repoFile(relative: string): string {
  const absolute = repoPath(relative);
  expect(existsSync(absolute)).toBe(true);
  return readFileSync(absolute, "utf8");
}

const expectedCommitSha = "a".repeat(40);
const expectedImageDigest = `sha256:${"b".repeat(64)}`;
const options = { expectedCommitSha, expectedImageDigest };

function readback(
  overrides: Partial<MatchingRuntimeHeartbeatReadback> = {},
): MatchingRuntimeHeartbeatReadback {
  return {
    heartbeat: {
      releaseCommitSha: expectedCommitSha,
      imageDigest: expectedImageDigest,
      schemaCompatibilityClass: "ove190.matching-schema.v1",
      supportedHandlers: [...MATCHING_RUNTIME_REQUIRED_HANDLERS],
      isFresh: true,
      drainClass: "converging",
    },
    jobQueue: { status: "available", depthClass: "low", lagClass: "fresh" },
    meilisearchStatus: "available",
    queueRecovery: {
      claimCompatible: "available",
      handlerCompatible: "available",
      unsupportedRetryingClass: "none",
      terminalCountClass: "empty",
      oldestDueAgeClass: "fresh",
    },
    ...overrides,
  };
}

describe("the retired application is gone", () => {
  it("deletes the FastAPI module and every route it served", () => {
    expect(existsSync(repoPath("services/matching/app/main.py"))).toBe(false);
  });

  it("removes the dependencies only that application needed", () => {
    const pyproject = repoFile("services/matching/pyproject.toml");
    expect(pyproject).not.toContain("fastapi");
    expect(pyproject).not.toContain("uvicorn");
    // The libraries the worker actually imports stay.
    for (const kept of ["rapidfuzz", "PyICU", "cyrtranslit", "psycopg"]) {
      expect(pyproject).toContain(kept);
    }
  });

  it("runs the worker rather than a server, and publishes no port", () => {
    const dockerfile = repoFile("services/matching/Dockerfile");
    expect(dockerfile).toContain('CMD ["python", "-m", "app.worker"]');
    expect(dockerfile).not.toContain("uvicorn");
    expect(dockerfile).not.toContain("EXPOSE");
  });

  it("stops defining the service in the release compose file", () => {
    const compose = repoFile(
      "infra/production-worker/docker-compose.release.yml",
    );
    expect(compose).not.toMatch(/^\s{2}matching-api:/mu);
    expect(compose).toContain("matching-worker:");
  });

  it("leaves no module importing the retired application", () => {
    // A deleted file with a live import is a broken build, not a retirement.
    const worker = repoFile("services/matching/app/worker.py");
    const runtime = repoFile("services/matching/app/runtime.py");
    const packageDoc = repoFile("services/matching/app/__init__.py");
    for (const source of [worker, runtime, packageDoc]) {
      expect(source).not.toContain("app.main");
    }
    expect(packageDoc).not.toContain("FastAPI");
  });
});

describe("the proof reads the heartbeat row instead", () => {
  it("refuses a base URL rather than ignoring it", () => {
    // A dead flag that parses would let a runbook keep naming a service that is
    // gone and believe it was checked.
    expect(() =>
      parseMatchingRuntimeCapabilityArgs([
        "--base-url",
        "https://matching.over.garden",
      ]),
    ).toThrowError(/--base-url is retired/u);
  });

  it("reports every class the endpoints reported, from Postgres alone", async () => {
    const evidence = await runMatchingRuntimeCapabilitySmokeFromHeartbeat(
      options,
      async () => readback(),
    );

    expect(evidence.release.commitSha).toBe(expectedCommitSha);
    expect(evidence.release.imageDigest).toBe(expectedImageDigest);
    expect(evidence.queue.supportedHandlers).toEqual([
      ...MATCHING_RUNTIME_REQUIRED_HANDLERS,
    ]);
    expect(evidence.readiness.status).toBe("ready");
    expect(evidence.leakCheck).toBe("passed");
  });

  it("drops the api dependency, because there is no api", () => {
    const documents = buildRuntimeDocumentsFromHeartbeat(readback(), options);
    const readiness = documents.readiness as {
      dependencies: Record<string, unknown>;
    };
    expect(Object.keys(readiness.dependencies).sort()).toEqual([
      "jobQueue",
      "meilisearch",
      "postgres",
      "queueRecovery",
      "worker",
    ]);
  });

  it("distinguishes a worker that never started from one that is missing", () => {
    // The retired endpoints were the only signal that answered before a first
    // run. Collapsing that into `missing` would lose the difference between
    // "no worker yet" and "a worker that should be here and is not".
    const documents = buildRuntimeDocumentsFromHeartbeat(
      readback({ heartbeat: null }),
      options,
    );
    const readiness = documents.readiness as {
      status: string;
      dependencies: { worker: { status: string; drainClass: string } };
    };
    expect(readiness.dependencies.worker.status).toBe("never_started");
    expect(readiness.dependencies.worker.drainClass).toBe("unknown");
    expect(readiness.status).toBe("degraded");
  });

  it("never reports a worker healthy on stale or mismatched evidence", () => {
    const cases: Array<[Partial<MatchingRuntimeHeartbeatReadback>, string]> = [
      [
        {
          heartbeat: { ...readback().heartbeat!, isFresh: false },
        },
        "stale",
      ],
      [
        {
          heartbeat: {
            ...readback().heartbeat!,
            imageDigest: `sha256:${"c".repeat(64)}`,
          },
        },
        "release_mismatch",
      ],
      [
        {
          heartbeat: {
            ...readback().heartbeat!,
            supportedHandlers: ["journal_entry_index"],
          },
        },
        "capability_mismatch",
      ],
    ];

    for (const [override, expected] of cases) {
      const documents = buildRuntimeDocumentsFromHeartbeat(
        readback(override),
        options,
      );
      const readiness = documents.readiness as {
        status: string;
        dependencies: { worker: { status: string } };
      };
      expect(readiness.dependencies.worker.status).toBe(expected);
      expect(readiness.status).toBe("degraded");
    }
  });

  it("carries a failing drain through on an otherwise healthy worker", () => {
    const documents = buildRuntimeDocumentsFromHeartbeat(
      readback({
        heartbeat: { ...readback().heartbeat!, drainClass: "failing" },
      }),
      options,
    );
    const readiness = documents.readiness as {
      dependencies: { worker: { status: string; drainClass: string } };
    };
    expect(readiness.dependencies.worker).toEqual({
      status: "available",
      drainClass: "failing",
    });
  });
});

describe("the teardown is not claimed", () => {
  it("records the live container, route, and DNS record as still pending", () => {
    // Phase B is a maintainer-approved provider effect and has not been
    // performed. The registry must not read as though it had.
    const registry = repoFile("docs/INFRASTRUCTURE_REGISTRY.md");
    expect(registry).toContain("Pending teardown obligation");
    expect(registry).toContain("has **not** been performed");
  });
});
