import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

import {
  AUTHENTICATED_MUTATION_SOURCE_POLICY,
  buildAuthenticatedMutationRegistry,
  buildAuthenticatedMutationRegistryReceipt,
  canonicalizeAuthenticatedMutationRegistry,
  validateAuthenticatedMutationRegistry,
  type AuthenticatedMutationPrerequisiteReceiptV3,
  type AuthenticatedMutationRegistryFinding,
  type AuthenticatedMutationRegistryReceiptV3,
  type AuthenticatedMutationRegistryV3,
  type AuthenticatedMutationSourceEvidence,
} from "./authenticated-mutation-registry";
import {
  AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST,
  validateAuthenticatedMutationSemanticEvidence,
  type AuthenticatedMutationSemanticFinding,
  type AuthenticatedMutationSemanticValidationResult,
} from "./authenticated-mutation-semantic-adapter";
import {
  analyzeAuthenticatedMutationRuntimeImports,
  scanAuthenticatedMutationNextBuildSentinels,
} from "./authenticated-mutation-runtime-safety";

export type AuthenticatedMutationTransport =
  | "server_action"
  | "route_handler"
  | "better_auth_callback"
  | "native_form"
  | "same_origin_fetch"
  | "offline_replay"
  | "browser_operator";

export interface AuthenticatedMutationSourceFile {
  relativePath: string;
  sourceText: string;
}

export interface AuthenticatedMutationDiscovery {
  entrypointId: string;
  path: string;
  symbol: string;
  variant: string;
  transport: AuthenticatedMutationTransport;
}

export interface AuthenticatedMutationSourcePolicyFinding {
  code: "production_imports_excluded_source";
  importerPath: string;
  importedPath: string;
}

const NON_PRODUCTION_SOURCE_SEGMENTS = new Set([
  ".next",
  "build",
  "dist",
  "generated",
  "node_modules",
]);

const AUDITED_ROUTE_METHODS = new Set(["DELETE", "GET", "PATCH", "POST", "PUT"]);
const AUTH_CLIENT_READ_METHODS = new Set([
  "getSession",
  "useSession",
  "listAccounts",
  "listSessions",
  "getAccessToken",
]);
const BETTER_AUTH_CALLBACK_VARIANTS = {
  GET: [
    "get_read_only_endpoint",
    "callback_get_explicit_link_existing_account",
    "callback_get_explicit_link_new_account",
    "callback_get_explicit_link_profile_update",
    "callback_get_ordinary_implicit_link",
    "callback_get_ordinary_registration",
    "callback_get_ordinary_sign_in_existing_account",
  ],
  POST: [
    "callback_post_normalize_to_get",
    "guest_request_password_reset",
    "guest_reset_password",
    "guest_sign_in_email",
    "guest_sign_in_social",
    "guest_sign_up_email",
    "authenticated_sign_out",
    "authenticated_unlink_account",
    "authenticated_account_session_mutation",
    "link_social_post_id_token",
    "link_social_post_redirect",
    "retired_facebook_request",
  ],
} as const;

export function discoverAuthenticatedMutationEntrypoints(
  files: readonly AuthenticatedMutationSourceFile[],
): AuthenticatedMutationDiscovery[] {
  const discoveries: AuthenticatedMutationDiscovery[] = [];
  const sourceIndex = new Map<
    string,
    { sourceFile: ts.SourceFile; sourceText: string }
  >();

  for (const file of files) {
    const relativePath = normalizeRelativePath(file.relativePath);
    if (
      !isAuthenticatedMutationProductionSourcePath(relativePath) ||
      !isTypeScriptOrJavaScriptSource(relativePath)
    ) {
      continue;
    }
    const sourceFile = ts.createSourceFile(
      relativePath,
      file.sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(relativePath),
    );
    sourceIndex.set(relativePath, { sourceFile, sourceText: file.sourceText });
  }

  for (const [relativePath, { sourceFile }] of sourceIndex) {
    if (isRouteModule(relativePath)) {
      discoverRouteHandlers(sourceFile, relativePath, discoveries);
    }
    discoverServerActions(sourceFile, relativePath, discoveries);
    discoverOfflineStorageOwners(sourceFile, relativePath, discoveries);
    discoverClientMutationEntrypoints(
      sourceFile,
      relativePath,
      discoveries,
      sourceIndex,
    );
  }

  return deduplicateDiscoveries(discoveries).sort(compareDiscoveries);
}

