import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RETIRED_ENGINE_REFERENCE =
  /(?:@editorjs\/|EditorJS|Editor\.js|editor\.js|\.ce-[a-z0-9_-]+|codex-editor|blocks\.move|journal-document-editor-adapter|journal-block-reorder-controller|overgarden-image-tool)/;

const FORBIDDEN_LEXICAL_ACTIVATION =
  /(?:@lexical\/(?:yjs|table|code|markdown|hashtag|dragon|devtools)|Lexical(?:Collaboration|Table|Code|Markdown|Hashtag|Dragon|DraggableBlock|TreeView|Devtools))/;

export const EXACT_LEXICAL_VERSION = "0.49.0";

export const EXACT_LEXICAL_DIRECT_PACKAGES = [
  "lexical",
  "@lexical/react",
  "@lexical/extension",
  "@lexical/rich-text",
  "@lexical/list",
  "@lexical/link",
  "@lexical/history",
  "@lexical/selection",
  "@lexical/utils",
  "@lexical/a11y",
  "@lexical/clipboard",
  "@lexical/html",
] as const;

export const RETIRED_FILE_PATHS = [
  "apps/web/src/lib/garden/journal-document-editor-adapter.ts",
  "apps/web/src/components/garden/overgarden-image-tool.ts",
  "apps/web/src/components/garden/journal-block-reorder-controller.ts",
  "apps/web/src/components/garden/journal-block-reorder.ts",
  "apps/web/src/components/garden/journal-block-reorder.test.tsx",
] as const;

/** Exact repository paths whose matching lines are immutable migration history. */
export const HISTORICAL_REFERENCE_ALLOWLIST = {
  "docs/LEXICAL_STRUCTURED_JOURNAL_EDITOR_AUDIT.md": "OVE-317 baseline audit",
  "docs/LOCALIZATION_COVERAGE_BASELINE_2026-07-14.md":
    "dated localization baseline",
  "docs/MVP_SCOPE_RECHECK_2026-07-03.md": "dated MVP scope decision",
  "docs/adr/ADR-0015-lexical-structured-journal-editor.md":
    "superseding architecture decision",
  "docs/linear/ove-317-lexical-structured-journal.md":
    "validated OVE-317 execution contract",
  "docs/mainline-closeout-ledger.json": "immutable completed-issue receipts",
  "docs/product-research/OverGarden_MVP_PRD_v0.md":
    "dated product-research provenance",
  "docs/product-research/OverGarden_PAGE_ARCHITECTURE_v1.md":
    "dated product-research provenance",
  "docs/product-research/OverGarden_PAGE_ARCH_DECISIONS_v0.md":
    "dated product-research provenance",
} as const;

export interface TextFile {
  relativePath: string;
  content: string;
}

export interface RetirementInventory {
  activeReferences: Array<{
    relativePath: string;
    line: number;
    value: string;
  }>;
  historicalReferences: Array<{
    relativePath: string;
    line: number;
    classification: string;
  }>;
  staleHistoricalPaths: string[];
}

export function inventoryRetiredEngineReferences(
  files: readonly TextFile[],
): RetirementInventory {
  const activeReferences: RetirementInventory["activeReferences"] = [];
  const historicalReferences: RetirementInventory["historicalReferences"] = [];
  const seenHistoricalPaths = new Set<string>();

  for (const file of files) {
    for (const [index, line] of file.content.split(/\r?\n/).entries()) {
      if (!RETIRED_ENGINE_REFERENCE.test(line)) continue;

      const classification = classifyHistoricalLine(file.relativePath, line);
      if (classification) {
        seenHistoricalPaths.add(file.relativePath);
        historicalReferences.push({
          relativePath: file.relativePath,
          line: index + 1,
          classification,
        });
      } else {
        activeReferences.push({
          relativePath: file.relativePath,
          line: index + 1,
          value: line.trim().slice(0, 160),
        });
      }
    }
  }

  return {
    activeReferences,
    historicalReferences,
    staleHistoricalPaths: Object.keys(HISTORICAL_REFERENCE_ALLOWLIST).filter(
      (relativePath) => !seenHistoricalPaths.has(relativePath),
    ),
  };
}

