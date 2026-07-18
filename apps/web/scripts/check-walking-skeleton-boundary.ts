import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type BoundarySurface = "repository-source" | "next-production-output";
type MarkerClass =
  | "shared-skeleton-email"
  | "shared-skeleton-password"
  | "shared-skeleton-account-name"
  | "shared-local-dev-email"
  | "shared-local-dev-password"
  | "shared-local-dev-account-name"
  | "legacy-skeleton-server-action-symbol"
  | "legacy-skeleton-server-action-path"
  | "retired-auth-component-symbol"
  | "legacy-walking-auth-component-module"
  | "legacy-local-dev-default-prefix";

type MarkerMatchContext = "account-name-initializer" | "any";

interface DigestRepresentation {
  byteLength: number;
  prefixRollingHash: number;
  sha256: string;
}

interface ForbiddenMarker {
  markerClass: MarkerClass;
  matchContext: MarkerMatchContext;
  representations: readonly DigestRepresentation[];
}

interface DigestMatch {
  end: number;
  markerClass: MarkerClass;
  start: number;
}

export interface WalkingSkeletonBoundaryMarkerFixture {
  markerClass: MarkerClass;
  matchContext?: MarkerMatchContext;
  value: string;
}

type StaticExpressionValue = string | readonly StaticExpressionValue[];

interface StaticScope {
  parent?: StaticScope;
  values: Map<string, StaticExpressionValue>;
}

export interface WalkingSkeletonBoundaryFinding {
  markerClass: MarkerClass;
  relativePath: string;
  surface: BoundarySurface;
}

export interface WalkingSkeletonBoundaryReport {
  buildFileCount: number;
  findings: WalkingSkeletonBoundaryFinding[];
  repositoryFileCount: number;
}

export interface WalkingSkeletonBoundaryOptions {
  buildOutputDirectory?: string;
  repositoryRoot: string;
  requireBuildOutput?: boolean;
}

const NEXT_NON_PRODUCTION_DIRECTORIES = new Set([
  "cache",
  "dev",
  "diagnostics",
  "turbopack",
]);
const REPOSITORY_FALLBACK_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".cache",
  ".runtime",
  ".turbo",
  ".vercel",
  "build",
  "cache",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "storybook-static",
  "temp",
  "test-results",
  "tmp",
]);
const SCRIPT_SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".json",
  ".ts",
  ".tsx",
]);
const ROLLING_HASH_BASE = 257;
const DIGEST_PREFIX_BYTES = 8;
const MAX_STATIC_COLLECTION_ITEMS = 64;

export function scanWalkingSkeletonBoundary(
  options: WalkingSkeletonBoundaryOptions,
): WalkingSkeletonBoundaryReport {
  return scanWalkingSkeletonBoundaryWithMarkers(
    options,
    PRODUCTION_FORBIDDEN_MARKERS,
  );
}

export function scanWalkingSkeletonBoundaryWithSyntheticMarkers(
  options: WalkingSkeletonBoundaryOptions,
  markerFixtures: readonly WalkingSkeletonBoundaryMarkerFixture[],
): WalkingSkeletonBoundaryReport {
  if (markerFixtures.length === 0) {
    throw new Error("Synthetic boundary scan requires at least one marker.");
  }
  return scanWalkingSkeletonBoundaryWithMarkers(
    options,
    markerFixtures.map(createFixtureMarker),
  );
}

function scanWalkingSkeletonBoundaryWithMarkers(
  options: WalkingSkeletonBoundaryOptions,
  markers: readonly ForbiddenMarker[],
): WalkingSkeletonBoundaryReport {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const buildOutputDirectory = path.resolve(
    options.buildOutputDirectory ??
      path.join(repositoryRoot, "apps", "web", ".next"),
  );
  const repositoryFiles = excludeBuildOutput(
    repositoryRoot,
    buildOutputDirectory,
    listRepositoryFiles(repositoryRoot),
  );
  const findings = scanFiles(
    repositoryRoot,
    repositoryFiles,
    "repository-source",
    markers,
  );

  if (!existsSync(buildOutputDirectory)) {
    if (options.requireBuildOutput) {
      throw new Error(
        "Walking-skeleton boundary requires a completed Next production build.",
      );
    }
    return {
      buildFileCount: 0,
      findings,
      repositoryFileCount: repositoryFiles.length,
    };
  }

  const buildFiles = listNextProductionFiles(buildOutputDirectory);
  if (options.requireBuildOutput) {
    assertCompleteNextProductionOutput(buildOutputDirectory, buildFiles);
  }
  findings.push(
    ...scanFiles(
      buildOutputDirectory,
      buildFiles,
      "next-production-output",
      markers,
    ),
  );

  return {
    buildFileCount: buildFiles.length,
    findings,
    repositoryFileCount: repositoryFiles.length,
  };
}

