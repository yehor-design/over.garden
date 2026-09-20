import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  checkBrowserSpecs,
  runBrowserSpecGate,
  specsNamedIn,
} from "./check-browser-specs";

const RUNNER = "pnpm exec tsx scripts/run-browser-gate.ts";

function check(overrides: Partial<Parameters<typeof checkBrowserSpecs>[0]>) {
  return checkBrowserSpecs({
    specs: ["a.spec.ts", "b.spec.ts"],
    gate: ["a.spec.ts", "b.spec.ts"],
    dedicated: {},
    ciWorkflow: `run: ${RUNNER} --shard=1/2`,
    packageScripts: { "gates:browser": `pnpm build && ${RUNNER}` },
    ...overrides,
  });
}

describe("every browser spec is run by something (OVE-462)", () => {
  it("passes on this repository", () => {
    const report = runBrowserSpecGate(
      fileURLToPath(new URL("..", import.meta.url)),
    );
    expect(report.failures).toEqual([]);
    // The check read a real directory: a gate that lists nothing passes too.
    expect(report.specs.length).toBeGreaterThan(20);
  });

  it("fails on a spec that nothing runs", () => {
    // Seen red: the state seven specs were in on 2026-09-20.
    const failures = check({
      specs: ["a.spec.ts", "b.spec.ts", "site-shell.spec.ts"],
    });
    expect(failures).toEqual([
      expect.objectContaining({
        subject: "tests/site-shell.spec.ts",
        reason: "unreferenced",
      }),
    ]);
  });

  it("accepts a spec with a script of its own, and holds the script to it", () => {
    const dedicated = {
      "linking.spec.ts": { script: "test:linking", reason: "its own server" },
    };
    const specs = ["a.spec.ts", "b.spec.ts", "linking.spec.ts"];
    expect(
      check({
        specs,
        dedicated,
        packageScripts: {
          "gates:browser": `pnpm build && ${RUNNER}`,
          "test:linking": "playwright test tests/linking.spec.ts",
        },
      }),
    ).toEqual([]);
    // The script was renamed, or stopped naming the spec.
    expect(check({ specs, dedicated })).toEqual([
      expect.objectContaining({
        subject: "tests/linking.spec.ts",
        reason: "missing_dedicated_script",
      }),
    ]);
  });

  it("fails on an entry that outlived its reason, or its file", () => {
    expect(
      check({
        dedicated: { "a.spec.ts": { script: "test:a", reason: "was special" } },
      }),
    ).toEqual([
      expect.objectContaining({
        subject: "tests/a.spec.ts",
        reason: "listed_twice",
      }),
    ]);
    expect(check({ gate: ["a.spec.ts", "b.spec.ts", "gone.spec.ts"] })).toEqual([
      expect.objectContaining({
        subject: "tests/gone.spec.ts",
        reason: "listed_but_missing",
      }),
    ]);
  });

  it("fails when CI or the local gate stops going through the one runner", () => {
    const failures = check({
      ciWorkflow:
        "run: pnpm exec playwright test tests/a.spec.ts tests/b.spec.ts",
    });
    expect(failures.map((failure) => failure.reason)).toEqual([
      "runner_not_used",
      "second_list",
    ]);
    expect(
      check({
        packageScripts: { "gates:browser": "playwright test tests/a.spec.ts" },
      }).map((failure) => failure.reason),
    ).toEqual(["runner_not_used", "second_list"]);
  });

  it("reads spec names out of a command line", () => {
    expect(
      specsNamedIn(
        "playwright test tests/a.spec.ts tests/journal-entry.spec.ts tests/a.spec.ts",
      ),
    ).toEqual(["a.spec.ts", "journal-entry.spec.ts"]);
  });
});