export function validateLexicalPackageContract(
  dependencies: Record<string, string> | undefined,
  lockfile: string,
): string[] {
  const errors: string[] = [];
  const direct = dependencies ?? {};

  for (const packageName of EXACT_LEXICAL_DIRECT_PACKAGES) {
    if (direct[packageName] !== EXACT_LEXICAL_VERSION) {
      errors.push(
        `${packageName} must be pinned exactly to ${EXACT_LEXICAL_VERSION}.`,
      );
    }
  }

  const unexpectedDirect = Object.keys(direct).filter(
    (packageName) =>
      (packageName === "lexical" || packageName.startsWith("@lexical/")) &&
      !EXACT_LEXICAL_DIRECT_PACKAGES.includes(
        packageName as (typeof EXACT_LEXICAL_DIRECT_PACKAGES)[number],
      ),
  );
  if (unexpectedDirect.length > 0) {
    errors.push(
      `Unexpected direct Lexical packages: ${unexpectedDirect.join(", ")}.`,
    );
  }

  const resolvedVersions = new Set<string>();
  for (const match of lockfile.matchAll(
    /^\s{2}['"]?(?:@lexical\/[a-z0-9-]+|lexical)@(\d+\.\d+\.\d+)/gim,
  )) {
    resolvedVersions.add(match[1]);
  }
  if (
    resolvedVersions.size !== 1 ||
    !resolvedVersions.has(EXACT_LEXICAL_VERSION)
  ) {
    errors.push(
      `Resolved Lexical versions must equal only ${EXACT_LEXICAL_VERSION}; found ${
        [...resolvedVersions].join(", ") || "none"
      }.`,
    );
  }

  if (/@editorjs\//.test(lockfile)) {
    errors.push("The lockfile still contains a retired editor package.");
  }

  return errors;
}

export function findForbiddenLexicalActivations(files: readonly TextFile[]) {
  return files.flatMap((file) =>
    file.content
      .split(/\r?\n/)
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => FORBIDDEN_LEXICAL_ACTIVATION.test(line))
      .map(({ line, index }) => ({
        relativePath: file.relativePath,
        line: index + 1,
        value: line.trim().slice(0, 160),
      })),
  );
}

export function findRetiredBundleReferences(files: readonly TextFile[]) {
  return files
    .filter((file) => RETIRED_ENGINE_REFERENCE.test(file.content))
    .map((file) => file.relativePath);
}

function classifyHistoricalLine(
  relativePath: string,
  line: string,
): string | null {
  const classification = (
    HISTORICAL_REFERENCE_ALLOWLIST as Record<string, string>
  )[relativePath];
  if (classification) return classification;

  if (
    relativePath === "docs/MAINLINE_CLOSEOUT.md" &&
    (/\[OVE-202\]/.test(line) || /\[OVE-206\]/.test(line))
  ) {
    return "immutable OVE-202 or OVE-206 mainline receipt";
  }

  return null;
}

function listTextFiles(
  root: string,
  relativePaths: readonly string[],
): TextFile[] {
  return relativePaths.flatMap((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath)) return [];
    if (statSync(absolutePath).isDirectory()) {
      return walkTextFiles(root, absolutePath);
    }
    return [{ relativePath, content: readFileSync(absolutePath, "utf8") }];
  });
}

function walkTextFiles(root: string, directory: string): TextFile[] {
  const files: TextFile[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next"].includes(entry.name)) continue;
      files.push(...walkTextFiles(root, absolutePath));
      continue;
    }
    if (!/\.(?:css|js|json|md|mjs|ts|tsx|yaml|yml)$/.test(entry.name)) continue;
    const relativePath = path.relative(root, absolutePath);
    if (
      relativePath === "apps/web/scripts/verify-editorjs-retirement.ts" ||
      relativePath === "apps/web/scripts/verify-editorjs-retirement.test.ts"
    ) {
      continue;
    }
    files.push({ relativePath, content: readFileSync(absolutePath, "utf8") });
  }
  return files;
}

function findMaximumMtime(
  root: string,
  relativePaths: readonly string[],
): number {
  let maximum = 0;
  const visit = (absolutePath: string) => {
    if (!existsSync(absolutePath)) return;
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
        if (["node_modules", ".next"].includes(entry.name)) continue;
        visit(path.join(absolutePath, entry.name));
      }
      return;
    }
    maximum = Math.max(maximum, stat.mtimeMs);
  };
  for (const relativePath of relativePaths)
    visit(path.join(root, relativePath));
  return maximum;
}

