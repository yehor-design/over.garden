import path from "node:path";

import ts from "typescript";

export interface AuthenticatedMutationRuntimeSourceFile {
  path: string;
  sourceText: string;
}

export interface AuthenticatedMutationRuntimeImportFinding {
  forbiddenPath: string;
  importChain: string[];
  runtimeRoot: string;
}

export interface AuthenticatedMutationRuntimeUnsupportedFinding {
  path: string;
  reason: string;
}

export interface AuthenticatedMutationRuntimeImportReport {
  state: "safe" | "unsafe" | "unsupported";
  findings: AuthenticatedMutationRuntimeImportFinding[];
  unsupported: AuthenticatedMutationRuntimeUnsupportedFinding[];
}

export interface AuthenticatedMutationNextBuildInventory {
  listFiles(): Promise<readonly string[]>;
  readFile(relativePath: string): Promise<Uint8Array>;
}

export interface AuthenticatedMutationBuildSentinel {
  id: string;
  value: string;
}

export interface AuthenticatedMutationBuildSentinelFinding {
  artifactPath: string;
  representation: "exact" | "base64" | "base64url" | "static_expression";
  sentinelId: string;
}

export interface AuthenticatedMutationNextBuildError {
  code: string;
  artifactPath?: string;
}

export interface AuthenticatedMutationNextBuildSentinelReport {
  state: "safe" | "unsafe" | "inconclusive";
  scannedArtifactCount: number;
  findings: AuthenticatedMutationBuildSentinelFinding[];
  errors: AuthenticatedMutationNextBuildError[];
}

export async function scanAuthenticatedMutationNextBuildSentinels(input: {
  inventory: AuthenticatedMutationNextBuildInventory;
  sentinels: readonly AuthenticatedMutationBuildSentinel[];
}): Promise<AuthenticatedMutationNextBuildSentinelReport> {
  const listedPaths = uniqueSorted(
    (await input.inventory.listFiles()).map(normalizePath),
  );
  const listedPathSet = new Set(listedPaths);
  const errors: AuthenticatedMutationNextBuildError[] = [];
  if (!listedPathSet.has("BUILD_ID")) {
    errors.push({ code: "missing_build_id" });
  } else {
    const buildId = Buffer.from(
      await input.inventory.readFile("BUILD_ID"),
    ).toString("utf8");
    if (!buildId.trim()) errors.push({ code: "empty_build_id" });
  }
  if (!listedPathSet.has("server/app-paths-manifest.json")) {
    errors.push({ code: "missing_app_paths_manifest" });
  } else {
    const manifest = Buffer.from(
      await input.inventory.readFile("server/app-paths-manifest.json"),
    ).toString("utf8");
    if (!isJsonObject(manifest)) {
      errors.push({ code: "invalid_app_paths_manifest" });
    }
  }
  if (!listedPaths.some(isNextStaticRuntimeJavaScriptArtifact)) {
    errors.push({ code: "missing_static_runtime_chunk" });
  }
  if (errors.length > 0) {
    return {
      state: "inconclusive",
      scannedArtifactCount: 0,
      findings: [],
      errors,
    };
  }

  const artifactPaths = listedPaths.filter(isNextRuntimeJavaScriptArtifact);
  const sentinels = [...input.sentinels].sort((left, right) =>
    byteCompare(left.id, right.id),
  );
  const findings: AuthenticatedMutationBuildSentinelFinding[] = [];

  for (const artifactPath of artifactPaths) {
    const source = Buffer.from(
      await input.inventory.readFile(artifactPath),
    ).toString("utf8");
    const staticStrings = collectStaticStringValues(source, artifactPath);
    for (const sentinel of sentinels) {
      const representation = findDirectSentinelRepresentation(
        source,
        sentinel.value,
      );
      if (representation) {
        findings.push({
          artifactPath,
          representation,
          sentinelId: sentinel.id,
        });
      } else if (
        staticStrings.some((staticValue) =>
          staticValue.includes(sentinel.value),
        )
      ) {
        findings.push({
          artifactPath,
          representation: "static_expression",
          sentinelId: sentinel.id,
        });
      }
    }
  }

  return {
    state: findings.length > 0 ? "unsafe" : "safe",
    scannedArtifactCount: artifactPaths.length,
    findings,
    errors: [],
  };
}

