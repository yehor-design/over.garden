import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const RETIRED_PATHS = [
  "apps/web/sql/0019_ove269_plantnet_identification.sql",
  "apps/web/scripts/benchmark-plantnet-species.ts",
  "apps/web/scripts/prove-plantnet-production.ts",
  "apps/web/src/lib/plantnet-species-proof.ts",
  "apps/web/src/lib/plantnet-species-proof.test.ts",
  "apps/web/src/server/plantnet-species-adapter.ts",
  "apps/web/src/server/plantnet-species-adapter.test.ts",
  "apps/web/src/server/plant-identification-repository.ts",
  "apps/web/src/server/plant-identification-repository.test.ts",
  "apps/web/src/server/plant-identification-schema.test.ts",
  "apps/web/src/app/api/garden/plant-identification/route.ts",
  "apps/web/src/app/api/garden/plant-identification/route.test.ts",
  "apps/web/src/app/api/garden/plant-identification/decision/route.ts",
  "apps/web/src/app/api/garden/plant-identification/decision/route.test.ts",
  "apps/web/src/components/garden/plant-identification-panel.tsx",
  "apps/web/src/components/garden/plant-identification-panel.test.tsx",
  "docs/PLANTNET_SPECIES_IDENTIFICATION.md",
] as const;

const PRESERVED_PATHS = [
  "apps/web/src/app/garden/objects/[objectId]/catalog-resolve-control.tsx",
  "apps/web/src/app/api/garden/catalog/typeahead/route.ts",
  "apps/web/src/server/catalog-repository.ts",
  "apps/web/src/server/journal-repository.ts",
  "apps/web/src/server/lineage-repository.ts",
] as const;

const ALLOWED_RETIREMENT_EVIDENCE_PATHS = new Set([
  "apps/web/scripts/verify-external-photo-identification-retirement.ts",
  "apps/web/scripts/verify-external-photo-identification-retirement.test.ts",
  "apps/web/scripts/retire-external-photo-identification-production.ts",
  "apps/web/scripts/retire-external-photo-identification-production.test.ts",
  "apps/web/sql/0037_ove351_retire_external_photo_identification.sql",
  "docs/product-research/BG_summaries_all.md",
  "docs/product-research/UA_summaries_all.md",
]);

const RETIRED_CONTENT_RULES = [
  {
    id: "provider_brand",
    pattern: /(?:pl@ntnet|plantnet|plant[ -]net)/i,
  },
  {
    id: "provider_environment",
    pattern: /PLANTNET_(?:API_KEY|SPECIES_IDENTIFICATION_ENABLED)/,
  },
  {
    id: "retired_route_or_owner",
    pattern:
      /(?:plant-identification|PlantIdentification|plant_identification_|plantnet-species)/,
  },
] as const;

const TEXT_FILE =
  /(?:\.(?:bash|c?js|conf|css|env|gql|graphql|html|ini|json|lock|md|mjs|properties|py|scss|sh|sql|svg|toml|ts|tsx|txt|xml|ya?ml|zsh)|\.env\.example)$/i;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
]);

export interface RetirementViolation {
  code:
    | "preserved_path_missing"
    | "retired_content_present"
    | "retired_path_present";
  path: string;
  rule?: string;
}

export interface RetirementScanReceipt {
  version: "ove351.externalPhotoIdentificationRetirementScan.v1";
  status: "retired" | "violations";
  scannedFileCount: number;
  preservedPaths: string[];
  violations: RetirementViolation[];
  inventoryDigest: string;
  durationMs: number;
}

export interface RetirementScanOptions {
  projectRoot: string;
  requirePreservedPaths?: boolean;
  signal?: AbortSignal;
}

