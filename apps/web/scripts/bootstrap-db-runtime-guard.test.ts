import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const bootstrap = readFileSync(join(scriptsRoot, "bootstrap-db.ts"), "utf8");

/**
 * `bootstrap-db.ts` is the only sanctioned way to apply versioned migrations to
 * a database, and it runs under plain Node rather than inside a Next bundle.
 *
 * It reaches `@/server/public-identity-integrity` through
 * `restore-readiness/checks`, and that module opens with `import "server-only"`
 * — a guard that throws outside a server bundle. When it was added, the script
 * stopped starting at all: it failed during module evaluation, before parsing a
 * single argument, so the failure looked nothing like a database problem.
 *
 * `neutralise-server-only` resolves the guard to an empty module exactly as
 * `vitest.config.ts` does for these suites. Its effect depends entirely on
 * running *first*: ES modules evaluate imports in source order, so an import
 * added above it — or a reordering by a formatter — silently restores the
 * crash.
 *
 * Asserting only that the import exists would not hold, because the failure
 * mode is ordering, not absence.
 */
describe("bootstrap-db runtime guard", () => {
  const lines = bootstrap.split("\n");
  const neutraliseAt = lines.findIndex((line) =>
    line.includes('import "./neutralise-server-only"'),
  );

  it("neutralises the server-only guard", () => {
    expect(neutraliseAt).toBeGreaterThanOrEqual(0);
  });

  it("does so before the first import that can reach a server module", () => {
    const firstServerImportAt = lines.findIndex(
      (line, index) =>
        index !== neutraliseAt &&
        /^import .*from "(\.\.\/src\/server\/|@\/server\/)/.test(line.trim()),
    );

    expect(firstServerImportAt).toBeGreaterThanOrEqual(0);
    // `findIndex` answers -1 for an absent import, and -1 precedes every real
    // line number. Comparing the two positions alone therefore passes when the
    // guard has been deleted outright — the very case this file exists to
    // catch. Pinning the lower bound first is what makes the comparison mean
    // anything.
    expect(neutraliseAt).toBeGreaterThanOrEqual(0);
    expect(neutraliseAt).toBeLessThan(firstServerImportAt);
  });

  it("keeps the guard module itself free of application imports", () => {
    const guard = readFileSync(
      join(scriptsRoot, "neutralise-server-only.ts"),
      "utf8",
    );

    // The guard runs before anything else; an application import inside it
    // would be evaluated before the guard had taken effect, which is the exact
    // situation it exists to prevent.
    expect(guard).not.toMatch(/from "(@\/|\.\.\/src\/)/);
  });
});