export function auditAuthenticatedMutationSourcePolicy(
  files: readonly AuthenticatedMutationSourceFile[],
): AuthenticatedMutationSourcePolicyFinding[] {
  const normalizedFiles = new Map(
    files.map((file) => [
      normalizeRelativePath(file.relativePath),
      file.sourceText,
    ]),
  );
  const findings = new Map<string, AuthenticatedMutationSourcePolicyFinding>();

  for (const [importerPath, sourceText] of normalizedFiles) {
    if (
      !isAuthenticatedMutationProductionSourcePath(importerPath) ||
      !isTypeScriptOrJavaScriptSource(importerPath)
    ) {
      continue;
    }
    const sourceFile = ts.createSourceFile(
      importerPath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(importerPath),
    );
    const inspectSpecifier = (specifier: string): void => {
      const importedPath = resolveSourceModulePath(
        importerPath,
        specifier,
        normalizedFiles,
      );
      if (
        !importedPath ||
        isAuthenticatedMutationProductionSourcePath(importedPath)
      ) {
        return;
      }
      const finding = {
        code: "production_imports_excluded_source" as const,
        importerPath,
        importedPath,
      };
      findings.set(`${importerPath}\0${importedPath}`, finding);
    };
    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        inspectSpecifier(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node) &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        inspectSpecifier(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return [...findings.values()].sort((left, right) =>
    `${left.importerPath}\0${left.importedPath}`.localeCompare(
      `${right.importerPath}\0${right.importedPath}`,
      "en",
    ),
  );
}

export function isAuthenticatedMutationProductionSourcePath(
  relativePath: string,
): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/");
  if (
    /\.(?:test|spec|fixture|snapshot)\.[cm]?[jt]sx?$/.test(normalized) ||
    segments.some(
      (segment) =>
        AUTHENTICATED_MUTATION_SOURCE_POLICY.excludedPathSegments.includes(
          segment as (typeof AUTHENTICATED_MUTATION_SOURCE_POLICY.excludedPathSegments)[number],
        ) || NON_PRODUCTION_SOURCE_SEGMENTS.has(segment),
    )
  ) {
    return false;
  }
  return (
    normalized === "public/sw.js" ||
    normalized.startsWith("sql/") ||
    normalized.startsWith("src/")
  );
}

function isTypeScriptOrJavaScriptSource(relativePath: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(relativePath);
}

export function expandBetterAuthSemanticVariants(
  discoveries: readonly AuthenticatedMutationDiscovery[],
): AuthenticatedMutationDiscovery[] {
  const expanded = discoveries.flatMap((discovery) => {
    if (!isBetterAuthCatchAll(discovery.path)) return [discovery];
    if (discovery.symbol !== "GET" && discovery.symbol !== "POST") {
      return [discovery];
    }
    return BETTER_AUTH_CALLBACK_VARIANTS[discovery.symbol].map((variant) => ({
      entrypointId: `better_auth_callback:${discovery.path}#${variant}`,
      path: discovery.path,
      symbol: discovery.symbol,
      variant,
      transport: "better_auth_callback" as const,
    }));
  });
  return deduplicateDiscoveries(expanded).sort(compareDiscoveries);
}

function discoverRouteHandlers(
  sourceFile: ts.SourceFile,
  relativePath: string,
  discoveries: AuthenticatedMutationDiscovery[],
): void {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
      addRouteMethod(statement.name?.text, relativePath, discoveries);
      continue;
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          addRouteMethod(declaration.name.text, relativePath, discoveries);
          continue;
        }
        if (ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements) {
            const symbol = ts.isIdentifier(element.name)
              ? element.name.text
              : undefined;
            addRouteMethod(symbol, relativePath, discoveries);
          }
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (!ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        addRouteMethod(element.name.text, relativePath, discoveries);
      }
    }
  }
}

function addRouteMethod(
  symbol: string | undefined,
  relativePath: string,
  discoveries: AuthenticatedMutationDiscovery[],
): void {
  if (!symbol || !AUDITED_ROUTE_METHODS.has(symbol)) {
    return;
  }
  discoveries.push(
    createDiscovery(relativePath, symbol, "route_handler", symbol),
  );
}

function discoverServerActions(
  sourceFile: ts.SourceFile,
  relativePath: string,
  discoveries: AuthenticatedMutationDiscovery[],
): void {
  const fileIsServerActionModule = hasDirective(sourceFile.statements, "use server");

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      if (
        statement.name &&
        isExported(statement) &&
        (fileIsServerActionModule || hasFunctionDirective(statement, "use server"))
      ) {
        discoveries.push(
          createDiscovery(relativePath, statement.name.text, "server_action"),
        );
      }
      continue;
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        if (
          fileIsServerActionModule ||
          hasFunctionDirective(declaration.initializer, "use server")
        ) {
          discoveries.push(
            createDiscovery(relativePath, declaration.name.text, "server_action"),
          );
        }
      }
      continue;
    }

    if (
      fileIsServerActionModule &&
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        discoveries.push(
          createDiscovery(relativePath, element.name.text, "server_action"),
        );
      }
    }
  }
}