function verifyProductionBundle(webRoot: string, repositoryMtime: number) {
  const buildIdPath = path.join(webRoot, ".next/BUILD_ID");
  if (!existsSync(buildIdPath)) {
    throw new Error(
      "A production .next build is required for retirement proof.",
    );
  }
  if (statSync(buildIdPath).mtimeMs < repositoryMtime) {
    throw new Error(
      "The production .next build predates the inspected source.",
    );
  }

  const chunkRoot = path.join(webRoot, ".next/static/chunks");
  const chunks = walkTextFiles(webRoot, chunkRoot).filter(({ relativePath }) =>
    relativePath.endsWith(".js"),
  );
  const retiredChunks = findRetiredBundleReferences(chunks);
  if (retiredChunks.length > 0) {
    throw new Error(
      `Retired runtime residue in chunks: ${retiredChunks.join(", ")}`,
    );
  }

  const lexicalChunks = chunks.filter(({ content }) =>
    /(?:OverGardenJournal|OVERGARDEN_MOVE_JOURNAL_BLOCK_COMMAND|LexicalEditor)/.test(
      content,
    ),
  );
  if (lexicalChunks.length === 0) {
    throw new Error(
      "No production authoring chunk contains the Lexical runtime.",
    );
  }

  const lexicalChunkNames = lexicalChunks.map(({ relativePath }) =>
    path.basename(relativePath),
  );
  const publicManifestSuffixes = [
    "server/app/journal/[slug]/page_client-reference-manifest.js",
    "server/app/[locale]/journal/[slug]/page_client-reference-manifest.js",
    "server/app/journals/page_client-reference-manifest.js",
    "server/app/[locale]/journals/page_client-reference-manifest.js",
    "server/app/garden/objects/[objectId]/page_client-reference-manifest.js",
  ];

  for (const suffix of publicManifestSuffixes) {
    const manifestPath = path.join(webRoot, ".next", suffix);
    if (!existsSync(manifestPath)) {
      throw new Error(`Expected read-route manifest is missing: ${suffix}`);
    }
    const content = readFileSync(manifestPath, "utf8");
    const leakedChunks = lexicalChunkNames.filter((chunkName) =>
      content.includes(chunkName),
    );
    if (leakedChunks.length > 0) {
      throw new Error(
        `Read-route manifest ${suffix} references authoring chunks: ${leakedChunks.join(", ")}`,
      );
    }
  }

  return {
    buildIdClass: "present-and-fresh",
    lexicalAuthoringChunkCount: lexicalChunks.length,
    readRouteManifestCount: publicManifestSuffixes.length,
  };
}

export function runRetirementVerification() {
  const webRoot = process.cwd();
  const repositoryRoot = path.resolve(webRoot, "../..");
  const inspectedPaths = [
    "AGENTS.md",
    "apps/web/package.json",
    "apps/web/pnpm-lock.yaml",
    "apps/web/scripts",
    "apps/web/src",
    "docs",
  ] as const;
  const files = listTextFiles(repositoryRoot, inspectedPaths);
  const inventory = inventoryRetiredEngineReferences(files);

  if (inventory.activeReferences.length > 0) {
    throw new Error(
      `Active retired-editor references:\n${inventory.activeReferences
        .map(({ relativePath, line }) => `${relativePath}:${line}`)
        .join("\n")}`,
    );
  }
  if (inventory.staleHistoricalPaths.length > 0) {
    throw new Error(
      `Stale historical allowlist paths: ${inventory.staleHistoricalPaths.join(", ")}`,
    );
  }

  for (const relativePath of RETIRED_FILE_PATHS) {
    if (existsSync(path.join(repositoryRoot, relativePath))) {
      throw new Error(`Retired source file still exists: ${relativePath}`);
    }
  }

  const packageJson = JSON.parse(
    readFileSync(path.join(webRoot, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const lockfile = readFileSync(path.join(webRoot, "pnpm-lock.yaml"), "utf8");
  const packageErrors = validateLexicalPackageContract(
    packageJson.dependencies,
    lockfile,
  );
  if (packageErrors.length > 0) throw new Error(packageErrors.join("\n"));

  const productionSourceFiles = files.filter(
    ({ relativePath }) =>
      relativePath.startsWith("apps/web/src/") &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath),
  );
  const forbiddenActivations = findForbiddenLexicalActivations(
    productionSourceFiles,
  );
  if (forbiddenActivations.length > 0) {
    throw new Error(
      `Forbidden Lexical activation:\n${forbiddenActivations
        .map(({ relativePath, line }) => `${relativePath}:${line}`)
        .join("\n")}`,
    );
  }

  const bundle = verifyProductionBundle(
    webRoot,
    findMaximumMtime(repositoryRoot, inspectedPaths),
  );

  const receipt = {
    ok: true,
    issue: "OVE-317",
    activeRetiredReferences: inventory.activeReferences.length,
    classifiedHistoricalReferences: inventory.historicalReferences.length,
    directLexicalPackages: EXACT_LEXICAL_DIRECT_PACKAGES.length,
    lexicalVersion: EXACT_LEXICAL_VERSION,
    forbiddenLexicalActivations: forbiddenActivations.length,
    ...bundle,
  };
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runRetirementVerification();
}
