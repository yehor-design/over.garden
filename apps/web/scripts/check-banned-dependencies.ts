/**
 * Banned-dependency gate (ADR-0022, D7).
 *
 * One small mechanical check replaces the retired canon checkers: it refuses
 * packages and browser APIs that would bring back an ORM, server image
 * processing, durable browser journal state, or speech recognition.
 *
 * Usage: `pnpm check:banned-dependencies` (also part of `pnpm test`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const BANNED_PACKAGES = [
  "dexie",
  "localforage",
  "sharp",
  "prisma",
  "@prisma/client",
  "drizzle-orm",
  "typeorm",
  "next-pwa",
  "@serwist/next",
] as const;

export const BANNED_PACKAGE_PREFIXES = ["workbox-"] as const;

export const BANNED_SOURCE_PATTERNS: ReadonlyArray<{
  id: string;
  pattern: RegExp;
}> = [
  { id: "speech_recognition", pattern: /\bwebkitSpeechRecognition\b|\bSpeechRecognition\b/ },
  { id: "service_worker_register", pattern: /serviceWorker\s*\.\s*register\s*\(/ },
  { id: "navigator_online", pattern: /navigator\s*\.\s*onLine\b/ },
  { id: "indexeddb", pattern: /\bindexedDB\b|\bIDBFactory\b/ },
  { id: "web_manifest", pattern: /manifest\.webmanifest/ },
  { id: "sharp_import", pattern: /from\s+["']sharp["']|require\(\s*["']sharp["']\s*\)/ },
];

/**
 * Residue that a later task of the same slice removes. Each entry is checked:
 * the gate passes while the path still contains a banned pattern, and fails
 * with `stale_allowlist` once the path is gone or clean, so the entry cannot
 * outlive the residue it excused.
 */
export const ALLOWED_RESIDUE: ReadonlyArray<{
  pathPrefix: string;
  owner: string;
}> = [
  { pathPrefix: "src/lib/retirement/", owner: "OVE-365" },
  { pathPrefix: "src/proxy.ts", owner: "OVE-365" },
];

const SCAN_DIRECTORIES = ["src", "scripts", "cloudflare/media-staging/src"] as const;
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_FILE_PATTERNS = [
  /\.test\.tsx?$/,
  /\.d\.ts$/,
  /^scripts\/check-banned-dependencies\.ts$/,
];

export interface BannedDependencyViolation {
  kind: "package" | "source" | "stale_allowlist";
  detail: string;
}

export interface BannedDependencyReport {
  violations: BannedDependencyViolation[];
  scannedFiles: number;
  excusedFiles: number;
}

export function scanPackageJson(
  packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
): BannedDependencyViolation[] {
  const names = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ];
  return names
    .filter(
      (name) =>
        (BANNED_PACKAGES as readonly string[]).includes(name) ||
        BANNED_PACKAGE_PREFIXES.some((prefix) => name.startsWith(prefix)),
    )
    .map((name) => ({ kind: "package" as const, detail: name }));
}

export function scanSource(source: string): string[] {
  return BANNED_SOURCE_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(
    ({ id }) => id,
  );
}

function walk(root: string, directory: string, out: string[]) {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      walk(root, absolute, out);
      continue;
    }
    const extension = entry.slice(entry.lastIndexOf("."));
    if (!SCAN_EXTENSIONS.has(extension)) continue;
    out.push(relative(root, absolute).split(sep).join("/"));
  }
}

export function runBannedDependencyGate(input: {
  rootDir: string;
  packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  allowedResidue?: ReadonlyArray<{ pathPrefix: string; owner: string }>;
}): BannedDependencyReport {
  const allowedResidue = input.allowedResidue ?? ALLOWED_RESIDUE;
  const violations: BannedDependencyViolation[] = scanPackageJson(input.packageJson);
  const files: string[] = [];
  for (const directory of SCAN_DIRECTORIES) {
    walk(input.rootDir, join(input.rootDir, directory), files);
  }
  const seenResidue = new Set<string>();
  let scannedFiles = 0;
  let excusedFiles = 0;
  for (const file of files) {
    if (SKIP_FILE_PATTERNS.some((pattern) => pattern.test(file))) continue;
    scannedFiles += 1;
    const residue = allowedResidue.find(({ pathPrefix }) => file.startsWith(pathPrefix));
    const hits = scanSource(readFileSync(join(input.rootDir, file), "utf8"));
    if (hits.length === 0) continue;
    if (residue) {
      seenResidue.add(residue.pathPrefix);
      excusedFiles += 1;
      continue;
    }
    for (const hit of hits) {
      violations.push({ kind: "source", detail: `${file}: ${hit}` });
    }
  }
  for (const residue of allowedResidue) {
    if (!seenResidue.has(residue.pathPrefix)) {
      violations.push({
        kind: "stale_allowlist",
        detail: `${residue.pathPrefix} (${residue.owner}) is gone or clean; remove it from ALLOWED_RESIDUE`,
      });
    }
  }
  return { violations, scannedFiles, excusedFiles };
}

function main() {
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const report = runBannedDependencyGate({ rootDir, packageJson });
  const summary = `banned-dependency gate: ${report.scannedFiles} files scanned, ${report.excusedFiles} excused as pending residue, ${report.violations.length} violations`;
  if (report.violations.length === 0) {
    console.log(summary);
    return;
  }
  console.error(summary);
  for (const violation of report.violations) {
    console.error(`  [${violation.kind}] ${violation.detail}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