function discoverOfflineStorageOwners(
  sourceFile: ts.SourceFile,
  relativePath: string,
  discoveries: AuthenticatedMutationDiscovery[],
): void {
  if (!relativePath.startsWith("src/lib/offline/")) return;

  const add = (symbol: string): void => {
    discoveries.push(
      createDiscovery(
        relativePath,
        symbol,
        "offline_replay",
        `browser_storage:${symbol}`,
      ),
    );
  };

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      isExported(statement)
    ) {
      add(statement.name.text);
      continue;
    }
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      ) {
        add(declaration.name.text);
      }
    }
  }
}

function discoverClientMutationEntrypoints(
  sourceFile: ts.SourceFile,
  relativePath: string,
  discoveries: AuthenticatedMutationDiscovery[],
  sourceIndex: ReadonlyMap<
    string,
    { sourceFile: ts.SourceFile; sourceText: string }
  >,
): void {
  const visit = (node: ts.Node, enclosingSymbol: string): void => {
    const nextSymbol = declaredSymbol(node) ?? enclosingSymbol;

    if (ts.isJsxAttribute(node)) {
      const attributeName = node.name.getText(sourceFile);
      const intrinsicName = intrinsicElementNameForAttribute(node);
      const expression = jsxAttributeExpression(node);
      if (
        (attributeName === "action" || attributeName === "formAction") &&
        ((attributeName === "action" && intrinsicName === "form") ||
          (attributeName === "formAction" &&
            (intrinsicName === "button" || intrinsicName === "input")))
      ) {
        const stringTarget = jsxAttributeString(node);
        if (expression) {
          const target = expressionName(expression, sourceFile);
          discoveries.push(
            createDiscovery(
              relativePath,
              nextSymbol,
              "native_form",
              `${attributeName}:${target}`,
            ),
          );
        } else if (
          attributeName === "action" &&
          stringTarget &&
          jsxStringAttribute(node, "method")?.toUpperCase() === "POST"
        ) {
          discoveries.push(
            createDiscovery(
              relativePath,
              nextSymbol,
              "native_form",
              `POST:${stringTarget}`,
            ),
          );
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const call = callName(node.expression, sourceFile);
      if (call === "fetch") {
        const url = resolveStringArgument(
          node.arguments[0],
          sourceFile,
          relativePath,
          sourceIndex,
        );
        if (url?.startsWith("/")) {
          const method = objectStringProperty(node.arguments[1], "method") ?? "GET";
          const keepalive = objectBooleanProperty(node.arguments[1], "keepalive");
          if (method !== "GET" || keepalive) {
            discoveries.push(
              createDiscovery(
                relativePath,
                nextSymbol,
                "same_origin_fetch",
                `${method}:${url}${keepalive ? ":keepalive" : ""}`,
              ),
            );
          }
        }
      } else if (call === "navigator.sendBeacon") {
        const url = resolveStringArgument(
          node.arguments[0],
          sourceFile,
          relativePath,
          sourceIndex,
        );
        if (url?.startsWith("/")) {
          discoveries.push(
            createDiscovery(
              relativePath,
              nextSymbol,
              "same_origin_fetch",
              `BEACON:${url}`,
            ),
          );
        }
      } else if (call?.startsWith("authClient.")) {
        const method = call.slice("authClient.".length);
        if (method && !AUTH_CLIENT_READ_METHODS.has(method)) {
          discoveries.push(
            createDiscovery(
              relativePath,
              nextSymbol,
              "browser_operator",
              `auth_client.${method}`,
            ),
          );
        }
      } else if (
        call &&
        /^(?:drain|replay|process|sync)(?:Queued|Offline|Pending)/.test(call)
      ) {
        discoveries.push(
          createDiscovery(relativePath, nextSymbol, "offline_replay", call),
        );
      }
    }

    ts.forEachChild(node, (child) => visit(child, nextSymbol));
  };

  visit(sourceFile, "module");
}

function intrinsicElementNameForAttribute(
  attribute: ts.JsxAttribute,
): string | undefined {
  const attributes = attribute.parent;
  const element = attributes.parent;
  if (
    !ts.isJsxOpeningElement(element) &&
    !ts.isJsxSelfClosingElement(element)
  ) {
    return undefined;
  }
  return ts.isIdentifier(element.tagName) &&
    element.tagName.text === element.tagName.text.toLowerCase()
    ? element.tagName.text
    : undefined;
}

function jsxAttributeExpression(
  attribute: ts.JsxAttribute,
): ts.Expression | undefined {
  return attribute.initializer && ts.isJsxExpression(attribute.initializer)
    ? attribute.initializer.expression
    : undefined;
}

function jsxAttributeString(attribute: ts.JsxAttribute): string | undefined {
  return attribute.initializer && ts.isStringLiteral(attribute.initializer)
    ? attribute.initializer.text
    : undefined;
}

function jsxStringAttribute(
  attribute: ts.JsxAttribute,
  name: string,
): string | undefined {
  for (const candidate of attribute.parent.properties) {
    if (
      ts.isJsxAttribute(candidate) &&
      candidate.name.getText() === name
    ) {
      return jsxAttributeString(candidate);
    }
  }
  return undefined;
}

function hasFunctionDirective(
  node: ts.Node | undefined,
  directive: string,
): boolean {
  if (!node) return false;
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)) &&
    node.body &&
    ts.isBlock(node.body)
  ) {
    return hasDirective(node.body.statements, directive);
  }
  return false;
}