export function assertWalkingSkeletonBoundary(
  report: WalkingSkeletonBoundaryReport,
): void {
  if (report.findings.length === 0) return;

  const redactedFindings = report.findings.map(
    (finding) =>
      `${finding.markerClass} [${finding.surface}] ${redactControlCharacters(
        finding.relativePath,
      )}`,
  );
  throw new Error(
    `Walking-skeleton credential boundary failed: ${redactedFindings.join(
      ", ",
    )}.`,
  );
}

// Production markers are one-way digest metadata only. The scanner never
// stores or reconstructs the retired identities or removed source symbols.
// Each tuple is [UTF-8 byte length, 8-byte prefix digest, SHA-256 digest].
const PRODUCTION_FORBIDDEN_MARKERS: readonly ForbiddenMarker[] = [
  digestMarker("shared-skeleton-email", "any", [
    [
      20,
      2048193901,
      "aa1e7a4cca79271246d0b8497635518b75a95560d4d68744ca5a795176e4440a",
    ],
    [
      28,
      1691090348,
      "38cbecff9abef552daafb60fb259692a1a2d56b47ab1da81aadbb84e83878c99",
    ],
    [
      27,
      1691090348,
      "6ff52bfedc26db1fb75da5166fe57cb25a00b6c1984f3edaefa905fa8cffc063",
    ],
  ]),
  digestMarker("shared-skeleton-password", "any", [
    [
      28,
      3833402978,
      "09b034c3f56bbc258cfbe11c0ee12e5a7474173fcafdd731710e84c99ca30c50",
    ],
    [
      40,
      1374345215,
      "0504314515dba91aab2370ce8ac6e1042910e377761f3ebf7f73e72a2c1380e6",
    ],
    [
      38,
      1374345215,
      "660fbf04cefe0b45255034eb5c2bf6de9462ffee95352dc995576d1bca4e6283",
    ],
  ]),
  digestMarker("shared-skeleton-account-name", "account-name-initializer", [
    [
      16,
      561515509,
      "0357339f1111d18c49f9c80d9bd0d96b36a7b9f54c3ec12945ea31688affd67b",
    ],
    [
      24,
      3925852605,
      "ab8843d4722fb81389cdfa52e7c2beb0e8b5f0bebd99f658f2b851187515a740",
    ],
    [
      22,
      3925852605,
      "c2a2ae77272bff565e874a90e69c098819abe69e0faed76edaa8bbf16f991280",
    ],
  ]),
  digestMarker("shared-local-dev-email", "any", [
    [
      20,
      1859022928,
      "88874454b978fa046bc0f7e2ea012a4971b98614ad8faa58dce5b637d57e8c22",
    ],
    [
      28,
      2272785599,
      "3ea499afecfb4ebf9edcb0a0534583797efe1359807c394c77e3eafa57628644",
    ],
    [
      27,
      2272785599,
      "d59db4b3ee04bb453fe6f27e828c49d2177743da957a5d51370fb48d8c240a3b",
    ],
  ]),
  digestMarker("shared-local-dev-password", "any", [
    [
      25,
      3833402978,
      "90e541d842a97efe2d25b8309dfc50075d64d2340b0f63d2acbe5607feb4f1c5",
    ],
    [
      36,
      1374345215,
      "8958ec9f4feb8690afc9a83ca9244d3025c9213914796055a0a978136774cb28",
    ],
    [
      34,
      1374345215,
      "7a1fd401d41966223c88491a0495ed347d9d8c6de389dae18df2c9cf2b234da0",
    ],
  ]),
  digestMarker("shared-local-dev-account-name", "any", [
    [
      14,
      948374203,
      "9f51e1be0a4f0be56cfc6829c51fc0139f09fda69272c5a35e4693c940005433",
    ],
    [
      20,
      2590378452,
      "777f95d6e49221e9b50c04ca4d988c6d2aa8faf7730fc71f565fa9507b74c114",
    ],
    [
      19,
      2590378452,
      "52661b2a24ce4b2eab086d0c06e0192d4553b99997c2b5631087e0f58b1d3fc2",
    ],
  ]),
  digestMarker("legacy-skeleton-server-action-symbol", "any", [
    [
      26,
      3087627834,
      "9ce5348fe314aafb8be95c91db86971e3f5c9b3944e723e90e9295b8c33fed93",
    ],
    [
      36,
      1801055929,
      "29706892f0c5c623c7e2536cf1188d1e2adadec78ffd1734ea2601a55711e666",
    ],
    [
      35,
      1801055929,
      "4aa703ab69075fdd907e775eef1a3aada715c90e7f4be84ad773eec696e6c2be",
    ],
  ]),
  digestMarker("legacy-skeleton-server-action-path", "any", [
    [
      20,
      3993364007,
      "ac8911ef329b80da4dc9c6ce9cb440ecf7d2ca41c9aebbee4b75ab60c5737cb7",
    ],
    [
      28,
      539712433,
      "7b49baab0300e6e9e7bbe1603f9cef3ce28db7e1d5731bb41432105cbcf80aa8",
    ],
    [
      27,
      539712433,
      "460b57c964cb3dc4b8ecd6af5f80df5c9b38fc386cdc10852a8184bcb55a65a6",
    ],
  ]),
  digestMarker("retired-auth-component-symbol", "any", [
    [
      17,
      393483597,
      "cc36577fa129ddbf7357809ae0697ab4779f47c38c38bbc6da15f79b17025df0",
    ],
    [
      24,
      2040896414,
      "c201c4e5c4a52fca454bf12dcfad974cf22b8ee371c7f9b1728cff83d199158c",
    ],
    [
      23,
      2040896414,
      "c0d308dc36aa0a7d112dac6e0cce15291d5ed66d5bbd1c1c9394def0bd8a1838",
    ],
  ]),
  digestMarker("legacy-walking-auth-component-module", "any", [
    [
      19,
      2048193901,
      "3abc8e667fb7bf0f4d60d047b42656d3774656c7fbafe121429c89a671ee85db",
    ],
    [
      28,
      1691090348,
      "86241ba74d28711314ed76b06e30de4e258f56e4ba0bff87a37b05dd3498c5a8",
    ],
    [
      26,
      1691090348,
      "bd1ee82bc3befc42a38021d746e186ab8c80a832313d9decf1ed454e50eab58a",
    ],
  ]),
  digestMarker("legacy-local-dev-default-prefix", "any", [
    [
      18,
      3565438299,
      "507cf607e27e494b374f8ed190614b0f740e73a5fe5acd57c1be591e70bfc727",
    ],
    [
      24,
      3511241378,
      "fe6d875c5a071dc6554cd9d42fe17555ec42898c3de8a488d105e2d101401b83",
    ],
  ]),
];

