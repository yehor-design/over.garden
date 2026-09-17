/**
 * Gate 3 — a primitive never leaves `globals.css` (DESIGN.md §10, ADR-0031 D1).
 *
 * The token architecture has exactly two layers, and it only works while the
 * lower one is invisible: semantics can be re-pointed because nothing else
 * knows a primitive's name. One `--og-neutral-600` in a component makes the
 * whole system a suggestion.
 *
 * Built on `scripts/check-banned-dependencies.ts`: mechanical, in CI, in
 * `pnpm test`, and it prints the path, the line and the token it found — a
 * step that exits 1 with no output cost this repository days once.
 *
 * Usage: `pnpm check:design-tokens`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The one file the primitive layer lives in. */
export const TOKEN_SOURCE = "src/app/globals.css";

const SCAN_DIRECTORIES = ["src", "scripts", "tests"] as const;
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mjs"]);

/**
 * Files that name a primitive on purpose: `globals.test.ts` resolves every
 * semantic name to its primitive and measures the result, the screen-state
 * renderer checks the built stylesheet carries the layer at all, and the gate's
 * own falsification test spells the token it expects to be rejected.
 *
 * Each is listed by exact path rather than by a pattern, so a new file cannot
 * inherit the excuse — and an entry that stops naming a primitive fails the
 * gate as `stale allowance`, so the list cannot outlive its reasons.
 */
export const ALLOWED_PRIMITIVE_READERS = [
  "src/app/globals.test.ts",
  "scripts/render-screen-states.tsx",
  "scripts/check-design-tokens.ts",
  "scripts/check-design-gates.test.ts",
] as const;

const PRIMITIVE_PATTERN = /--og-[a-z0-9-]+/gu;

export interface DesignTokenViolation {
  file: string;
  line: number;
  token: string;
}

export function scanForPrimitives(
  file: string,
  source: string,
): DesignTokenViolation[] {
  const violations: DesignTokenViolation[] = [];
  source.split("\n").forEach((text, index) => {
    for (const match of text.matchAll(PRIMITIVE_PATTERN)) {
      violations.push({ file, line: index + 1, token: match[0] });
    }
  });
  return violations;
}

function walk(root: string, directory: string, out: string[]) {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      walk(root, absolute, out);
      continue;
    }
    const extension = entry.slice(entry.lastIndexOf("."));
    if (!SCAN_EXTENSIONS.has(extension)) continue;
    out.push(relative(root, absolute).split(sep).join("/"));
  }
}

export interface DesignTokenReport {
  violations: DesignTokenViolation[];
  scannedFiles: number;
}

export function runDesignTokenGate(rootDir: string): DesignTokenReport {
  const files: string[] = [];
  for (const directory of SCAN_DIRECTORIES) {
    walk(rootDir, join(rootDir, directory), files);
  }
  const allowed = new Set<string>([TOKEN_SOURCE, ...ALLOWED_PRIMITIVE_READERS]);
  const violations: DesignTokenViolation[] = [];
  const usedAllowance = new Set<string>();
  let scannedFiles = 0;
  for (const file of files) {
    const source = readFileSync(join(rootDir, file), "utf8");
    if (allowed.has(file)) {
      if (PRIMITIVE_PATTERN.test(source)) usedAllowance.add(file);
      PRIMITIVE_PATTERN.lastIndex = 0;
      continue;
    }
    scannedFiles += 1;
    violations.push(...scanForPrimitives(file, source));
  }
  // An allowance that no longer excuses anything is stale, and a list that can
  // grow but never shrink stops being a list of exceptions.
  for (const reader of ALLOWED_PRIMITIVE_READERS) {
    if (usedAllowance.has(reader)) continue;
    violations.push({
      file: reader,
      line: 0,
      token:
        "(stale allowance — this file names no primitive; remove it from ALLOWED_PRIMITIVE_READERS)",
    });
  }
  return { violations, scannedFiles };
}

function main() {
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  const report = runDesignTokenGate(rootDir);
  const summary = `design-token gate: ${report.scannedFiles} files scanned, ${report.violations.length} primitives outside ${TOKEN_SOURCE}`;
  if (report.violations.length === 0) {
    console.log(summary);
    return;
  }
  console.error(summary);
  for (const violation of report.violations) {
    console.error(
      `  ${violation.file}:${violation.line}  ${violation.token} — a primitive belongs to ${TOKEN_SOURCE}; use the semantic token that points at it (DESIGN.md §2.2)`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