function hasDirective(
  statements: ts.NodeArray<ts.Statement>,
  directive: string,
): boolean {
  for (const statement of statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    ) {
      return false;
    }
    if (statement.expression.text === directive) return true;
  }
  return false;
}

function isExported(node: ts.Node): boolean {
  return Boolean(
    ts.getCombinedModifierFlags(node as ts.Declaration) &
      ts.ModifierFlags.Export,
  );
}

function isRouteModule(relativePath: string): boolean {
  return /(^|\/)route\.[cm]?[jt]sx?$/.test(relativePath);
}

function isBetterAuthCatchAll(relativePath: string): boolean {
  return /(^|\/)api\/auth\/\[\.\.\.all\]\/route\.[cm]?[jt]sx?$/.test(
    relativePath,
  );
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/").replace(/^\.\//, "");
}

function scriptKindForPath(relativePath: string): ts.ScriptKind {
  if (/\.tsx$/i.test(relativePath)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(relativePath)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/i.test(relativePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function createDiscovery(
  relativePath: string,
  symbol: string,
  transport: AuthenticatedMutationTransport,
  variant = symbol,
): AuthenticatedMutationDiscovery {
  const variantSuffix = variant === symbol ? "" : `:${variant}`;
  return {
    entrypointId: `${transport}:${relativePath}#${symbol}${variantSuffix}`,
    path: relativePath,
    symbol,
    variant,
    transport,
  };
}

function compareDiscoveries(
  left: AuthenticatedMutationDiscovery,
  right: AuthenticatedMutationDiscovery,
): number {
  return left.entrypointId.localeCompare(right.entrypointId, "en");
}

function deduplicateDiscoveries(
  discoveries: readonly AuthenticatedMutationDiscovery[],
): AuthenticatedMutationDiscovery[] {
  return [...new Map(discoveries.map((item) => [item.entrypointId, item])).values()];
}

function declaredSymbol(node: ts.Node): string | undefined {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)) &&
    node.parent
  ) {
    if ("name" in node && node.name && ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    if (
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      return node.parent.name.text;
    }
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return undefined;
}

function expressionName(node: ts.Expression, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile).trim();
}

function callName(
  expression: ts.LeftHandSideExpression,
  sourceFile: ts.SourceFile,
): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.getText(sourceFile);
  }
  return undefined;
}

function stringArgument(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function resolveStringArgument(
  node: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
  relativePath: string,
  sourceIndex: ReadonlyMap<
    string,
    { sourceFile: ts.SourceFile; sourceText: string }
  >,
  seen = new Set<string>(),
): string | undefined {
  const literal = stringArgument(node);
  if (literal !== undefined) return literal;
  if (!node) return undefined;
  if (ts.isTemplateExpression(node)) {
    return `${node.head.text}${node.templateSpans
      .map((span) => `:dynamic${span.literal.text}`)
      .join("")}`;
  }
  if (!ts.isIdentifier(node)) return undefined;
  const seenKey = `${relativePath}#${node.text}`;
  if (seen.has(seenKey)) return undefined;
  seen.add(seenKey);

  const local = findVariableInitializer(sourceFile, node.text);
  if (local) {
    return resolveStringArgument(
      local,
      sourceFile,
      relativePath,
      sourceIndex,
      seen,
    );
  }

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    const element = statement.importClause.namedBindings.elements.find(
      (candidate) => candidate.name.text === node.text,
    );
    if (!element) continue;
    const importedName = element.propertyName?.text ?? element.name.text;
    const importedPath = resolveSourceModulePath(
      relativePath,
      statement.moduleSpecifier.text,
      sourceIndex,
    );
    if (!importedPath) return undefined;
    const imported = sourceIndex.get(importedPath);
    if (!imported) return undefined;
    const initializer = findVariableInitializer(imported.sourceFile, importedName);
    return initializer
      ? resolveStringArgument(
          initializer,
          imported.sourceFile,
          importedPath,
          sourceIndex,
          seen,
        )
      : undefined;
  }
  return undefined;
}

function findVariableInitializer(
  sourceFile: ts.SourceFile,
  name: string,
): ts.Expression | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      ) {
        return declaration.initializer;
      }
    }
  }
  return undefined;
}

function resolveSourceModulePath(
  fromPath: string,
  specifier: string,
  sourceIndex: ReadonlyMap<string, unknown>,
): string | undefined {
  const base = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier))
      : null;
  if (!base) return undefined;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (sourceIndex.has(candidate)) return candidate;
  }
  return undefined;
}