function digestMarker(
  markerClass: MarkerClass,
  matchContext: MarkerMatchContext,
  representations: ReadonlyArray<
    readonly [byteLength: number, prefixRollingHash: number, sha256: string]
  >,
): ForbiddenMarker {
  return {
    markerClass,
    matchContext,
    representations: representations.map(
      ([byteLength, prefixRollingHash, sha256]) => ({
        byteLength,
        prefixRollingHash,
        sha256,
      }),
    ),
  };
}

function createFixtureMarker(
  fixture: WalkingSkeletonBoundaryMarkerFixture,
): ForbiddenMarker {
  const representations = new Map<string, Buffer>();
  const value = Buffer.from(fixture.value, "utf8");
  for (const representation of [
    value,
    Buffer.from(value.toString("base64"), "utf8"),
    Buffer.from(value.toString("base64url"), "utf8"),
  ]) {
    representations.set(representation.toString("hex"), representation);
  }

  return {
    markerClass: fixture.markerClass,
    matchContext: fixture.matchContext ?? "any",
    representations: [...representations.values()].map((representation) => ({
      byteLength: representation.length,
      prefixRollingHash: rollingHash(
        representation.subarray(0, DIGEST_PREFIX_BYTES),
      ),
      sha256: sha256(representation),
    })),
  };
}

