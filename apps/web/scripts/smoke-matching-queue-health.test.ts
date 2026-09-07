import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONSUMED_FLAGS, capabilityArgv } from "./smoke-matching-queue-health";

/**
 * The deploy runbook's verification step is this command. It has to be able to
 * reach production.
 *
 * It could not: the script loaded `.env.local` and nothing else, so a run with
 * `--environment production` read the loopback heartbeat and reported the
 * handler set of a worker nobody deployed — a green line for a deploy that had
 * not happened, or a red one for a deploy that had. `--env-file` now names the
 * pulled environment and overrides, as it does in every other production
 * script here.
 */
describe("the queue health smoke's own flags", () => {
  it("hands the capability parser neither its flags nor their values", () => {
    const argv = [
      "--environment",
      "production",
      "--confirm-environment",
      "production",
      "--env-file",
      "/abs/path/prod.env",
      "--expected-commit",
      "1fa6ca8906db295797f6340993990c58f81ca277",
      "--expected-digest",
      "sha256:08b8828331715",
    ];

    // A value left behind is read as the next flag's: without dropping the
    // path, `--expected-commit` would have been handed `/abs/path/prod.env`.
    expect(capabilityArgv(argv)).toEqual([
      "--expected-commit",
      "1fa6ca8906db295797f6340993990c58f81ca277",
      "--expected-digest",
      "sha256:08b8828331715",
    ]);
  });

  it("consumes exactly the three flags it handles itself", () => {
    expect([...CONSUMED_FLAGS].sort()).toEqual([
      "--confirm-environment",
      "--env-file",
      "--environment",
    ]);
  });

  it("loads the named environment file over .env.local, not under it", async () => {
    const source = await readFile(
      join(import.meta.dirname, "smoke-matching-queue-health.ts"),
      "utf8",
    );
    // Falsify by dropping `override: true`: the loopback DATABASE_URL wins
    // again and the smoke silently reads the wrong database.
    expect(source).toMatch(/loadEnv\(\{ path: envFile, override: true \}\)/u);
    expect(source.indexOf('loadEnv({ path: ".env.local" })')).toBeLessThan(
      source.indexOf("override: true"),
    );
  });

  it("is named in the runbook with the flag that makes it work", async () => {
    const runbook = await readFile(
      join(import.meta.dirname, "..", "..", "..", "docs", "ORGANISM_GRAPH_EXECUTION.md"),
      "utf8",
    );
    const step = runbook.slice(
      runbook.indexOf("pnpm smoke:matching-queue-health"),
    );
    expect(step.slice(0, 400)).toContain("--env-file");
  });
});