function objectStringProperty(
  node: ts.Expression | undefined,
  propertyName: string,
): string | undefined {
  const value = objectProperty(node, propertyName);
  return stringArgument(value)?.toUpperCase();
}

function objectBooleanProperty(
  node: ts.Expression | undefined,
  propertyName: string,
): boolean {
  const value = objectProperty(node, propertyName);
  return value?.kind === ts.SyntaxKind.TrueKeyword;
}

function objectProperty(
  node: ts.Expression | undefined,
  propertyName: string,
): ts.Expression | undefined {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name.getText().replaceAll(/["']/g, "");
    if (name === propertyName) return property.initializer;
  }
  return undefined;
}

export const AUTHENTICATED_MUTATION_AUDIT_BASELINE_SHA =
  "5c403444cddc2e195690808de08304d14fe41fd3";
export const AUTHENTICATED_MUTATION_REGISTRY_ARTIFACT_PATH =
  "../../contracts/auth/authenticated-mutation-registry.v3.json";
export const AUTHENTICATED_MUTATION_AUDIT_DEADLINE_MS = 30_000;
export const AUTHENTICATED_MUTATION_PREREQUISITE_RECEIPTS = [
  {
    issueId: "OVE-296",
    receiptDigest:
      "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
  },
] as const satisfies readonly AuthenticatedMutationPrerequisiteReceiptV3[];

export interface AuthenticatedMutationAuditCounts {
  productionSourceCount: number;
  sourceNodeCount: number;
  entrypointCount: number;
  effectBoundaryCount: number;
  consumerEdgeCount: number;
  excludedEntrypointCount: number;
  retiredProviderEntrypointCount: number;
  unresolvedCount: number;
}

export interface AuthenticatedMutationAuditCompletedResult {
  terminalState: "ready" | "inconclusive";
  baselineSha: string;
  registry: AuthenticatedMutationRegistryV3;
  receipt: AuthenticatedMutationRegistryReceiptV3;
  semanticReceipt: AuthenticatedMutationSemanticValidationResult;
  counts: AuthenticatedMutationAuditCounts;
  sourcePolicyFindings: readonly AuthenticatedMutationSourcePolicyFinding[];
  registryFindings: readonly AuthenticatedMutationRegistryFinding[];
  semanticFindings: readonly AuthenticatedMutationSemanticFinding[];
  elapsedBucket: "under_5_seconds" | "under_30_seconds";
}

export interface AuthenticatedMutationAuditUnavailableResult {
  terminalState: "inconclusive";
  failureClass: "deadline" | "scan_error";
  baselineSha: string;
  counts: null;
  registry: null;
  receipt: null;
  semanticReceipt: null;
  sourcePolicyFindings: readonly [];
  registryFindings: readonly [];
  semanticFindings: readonly [];
  elapsedBucket: "timed_out" | "under_30_seconds";
}

export type AuthenticatedMutationAuditResult =
  | AuthenticatedMutationAuditCompletedResult
  | AuthenticatedMutationAuditUnavailableResult;

export interface AuthenticatedMutationDeadlineResult<T> {
  terminalState: "settled" | "timed_out" | "failed";
  value?: T;
}

export async function runAuthenticatedMutationOperationWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<AuthenticatedMutationDeadlineResult<T>> {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new Error("mutation audit deadline must be a positive finite value");
  }
  const controller = new AbortController();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: AuthenticatedMutationDeadlineResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      controller.abort();
      finish({ terminalState: "timed_out" });
    }, deadlineMs);
    void operation(controller.signal).then(
      (value) => finish({ terminalState: "settled", value }),
      () =>
        finish({
          terminalState: controller.signal.aborted ? "timed_out" : "failed",
        }),
    );
  });
}

export async function runAuthenticatedMutationSurfaceAudit(input: {
  appRoot?: string;
  baselineSha?: string;
  deadlineMs?: number;
  now?: () => number;
} = {}): Promise<AuthenticatedMutationAuditResult> {
  const appRoot = path.resolve(input.appRoot ?? DEFAULT_APP_WEB_ROOT);
  const baselineSha =
    input.baselineSha ?? AUTHENTICATED_MUTATION_AUDIT_BASELINE_SHA;
  const deadlineMs =
    input.deadlineMs ?? AUTHENTICATED_MUTATION_AUDIT_DEADLINE_MS;
  const now = input.now ?? Date.now;
  const startedAt = now();
  const settled = await runAuthenticatedMutationOperationWithinDeadline(
    (signal) =>
      scanAuthenticatedMutationSurface({ appRoot, baselineSha, signal }),
    deadlineMs,
  );
  if (settled.terminalState !== "settled" || !settled.value) {
    return {
      terminalState: "inconclusive",
      failureClass:
        settled.terminalState === "timed_out" ? "deadline" : "scan_error",
      baselineSha,
      counts: null,
      registry: null,
      receipt: null,
      semanticReceipt: null,
      sourcePolicyFindings: [],
      registryFindings: [],
      semanticFindings: [],
      elapsedBucket:
        settled.terminalState === "timed_out"
          ? "timed_out"
          : "under_30_seconds",
    };
  }
  return {
    ...settled.value,
    elapsedBucket:
      now() - startedAt < 5_000 ? "under_5_seconds" : "under_30_seconds",
  };
}