function findDerivedMarkerClasses(
  content: Buffer,
  relativePath: string,
  markers: readonly ForbiddenMarker[],
): Set<MarkerClass> {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!SCRIPT_SOURCE_EXTENSIONS.has(path.extname(normalizedPath))) {
    return new Set();
  }

  const sourceText = content.toString("utf8");
  const sourceFile = ts.createSourceFile(
    normalizedPath,
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    scriptKindForPath(normalizedPath),
  );
  const findings = new Set<MarkerClass>();
  visitStaticSource(sourceFile, createStaticScope(), markers, findings);
  return findings;
}

function scriptKindForPath(relativePath: string): ts.ScriptKind {
  switch (path.extname(relativePath)) {
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".json":
      return ts.ScriptKind.JSON;
    default:
      return ts.ScriptKind.TS;
  }
}

function createStaticScope(parent?: StaticScope): StaticScope {
  return { parent, values: new Map() };
}

function visitStaticSource(
  node: ts.Node,
  scope: StaticScope,
  markers: readonly ForbiddenMarker[],
  findings: Set<MarkerClass>,
): void {
  if (ts.isSourceFile(node)) {
    visitStaticStatements(node.statements, scope, markers, findings);
    return;
  }

  if (ts.isBlock(node) || ts.isModuleBlock(node)) {
    visitStaticStatements(
      node.statements,
      createStaticScope(scope),
      markers,
      findings,
    );
    return;
  }

  if (ts.isFunctionLike(node)) {
    const functionScope = createStaticScope(scope);
    for (const parameter of node.parameters) {
      if (parameter.initializer && ts.isIdentifier(parameter.name)) {
        const value = evaluateStaticExpression(
          parameter.initializer,
          functionScope,
        );
        if (value !== undefined) {
          functionScope.values.set(parameter.name.text, value);
        }
      }
    }
    const body = "body" in node ? node.body : undefined;
    if (body) {
      visitStaticSource(body, functionScope, markers, findings);
    }
    return;
  }

  inspectStaticExpression(node, scope, markers, findings);
  ts.forEachChild(node, (child) =>
    visitStaticSource(child, scope, markers, findings),
  );
}

function visitStaticStatements(
  statements: ts.NodeArray<ts.Statement>,
  scope: StaticScope,
  markers: readonly ForbiddenMarker[],
  findings: Set<MarkerClass>,
) {
  for (const statement of statements) {
    if (
      ts.isVariableStatement(statement) &&
      (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer) {
          inspectStaticExpression(
            declaration.initializer,
            scope,
            markers,
            findings,
          );
          visitStaticSource(declaration.initializer, scope, markers, findings);
        }
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          const value = evaluateStaticExpression(
            declaration.initializer,
            scope,
          );
          if (value !== undefined) {
            scope.values.set(declaration.name.text, value);
          }
        }
      }
      continue;
    }

    visitStaticSource(statement, scope, markers, findings);
  }
}

function inspectStaticExpression(
  node: ts.Node,
  scope: StaticScope,
  markers: readonly ForbiddenMarker[],
  findings: Set<MarkerClass>,
) {
  if (!ts.isExpression(node)) return;
  const value = evaluateStaticExpression(node, scope);
  if (value === undefined) return;

  for (const staticString of collectStaticStrings(value)) {
    const buffers = [
      Buffer.from(staticString, "utf8"),
      ...decodeCanonicalBase64(staticString),
    ];
    for (const buffer of buffers) {
      for (const match of findDigestMatches(buffer, markers, true)) {
        const marker = markers.find(
          (candidate) => candidate.markerClass === match.markerClass,
        );
        if (
          marker &&
          (marker.matchContext === "any" || isAccountNameInitializer(node))
        ) {
          findings.add(marker.markerClass);
        }
      }
    }
  }
}

