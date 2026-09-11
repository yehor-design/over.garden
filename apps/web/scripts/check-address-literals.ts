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
 * ## The allowlist is a ledger, not an exemption
 *
 * `KNOWN_LITERALS` holds the call sites that already existed when the rule
 * landed. The gate is real from the first commit — a literal in a file that is
 * not on this list fails the build — and the list only shrinks. `OVE-426`
 * empties it. A file that stops spelling a path is removed from the list by
 * this script itself, which fails when an entry no longer matches anything:
 * a stale allowlist is the way a ratchet quietly stops ratcheting.
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
  "src/lib/interface-route-policy.ts",
  "src/lib/site-shell-navigation.ts",
]);

/**
 * The call sites that predate the rule. One line per file; the count is the
 * number of literals that file holds, so removing one of several still fails
 * until the ledger is updated.
 */
const KNOWN_LITERALS: Readonly<Record<string, number>> = {
  "src/app/(default)/account/communities/[slug]/actions.ts": 1,
  "src/app/(default)/account/communities/[slug]/page.tsx": 1,
  "src/app/(default)/communities/[slug]/page.tsx": 1,
  "src/app/[locale]/answers/[slug]/page.tsx": 1,
  "src/app/[locale]/communities/[slug]/actions.ts": 2,
  "src/app/[locale]/communities/[slug]/discussions/[contributionId]/page.tsx": 2,
  "src/app/[locale]/guides/[slug]/page.tsx": 1,
  "src/app/[locale]/knowledge/page.tsx": 1,
  "src/app/[locale]/topics/[slug]/page.tsx": 1,
  "src/app/api/media/[mediaAssetId]/focal/route.ts": 2,
  "src/app/catalog-owner-card-controls.tsx": 1,
  "src/app/engagement/public-engagement-panel.tsx": 1,
  "src/components/public/public-community.tsx": 4,
  "src/lib/public-catalog-lifecycle.ts": 1,
  "src/lib/public-community-lifecycle.ts": 1,
  "src/lib/public-journal-entry-lifecycle.ts": 1,
  "src/lib/public-object-passport-lifecycle.ts": 1,
  "src/lib/public-profile-lifecycle.ts": 1,
  "src/proxy.ts": 1,
  "src/server/engagement-repository.ts": 2,
  "src/server/public-catalog-address-repository.ts": 2,
  "src/server/public-knowledge-evidence-repository.ts": 1,
  "src/server/public-localized-content.ts": 1,
};

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
    `address literals: no new ones; ${remaining} on the ledger for OVE-426`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