async function scanAuthenticatedMutationSurface(input: {
  appRoot: string;
  baselineSha: string;
  signal: AbortSignal;
}): Promise<Omit<AuthenticatedMutationAuditCompletedResult, "elapsedBucket">> {
  const rawSources = await readAuthenticatedMutationSourceInventory(
    input.appRoot,
    input.signal,
  );
  const productionSources = rawSources
    .filter(
      (source) =>
        isAuthenticatedMutationProductionSourcePath(source.path) &&
        (/\.[cm]?[jt]sx?$/.test(source.path) || source.path.endsWith(".sql")),
    )
    .sort((left, right) => byteCompare(left.path, right.path));
  const discoverySources = productionSources.map((source) => ({
    relativePath: source.path,
    sourceText: source.sourceText,
  }));
  const sourcePolicyFindings = auditAuthenticatedMutationSourcePolicy(
    rawSources.map((source) => ({
      relativePath: source.path,
      sourceText: source.sourceText,
    })),
  );
  const discoveries = expandBetterAuthSemanticVariants(
    discoverAuthenticatedMutationEntrypoints(discoverySources),
  );
  const registry = buildAuthenticatedMutationRegistry({
    discoveries,
    sources: productionSources,
    toolchain: {
      typescriptVersion: ts.version,
      betterAuthVersion: "1.6.25",
    },
    prerequisiteReceipts: AUTHENTICATED_MUTATION_PREREQUISITE_RECEIPTS,
  });
  const registryFindings = validateAuthenticatedMutationRegistry(registry);

  const semanticEvidence = await readAuthenticatedMutationSemanticEvidence(
    input.appRoot,
    input.signal,
  );
  const semanticReceipt = validateAuthenticatedMutationSemanticEvidence(
    semanticEvidence,
  );
  const semanticFindings = semanticReceipt.findings;
  const terminalState =
    sourcePolicyFindings.length === 0 &&
    registryFindings.length === 0 &&
    semanticReceipt.decisionState === "ready"
      ? "ready"
      : "inconclusive";

  const sourceEvidenceByPath = new Map<string, AuthenticatedMutationSourceEvidence>();
  for (const source of [...productionSources, ...semanticEvidence.sources]) {
    sourceEvidenceByPath.set(source.path, {
      path: source.path,
      sourceText: source.sourceText,
    });
  }
  const receipt = buildAuthenticatedMutationRegistryReceipt({
    registry,
    baselineSha: input.baselineSha,
    sourceEvidence: [...sourceEvidenceByPath.values()].sort((left, right) =>
      byteCompare(left.path, right.path),
    ),
    prerequisiteReceipts: AUTHENTICATED_MUTATION_PREREQUISITE_RECEIPTS,
    decisionState: terminalState,
  });
  const unresolvedCount =
    registry.sourceNodes.filter((node) => node.resolutionState === "unresolved")
      .length +
    registry.entrypoints.filter(
      (entrypoint) => entrypoint.classification === "unresolved",
    ).length;

  return {
    terminalState,
    baselineSha: input.baselineSha,
    registry,
    receipt,
    semanticReceipt,
    counts: {
      productionSourceCount: productionSources.length,
      sourceNodeCount: registry.sourceNodes.length,
      entrypointCount: registry.entrypoints.length,
      effectBoundaryCount: registry.effectBoundaries.length,
      consumerEdgeCount: registry.consumerEdges.length,
      excludedEntrypointCount: registry.entrypoints.filter(
        (entrypoint) =>
          entrypoint.classification === "excluded_distinct_authority" ||
          entrypoint.classification === "read_only",
      ).length,
      retiredProviderEntrypointCount: registry.entrypoints.filter(
        (entrypoint) => entrypoint.classification === "retired_provider",
      ).length,
      unresolvedCount,
    },
    sourcePolicyFindings,
    registryFindings,
    semanticFindings,
  };
}

async function readAuthenticatedMutationSourceInventory(
  appRoot: string,
  signal: AbortSignal,
): Promise<AuthenticatedMutationSourceEvidence[]> {
  const sourcePaths = [
    ...(await listFilesRecursively(path.join(appRoot, "src"), signal)),
    ...(await listFilesRecursively(path.join(appRoot, "sql"), signal)),
    path.join(appRoot, "public/sw.js"),
  ]
    .filter((absolutePath) =>
      /(?:\.[cm]?[jt]sx?|\.sql)$/.test(absolutePath),
    )
    .sort(byteCompare);
  return Promise.all(
    sourcePaths.map(async (absolutePath) => ({
      path: toRepositoryPath(appRoot, absolutePath),
      sourceText: await readFile(absolutePath, {
        encoding: "utf8",
        signal,
      }),
    })),
  );
}