function collectStaticStrings(value: StaticExpressionValue): string[] {
  if (typeof value === "string") return [value];
  return value.flatMap(collectStaticStrings);
}

function isAccountNameInitializer(node: ts.Expression) {
  let current: ts.Node = node;
  while (
    ts.isParenthesizedExpression(current.parent) ||
    ts.isAsExpression(current.parent) ||
    ts.isSatisfiesExpression(current.parent) ||
    ts.isTypeAssertionExpression(current.parent) ||
    ts.isNonNullExpression(current.parent)
  ) {
    current = current.parent;
  }
  return (
    ts.isPropertyAssignment(current.parent) &&
    propertyNameText(current.parent.name) === "name" &&
    current.parent.initializer === current
  );
}

function propertyNameText(name: ts.PropertyName) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return undefined;
}

function evaluateStaticExpression(
  expression: ts.Expression,
  scope: StaticScope,
  seenIdentifiers = new Set<string>(),
): StaticExpressionValue | undefined {
  const unwrapped = unwrapExpression(expression);

  if (
    ts.isStringLiteral(unwrapped) ||
    ts.isNoSubstitutionTemplateLiteral(unwrapped)
  ) {
    return unwrapped.text;
  }
  if (ts.isNumericLiteral(unwrapped)) return unwrapped.text;
  if (ts.isIdentifier(unwrapped)) {
    if (seenIdentifiers.has(unwrapped.text)) return undefined;
    const value = findStaticValue(scope, unwrapped.text);
    if (value === undefined) return undefined;
    seenIdentifiers.add(unwrapped.text);
    return value;
  }
  if (
    ts.isBinaryExpression(unwrapped) &&
    unwrapped.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = evaluateStaticExpression(
      unwrapped.left,
      scope,
      new Set(seenIdentifiers),
    );
    const right = evaluateStaticExpression(
      unwrapped.right,
      scope,
      new Set(seenIdentifiers),
    );
    return typeof left === "string" && typeof right === "string"
      ? left + right
      : undefined;
  }
  if (ts.isTemplateExpression(unwrapped)) {
    let value = unwrapped.head.text;
    for (const span of unwrapped.templateSpans) {
      const expressionValue = evaluateStaticExpression(
        span.expression,
        scope,
        new Set(seenIdentifiers),
      );
      if (typeof expressionValue !== "string") return undefined;
      value += expressionValue + span.literal.text;
    }
    return value;
  }
  if (ts.isArrayLiteralExpression(unwrapped)) {
    if (unwrapped.elements.length > MAX_STATIC_COLLECTION_ITEMS) {
      return undefined;
    }
    const values: StaticExpressionValue[] = [];
    for (const element of unwrapped.elements) {
      if (ts.isSpreadElement(element)) {
        const spreadValue = evaluateStaticExpression(
          element.expression,
          scope,
          new Set(seenIdentifiers),
        );
        if (!Array.isArray(spreadValue)) return undefined;
        values.push(...spreadValue);
        if (values.length > MAX_STATIC_COLLECTION_ITEMS) return undefined;
        continue;
      }
      const elementValue = evaluateStaticExpression(
        element,
        scope,
        new Set(seenIdentifiers),
      );
      if (elementValue === undefined) return undefined;
      values.push(elementValue);
    }
    return values;
  }
  if (
    ts.isCallExpression(unwrapped) &&
    ts.isPropertyAccessExpression(unwrapped.expression) &&
    unwrapped.expression.name.text === "join" &&
    unwrapped.arguments.length <= 1
  ) {
    const receiver = evaluateStaticExpression(
      unwrapped.expression.expression,
      scope,
      new Set(seenIdentifiers),
    );
    if (!Array.isArray(receiver)) return undefined;
    const separator = unwrapped.arguments[0]
      ? evaluateStaticExpression(
          unwrapped.arguments[0],
          scope,
          new Set(seenIdentifiers),
        )
      : ",";
    if (typeof separator !== "string") return undefined;
    const elements = receiver.map(staticArrayElementToString);
    return elements.every((element): element is string => element !== undefined)
      ? elements.join(separator)
      : undefined;
  }
  if (
    ts.isCallExpression(unwrapped) &&
    ts.isPropertyAccessExpression(unwrapped.expression) &&
    unwrapped.expression.name.text === "map" &&
    unwrapped.arguments.length === 1 &&
    ts.isArrowFunction(unwrapped.arguments[0]) &&
    !ts.isBlock(unwrapped.arguments[0].body) &&
    unwrapped.arguments[0].parameters.length === 1
  ) {
    const receiver = evaluateStaticExpression(
      unwrapped.expression.expression,
      scope,
      new Set(seenIdentifiers),
    );
    if (
      !Array.isArray(receiver) ||
      receiver.length > MAX_STATIC_COLLECTION_ITEMS
    ) {
      return undefined;
    }

    const callback = unwrapped.arguments[0];
    const callbackBody = callback.body;
    if (ts.isBlock(callbackBody)) return undefined;
    const results: StaticExpressionValue[] = [];
    for (const item of receiver) {
      const callbackScope = createStaticScope(scope);
      if (
        !bindStaticParameter(callback.parameters[0]!.name, item, callbackScope)
      ) {
        return undefined;
      }
      const result = evaluateStaticExpression(
        callbackBody,
        callbackScope,
        new Set(),
      );
      if (result === undefined) return undefined;
      results.push(result);
    }
    return results;
  }

  return undefined;
}

