import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_NODE_ENGINE,
  REQUIRED_NODE_MAJOR,
  evaluateNodeRuntime,
  formatNodeRuntimeGuardResult,
  parseNodeMajor,
  readNodeRuntimeConfiguration,
  runNodeRuntimeGuard,
} from "./check-node-runtime";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

describe("check-node-runtime", () => {
  it("accepts the declared floor and reports only version/configuration data", () => {
    const result = evaluateNodeRuntime(`v${REQUIRED_NODE_MAJOR}.0.0`, {
      engine: REQUIRED_NODE_ENGINE,
      nvmrcMajor: REQUIRED_NODE_MAJOR,
      ciMajor: REQUIRED_NODE_MAJOR,
    });

    expect(result).toEqual({
      status: "supported",
      requiredMajor: REQUIRED_NODE_MAJOR,
      detectedVersion: `v${REQUIRED_NODE_MAJOR}.0.0`,
      reason: "supported",
      configurationIssues: [],
    });
    expect(JSON.parse(formatNodeRuntimeGuardResult(result))).toEqual({
      runtime: "node",
      requiredMajor: REQUIRED_NODE_MAJOR,
      detectedVersion: `v${REQUIRED_NODE_MAJOR}.0.0`,
      status: "supported",
      reason: "supported",
      configurationIssues: [],
    });
  });

  it("fails closed one major below the floor and on malformed versions", () => {
    const configuration = {
      engine: REQUIRED_NODE_ENGINE,
      nvmrcMajor: REQUIRED_NODE_MAJOR,
      ciMajor: REQUIRED_NODE_MAJOR,
    };

    expect(evaluateNodeRuntime("v21.99.99", configuration)).toMatchObject({
      status: "unsupported",
      reason: "below-floor",
    });
    expect(evaluateNodeRuntime("not-a-version", configuration)).toMatchObject({
      status: "unsupported",
      reason: "invalid-version",
    });
  });

  it("fails closed when any declaration diverges from the canonical floor", () => {
    const result = evaluateNodeRuntime("v24.0.0", {
      engine: REQUIRED_NODE_ENGINE,
      nvmrcMajor: REQUIRED_NODE_MAJOR - 1,
      ciMajor: REQUIRED_NODE_MAJOR + 1,
    });

    expect(result).toMatchObject({
      status: "unsupported",
      reason: "configuration-mismatch",
      configurationIssues: ["nvmrc", "ci-node-version"],
    });
  });

  it("keeps the package engine, version file, and CI runner on the same floor", () => {
    const configuration = readNodeRuntimeConfiguration(REPOSITORY_ROOT);
    const packageJson = JSON.parse(
      readFileSync(
        path.join(REPOSITORY_ROOT, "apps", "web", "package.json"),
        "utf8",
      ),
    ) as { scripts: Record<string, string> };

    expect(configuration).toEqual({
      engine: REQUIRED_NODE_ENGINE,
      nvmrcMajor: REQUIRED_NODE_MAJOR,
      ciMajor: REQUIRED_NODE_MAJOR,
    });
    expect(packageJson.scripts.prebuild).toMatch(
      /^pnpm run check:node-runtime && /,
    );
  });

  it("is idempotent and completes the local guard within two seconds", () => {
    const startedAt = performance.now();
    const first = runNodeRuntimeGuard({ repositoryRoot: REPOSITORY_ROOT });
    const second = runNodeRuntimeGuard({ repositoryRoot: REPOSITORY_ROOT });
    const elapsedMs = performance.now() - startedAt;

    expect(first).toEqual(second);
    expect(elapsedMs).toBeLessThanOrEqual(2_000);
  });

  it("parses the checked-in version form without accepting an ambiguous range", () => {
    expect(parseNodeMajor("22")).toBe(REQUIRED_NODE_MAJOR);
    expect(parseNodeMajor("v22.1.0")).toBe(REQUIRED_NODE_MAJOR);
    expect(parseNodeMajor(">=22")).toBeNull();
  });
});