async function readAuthenticatedMutationSemanticEvidence(
  appRoot: string,
  signal: AbortSignal,
) {
  const sources = await Promise.all(
    AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST.sources.map(
      async (source) => ({
        path: source.path,
        sourceText: await readFile(path.join(appRoot, source.path), {
          encoding: "utf8",
          signal,
        }),
      }),
    ),
  );
  const lockText =
    sources.find((source) => source.path === "pnpm-lock.yaml")?.sourceText ?? "";
  return {
    sources,
    packages: AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST.packages.flatMap(
      (requirement) => {
        const integrity = readPnpmLockIntegrity(
          lockText,
          requirement.name,
          requirement.version,
        );
        return integrity
          ? [{ name: requirement.name, version: requirement.version, integrity }]
          : [];
      },
    ),
  };
}

function readPnpmLockIntegrity(
  lockText: string,
  packageName: string,
  version: string,
): string | null {
  const key = packageName.startsWith("@")
    ? `  '${packageName}@${version}':`
    : `  ${packageName}@${version}:`;
  const start = lockText.indexOf(key);
  if (start < 0) return null;
  const block = lockText.slice(start, start + 1_000);
  return /\n\s+resolution:\s+\{integrity:\s+([^}\s]+)\}/.exec(block)?.[1] ?? null;
}