function staticArrayElementToString(
  value: StaticExpressionValue,
): string | undefined {
  if (typeof value === "string") return value;
  const elements = value.map(staticArrayElementToString);
  return elements.every((element): element is string => element !== undefined)
    ? elements.join(",")
    : undefined;
}

function bindStaticParameter(
  name: ts.BindingName,
  value: StaticExpressionValue,
  scope: StaticScope,
): boolean {
  if (ts.isIdentifier(name)) {
    scope.values.set(name.text, value);
    return true;
  }
  if (!ts.isArrayBindingPattern(name) || !Array.isArray(value)) return false;
  if (name.elements.length > MAX_STATIC_COLLECTION_ITEMS) return false;

  for (let index = 0; index < name.elements.length; index += 1) {
    const element = name.elements[index];
    if (!element || ts.isOmittedExpression(element)) continue;
    if (element.dotDotDotToken) {
      return bindStaticParameter(element.name, value.slice(index), scope);
    }
    const item = value[index];
    if (item === undefined || !bindStaticParameter(element.name, item, scope)) {
      return false;
    }
  }
  return true;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function findStaticValue(scope: StaticScope, name: string) {
  let current: StaticScope | undefined = scope;
  while (current) {
    const value = current.values.get(name);
    if (value !== undefined) return value;
    current = current.parent;
  }
  return undefined;
}

function decodeCanonicalBase64(value: string): Buffer[] {
  if (value.length < 8 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return [];

  const decoded = new Map<string, Buffer>();
  for (const encoding of ["base64", "base64url"] as const) {
    try {
      const bytes = Buffer.from(value, encoding);
      if (bytes.length === 0) continue;
      const canonical = bytes.toString(encoding);
      if (canonical.replace(/=+$/u, "") !== value.replace(/=+$/u, "")) {
        continue;
      }
      const text = bytes.toString("utf8");
      if (Buffer.from(text, "utf8").equals(bytes)) {
        decoded.set(bytes.toString("hex"), bytes);
      }
    } catch {
      // Non-canonical encoded strings are not static evidence.
    }
  }
  return [...decoded.values()];
}

function findDigestMatches(
  content: Buffer,
  markers: readonly ForbiddenMarker[],
  includeContextual = false,
): DigestMatch[] {
  if (content.length < DIGEST_PREFIX_BYTES) return [];

  const candidatesByPrefix = new Map<
    number,
    Array<{ marker: ForbiddenMarker; representation: DigestRepresentation }>
  >();
  for (const marker of markers) {
    if (!includeContextual && marker.matchContext !== "any") continue;
    for (const representation of marker.representations) {
      if (representation.byteLength < DIGEST_PREFIX_BYTES) continue;
      const candidates =
        candidatesByPrefix.get(representation.prefixRollingHash) ?? [];
      candidates.push({ marker, representation });
      candidatesByPrefix.set(representation.prefixRollingHash, candidates);
    }
  }

  const matches = new Map<string, DigestMatch>();
  const trailingPower = rollingHashPower(DIGEST_PREFIX_BYTES - 1);
  let prefixHash = rollingHash(content.subarray(0, DIGEST_PREFIX_BYTES));
  for (
    let start = 0;
    start <= content.length - DIGEST_PREFIX_BYTES;
    start += 1
  ) {
    const candidates = candidatesByPrefix.get(prefixHash);
    if (candidates) {
      for (const candidate of candidates) {
        const end = start + candidate.representation.byteLength;
        if (end > content.length) continue;
        if (
          sha256(content.subarray(start, end)) !==
          candidate.representation.sha256
        ) {
          continue;
        }
        const match = {
          end,
          markerClass: candidate.marker.markerClass,
          start,
        };
        matches.set(`${match.markerClass}:${match.start}:${match.end}`, match);
      }
    }

    if (start === content.length - DIGEST_PREFIX_BYTES) break;
    prefixHash = slideRollingHash(
      prefixHash,
      content[start] ?? 0,
      content[start + DIGEST_PREFIX_BYTES] ?? 0,
      trailingPower,
    );
  }

  return [...matches.values()].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
}

function rollingHash(content: Buffer) {
  let digest = 0;
  for (const byte of content) {
    digest = (Math.imul(digest, ROLLING_HASH_BASE) + byte + 1) >>> 0;
  }
  return digest;
}

function rollingHashPower(exponent: number) {
  let power = 1;
  for (let index = 0; index < exponent; index += 1) {
    power = Math.imul(power, ROLLING_HASH_BASE) >>> 0;
  }
  return power;
}

function slideRollingHash(
  current: number,
  outgoingByte: number,
  incomingByte: number,
  trailingPower: number,
) {
  const withoutOutgoing =
    (current - Math.imul(outgoingByte + 1, trailingPower)) >>> 0;
  return (
    (Math.imul(withoutOutgoing, ROLLING_HASH_BASE) + incomingByte + 1) >>> 0
  );
}

function sha256(content: Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

function redactDiagnosticPath(
  relativePath: string,
  markers: readonly ForbiddenMarker[],
) {
  const content = Buffer.from(relativePath, "utf8");
  const matches = findDigestMatches(content, markers, true);
  if (matches.length === 0) return redactControlCharacters(relativePath);

  const parts: string[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    parts.push(content.subarray(cursor, match.start).toString("utf8"));
    parts.push("[redacted]");
    cursor = match.end;
  }
  parts.push(content.subarray(cursor).toString("utf8"));
  return redactControlCharacters(parts.join(""));
}

function redactControlCharacters(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/gu, "?");
}

function listRepositoryFiles(repositoryRoot: string): string[] {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      {
        cwd: repositoryRoot,
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const files = output
      .toString("utf8")
      .split("\0")
      .filter((value) => value.length > 0)
      .filter((relativePath) =>
        existsSync(path.join(repositoryRoot, relativePath)),
      )
      .sort();
    if (files.length > 0) return files;
  } catch {
    // Vercel source bundles may intentionally omit Git metadata and sometimes
    // the Git binary. Fall through to the bounded filesystem inventory.
  }

  const files: string[] = [];
  visitRepositoryFallbackDirectory(repositoryRoot, "", files);
  if (files.length === 0) {
    throw new Error(
      "Walking-skeleton boundary could not establish a repository source inventory.",
    );
  }
  return files.sort();
}

function visitRepositoryFallbackDirectory(
  repositoryRoot: string,
  relativeDirectory: string,
  files: string[],
) {
  const directory = path.join(repositoryRoot, relativeDirectory);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      REPOSITORY_FALLBACK_EXCLUDED_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      visitRepositoryFallbackDirectory(repositoryRoot, relativePath, files);
    } else if (entry.isFile() && !isRuntimeEnvironmentFile(entry.name)) {
      files.push(relativePath);
    }
  }
}

