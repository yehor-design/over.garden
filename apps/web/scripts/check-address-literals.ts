/**
 * No call site spells a public path (ADR-0029 D12).
 *
 * The literals come from the address manifest, so the rule cannot fall behind
 * the routes: adding a namespace adds its prefix here, and renaming one
 * renames it. `OVE-428` moves entries and object passports under `/@{handle}`
 * and `OVE-429` re-slugs the catalog; every hand-written `/journal/${slug}` is
 * a place those renames have to be remembered, and the reason to have a
 * builder at all is that nobody remembers all of them.
 *
 * ## The allowlist is empty and stays empty
 *
 * `KNOWN_LITERALS` held thirty-one entries for one commit — `OVE-425`, which
 * introduced the rule — and `OVE-426` emptied it. The script fails on a
 * literal in any file not listed there, and equally on a listed file that no
 * longer has one, because a stale allowlist is how a ratchet quietly stops
 * ratcheting.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { BANNED_ADDRESS_PATH_LITERALS } from "../src/lib/address/address-contract.generated";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Files that may spell a path because they are the definition of it: the
 * builders themselves, and the route policy tables the proxy matches on before
 * any builder exists.
 */
const DEFINITIONS = new Set([
  "src/lib/garden/public-paths.ts",
  "src/lib/address/address-manifest.ts",
  "src/lib/address/address-contract.generated.ts",
  // Decides which shapes a route family serves, so it names prefixes rather
  // than building addresses out of them.
  "src/lib/address/match-address-path.ts",
  "src/lib/public-listing-pagination.ts",
  "src/lib/interface-route-policy.ts",
  "src/lib/site-shell-navigation.ts",
]);

/**
 * Call sites allowed to spell a path. Empty, and it stays empty.
 *
 * It held thirty-one entries for exactly one commit — the one that introduced
 * the rule, where emptying it in the same change would have made a large
 * diff larger. `OVE-426` emptied it. An entry here now is a deliberate
 * exception and needs a reason beside it.
 */
const KNOWN_LITERALS: Readonly<Record<string, number>> = {};

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly literal: string;
  readonly builders: readonly string[];
}

/**
 * A path literal is a quoted or templated string that *starts* with the
 * prefix, or one that resumes with it after an interpolation — `/journal/x`
 * and `` `/${locale}/journal/${slug}` `` are both addresses. An import
 * specifier is neither, and neither is prose in a comment, so both are skipped
 * before the line is read at all.
 */
export function findAddressLiterals(
  relativePath: string,
  source: string,
): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split("\n");
  let inBlockComment = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (/^(import|export)\b.*\bfrom\b/u.test(trimmed)) return;
    if (/^\}\s*from\b/u.test(trimmed)) return;

    for (const banned of BANNED_ADDRESS_PATH_LITERALS) {
      const escaped = banned.literal.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const pattern = new RegExp(`["'\`}]${escaped}`, "u");
      if (!pattern.test(line)) continue;
      findings.push({
        file: relativePath,
        line: index + 1,
        literal: banned.literal,
        builders: banned.builders,
      });
    }
  });

  return findings;
}

/** Every `.ts`/`.tsx` under `src`, minus the tests, as repository paths. */
function listSourceFiles(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      listSourceFiles(absolute, out);
      continue;
    }
    if (!/\.tsx?$/u.test(entry) || /\.test\.tsx?$/u.test(entry)) continue;
    out.push(path.relative(WEB_ROOT, absolute).split(path.sep).join("/"));
  }
  return out;
}

function main() {
  const files = listSourceFiles(path.join(WEB_ROOT, "src")).sort();

  const byFile = new Map<string, Finding[]>();
  for (const file of files) {
    if (DEFINITIONS.has(file)) continue;
    const findings = findAddressLiterals(
      file,
      readFileSync(path.join(WEB_ROOT, file), "utf8"),
    );
    if (findings.length > 0) byFile.set(file, findings);
  }

  const unexpected: Finding[] = [];
  const overBudget: string[] = [];
  for (const [file, findings] of byFile) {
    const allowed = KNOWN_LITERALS[file];
    if (allowed === undefined) {
      unexpected.push(...findings);
      continue;
    }
    if (findings.length > allowed) {
      overBudget.push(
        `${file}: ${findings.length} path literals, ${allowed} on the ledger`,
      );
    }
  }

  const stale = Object.keys(KNOWN_LITERALS).filter(
    (file) => !byFile.has(file) || byFile.get(file)!.length < KNOWN_LITERALS[file]!,
  );

  const problems = [
    ...unexpected.map(
      (finding) =>
        `${finding.file}:${finding.line} spells ${finding.literal} — call ${finding.builders.join(" or ")} instead`,
    ),
    ...overBudget,
    ...stale.map(
      (file) =>
        `${file} is on the ledger with more literals than it now has — lower or remove its entry in scripts/check-address-literals.ts`,
    ),
  ];

  if (problems.length > 0) {
    console.error(
      `address literals: ${problems.length} problem(s)\n${problems
        .map((problem) => `  ${problem}`)
        .join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }

  const remaining = Object.values(KNOWN_LITERALS).reduce(
    (total, count) => total + count,
    0,
  );
  console.log(
    remaining === 0
      ? `address literals: none; ${files.length} files scanned`
      : `address literals: no new ones; ${remaining} still on the ledger`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