async function listFilesRecursively(
  directory: string,
  signal: AbortSignal,
): Promise<string[]> {
  if (signal.aborted) throw new Error("mutation audit cancelled");
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    byteCompare(left.name, right.name),
  )) {
    if (signal.aborted) throw new Error("mutation audit cancelled");
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(absolutePath, signal)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

export async function verifyAuthenticatedMutationRuntimeIsolation(input: {
  appRoot?: string;
} = {}) {
  const appRoot = path.resolve(input.appRoot ?? DEFAULT_APP_WEB_ROOT);
  const controller = new AbortController();
  const rawSources = await readAuthenticatedMutationSourceInventory(
    appRoot,
    controller.signal,
  );
  const forbiddenPaths = [
    "scripts/audit-authenticated-mutation-surface.ts",
    "scripts/authenticated-mutation-registry.ts",
    "scripts/authenticated-mutation-runtime-safety.ts",
    "scripts/authenticated-mutation-semantic-adapter.ts",
    "scripts/authenticated-mutation-source-graph.ts",
    "test/auth/authenticated-mutation-effect-oracle.ts",
  ];
  const forbiddenSources = await Promise.all(
    forbiddenPaths.map(async (repositoryPath) => ({
      path: repositoryPath,
      sourceText: await readFile(path.join(appRoot, repositoryPath), "utf8"),
    })),
  );
  const runtimeSources = rawSources.filter(
    (source) =>
      isAuthenticatedMutationProductionSourcePath(source.path) &&
      /\.[cm]?[jt]sx?$/.test(source.path),
  );
  const runtimeRoots = runtimeSources
    .map((source) => source.path)
    .filter(
      (repositoryPath) =>
        /^src\/app\/.*\/(?:default|error|layout|loading|not-found|page|route|template)\.[cm]?[jt]sx?$/.test(
          repositoryPath,
        ) ||
        /^src\/(?:instrumentation|middleware|proxy)\.[cm]?[jt]sx?$/.test(
          repositoryPath,
        ),
    );
  const importReport = analyzeAuthenticatedMutationRuntimeImports({
    files: [...runtimeSources, ...forbiddenSources],
    runtimeRoots,
    forbiddenPaths,
  });

  let buildReport:
    | Awaited<ReturnType<typeof scanAuthenticatedMutationNextBuildSentinels>>
    | { state: "inconclusive"; errors: readonly [{ code: "build_output_missing" }] };
  const nextRoot = path.join(appRoot, ".next");
  try {
    const buildPaths = await listFilesRecursively(
      nextRoot,
      controller.signal,
    );
    const repositoryPaths = buildPaths.map((absolutePath) =>
      toRepositoryPath(nextRoot, absolutePath),
    );
    buildReport = await scanAuthenticatedMutationNextBuildSentinels({
      inventory: {
        async listFiles() {
          return repositoryPaths;
        },
        async readFile(relativePath) {
          return readFile(path.join(nextRoot, relativePath));
        },
      },
      sentinels: [
        {
          id: "authenticated-mutation-registry-schema",
          value: "overgarden.authenticated-mutation-registry.v3",
        },
        {
          id: "authenticated-mutation-semantic-adapter-schema",
          value: "overgarden.authenticated-mutation-semantic-adapter.v1",
        },
      ],
    });
  } catch {
    buildReport = {
      state: "inconclusive",
      errors: [{ code: "build_output_missing" }],
    };
  }
  return {
    state:
      importReport.state === "safe" && buildReport.state === "safe"
        ? "safe"
        : "inconclusive",
    importReport,
    buildReport,
  } as const;
}

async function readAuthenticatedMutationRegistryArtifact(
  appRoot: string,
): Promise<AuthenticatedMutationRegistryV3 | null> {
  try {
    return JSON.parse(
      await readFile(
        path.resolve(appRoot, AUTHENTICATED_MUTATION_REGISTRY_ARTIFACT_PATH),
        "utf8",
      ),
    ) as AuthenticatedMutationRegistryV3;
  } catch {
    return null;
  }
}

async function writeAuthenticatedMutationRegistryArtifact(
  appRoot: string,
  registry: AuthenticatedMutationRegistryV3,
): Promise<void> {
  const artifactPath = path.resolve(
    appRoot,
    AUTHENTICATED_MUTATION_REGISTRY_ARTIFACT_PATH,
  );
  await mkdir(path.dirname(artifactPath), { recursive: true });
  const canonical = canonicalizeAuthenticatedMutationRegistry(registry);
  await writeFile(
    artifactPath,
    `${JSON.stringify(JSON.parse(canonical), null, 2)}\n`,
    "utf8",
  );
}

function toRepositoryPath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function byteCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function elapsedReceipt(result: AuthenticatedMutationAuditResult) {
  if (!result.registry || !result.receipt || !result.semanticReceipt) {
    return {
      schemaVersion: "overgarden.authenticated-mutation-audit.v1",
      state: "inconclusive",
      failureClass: result.failureClass,
      baselineSha: result.baselineSha,
      elapsedBucket: result.elapsedBucket,
      evidenceSafety: "counts_digests_paths_and_classes_only",
    };
  }
  return {
    schemaVersion: "overgarden.authenticated-mutation-audit.v1",
    state: result.terminalState,
    baselineSha: result.baselineSha,
    elapsedBucket: result.elapsedBucket,
    counts: result.counts,
    registryDigest: result.receipt.registryDigest,
    sourceEvidenceDigest: result.receipt.sourceEvidenceDigest,
    receiptDigest: result.receipt.receiptDigest,
    semanticManifestDigest: result.semanticReceipt.manifestDigest,
    semanticSourceEvidenceDigest: result.semanticReceipt.sourceEvidenceDigest,
    semanticReceiptDigest: result.semanticReceipt.receiptDigest,
    sourcePolicyFindings: result.sourcePolicyFindings,
    registryFindings: result.registryFindings.map(({ code, subjectId }) => ({
      code,
      subjectId,
    })),
    semanticFindings: result.semanticFindings.map(({ code, subjectId }) => ({
      code,
      subjectId,
    })),
    evidenceSafety: "counts_digests_paths_and_classes_only",
  };
}

async function main(): Promise<void> {
  const appRoot = DEFAULT_APP_WEB_ROOT;
  const result = await runAuthenticatedMutationSurfaceAudit({ appRoot });
  let artifactState: "matching" | "missing" | "drifted" | "written" =
    "missing";
  if (result.registry && process.argv.includes("--write-artifact")) {
    if (result.terminalState !== "ready") {
      throw new Error("an inconclusive mutation audit cannot write an artifact");
    }
    await writeAuthenticatedMutationRegistryArtifact(appRoot, result.registry);
    artifactState = "written";
  } else if (result.registry && process.argv.includes("--check")) {
    const artifact = await readAuthenticatedMutationRegistryArtifact(appRoot);
    artifactState = !artifact
      ? "missing"
      : canonicalizeAuthenticatedMutationRegistry(artifact) ===
          canonicalizeAuthenticatedMutationRegistry(result.registry)
        ? "matching"
        : "drifted";
  }

  const runtimeIsolation = process.argv.includes("--check-runtime-imports")
    ? await verifyAuthenticatedMutationRuntimeIsolation({ appRoot })
    : null;
  const success =
    result.terminalState === "ready" &&
    (!process.argv.includes("--check") || artifactState === "matching") &&
    (!runtimeIsolation || runtimeIsolation.state === "safe");
  const output = {
    ...elapsedReceipt(result),
    artifactState,
    runtimeIsolation,
  };
  (success ? process.stdout : process.stderr).write(
    `${JSON.stringify(output, null, 2)}\n`,
  );
  if (!success) process.exitCode = 1;
}

const DEFAULT_APP_WEB_ROOT = path.resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        schemaVersion: "overgarden.authenticated-mutation-audit.v1",
        state: "inconclusive",
        failureClass: "unexpected_error",
        errorClass: error instanceof Error ? error.name : "unknown_error",
        evidenceSafety: "no_source_or_protected_payload",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