function isRuntimeEnvironmentFile(filename: string) {
  return (
    filename === ".env" ||
    (filename.startsWith(".env.") && filename !== ".env.example")
  );
}

function excludeBuildOutput(
  repositoryRoot: string,
  buildOutputDirectory: string,
  repositoryFiles: readonly string[],
) {
  const relativeBuildOutput = path.relative(
    repositoryRoot,
    buildOutputDirectory,
  );
  if (
    !relativeBuildOutput ||
    relativeBuildOutput === ".." ||
    relativeBuildOutput.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeBuildOutput)
  ) {
    return [...repositoryFiles];
  }

  return repositoryFiles.filter(
    (relativePath) =>
      relativePath !== relativeBuildOutput &&
      !relativePath.startsWith(`${relativeBuildOutput}${path.sep}`),
  );
}

function listNextProductionFiles(buildOutputDirectory: string): string[] {
  const files: string[] = [];
  visitBuildDirectory(buildOutputDirectory, "", files);
  return files.sort();
}

function assertCompleteNextProductionOutput(
  buildOutputDirectory: string,
  buildFiles: readonly string[],
) {
  const buildIdPath = path.join(buildOutputDirectory, "BUILD_ID");
  const appPathsManifestPath = path.join(
    buildOutputDirectory,
    "server",
    "app-paths-manifest.json",
  );
  const hasStaticJavaScriptChunk = buildFiles.some(isStaticJavaScriptChunk);

  if (
    buildFiles.length === 0 ||
    !isRegularFile(buildIdPath) ||
    readFileSync(buildIdPath, "utf8").trim().length === 0 ||
    !isRegularFile(appPathsManifestPath) ||
    !hasStaticJavaScriptChunk
  ) {
    throw new Error(
      "Walking-skeleton boundary requires complete Next production build output.",
    );
  }
}