function isJsonObject(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}

function collectStaticStringValues(source: string, filePath: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const values = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isExpression(node)) {
      const value = evaluateStaticString(node);
      if (value !== undefined) values.add(value);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...values].sort(byteCompare);
}

function evaluateStaticString(expression: ts.Expression): string | undefined {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (ts.isParenthesizedExpression(expression)) {
    return evaluateStaticString(expression.expression);
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = evaluateStaticString(expression.left);
    const right = evaluateStaticString(expression.right);
    if (left === undefined || right === undefined) return undefined;
    const combined = `${left}${right}`;
    return combined.length <= 16_384 ? combined : undefined;
  }
  return undefined;
}

function findDirectSentinelRepresentation(
  source: string,
  sentinel: string,
): "exact" | "base64" | "base64url" | undefined {
  if (source.includes(sentinel)) return "exact";
  const bytes = Buffer.from(sentinel, "utf8");
  const base64 = bytes.toString("base64");
  if (source.includes(base64)) return "base64";
  const base64url = bytes.toString("base64url");
  return base64url !== base64 && source.includes(base64url)
    ? "base64url"
    : undefined;
}

export function analyzeAuthenticatedMutationRuntimeImports(input: {
  files: readonly AuthenticatedMutationRuntimeSourceFile[];
  runtimeRoots: readonly string[];
  forbiddenPaths: readonly string[];
}): AuthenticatedMutationRuntimeImportReport {
  const files = new Map(
    input.files.map((file) => [normalizePath(file.path), file.sourceText]),
  );
  const graph = new Map<string, string[]>();
  const unsupportedByFile = new Map<
    string,
    AuthenticatedMutationRuntimeUnsupportedFinding[]
  >();

  for (const [filePath, sourceText] of files) {
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(filePath),
    );
    const imports: string[] = [];
    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        importDeclarationHasRuntimeValue(statement)
      ) {
        const resolved = resolveInternalModule(
          filePath,
          statement.moduleSpecifier.text,
          files,
        );
        if (resolved) imports.push(resolved);
      } else if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        exportDeclarationHasRuntimeValue(statement)
      ) {
        const resolved = resolveInternalModule(
          filePath,
          statement.moduleSpecifier.text,
          files,
        );
        if (resolved) imports.push(resolved);
      }
    }
    const unsupported: AuthenticatedMutationRuntimeUnsupportedFinding[] = [];
    const visitRuntimeCalls = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const loadingKind = moduleLoadingKind(node);
        if (loadingKind) {
          const argument = node.arguments[0];
          if (
            node.arguments.length !== 1 ||
            !ts.isStringLiteralLike(argument)
          ) {
            unsupported.push({
              path: filePath,
              reason:
                loadingKind === "dynamic_import"
                  ? "nonliteral_dynamic_import"
                  : "nonliteral_require",
            });
          } else {
            const resolved = resolveInternalModule(
              filePath,
              argument.text,
              files,
            );
            if (resolved) imports.push(resolved);
          }
        }
      }
      ts.forEachChild(node, visitRuntimeCalls);
    };
    visitRuntimeCalls(sourceFile);
    graph.set(filePath, uniqueSorted(imports));
    unsupportedByFile.set(filePath, uniqueUnsupportedFindings(unsupported));
  }

  const findings: AuthenticatedMutationRuntimeImportFinding[] = [];
  const unsupported: AuthenticatedMutationRuntimeUnsupportedFinding[] = [];
  const forbiddenPaths = uniqueSorted(input.forbiddenPaths.map(normalizePath));
  for (const runtimeRoot of uniqueSorted(
    input.runtimeRoots.map(normalizePath),
  )) {
    const chains = shortestImportChains(runtimeRoot, graph);
    for (const reachablePath of chains.keys()) {
      unsupported.push(...(unsupportedByFile.get(reachablePath) ?? []));
    }
    for (const forbiddenPath of forbiddenPaths) {
      const importChain = chains.get(forbiddenPath);
      if (importChain) {
        findings.push({ forbiddenPath, importChain, runtimeRoot });
      }
    }
  }
  const normalizedUnsupported = uniqueUnsupportedFindings(unsupported);

  return {
    state:
      normalizedUnsupported.length > 0
        ? "unsupported"
        : findings.length > 0
          ? "unsafe"
          : "safe",
    findings,
    unsupported: normalizedUnsupported,
  };
}