export async function scanExternalPhotoIdentificationRetirement({
  projectRoot,
  requirePreservedPaths = true,
  signal,
}: RetirementScanOptions): Promise<RetirementScanReceipt> {
  const startedAt = performance.now();
  throwIfAborted(signal);
  const violations: RetirementViolation[] = [];

  for (const retiredPath of RETIRED_PATHS) {
    throwIfAborted(signal);
    if (await exists(path.join(projectRoot, retiredPath))) {
      violations.push({ code: "retired_path_present", path: retiredPath });
    }
  }

  const preservedPaths: string[] = [];
  if (requirePreservedPaths) {
    for (const preservedPath of PRESERVED_PATHS) {
      throwIfAborted(signal);
      if (await exists(path.join(projectRoot, preservedPath))) {
        preservedPaths.push(preservedPath);
      } else {
        violations.push({
          code: "preserved_path_missing",
          path: preservedPath,
        });
      }
    }
  }

  const files = await listWorkingTreeFiles(projectRoot, signal);
  let scannedFileCount = 0;
  for (const relativePath of files) {
    throwIfAborted(signal);
    if (
      !isTextSourcePath(relativePath) ||
      ALLOWED_RETIREMENT_EVIDENCE_PATHS.has(relativePath)
    ) {
      continue;
    }
    const absolutePath = path.join(projectRoot, relativePath);
    if (!(await exists(absolutePath))) continue;
    const source = await readFile(absolutePath, "utf8");
    scannedFileCount += 1;
    for (const rule of RETIRED_CONTENT_RULES) {
      if (rule.pattern.test(source)) {
        violations.push({
          code: "retired_content_present",
          path: relativePath,
          rule: rule.id,
        });
      }
    }
  }

  violations.sort((left, right) =>
    `${left.path}:${left.rule ?? ""}`.localeCompare(
      `${right.path}:${right.rule ?? ""}`,
      "en",
    ),
  );
  preservedPaths.sort((left, right) => left.localeCompare(right, "en"));
  const inventoryDigest = sha256(
    JSON.stringify({ preservedPaths, scannedFileCount, violations }),
  );
  return {
    version: "ove351.externalPhotoIdentificationRetirementScan.v1",
    status: violations.length === 0 ? "retired" : "violations",
    scannedFileCount,
    preservedPaths,
    violations,
    inventoryDigest,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

function isTextSourcePath(relativePath: string) {
  if (TEXT_FILE.test(relativePath)) return true;
  const baseName = path.basename(relativePath);
  return baseName.length > 0 && !baseName.includes(".");
}

export async function verifyExternalPhotoIdentificationRetirement(
  options: RetirementScanOptions,
) {
  return scanExternalPhotoIdentificationRetirement({
    ...options,
    requirePreservedPaths: true,
  });
}

async function listWorkingTreeFiles(projectRoot: string, signal?: AbortSignal) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      {
        cwd: projectRoot,
        encoding: "buffer",
        maxBuffer: 16 * 1024 * 1024,
        signal,
      },
    );
    return stdout
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch {
    if (signal?.aborted) throw abortError();
    return walkFiles(projectRoot, projectRoot, signal);
  }
}

async function walkFiles(
  projectRoot: string,
  directory: string,
  signal?: AbortSignal,
): Promise<string[]> {
  throwIfAborted(signal);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    throwIfAborted(signal);
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(projectRoot, absolutePath, signal)));
    } else if (entry.isFile()) {
      files.push(path.relative(projectRoot, absolutePath));
    }
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

async function exists(candidate: string) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function abortError() {
  return new DOMException("Retirement scan canceled", "AbortError");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const projectRoot = path.resolve(import.meta.dirname, "../../..");
  const receipt = await verifyExternalPhotoIdentificationRetirement({
    projectRoot,
    signal: AbortSignal.timeout(30_000),
  });
  console.log(JSON.stringify(receipt));
  if (receipt.status !== "retired") process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(
      JSON.stringify({
        version: "ove351.externalPhotoIdentificationRetirementScan.v1",
        status: "inconclusive",
        errorClass:
          error instanceof DOMException && error.name === "AbortError"
            ? "timeout_or_canceled"
            : "scan_failed",
      }),
    );
    process.exitCode = 1;
  });
}
