/**
 * Every browser spec is run by something (`OVE-462`).
 *
 * A spec that no list names is a proof nobody runs, and it rots without saying
 * so. Found that way, in this repository: a spec asserting a panel deleted a
 * fortnight earlier; a spec seeding a column the schema no longer had; and on
 * 2026-09-20 five specs — the proofs of five finished redesign tasks — that had
 * never run in CI, behind which sat a footer assertion a merge had made false,
 * a catalogue that was not complete without its context rail, and `/journals`
 * scrolling sideways at 320 px in two of three languages, on production.
 *
 * The rule is mechanical:
 *
 * - every `tests/*.spec.ts` is in `BROWSER_GATE_SPECS`, or in
 *   `DEDICATED_BROWSER_SPECS` with the script that runs it and why it cannot
 *   share the gate's server — and that script exists and names it;
 * - neither list names a file that is not there, and no spec is in both;
 * - CI and `gates:browser` both go through `scripts/run-browser-gate.ts` and
 *   spell no list of their own, because two lists is how seven specs came to be
 *   in neither.
 *
 * Usage: `pnpm check:browser-specs`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BROWSER_GATE_SPECS,
  DEDICATED_BROWSER_SPECS,
} from "./browser-gate-specs";

export const SPEC_DIRECTORY = "tests";
export const CI_WORKFLOW = "../../.github/workflows/ci.yml";
export const LOCAL_GATE_SCRIPT = "gates:browser";
export const GATE_RUNNER = "scripts/run-browser-gate.ts";

export type BrowserSpecFailure =
  | { subject: string; reason: "unreferenced"; expected: string }
  | { subject: string; reason: "listed_but_missing"; expected: string }
  | { subject: string; reason: "listed_twice"; expected: string }
  | { subject: string; reason: "missing_dedicated_script"; expected: string }
  | { subject: string; reason: "runner_not_used"; expected: string }
  | { subject: string; reason: "second_list"; expected: string };

/** The spec files a text names, as `tests/<name>.spec.ts`. */
export function specsNamedIn(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/\btests\/([A-Za-z0-9._-]+\.spec\.ts)\b/gu)].map(
        (match) => match[1]!,
      ),
    ),
  ];
}

export function checkBrowserSpecs(input: {
  /** The `*.spec.ts` files that exist in `tests/`. */
  specs: readonly string[];
  gate: readonly string[];
  dedicated: Readonly<Record<string, { script: string; reason: string }>>;
  ciWorkflow: string;
  packageScripts: Readonly<Record<string, string>>;
}): BrowserSpecFailure[] {
  const failures: BrowserSpecFailure[] = [];
  const existing = new Set(input.specs);
  const gate = new Set(input.gate);

  for (const spec of input.specs) {
    const entry = input.dedicated[spec];
    if (gate.has(spec) && entry) {
      failures.push({
        subject: `tests/${spec}`,
        reason: "listed_twice",
        expected: `it runs in the gate now; remove its DEDICATED_BROWSER_SPECS entry`,
      });
      continue;
    }
    if (gate.has(spec)) continue;
    if (!entry) {
      failures.push({
        subject: `tests/${spec}`,
        reason: "unreferenced",
        expected: `add it to BROWSER_GATE_SPECS in scripts/browser-gate-specs.ts, or to DEDICATED_BROWSER_SPECS with the script that runs it and why it cannot share the gate's server`,
      });
      continue;
    }
    if (
      !specsNamedIn(input.packageScripts[entry.script] ?? "").includes(spec)
    ) {
      failures.push({
        subject: `tests/${spec}`,
        reason: "missing_dedicated_script",
        expected: `package.json script "${entry.script}" must exist and name it`,
      });
    }
  }

  for (const spec of [...input.gate, ...Object.keys(input.dedicated)]) {
    if (!existing.has(spec)) {
      failures.push({
        subject: `tests/${spec}`,
        reason: "listed_but_missing",
        expected: `a list names it and the file does not exist`,
      });
    }
  }

  const callers: Array<[string, string]> = [
    [".github/workflows/ci.yml", input.ciWorkflow],
    [
      `package.json "${LOCAL_GATE_SCRIPT}"`,
      input.packageScripts[LOCAL_GATE_SCRIPT] ?? "",
    ],
  ];
  for (const [subject, text] of callers) {
    if (!text.includes(GATE_RUNNER)) {
      failures.push({
        subject,
        reason: "runner_not_used",
        expected: `it must run the gate through ${GATE_RUNNER}`,
      });
    }
    const spelled = specsNamedIn(text).filter((spec) => gate.has(spec));
    if (spelled.length > 0) {
      failures.push({
        subject,
        reason: "second_list",
        expected: `it spells ${spelled.length} gate spec(s) itself (${spelled.slice(0, 3).join(", ")}…); the list lives in scripts/browser-gate-specs.ts and nowhere else`,
      });
    }
  }

  return failures;
}

export function runBrowserSpecGate(rootDir: string) {
  const specs = readdirSync(join(rootDir, SPEC_DIRECTORY))
    .filter((name) => name.endsWith(".spec.ts"))
    .sort();
  const packageJson = JSON.parse(
    readFileSync(join(rootDir, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  const failures = checkBrowserSpecs({
    specs,
    gate: BROWSER_GATE_SPECS,
    dedicated: DEDICATED_BROWSER_SPECS,
    ciWorkflow: readFileSync(join(rootDir, CI_WORKFLOW), "utf8"),
    packageScripts: packageJson.scripts ?? {},
  });
  return { specs, failures };
}

function main() {
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  const report = runBrowserSpecGate(rootDir);
  const summary = `browser-spec gate: ${report.specs.length} specs in ${SPEC_DIRECTORY}/, ${BROWSER_GATE_SPECS.length} in the gate, ${Object.keys(DEDICATED_BROWSER_SPECS).length} with a script of their own, ${report.failures.length} problem(s)`;
  if (report.failures.length === 0) {
    console.log(summary);
    return;
  }
  console.error(summary);
  for (const failure of report.failures) {
    console.error(`  ${failure.subject}  ${failure.expected}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