function isStaticJavaScriptChunk(relativePath: string) {
  return /^static\/chunks\/.+\.js$/.test(normalizeRelativePath(relativePath));
}

function isRegularFile(filePath: string) {
  return existsSync(filePath) && lstatSync(filePath).isFile();
}

function visitBuildDirectory(
  buildOutputDirectory: string,
  relativeDirectory: string,
  files: string[],
) {
  const directory = path.join(buildOutputDirectory, relativeDirectory);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      relativeDirectory === "" &&
      entry.isDirectory() &&
      NEXT_NON_PRODUCTION_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      visitBuildDirectory(buildOutputDirectory, relativePath, files);
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}

function scanFiles(
  root: string,
  relativePaths: readonly string[],
  surface: BoundarySurface,
  markers: readonly ForbiddenMarker[],
): WalkingSkeletonBoundaryFinding[] {
  const findings: WalkingSkeletonBoundaryFinding[] = [];

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(root, relativePath);
    if (!statSync(absolutePath).isFile()) continue;
    const content = readFileSync(absolutePath);
    const derivedMarkerClasses = findDerivedMarkerClasses(
      content,
      relativePath,
      markers,
    );
    const exactMarkerClasses = new Set(
      findDigestMatches(content, markers).map((match) => match.markerClass),
    );

    for (const marker of markers) {
      if (
        exactMarkerClasses.has(marker.markerClass) ||
        derivedMarkerClasses.has(marker.markerClass)
      ) {
        findings.push({
          markerClass: marker.markerClass,
          relativePath: redactDiagnosticPath(
            normalizeRelativePath(relativePath),
            markers,
          ),
          surface,
        });
      }
    }
  }

  return findings;
}

function normalizeRelativePath(value: string) {
  return value.split(path.sep).join("/");
}

function parseRequireBuildOutput(argv: readonly string[]) {
  const args = argv.filter((value) => value !== "--");
  const unknown = args.filter((value) => value !== "--require-build-output");
  if (unknown.length > 0) {
    throw new Error("Unknown walking-skeleton boundary option.");
  }
  return args.includes("--require-build-output");
}

function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(scriptDirectory, "..", "..", "..");
  const report = scanWalkingSkeletonBoundary({
    repositoryRoot,
    requireBuildOutput: parseRequireBuildOutput(process.argv.slice(2)),
  });
  assertWalkingSkeletonBoundary(report);
  process.stdout.write(
    `Walking-skeleton boundary OK (${report.repositoryFileCount} repository files, ${report.buildFileCount} production build files).\n`,
  );
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) main();