function importDeclarationHasRuntimeValue(
  declaration: ts.ImportDeclaration,
): boolean {
  const clause = declaration.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name || !clause.namedBindings) return true;
  if (ts.isNamespaceImport(clause.namedBindings)) return true;
  return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function exportDeclarationHasRuntimeValue(
  declaration: ts.ExportDeclaration,
): boolean {
  if (declaration.isTypeOnly) return false;
  if (!declaration.exportClause) return true;
  if (ts.isNamespaceExport(declaration.exportClause)) return true;
  return declaration.exportClause.elements.some(
    (element) => !element.isTypeOnly,
  );
}

function moduleLoadingKind(
  node: ts.CallExpression,
): "dynamic_import" | "require" | undefined {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return "dynamic_import";
  }
  return ts.isIdentifier(node.expression) && node.expression.text === "require"
    ? "require"
    : undefined;
}

function shortestImportChains(
  runtimeRoot: string,
  graph: ReadonlyMap<string, readonly string[]>,
): Map<string, string[]> {
  const chains = new Map<string, string[]>([[runtimeRoot, [runtimeRoot]]]);
  const queue = [runtimeRoot];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const currentChain = chains.get(current)!;
    for (const imported of graph.get(current) ?? []) {
      if (chains.has(imported)) continue;
      chains.set(imported, [...currentChain, imported]);
      queue.push(imported);
    }
  }
  return chains;
}

function resolveInternalModule(
  fromPath: string,
  specifier: string,
  files: ReadonlyMap<string, unknown>,
): string | undefined {
  const base = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? path.posix.normalize(
          path.posix.join(path.posix.dirname(fromPath), specifier),
        )
      : undefined;
  if (!base) return undefined;
  for (const candidate of moduleCandidates(base)) {
    if (files.has(candidate)) return candidate;
  }
  return undefined;
}

function moduleCandidates(base: string): string[] {
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/u.test(filePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isNextRuntimeJavaScriptArtifact(relativePath: string): boolean {
  return /^(?:server\/|static\/chunks\/).+\.(?:cjs|js|mjs)$/u.test(
    relativePath,
  );
}

function isNextStaticRuntimeJavaScriptArtifact(relativePath: string): boolean {
  return /^static\/chunks\/.+\.(?:cjs|js|mjs)$/u.test(relativePath);
}

function normalizePath(value: string): string {
  return path.posix.normalize(
    value.replaceAll("\\", "/").replace(/^\.\//u, ""),
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(byteCompare);
}

function uniqueUnsupportedFindings(
  findings: readonly AuthenticatedMutationRuntimeUnsupportedFinding[],
): AuthenticatedMutationRuntimeUnsupportedFinding[] {
  return [
    ...new Map(
      findings.map((finding) => [
        `${finding.path}\0${finding.reason}`,
        finding,
      ]),
    ).values(),
  ].sort((left, right) =>
    byteCompare(
      `${left.path}\0${left.reason}`,
      `${right.path}\0${right.reason}`,
    ),
  );
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
