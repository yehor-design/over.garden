/**
 * Gate 6 — every component in `components/ui/` has a test that asks for it the
 * way a reader does (DESIGN.md §4.2.7, §10).
 *
 * A sibling file called `*.test.tsx` is not the bar. The bar is a test that
 * queries by **role** and by **accessible name**, because that is the pair a
 * screen reader uses, and a component that cannot be found that way is a
 * component nobody can operate. A test file that renders and asserts a class
 * list satisfies neither.
 *
 * Built on `scripts/check-banned-dependencies.ts`: mechanical, in CI, in
 * `pnpm test`, and it prints the path and what was missing.
 *
 * Usage: `pnpm check:component-tests`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const COMPONENT_DIRECTORY = "src/components/ui";

/**
 * Modules in `ui/` that export no component. They still need a test — every
 * one of them has one — but a role query would have nothing to query.
 */
export const NON_COMPONENT_MODULES = ["screen-state.ts"] as const;

export type ComponentTestFailure =
  | { file: string; reason: "missing_test"; expected: string }
  | { file: string; reason: "no_role_query"; expected: string }
  | { file: string; reason: "no_accessible_name"; expected: string }
  | { file: string; reason: "stale_nameless_entry"; expected: string };

/**
 * Components with no accessible name to assert, and why. Each is checked both
 * ways: the entry excuses the missing assertion, and the gate fails with
 * `stale_nameless_entry` once the test does assert a name — so the list cannot
 * outlive its reason or become somewhere to put an awkward component.
 */
export const NAMELESS_COMPONENTS: Readonly<Record<string, string>> = {
  "badge.tsx": "a badge is its own text; it carries no accessible name",
  "callout.tsx":
    "an alert or status region takes its name from nothing — the message is its content",
  "separator.tsx": "a separator names nothing; it divides",
  "accordion.tsx":
    "a browser names the group from its <summary>; testing-library does not compute that, so the name is asserted through the summary",
};

const ROLE_QUERY = /\b(?:get|find|getAll|findAll|query|queryAll)ByRole\s*\(/u;
const ACCESSIBLE_NAME =
  /ByRole\s*\([^)]*\bname\s*:|ByLabelText\s*\(|toHaveAccessibleName/u;

export function checkComponentTestSource(
  file: string,
  testFile: string,
  source: string,
  options: { nameless?: string } = {},
): ComponentTestFailure[] {
  const failures: ComponentTestFailure[] = [];
  if (!ROLE_QUERY.test(source)) {
    failures.push({
      file,
      reason: "no_role_query",
      expected: `${testFile} must ask for the component the way a reader does — screen.getByRole("button", { name: "…" }) — or assert, with a role query, that it exposes no role`,
    });
    return failures;
  }
  const asserts = ACCESSIBLE_NAME.test(source);
  if (!asserts && !options.nameless) {
    failures.push({
      file,
      reason: "no_accessible_name",
      expected: `${testFile} queries by role but never by accessible name; add { name: … }, getByLabelText, or list the component in NAMELESS_COMPONENTS with its reason`,
    });
  }
  if (asserts && options.nameless) {
    failures.push({
      file,
      reason: "stale_nameless_entry",
      expected: `${testFile} does assert an accessible name now; remove its NAMELESS_COMPONENTS entry ("${options.nameless}")`,
    });
  }
  return failures;
}

export interface ComponentTestReport {
  failures: ComponentTestFailure[];
  checkedComponents: number;
}

export function runComponentTestGate(rootDir: string): ComponentTestReport {
  const directory = join(rootDir, COMPONENT_DIRECTORY);
  const entries = readdirSync(directory).filter(
    (name) =>
      /\.tsx?$/u.test(name) &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx"),
  );
  const failures: ComponentTestFailure[] = [];
  let checkedComponents = 0;
  for (const entry of entries) {
    const base = entry.replace(/\.tsx?$/u, "");
    const file = `${COMPONENT_DIRECTORY}/${entry}`;
    const testFile = [`${base}.test.tsx`, `${base}.test.ts`].find((name) =>
      existsInDirectory(directory, name),
    );
    if (!testFile) {
      failures.push({
        file,
        reason: "missing_test",
        expected: `${COMPONENT_DIRECTORY}/${base}.test.tsx must exist beside it`,
      });
      continue;
    }
    if ((NON_COMPONENT_MODULES as readonly string[]).includes(entry)) continue;
    checkedComponents += 1;
    failures.push(
      ...checkComponentTestSource(
        file,
        `${COMPONENT_DIRECTORY}/${testFile}`,
        readFileSync(join(directory, testFile), "utf8"),
        { nameless: NAMELESS_COMPONENTS[entry] },
      ),
    );
  }
  return { failures, checkedComponents };
}

function existsInDirectory(directory: string, name: string): boolean {
  try {
    readFileSync(join(directory, name), "utf8");
    return true;
  } catch {
    return false;
  }
}

function main() {
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  const report = runComponentTestGate(rootDir);
  const summary = `component-test gate: ${report.checkedComponents} components checked, ${report.failures.length} without a role-and-name test`;
  if (report.failures.length === 0) {
    console.log(summary);
    return;
  }
  console.error(summary);
  for (const failure of report.failures) {
    console.error(`  ${failure.file}  ${failure.expected}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
