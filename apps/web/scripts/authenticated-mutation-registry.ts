import { createHash } from "node:crypto";
import path from "node:path";

import ts from "typescript";

import {
  AuthenticatedMutationSourceGraph,
  type MutationAdmissionBinding,
  type MutationEffectTrace,
} from "./authenticated-mutation-source-graph";

export const AUTHENTICATED_MUTATION_REGISTRY_SCHEMA_VERSION =
  "overgarden.authenticated-mutation-registry.v3" as const;

export const AUTHENTICATED_MUTATION_SOURCE_POLICY = {
  excludedPathSegments: [
    "__test__",
    "__tests__",
    "fixture",
    "fixtures",
    "snapshot",
    "snapshots",
    "spec",
    "specs",
    "test",
    "tests",
  ],
  productionRoots: ["public/sw.js", "sql", "src"],
} as const;

export type AuthenticatedMutationTransport =
  | "server_action"
  | "route_handler"
  | "better_auth_callback"
  | "native_form"
  | "same_origin_fetch"
  | "offline_replay"
  | "browser_operator";

export type AuthenticatedMutationAuthority =
  | "authenticated_user"
  | "google_explicit_link"
  | "public_google_auth"
  | "public_credential_auth"
  | "password_recovery"
  | "public_session_read"
  | "admin"
  | "moderator"
  | "founder_operator"
  | "guest"
  | "locale"
  | "bearer_cron"
  | "visual_fixture"
  | "retired_facebook";

export type AuthenticatedMutationClassification =
  | "effectful"
  | "read_only"
  | "excluded_distinct_authority"
  | "retired_provider"
  | "unresolved";

export type AuthenticatedMutationExecutionOwner =
  | "owned_by_ove_295"
  | "high_risk_ove_290"
  | "remaining_ove_291"
  | "capability_runtime_ove_286"
  | "excluded_with_reason";

export type AuthenticatedMutationGenerationRequirement =
  | "required_before_first_effect"
  | "not_applicable";

export type AuthenticatedMutationAtomicity =
  | "database_transaction"
  | "browser_storage_transaction"
  | "auth_adapter_commit"
  | "provider_operation"
  | "cookie_commit"
  | "sql_trigger_commit"
  | "single_best_effort_attempt";

export type AuthenticatedMutationEffectFamily =
  | "canonical_row"
  | "transactional_outbox"
  | "public_projection"
  | "quarantine_object"
  | "public_derivative"
  | "auth_account"
  | "auth_session"
  | "browser_cookie"
  | "browser_storage"
  | "analytics_event"
  | "external_call";

export type AuthenticatedMutationExecutionMode =
  | "required"
  | "conditional"
  | "best_effort_after_commit"
  | "asynchronous_from_durable_intent";

export type AuthenticatedMutationBranchConditionClass =
  | "always"
  | "success"
  | "failure"
  | "present"
  | "absent"
  | "eligible"
  | "ineligible"
  | "provider_callback"
  | "retry";

export type AuthenticatedMutationSourceNodeKind =
  | "typed_action_prop"
  | "import"
  | "re_export"
  | "callback"
  | "route_handler"
  | "server_action"
  | "native_form"
  | "same_origin_call"
  | "auth_client_call"
  | "offline_producer"
  | "contextual_transaction"
  | "sql_trigger"
  | "effect_owner";

export interface AuthenticatedMutationPrerequisiteReceiptV3 {
  issueId: string;
  receiptDigest: string;
}

export interface AuthenticatedMutationSourceNodeV3 {
  sourceNodeId: string;
  path: string;
  symbol: string;
  nodeKind: AuthenticatedMutationSourceNodeKind;
  semanticVariant: string;
  resolutionState: "resolved" | "unresolved";
  evidencePaths: readonly string[];
}

export interface AuthenticatedMutationEntrypointV2 {
  entrypointId: string;
  path: string;
  symbol: string;
  variant: string;
  transport: AuthenticatedMutationTransport;
  authority: AuthenticatedMutationAuthority;
  classification: AuthenticatedMutationClassification;
  executionOwner: AuthenticatedMutationExecutionOwner;
  generationRequirement: AuthenticatedMutationGenerationRequirement;
  exclusionReason: string | null;
  evidencePaths: readonly string[];
}

export interface AuthenticatedMutationEffectBoundaryV2 {
  effectBoundaryId: string;
  ownerPath: string;
  ownerSymbol: string;
  commitLabel: string;
  atomicity: AuthenticatedMutationAtomicity;
  effectFamilies: readonly AuthenticatedMutationEffectFamily[];
  idempotencyOwner: string;
  evidencePaths: readonly string[];
}

export interface AuthenticatedMutationConsumerEdgeV2 {
  consumerEdgeId: string;
  entrypointId: string;
  effectBoundaryId: string;
  pipelineId: string;
  branchId: string;
  branchConditionClass: AuthenticatedMutationBranchConditionClass;
  predecessorEdgeIds: readonly string[];
  admissionBoundaryId: string;
  executionMode: AuthenticatedMutationExecutionMode;
  evidencePaths: readonly string[];
}

export interface AuthenticatedMutationRegistryV3 {
  schemaVersion: typeof AUTHENTICATED_MUTATION_REGISTRY_SCHEMA_VERSION;
  toolchain: {
    typescriptVersion: string;
    betterAuthVersion: string;
  };
  sourcePolicy: {
    productionRoots: readonly string[];
    excludedPathSegments: readonly string[];
  };
  prerequisiteReceipts: readonly AuthenticatedMutationPrerequisiteReceiptV3[];
  sourceNodes: readonly AuthenticatedMutationSourceNodeV3[];
  entrypoints: readonly AuthenticatedMutationEntrypointV2[];
  effectBoundaries: readonly AuthenticatedMutationEffectBoundaryV2[];
  consumerEdges: readonly AuthenticatedMutationConsumerEdgeV2[];
}

/** @deprecated The execution contract is v3; retained only as a source-compatible alias. */
export type AuthenticatedMutationRegistryV2 = AuthenticatedMutationRegistryV3;

export interface AuthenticatedMutationRegistryFinding {
  code:
    | "schema_version"
    | "source_policy_mismatch"
    | "missing_prerequisite_receipt"
    | "invalid_prerequisite_receipt"
    | "duplicate_source_node_id"
    | "unresolved_source_node"
    | "missing_source_node"
    | "invalid_branch_contract"
    | "empty_registry"
    | "duplicate_entrypoint_id"
    | "duplicate_effect_boundary_id"
    | "duplicate_consumer_edge_id"
    | "unresolved_entrypoint"
    | "invalid_entrypoint_contract"
    | "dangling_entrypoint"
    | "dangling_effect_boundary"
    | "dangling_admission_boundary"
    | "invalid_predecessor"
    | "pipeline_cycle"
    | "orphan_effect_boundary"
    | "missing_evidence"
    | "absolute_evidence_path"
    | "duplicate_set_member";
  subjectId: string;
  message: string;
}

export interface AuthenticatedMutationSourceEvidence {
  path: string;
  sourceText: string;
}

export interface AuthenticatedMutationRegistryReceiptV3 {
  schemaVersion: typeof AUTHENTICATED_MUTATION_REGISTRY_SCHEMA_VERSION;
  registryDigest: string;
  sourceEvidenceDigest: string;
  receiptDigest: string;
  decisionState: "ready" | "inconclusive";
}

/** @deprecated The execution contract is v3; retained only as a source-compatible alias. */
export type AuthenticatedMutationRegistryReceiptV2 =
  AuthenticatedMutationRegistryReceiptV3;

export interface AuthenticatedMutationDiscoveryInput {
  entrypointId: string;
  path: string;
  symbol: string;
  variant: string;
  transport: AuthenticatedMutationTransport;
}

interface ExpandedDiscoveryInput extends AuthenticatedMutationDiscoveryInput {
  evidencePaths: readonly string[];
  forcedAuthority?: AuthenticatedMutationAuthority;
  forcedExclusion?: {
    classification:
      | "read_only"
      | "excluded_distinct_authority"
      | "retired_provider";
    reason: string;
  };
  admissionBinding?: MutationAdmissionBinding;
  behaviorVariant?: string;
  effectTraceRoots?: readonly {
    path: string;
    symbol: string;
    executionMode?: AuthenticatedMutationExecutionMode;
  }[];
}

interface AdmissionEffectSpec {
  effect: AuthenticatedMutationEffectBoundaryV2;
  executionMode: AuthenticatedMutationExecutionMode;
}

export function buildAuthenticatedMutationRegistry(input: {
  discoveries: readonly AuthenticatedMutationDiscoveryInput[];
  sources: readonly AuthenticatedMutationSourceEvidence[];
  toolchain: AuthenticatedMutationRegistryV3["toolchain"];
  prerequisiteReceipts?: readonly AuthenticatedMutationPrerequisiteReceiptV3[];
}): AuthenticatedMutationRegistryV3 {
  const sources = input.sources.map((source) => ({
    path: normalizeRepositoryPath(source.path),
    sourceText: normalizeSourceText(source.sourceText),
  }));
  const sourceGraph = new AuthenticatedMutationSourceGraph(sources);
  const normalizedDiscoveries = [...input.discoveries]
    .map((discovery) => ({
      ...discovery,
      path: normalizeRepositoryPath(discovery.path),
      evidencePaths: [normalizeRepositoryPath(discovery.path)],
    }))
    .sort((left, right) => byteCompare(left.entrypointId, right.entrypointId));
  const authorityExpanded = normalizedDiscoveries.flatMap((discovery) =>
    expandAuthorityVariants(discovery, sourceGraph.sourceText(discovery.path)),
  );
  const behaviorExpanded = authorityExpanded.flatMap((discovery) =>
    expandBehaviorVariants(discovery, sourceGraph.sourceText(discovery.path)),
  );
  const serverAdmissionRefs = new Set(
    behaviorExpanded
      .filter(
        (discovery) =>
          discovery.transport === "server_action" ||
          discovery.transport === "route_handler",
      )
      .map((discovery) => sourceRefKey(discovery.path, discovery.symbol)),
  );
  const discoveries = behaviorExpanded
    .flatMap((discovery) =>
      expandNativeFormBindings(discovery, sourceGraph, serverAdmissionRefs),
    )
    .sort((left, right) => byteCompare(left.entrypointId, right.entrypointId));

  const classified = discoveries.map((discovery) =>
    classifyIntrinsicDiscovery(discovery, sourceGraph),
  );
  let classifiedById = new Map(
    classified.map((entrypoint) => [entrypoint.entrypointId, entrypoint]),
  );
  const admissionByEntrypoint = new Map<string, string>();
  const discoveryByEntrypointId = new Map(
    discoveries.map((discovery) => [discovery.entrypointId, discovery]),
  );

  for (const [index, discovery] of discoveries.entries()) {
    const entrypoint = classified[index]!;
    if (entrypoint.classification !== "unresolved") {
      if (entrypoint.classification === "effectful") {
        admissionByEntrypoint.set(
          entrypoint.entrypointId,
          entrypoint.entrypointId,
        );
      }
      continue;
    }
    const admissionId = resolveAdmissionBoundary(
      discovery,
      entrypoint,
      classified,
      classifiedById,
    );
    const admission = admissionId ? classifiedById.get(admissionId) : undefined;
    if (!admission) continue;
    classified[index] = classifyConsumerFromAdmission(entrypoint, admission);
    if (admission.classification === "effectful") {
      admissionByEntrypoint.set(
        entrypoint.entrypointId,
        admission.entrypointId,
      );
    }
  }
  classifiedById = new Map(
    classified.map((entrypoint) => [entrypoint.entrypointId, entrypoint]),
  );

  const effectSpecsByAdmission = new Map<
    string,
    readonly AdmissionEffectSpec[]
  >();
  for (const admissionId of new Set(admissionByEntrypoint.values())) {
    const admission = classifiedById.get(admissionId);
    if (!admission) continue;
    effectSpecsByAdmission.set(
      admissionId,
      inferAdmissionEffects(
        admission,
        sourceGraph,
        discoveryByEntrypointId.get(admissionId),
      ),
    );
  }

  const effectBoundaries = [
    ...new Map(
      [...effectSpecsByAdmission.values()]
        .flat()
        .map((spec) => [spec.effect.effectBoundaryId, spec.effect]),
    ).values(),
  ].sort((left, right) =>
    byteCompare(
      `${left.ownerPath}\0${left.ownerSymbol}\0${left.effectBoundaryId}`,
      `${right.ownerPath}\0${right.ownerSymbol}\0${right.effectBoundaryId}`,
    ),
  );
  const consumerEdges: AuthenticatedMutationConsumerEdgeV2[] = [];
  for (const entrypoint of classified) {
    if (entrypoint.classification !== "effectful") continue;
    const admissionId = admissionByEntrypoint.get(entrypoint.entrypointId);
    const effects = admissionId
      ? (effectSpecsByAdmission.get(admissionId) ?? [])
      : [];
    let lastRequiredEdgeId: string | null = null;
    for (const [index, spec] of effects.entries()) {
      const effect = spec.effect;
      const consumerEdgeId = `edge:${stableId(entrypoint.entrypointId)}:${index + 1}:${stableId(effect.effectBoundaryId)}`;
      const predecessorEdgeIds = lastRequiredEdgeId ? [lastRequiredEdgeId] : [];
      const branchConditionClass = branchConditionFor(entrypoint, spec);
      consumerEdges.push({
        consumerEdgeId,
        entrypointId: entrypoint.entrypointId,
        effectBoundaryId: effect.effectBoundaryId,
        pipelineId: `pipeline:${stableId(entrypoint.entrypointId)}`,
        branchId: `branch:${stableId(entrypoint.entrypointId)}:${branchConditionClass}`,
        branchConditionClass,
        predecessorEdgeIds,
        admissionBoundaryId: admissionId ?? entrypoint.entrypointId,
        executionMode: spec.executionMode,
        evidencePaths: normalizeSet([
          entrypoint.path,
          effect.ownerPath,
          ...(admissionId && admissionId !== entrypoint.entrypointId
            ? [classifiedById.get(admissionId)?.path ?? entrypoint.path]
            : []),
        ]),
      });
      if (spec.executionMode === "required") {
        lastRequiredEdgeId = consumerEdgeId;
      }
    }
  }

  const sourceNodes = buildAuthenticatedMutationSourceNodes(
    classified,
    effectBoundaries,
    sources,
  );

  return {
    schemaVersion: AUTHENTICATED_MUTATION_REGISTRY_SCHEMA_VERSION,
    toolchain: { ...input.toolchain },
    sourcePolicy: {
      excludedPathSegments: [
        ...AUTHENTICATED_MUTATION_SOURCE_POLICY.excludedPathSegments,
      ],
      productionRoots: [
        ...AUTHENTICATED_MUTATION_SOURCE_POLICY.productionRoots,
      ],
    },
    prerequisiteReceipts: [...(input.prerequisiteReceipts ?? [])]
      .map((receipt) => ({ ...receipt }))
      .sort((left, right) =>
        byteCompare(
          `${left.issueId}\0${left.receiptDigest}`,
          `${right.issueId}\0${right.receiptDigest}`,
        ),
      ),
    sourceNodes,
    entrypoints: classified,
    effectBoundaries,
    consumerEdges: consumerEdges.sort((left, right) =>
      byteCompare(left.consumerEdgeId, right.consumerEdgeId),
    ),
  };
}

function branchConditionFor(
  entrypoint: AuthenticatedMutationEntrypointV2,
  spec: AdmissionEffectSpec,
): AuthenticatedMutationBranchConditionClass {
  if (
    entrypoint.variant.startsWith("callback_") &&
    spec.effect.effectFamilies.includes("external_call")
  ) {
    return "provider_callback";
  }
  switch (spec.executionMode) {
    case "required":
      return "always";
    case "conditional":
    case "best_effort_after_commit":
      return "success";
    case "asynchronous_from_durable_intent":
      return "eligible";
  }
}

function buildAuthenticatedMutationSourceNodes(
  entrypoints: readonly AuthenticatedMutationEntrypointV2[],
  effectBoundaries: readonly AuthenticatedMutationEffectBoundaryV2[],
  sources: readonly AuthenticatedMutationSourceEvidence[],
): AuthenticatedMutationSourceNodeV3[] {
  const nodes: AuthenticatedMutationSourceNodeV3[] = entrypoints.map(
    (entrypoint) => ({
      sourceNodeId: `source:${stableId(
        `${entrypoint.path}\0${entrypoint.symbol}\0${entrypoint.variant}\0${entrypoint.transport}`,
      )}`,
      path: entrypoint.path,
      symbol: entrypoint.symbol,
      nodeKind: sourceNodeKindForTransport(entrypoint.transport),
      semanticVariant: entrypoint.variant,
      resolutionState:
        entrypoint.classification === "unresolved" ? "unresolved" : "resolved",
      evidencePaths: normalizeSet(entrypoint.evidencePaths),
    }),
  );

  nodes.push(
    ...effectBoundaries.map((effectBoundary) => ({
      sourceNodeId: `source:${stableId(
        `${effectBoundary.ownerPath}\0${effectBoundary.ownerSymbol}\0effect_owner\0${effectBoundary.commitLabel}`,
      )}`,
      path: effectBoundary.ownerPath,
      symbol: effectBoundary.ownerSymbol,
      nodeKind: "effect_owner" as const,
      semanticVariant: effectBoundary.commitLabel,
      resolutionState: "resolved" as const,
      evidencePaths: normalizeSet(effectBoundary.evidencePaths),
    })),
  );

  nodes.push(
    ...buildStructuralSourceNodes(entrypoints, effectBoundaries, sources),
  );

  return [
    ...new Map(nodes.map((node) => [node.sourceNodeId, node])).values(),
  ].sort((left, right) => byteCompare(left.sourceNodeId, right.sourceNodeId));
}

function buildStructuralSourceNodes(
  entrypoints: readonly AuthenticatedMutationEntrypointV2[],
  effectBoundaries: readonly AuthenticatedMutationEffectBoundaryV2[],
  sources: readonly AuthenticatedMutationSourceEvidence[],
): AuthenticatedMutationSourceNodeV3[] {
  const nodes: AuthenticatedMutationSourceNodeV3[] = [];
  const sourcePaths = new Set(sources.map((source) => source.path));
  const relevantSourcePaths = new Set([
    ...entrypoints.flatMap((entrypoint) => [
      entrypoint.path,
      ...entrypoint.evidencePaths,
    ]),
    ...effectBoundaries.flatMap((effect) => [
      effect.ownerPath,
      ...effect.evidencePaths,
    ]),
  ]);
  const sqlFunctionNames = new Set<string>();

  for (const source of sources) {
    if (!source.path.endsWith(".sql")) continue;
    for (const match of source.sourceText.matchAll(
      /\bcreate\s+(?:or\s+replace\s+)?function\s+([a-zA-Z_][\w$]*)\s*\(/gi,
    )) {
      if (match[1]) sqlFunctionNames.add(match[1].toLowerCase());
    }
  }

  const addNode = (
    nodeKind: AuthenticatedMutationSourceNodeKind,
    sourcePath: string,
    symbol: string,
    semanticVariant: string,
    resolutionState: "resolved" | "unresolved",
    evidencePaths: readonly string[],
  ): void => {
    nodes.push({
      sourceNodeId: `source:${stableId(
        `${sourcePath}\0${symbol}\0${nodeKind}\0${semanticVariant}`,
      )}`,
      path: sourcePath,
      symbol,
      nodeKind,
      semanticVariant,
      resolutionState,
      evidencePaths: normalizeSet(evidencePaths),
    });
  };

  for (const entrypoint of entrypoints) {
    if (
      entrypoint.transport !== "native_form" ||
      entrypoint.variant.startsWith("POST:")
    ) {
      continue;
    }
    const target = entrypoint.variant.replace(/^[^:]+:/, "").trim();
    if (!/^[A-Za-z_$][\w$]*$/.test(target)) continue;
    addNode(
      "typed_action_prop",
      entrypoint.path,
      target,
      entrypoint.variant,
      entrypoint.classification === "unresolved" ? "unresolved" : "resolved",
      entrypoint.evidencePaths,
    );
  }

  for (const source of sources) {
    if (source.path.endsWith(".sql")) {
      for (const match of source.sourceText.matchAll(
        /\bcreate\s+(?:constraint\s+)?trigger\s+([a-zA-Z_][\w$]*)[\s\S]*?\bexecute\s+function\s+([a-zA-Z_][\w$]*)\s*\(/gi,
      )) {
        const triggerName = match[1];
        const functionName = match[2];
        if (!triggerName || !functionName) continue;
        addNode(
          "sql_trigger",
          source.path,
          triggerName,
          `executes:${functionName}`,
          sqlFunctionNames.has(functionName.toLowerCase())
            ? "resolved"
            : "unresolved",
          [source.path],
        );
      }
      continue;
    }
    if (!relevantSourcePaths.has(source.path)) continue;
    if (!/\.[cm]?[jt]sx?$/.test(source.path)) continue;

    const sourceFile = ts.createSourceFile(
      source.path,
      source.sourceText,
      ts.ScriptTarget.Latest,
      true,
      structuralScriptKind(source.path),
    );
    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        isInternalSourceSpecifier(statement.moduleSpecifier.text)
      ) {
        const targetPath = resolveStructuralSourceModulePath(
          source.path,
          statement.moduleSpecifier.text,
          sourcePaths,
        );
        const importedSymbols = importedBindingNames(statement);
        for (const importedSymbol of importedSymbols) {
          addNode(
            "import",
            source.path,
            importedSymbol,
            `from:${statement.moduleSpecifier.text}`,
            targetPath ? "resolved" : "unresolved",
            targetPath ? [source.path, targetPath] : [source.path],
          );
        }
      } else if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        isInternalSourceSpecifier(statement.moduleSpecifier.text)
      ) {
        const targetPath = resolveStructuralSourceModulePath(
          source.path,
          statement.moduleSpecifier.text,
          sourcePaths,
        );
        const symbols =
          statement.exportClause && ts.isNamedExports(statement.exportClause)
            ? statement.exportClause.elements.map(
                (element) => element.name.text,
              )
            : ["*"];
        for (const symbol of symbols) {
          addNode(
            "re_export",
            source.path,
            symbol,
            `from:${statement.moduleSpecifier.text}`,
            targetPath ? "resolved" : "unresolved",
            targetPath ? [source.path, targetPath] : [source.path],
          );
        }
      }
    }

    const visit = (node: ts.Node): void => {
      if (isContextualTransactionExecute(node)) {
        const symbol = enclosingStructuralSymbol(node) ?? "module";
        addNode(
          "contextual_transaction",
          source.path,
          symbol,
          `database_transaction_at_${node.getStart(sourceFile)}`,
          "resolved",
          [source.path],
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return nodes;
}

function importedBindingNames(declaration: ts.ImportDeclaration): string[] {
  const clause = declaration.importClause;
  if (!clause) return ["<side-effect>"];
  const names: string[] = [];
  if (clause.name) names.push(clause.name.text);
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    names.push(
      ...clause.namedBindings.elements.map((element) => element.name.text),
    );
  } else if (
    clause.namedBindings &&
    ts.isNamespaceImport(clause.namedBindings)
  ) {
    names.push(clause.namedBindings.name.text);
  }
  return names.length > 0 ? names : ["<side-effect>"];
}

function isInternalSourceSpecifier(specifier: string): boolean {
  return specifier.startsWith("@/") || specifier.startsWith(".");
}

function resolveStructuralSourceModulePath(
  fromPath: string,
  specifier: string,
  sourcePaths: ReadonlySet<string>,
): string | null {
  if (/\.(?:css|json|svg|png|jpe?g|webp|woff2?)$/i.test(specifier)) {
    return null;
  }
  const base = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : path.posix.normalize(
        path.posix.join(path.posix.dirname(fromPath), specifier),
      );
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ]) {
    if (sourcePaths.has(candidate)) return candidate;
  }
  return null;
}

function structuralScriptKind(repositoryPath: string): ts.ScriptKind {
  if (repositoryPath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (repositoryPath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(repositoryPath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isContextualTransactionExecute(
  node: ts.Node,
): node is ts.CallExpression {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression)
  ) {
    return false;
  }
  if (node.expression.name.text !== "execute") return false;
  const transactionCall = node.expression.expression;
  return (
    ts.isCallExpression(transactionCall) &&
    ts.isPropertyAccessExpression(transactionCall.expression) &&
    transactionCall.expression.name.text === "transaction"
  );
}

function enclosingStructuralSymbol(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) &&
      current.name &&
      ts.isIdentifier(current.name)
    ) {
      return current.name.text;
    }
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
    current = current.parent;
  }
  return null;
}

function sourceNodeKindForTransport(
  transport: AuthenticatedMutationTransport,
): AuthenticatedMutationSourceNodeKind {
  switch (transport) {
    case "server_action":
      return "server_action";
    case "route_handler":
      return "route_handler";
    case "better_auth_callback":
      return "callback";
    case "native_form":
      return "native_form";
    case "same_origin_fetch":
      return "same_origin_call";
    case "offline_replay":
      return "offline_producer";
    case "browser_operator":
      return "auth_client_call";
  }
}

function expandAuthorityVariants(
  discovery: ExpandedDiscoveryInput,
  sourceText: string,
): ExpandedDiscoveryInput[] {
  if (
    discovery.transport === "better_auth_callback" ||
    discovery.path.includes("%5F%5Fvisual-fixtures") ||
    discovery.path.includes("/__visual-fixtures/")
  ) {
    return [discovery];
  }
  const hasVisualBranch = sourceText.includes(
    "resolveVisualSocialMutationActor",
  );
  const hasGuestAuthIntentBranch =
    sourceText.includes("authIntentRequiredResponse") ||
    sourceText.includes("AuthenticationRequiredError");
  const hasDocumentMutationAdmission = sourceText.includes(
    "admitDocumentMutation",
  );
  if (!hasVisualBranch && !hasGuestAuthIntentBranch) {
    return hasDocumentMutationAdmission &&
      discovery.path !== "src/app/garden/actions.ts"
      ? BASELINE_AUTHENTICATED_AUTHORITY_VARIANT_PATHS.has(discovery.path)
        ? [withAuthorityVariant(discovery, "authenticated_user")]
        : [{ ...discovery, forcedAuthority: "authenticated_user" }]
      : [discovery];
  }

  const variants: ExpandedDiscoveryInput[] = [
    withAuthorityVariant(discovery, "authenticated_user"),
  ];
  if (hasGuestAuthIntentBranch) {
    variants.push({
      ...withAuthorityVariant(discovery, "guest", "guest_auth_intent"),
      forcedExclusion: {
        classification: "excluded_distinct_authority",
        reason: "guest_auth_intent_branch_has_no_authenticated_document_effect",
      },
    });
  }
  if (hasVisualBranch) {
    variants.push({
      ...withAuthorityVariant(discovery, "visual_fixture"),
      forcedExclusion: {
        classification: "excluded_distinct_authority",
        reason: "visual_fixture_has_a_distinct_synthetic_authority",
      },
    });
  }
  return variants;
}

// These paths already carried the explicit authenticated-authority suffix in
// the checked OVE-285 graph before OVE-291. Preserve those stable IDs while
// newly admitted single-authority remainder paths keep their original IDs.
const BASELINE_AUTHENTICATED_AUTHORITY_VARIANT_PATHS = new Set([
  "src/app/api/document-mutation-admission/continuity/route.ts",
  "src/app/api/garden/entries/[entryId]/route.ts",
  "src/app/api/garden/entries/route.ts",
  "src/app/api/media/[mediaAssetId]/focal/route.ts",
  "src/app/api/media/process/route.ts",
  "src/app/api/media/uploads/route.ts",
  "src/app/garden/lineage/invitations/claim/actions.ts",
  "src/app/garden/objects/[objectId]/actions.ts",
  "src/app/lineage/objects/[objectId]/actions.ts",
]);

function withAuthorityVariant(
  discovery: ExpandedDiscoveryInput,
  authority: AuthenticatedMutationAuthority,
  variantLabel: string = authority,
): ExpandedDiscoveryInput {
  return {
    ...discovery,
    entrypointId: `${discovery.entrypointId}:authority:${variantLabel}`,
    variant: `${discovery.variant}:${variantLabel}`,
    forcedAuthority: authority,
  };
}

function expandBehaviorVariants(
  discovery: ExpandedDiscoveryInput,
  sourceText: string,
): ExpandedDiscoveryInput[] {
  const isJournalAdmission =
    discovery.path === "src/app/api/garden/entries/route.ts" &&
    discovery.symbol === "POST" &&
    (discovery.forcedAuthority === undefined ||
      discovery.forcedAuthority === "authenticated_user") &&
    sourceText.includes("createSpaceJournalEntry") &&
    sourceText.includes("createPlantObjectJournalEntry") &&
    sourceText.includes("createFirstPlantEntry");
  if (isJournalAdmission) {
    return [
      journalBehaviorVariant(discovery, "space_entry", [
        {
          path: "src/server/journal-repository.ts",
          symbol: "createSpaceJournalEntry",
        },
        {
          path: discovery.path,
          symbol: "recordSpaceEntryEvents",
          executionMode: "asynchronous_from_durable_intent",
        },
      ]),
      journalBehaviorVariant(discovery, "plant_object_entry", [
        {
          path: "src/server/journal-repository.ts",
          symbol: "createPlantObjectJournalEntry",
        },
        {
          path: discovery.path,
          symbol: "recordPlantObjectEntryEvents",
          executionMode: "asynchronous_from_durable_intent",
        },
      ]),
      journalBehaviorVariant(discovery, "first_plant_entry", [
        {
          path: "src/server/journal-repository.ts",
          symbol: "createFirstPlantEntry",
        },
        {
          path: discovery.path,
          symbol: "recordFirstPlantEntryEvents",
          executionMode: "asynchronous_from_durable_intent",
        },
      ]),
    ];
  }

  const targets = journalConsumerBehaviorTargets(discovery);
  return targets.length > 0
    ? targets.map((target) => journalBehaviorVariant(discovery, target))
    : [discovery];
}

function journalConsumerBehaviorTargets(
  discovery: ExpandedDiscoveryInput,
): string[] {
  if (discovery.variant.startsWith("browser_storage:")) return [];
  if (
    discovery.transport === "same_origin_fetch" &&
    discovery.path === "src/lib/offline/journal-entry-sync.ts" &&
    discovery.variant.replace(/:keepalive$/, "") === "POST:/api/garden/entries"
  ) {
    return ["space_entry", "plant_object_entry", "first_plant_entry"];
  }
  if (discovery.transport !== "offline_replay") return [];
  if (discovery.path.includes("follow-up-entry-composer")) {
    return ["plant_object_entry"];
  }
  if (discovery.path.includes("first-entry-composer")) {
    return ["space_entry", "first_plant_entry"];
  }
  return ["space_entry", "plant_object_entry", "first_plant_entry"];
}

function journalBehaviorVariant(
  discovery: ExpandedDiscoveryInput,
  behaviorVariant: string,
  effectTraceRoots?: ExpandedDiscoveryInput["effectTraceRoots"],
): ExpandedDiscoveryInput {
  return {
    ...discovery,
    entrypointId: `${discovery.entrypointId}:behavior:${behaviorVariant}`,
    variant: `${discovery.variant}:behavior:${behaviorVariant}`,
    behaviorVariant,
    effectTraceRoots,
    evidencePaths: normalizeSet([
      ...discovery.evidencePaths,
      ...(effectTraceRoots?.map((root) => root.path) ?? []),
    ]),
  };
}

function expandNativeFormBindings(
  discovery: ExpandedDiscoveryInput,
  sourceGraph: AuthenticatedMutationSourceGraph,
  serverAdmissions: ReadonlySet<string>,
): ExpandedDiscoveryInput[] {
  if (
    discovery.transport !== "native_form" ||
    discovery.variant.startsWith("POST:") ||
    isNativeNavigation(discovery.variant)
  ) {
    return [discovery];
  }
  const bindings = sourceGraph.resolveNativeFormAdmissions({
    path: discovery.path,
    componentSymbol: discovery.symbol,
    variant: discovery.variant,
    serverAdmissions,
  });
  if (bindings.length === 0) return [discovery];
  return bindings.map((binding, index) => ({
    ...discovery,
    entrypointId:
      bindings.length === 1
        ? discovery.entrypointId
        : `${discovery.entrypointId}:binding:${index + 1}:${stableId(
            binding.admission
              ? sourceRefKey(binding.admission.path, binding.admission.symbol)
              : `${binding.route?.method ?? "UNKNOWN"}:${binding.route?.url ?? "unknown"}`,
          )}`,
    variant:
      bindings.length === 1
        ? discovery.variant
        : `${discovery.variant}->${
            binding.admission?.symbol ??
            `${binding.route?.method ?? "UNKNOWN"}:${binding.route?.url ?? "unknown"}`
          }`,
    evidencePaths: normalizeSet([
      ...discovery.evidencePaths,
      ...binding.evidencePaths,
    ]),
    admissionBinding: binding,
  }));
}

function classifyIntrinsicDiscovery(
  discovery: ExpandedDiscoveryInput,
  sourceGraph: AuthenticatedMutationSourceGraph,
): AuthenticatedMutationEntrypointV2 {
  const sourceText = sourceGraph.sourceText(discovery.path);
  const exclusion =
    discovery.forcedExclusion ?? exclusionFor(discovery, sourceText);
  const authority = discovery.forcedAuthority ?? authorityFor(discovery);
  const evidencePaths = normalizeSet(discovery.evidencePaths);
  if (exclusion) {
    return {
      ...entrypointIdentity(discovery),
      authority,
      classification: exclusion.classification,
      executionOwner: "excluded_with_reason",
      generationRequirement: "not_applicable",
      exclusionReason: exclusion.reason,
      evidencePaths,
    };
  }
  if (
    discovery.transport === "server_action" ||
    discovery.transport === "route_handler" ||
    (discovery.transport === "offline_replay" &&
      discovery.variant.startsWith("browser_storage:"))
  ) {
    const trace = sourceGraph.traceFunction({
      path: discovery.path,
      symbol: discovery.symbol,
    });
    if (trace.effects.length > 0) {
      return effectfulEntrypoint(discovery, authority, evidencePaths);
    }
    if (!trace.resolved || trace.unresolvedInternalCalls.length > 0) {
      return {
        ...entrypointIdentity(discovery),
        authority,
        classification: "unresolved",
        executionOwner: "excluded_with_reason",
        generationRequirement: "not_applicable",
        exclusionReason: "source_graph_has_unresolved_internal_calls",
        evidencePaths,
      };
    }
    return {
      ...entrypointIdentity(discovery),
      authority,
      classification: "read_only",
      executionOwner: "excluded_with_reason",
      generationRequirement: "not_applicable",
      exclusionReason: "source_graph_proves_no_mutating_effect",
      evidencePaths,
    };
  }
  if (discovery.transport === "better_auth_callback") {
    return effectfulEntrypoint(discovery, authority, evidencePaths);
  }
  return {
    ...entrypointIdentity(discovery),
    authority,
    classification: "unresolved",
    executionOwner: "excluded_with_reason",
    generationRequirement: "not_applicable",
    exclusionReason: "consumer_admission_boundary_is_unresolved",
    evidencePaths,
  };
}

function effectfulEntrypoint(
  discovery: ExpandedDiscoveryInput,
  authority: AuthenticatedMutationAuthority,
  evidencePaths: readonly string[],
): AuthenticatedMutationEntrypointV2 {
  return {
    ...entrypointIdentity(discovery),
    authority,
    classification: "effectful",
    executionOwner: executionOwnerFor(discovery),
    generationRequirement: "required_before_first_effect",
    exclusionReason: null,
    evidencePaths,
  };
}

function entrypointIdentity(
  discovery: AuthenticatedMutationDiscoveryInput,
): Pick<
  AuthenticatedMutationEntrypointV2,
  "entrypointId" | "path" | "symbol" | "variant" | "transport"
> {
  return {
    entrypointId: discovery.entrypointId,
    path: discovery.path,
    symbol: discovery.symbol,
    variant: discovery.variant,
    transport: discovery.transport,
  };
}

function exclusionFor(
  discovery: ExpandedDiscoveryInput,
  sourceText: string,
): {
  classification:
    | "read_only"
    | "excluded_distinct_authority"
    | "retired_provider";
  reason: string;
} | null {
  const key = `${discovery.path}\0${discovery.symbol}\0${discovery.variant}`;
  if (
    discovery.transport === "same_origin_fetch" &&
    discovery.variant === "POST:/api/document-mutation-admission/continuity"
  ) {
    return {
      classification: "read_only",
      reason:
        "document_owner_continuity_rechecks_authority_without_a_product_effect",
    };
  }
  if (
    discovery.transport === "better_auth_callback" &&
    discovery.variant === "retired_facebook_request"
  ) {
    return {
      classification: "retired_provider",
      reason: "ove_296_retired_facebook_is_denied_before_better_auth",
    };
  }
  if (
    discovery.transport === "better_auth_callback" &&
    discovery.variant === "link_social_post_id_token"
  ) {
    return {
      classification: "excluded_distinct_authority",
      reason: "google_direct_id_token_is_disabled_before_effect",
    };
  }
  if (
    discovery.path.includes("%5F%5Fvisual-fixtures") ||
    discovery.path.includes("/__visual-fixtures/") ||
    /visual(?:[-_ ]|Fixture)/i.test(key) ||
    sourceText.includes('data-interface-locale-form="ignore"')
  ) {
    return {
      classification: "excluded_distinct_authority",
      reason: "visual_fixture_has_a_distinct_synthetic_authority",
    };
  }
  if (
    discovery.transport === "route_handler" &&
    /api\/auth\/\[\.\.\.all\]\/route\.ts$/.test(discovery.path) &&
    discovery.symbol !== "GET" &&
    discovery.symbol !== "POST"
  ) {
    return {
      classification: "excluded_distinct_authority",
      reason:
        "installed_better_auth_core_has_no_configured_endpoint_for_this_method",
    };
  }
  if (discovery.path.includes("/api/cron/")) {
    return {
      classification: "excluded_distinct_authority",
      reason: "bearer_cron_has_no_authenticated_browser_document",
    };
  }
  if (
    discovery.transport === "better_auth_callback" &&
    (discovery.variant === "get_read_only_endpoint" ||
      discovery.variant.startsWith("guest_") ||
      discovery.variant.startsWith("callback_get_ordinary_") ||
      discovery.variant === "callback_post_normalize_to_get")
  ) {
    return {
      classification:
        discovery.variant === "get_read_only_endpoint"
          ? "read_only"
          : "excluded_distinct_authority",
      reason:
        discovery.variant === "get_read_only_endpoint"
          ? "better_auth_get_endpoint_is_read_only"
          : "guest_or_ordinary_auth_flow_has_distinct_document_authority",
    };
  }
  if (
    discovery.variant === "authenticated_sign_out" ||
    discovery.variant === "auth_client.signOut" ||
    (discovery.transport === "route_handler" &&
      discovery.path === "src/app/api/auth/local-exit-reconcile/route.ts" &&
      discovery.symbol === "POST")
  ) {
    return {
      classification: "excluded_distinct_authority",
      reason: "current_session_exit_is_owned_by_ove_287",
    };
  }
  if (
    discovery.transport === "browser_operator" &&
    /auth_client\.(?:requestPasswordReset|resetPassword|signIn\.|signUp\.)/.test(
      discovery.variant,
    )
  ) {
    return {
      classification: "excluded_distinct_authority",
      reason: "guest_authentication_flow_has_no_authenticated_document",
    };
  }
  if (
    discovery.path.includes("/api/interface/locale/") ||
    discovery.variant.includes("/api/interface/locale") ||
    discovery.path.includes("/api/meta/conversions/") ||
    discovery.variant.includes("/api/meta/conversions") ||
    discovery.path.includes("/auth/intent/start/") ||
    discovery.variant.includes("/auth/intent/start") ||
    discovery.path.includes("/lineage/invitations/claim/handoff/") ||
    discovery.variant.includes("/garden/lineage/invitations/claim/handoff") ||
    discovery.path.includes("/api/engagement/likes/")
  ) {
    return {
      classification: "excluded_distinct_authority",
      reason: "public_or_guest_capability_has_distinct_authority",
    };
  }
  if (
    discovery.transport === "route_handler" &&
    discovery.symbol === "GET" &&
    (discovery.path === "src/app/api/public/objects/suggestions/route.ts" ||
      discovery.path === "src/app/api/garden/catalog/typeahead/route.ts")
  ) {
    return {
      classification: "read_only",
      reason: "catalog_lookup_has_no_owner_scoped_effect",
    };
  }
  if (
    discovery.transport === "native_form" &&
    isNativeNavigation(discovery.variant)
  ) {
    return {
      classification: "read_only",
      reason: "native_form_submits_a_get_navigation",
    };
  }
  return null;
}

function isNativeNavigation(variant: string): boolean {
  return (
    /\b(?:Path|Href)\b/.test(variant) ||
    /action:communityPath$/.test(variant) ||
    /action:(?:build|localizedPath\()/.test(variant)
  );
}

function authorityFor(
  discovery: AuthenticatedMutationDiscoveryInput,
): AuthenticatedMutationAuthority {
  const key = `${discovery.path}\0${discovery.symbol}\0${discovery.variant}`;
  if (discovery.variant === "retired_facebook_request") {
    return "retired_facebook";
  }
  if (
    discovery.variant.includes("link_social") ||
    discovery.variant.startsWith("callback_get_explicit_link_") ||
    discovery.variant === "auth_client.linkSocial"
  ) {
    return "google_explicit_link";
  }
  if (
    discovery.variant === "guest_sign_in_social" ||
    discovery.variant.startsWith("callback_get_ordinary_")
  ) {
    return "public_google_auth";
  }
  if (
    discovery.variant === "guest_sign_in_email" ||
    discovery.variant === "guest_sign_up_email"
  ) {
    return "public_credential_auth";
  }
  if (
    discovery.variant === "guest_request_password_reset" ||
    discovery.variant === "guest_reset_password"
  ) {
    return "password_recovery";
  }
  if (discovery.variant === "get_read_only_endpoint") {
    return "public_session_read";
  }
  if (/visual[-_ ]fixture/i.test(key)) return "visual_fixture";
  if (discovery.path.includes("/api/cron/")) return "bearer_cron";
  if (
    discovery.path.includes("/admin/") ||
    /Catalog.*(?:Action|Candidate)/.test(key)
  ) {
    return "admin";
  }
  if (/moderate|moderation|resolveCommunityReport/.test(key))
    return "moderator";
  if (/erasure-requests/.test(key)) return "founder_operator";
  if (
    discovery.variant.startsWith("guest_") ||
    discovery.variant.includes("ordinary_registration") ||
    discovery.variant.includes("ordinary_sign_in")
  ) {
    return "guest";
  }
  if (
    discovery.path.includes("/api/interface/locale/") ||
    discovery.path.includes("/api/interface/context/") ||
    discovery.path.includes("/api/meta/conversions/") ||
    discovery.path.includes("/api/engagement/likes/") ||
    discovery.path.includes("/api/public/")
  ) {
    return discovery.path.includes("/api/interface/") ? "locale" : "guest";
  }
  if (discovery.path.includes("/auth/intent/")) return "guest";
  return "authenticated_user";
}

function executionOwnerFor(
  discovery: AuthenticatedMutationDiscoveryInput,
): AuthenticatedMutationExecutionOwner {
  if (
    discovery.variant.includes("link_social") ||
    discovery.variant.startsWith("callback_get_explicit_link_") ||
    discovery.variant === "auth_client.linkSocial"
  ) {
    return "owned_by_ove_295";
  }
  const key = `${discovery.path}\0${discovery.symbol}\0${discovery.variant}`;
  if (
    discovery.variant.startsWith("browser_storage:") &&
    /\/(?:owner-session-lifecycle|owner-composer(?:-|\.)|owner-composer-locale-change-participant)\b/.test(
      discovery.path,
    )
  ) {
    return "capability_runtime_ove_286";
  }
  if (
    discovery.transport === "offline_replay" ||
    /\/api\/(?:garden\/entries|media)\//.test(discovery.path) ||
    /\/(?:api\/garden\/entries|api\/media)\b/.test(discovery.variant) ||
    /(?:create(?:Space|PlantObject)?JournalEntry|archiveJournalEntry|publishJournalEntry)/.test(
      key,
    )
  ) {
    return "high_risk_ove_290";
  }
  return "remaining_ove_291";
}

function resolveAdmissionBoundary(
  discovery: ExpandedDiscoveryInput,
  entrypoint: AuthenticatedMutationEntrypointV2,
  entrypoints: readonly AuthenticatedMutationEntrypointV2[],
  byId: ReadonlyMap<string, AuthenticatedMutationEntrypointV2>,
): string | null {
  if (discovery.admissionBinding?.admission) {
    return findAuthenticatedAdmissionByRef(
      discovery.admissionBinding.admission.path,
      discovery.admissionBinding.admission.symbol,
      entrypoints,
    );
  }
  if (discovery.admissionBinding?.route) {
    return (
      entrypoints.find(
        (candidate) =>
          candidate.transport === "route_handler" &&
          routePathMatchesUrl(
            candidate.path,
            discovery.admissionBinding!.route!.url,
          ) &&
          candidate.symbol === discovery.admissionBinding!.route!.method &&
          candidate.authority !== "visual_fixture",
      )?.entrypointId ?? null
    );
  }
  if (
    entrypoint.transport === "route_handler" ||
    entrypoint.transport === "server_action" ||
    entrypoint.transport === "better_auth_callback"
  ) {
    return entrypoint.entrypointId;
  }
  if (
    entrypoint.transport === "same_origin_fetch" ||
    (entrypoint.transport === "native_form" &&
      entrypoint.variant.startsWith("POST:"))
  ) {
    const normalizedVariant = entrypoint.variant
      .replace(/:behavior:[^:]+$/, "")
      .replace(/:keepalive$/, "");
    const separator = normalizedVariant.indexOf(":");
    if (separator < 0) return null;
    const rawMethod = normalizedVariant.slice(0, separator);
    const url = normalizedVariant.slice(separator + 1);
    if (!url.startsWith("/")) return null;
    const method = rawMethod === "BEACON" ? "POST" : rawMethod;
    return (
      entrypoints.find(
        (candidate) =>
          candidate.transport === "route_handler" &&
          routePathMatchesUrl(candidate.path, url) &&
          candidate.symbol === method &&
          candidate.classification === "effectful" &&
          candidate.authority !== "visual_fixture" &&
          behaviorVariantsMatch(discovery, candidate),
      )?.entrypointId ?? null
    );
  }
  if (entrypoint.transport === "native_form") {
    const target = entrypoint.variant.replace(/^[^:]+:/, "");
    return (
      entrypoints.find(
        (candidate) =>
          candidate.transport === "server_action" &&
          candidate.symbol === target &&
          candidate.classification === "effectful",
      )?.entrypointId ?? null
    );
  }
  if (entrypoint.transport === "browser_operator") {
    const variant =
      entrypoint.variant === "auth_client.linkSocial"
        ? "link_social_post_redirect"
        : entrypoint.variant === "auth_client.unlinkAccount"
          ? "authenticated_unlink_account"
          : null;
    return variant
      ? (entrypoints.find(
          (candidate) =>
            candidate.transport === "better_auth_callback" &&
            candidate.variant === variant,
        )?.entrypointId ?? null)
      : null;
  }
  if (entrypoint.transport === "offline_replay") {
    return (
      entrypoints.find(
        (candidate) =>
          candidate.transport === "route_handler" &&
          candidate.path === "src/app/api/garden/entries/route.ts" &&
          candidate.symbol === "POST",
      )?.entrypointId ?? null
    );
  }
  return byId.has(entrypoint.entrypointId) ? entrypoint.entrypointId : null;
}

function findAuthenticatedAdmissionByRef(
  ownerPath: string,
  ownerSymbol: string,
  entrypoints: readonly AuthenticatedMutationEntrypointV2[],
): string | null {
  return (
    entrypoints.find(
      (candidate) =>
        candidate.path === ownerPath &&
        candidate.symbol === ownerSymbol &&
        candidate.classification === "effectful" &&
        candidate.authority !== "visual_fixture" &&
        candidate.authority !== "guest" &&
        candidate.authority !== "public_google_auth" &&
        candidate.authority !== "public_credential_auth" &&
        candidate.authority !== "password_recovery" &&
        candidate.authority !== "public_session_read" &&
        candidate.authority !== "locale" &&
        candidate.authority !== "retired_facebook",
    )?.entrypointId ?? null
  );
}

function behaviorVariantsMatch(
  consumer: ExpandedDiscoveryInput,
  admission: AuthenticatedMutationEntrypointV2,
): boolean {
  if (!consumer.behaviorVariant) return true;
  return admission.variant.endsWith(`:behavior:${consumer.behaviorVariant}`);
}

function classifyConsumerFromAdmission(
  consumer: AuthenticatedMutationEntrypointV2,
  admission: AuthenticatedMutationEntrypointV2,
): AuthenticatedMutationEntrypointV2 {
  if (admission.classification === "effectful") {
    return {
      ...entrypointIdentity(consumer),
      authority: admission.authority,
      classification: "effectful",
      executionOwner: admission.executionOwner,
      generationRequirement: "required_before_first_effect",
      exclusionReason: null,
      evidencePaths: normalizeSet([
        ...consumer.evidencePaths,
        ...admission.evidencePaths,
      ]),
    };
  }
  return {
    ...entrypointIdentity(consumer),
    authority: admission.authority,
    classification: admission.classification,
    executionOwner: "excluded_with_reason",
    generationRequirement: "not_applicable",
    exclusionReason: `consumer_reaches_${admission.classification}_admission`,
    evidencePaths: normalizeSet([
      ...consumer.evidencePaths,
      ...admission.evidencePaths,
    ]),
  };
}

function inferAdmissionEffects(
  admission: AuthenticatedMutationEntrypointV2,
  sourceGraph: AuthenticatedMutationSourceGraph,
  discovery?: ExpandedDiscoveryInput,
): AdmissionEffectSpec[] {
  if (admission.transport === "better_auth_callback") {
    const effects: AdmissionEffectSpec[] = [];
    if (
      admission.executionOwner === "owned_by_ove_295" ||
      admission.variant === "authenticated_account_session_mutation"
    ) {
      effects.push(
        createBetterAuthEffect(admission, "provider", "provider_operation", [
          "external_call",
        ]),
      );
    }
    effects.push(
      createBetterAuthEffect(admission, "auth-account", "auth_adapter_commit", [
        "auth_account",
      ]),
    );
    if (admission.variant === "authenticated_account_session_mutation") {
      effects.push(
        createBetterAuthEffect(
          admission,
          "auth-session",
          "auth_adapter_commit",
          ["auth_session"],
        ),
      );
    }
    effects.push(
      createBetterAuthEffect(admission, "cookie", "cookie_commit", [
        "browser_cookie",
      ]),
    );
    return effects;
  }
  const roots = discovery?.effectTraceRoots ?? [
    { path: admission.path, symbol: admission.symbol },
  ];
  const specs = roots.flatMap((root) =>
    sourceGraph
      .traceFunction({ path: root.path, symbol: root.symbol })
      .effects.map((trace) => ({
        effect: createTracedEffect(trace),
        executionMode: root.executionMode ?? trace.executionMode,
      })),
  );
  return [
    ...new Map(
      specs.map((spec) => [spec.effect.effectBoundaryId, spec]),
    ).values(),
  ];
}

function createBetterAuthEffect(
  admission: AuthenticatedMutationEntrypointV2,
  label: string,
  atomicity: AuthenticatedMutationAtomicity,
  effectFamilies: readonly AuthenticatedMutationEffectFamily[],
): AdmissionEffectSpec {
  const ownerPath = "src/lib/auth.ts";
  const ownerSymbol = `betterAuth:${label}`;
  return {
    effect: {
      effectBoundaryId: `effect:${stableId(`${ownerPath}#${ownerSymbol}`)}:${label}`,
      ownerPath,
      ownerSymbol,
      commitLabel: label,
      atomicity,
      effectFamilies: normalizeSet(effectFamilies),
      idempotencyOwner: `${ownerPath}#${ownerSymbol}`,
      evidencePaths: normalizeSet([admission.path, ownerPath]),
    },
    executionMode: label === "provider" ? "conditional" : "required",
  };
}

function createTracedEffect(
  trace: MutationEffectTrace,
): AuthenticatedMutationEffectBoundaryV2 {
  const identity = `${trace.ownerPath}#${trace.ownerSymbol}\0${trace.commitLabel}\0${trace.atomicity}`;
  return {
    effectBoundaryId: `effect:${stableId(identity)}:${slugify(trace.commitLabel)}`,
    ownerPath: trace.ownerPath,
    ownerSymbol: trace.ownerSymbol,
    commitLabel: trace.commitLabel,
    atomicity: trace.atomicity,
    effectFamilies: normalizeSet(trace.effectFamilies),
    idempotencyOwner: `${trace.ownerPath}#${trace.ownerSymbol}`,
    evidencePaths: normalizeSet(trace.evidencePaths),
  };
}

function sourceRefKey(ownerPath: string, ownerSymbol: string): string {
  return `${normalizeRepositoryPath(ownerPath)}#${ownerSymbol}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function routePathMatchesUrl(routePath: string, url: string): boolean {
  if (!routePath.startsWith("src/app/") || !routePath.endsWith("/route.ts")) {
    return false;
  }
  const routeSegments = routePath
    .slice("src/app/".length, -"/route.ts".length)
    .split("/");
  const urlSegments = url.split("?", 1)[0]!.replace(/^\//, "").split("/");
  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index]!;
    if (/^\[\.\.\.[^\]]+\]$/.test(routeSegment)) return true;
    const urlSegment = urlSegments[index];
    if (urlSegment === undefined) return false;
    if (/^\[[^\]]+\]$/.test(routeSegment) || urlSegment === ":dynamic") {
      continue;
    }
    if (routeSegment !== urlSegment) return false;
  }
  return routeSegments.length === urlSegments.length;
}

function stableId(value: string): string {
  return sha256Hex(value).slice(0, 20);
}

export function validateAuthenticatedMutationRegistry(
  registry: AuthenticatedMutationRegistryV2,
): AuthenticatedMutationRegistryFinding[] {
  const findings: AuthenticatedMutationRegistryFinding[] = [];

  if (
    registry.schemaVersion !== AUTHENTICATED_MUTATION_REGISTRY_SCHEMA_VERSION
  ) {
    findings.push({
      code: "schema_version",
      subjectId: registry.schemaVersion,
      message: `Expected ${AUTHENTICATED_MUTATION_REGISTRY_SCHEMA_VERSION}.`,
    });
  }
  if (
    canonicalJson({
      excludedPathSegments: registry.sourcePolicy.excludedPathSegments,
      productionRoots: registry.sourcePolicy.productionRoots,
    }) !==
    canonicalJson({
      excludedPathSegments:
        AUTHENTICATED_MUTATION_SOURCE_POLICY.excludedPathSegments,
      productionRoots: AUTHENTICATED_MUTATION_SOURCE_POLICY.productionRoots,
    })
  ) {
    findings.push({
      code: "source_policy_mismatch",
      subjectId: registry.schemaVersion,
      message:
        "The v3 production roots and excluded path segments must match the closed source policy.",
    });
  }
  const prerequisiteIssueIds = new Set<string>();
  for (const receipt of registry.prerequisiteReceipts) {
    if (
      prerequisiteIssueIds.has(receipt.issueId) ||
      !/^OVE-\d+$/.test(receipt.issueId) ||
      !/^[a-f0-9]{64}$/.test(receipt.receiptDigest)
    ) {
      findings.push({
        code: "invalid_prerequisite_receipt",
        subjectId: receipt.issueId || registry.schemaVersion,
        message:
          "Prerequisite receipts require unique OVE issue IDs and exact SHA-256 digests.",
      });
    }
    prerequisiteIssueIds.add(receipt.issueId);
  }
  if (!prerequisiteIssueIds.has("OVE-296")) {
    findings.push({
      code: "missing_prerequisite_receipt",
      subjectId: "OVE-296",
      message:
        "The checked v3 registry must bind the terminal OVE-296 retirement receipt.",
    });
  }

  const sourceNodeIds = new Set<string>();
  for (const sourceNode of registry.sourceNodes) {
    if (sourceNodeIds.has(sourceNode.sourceNodeId)) {
      findings.push({
        code: "duplicate_source_node_id",
        subjectId: sourceNode.sourceNodeId,
        message: "Source node identifiers must be unique after normalization.",
      });
    }
    sourceNodeIds.add(sourceNode.sourceNodeId);
    validateEvidence(
      sourceNode.sourceNodeId,
      sourceNode.evidencePaths,
      findings,
    );
    if (
      ![
        "typed_action_prop",
        "import",
        "re_export",
        "callback",
        "route_handler",
        "server_action",
        "native_form",
        "same_origin_call",
        "auth_client_call",
        "offline_producer",
        "contextual_transaction",
        "sql_trigger",
        "effect_owner",
      ].includes(sourceNode.nodeKind) ||
      !isRegistryProductionPath(sourceNode.path)
    ) {
      findings.push({
        code: "source_policy_mismatch",
        subjectId: sourceNode.sourceNodeId,
        message:
          "Source nodes must use a closed kind and an allowed production source path.",
      });
    }
    if (sourceNode.resolutionState === "unresolved") {
      findings.push({
        code: "unresolved_source_node",
        subjectId: sourceNode.sourceNodeId,
        message: "A ready registry cannot contain an unresolved source node.",
      });
    }
  }
  if (registry.entrypoints.length === 0) {
    findings.push({
      code: "empty_registry",
      subjectId: registry.schemaVersion,
      message:
        "A checked registry must contain at least one discovered entrypoint.",
    });
  }

  const entrypoints = indexUnique(
    registry.entrypoints,
    (item) => item.entrypointId,
    "duplicate_entrypoint_id",
    findings,
  );
  const effects = indexUnique(
    registry.effectBoundaries,
    (item) => item.effectBoundaryId,
    "duplicate_effect_boundary_id",
    findings,
  );
  const edges = indexUnique(
    registry.consumerEdges,
    (item) => item.consumerEdgeId,
    "duplicate_consumer_edge_id",
    findings,
  );

  const edgesByEntrypoint = new Map<
    string,
    AuthenticatedMutationConsumerEdgeV2[]
  >();
  for (const edge of registry.consumerEdges) {
    const current = edgesByEntrypoint.get(edge.entrypointId) ?? [];
    current.push(edge);
    edgesByEntrypoint.set(edge.entrypointId, current);
  }

  for (const entrypoint of registry.entrypoints) {
    validateEvidence(
      entrypoint.entrypointId,
      entrypoint.evidencePaths,
      findings,
    );
    const reachableEdges = edgesByEntrypoint.get(entrypoint.entrypointId) ?? [];
    if (entrypoint.classification === "unresolved") {
      findings.push({
        code: "unresolved_entrypoint",
        subjectId: entrypoint.entrypointId,
        message: "Checked registries cannot contain an unresolved entrypoint.",
      });
    }
    const isEffectful = entrypoint.classification === "effectful";
    const validEffectful =
      isEffectful &&
      reachableEdges.length > 0 &&
      entrypoint.executionOwner !== "excluded_with_reason" &&
      entrypoint.generationRequirement === "required_before_first_effect" &&
      entrypoint.exclusionReason === null;
    const validExcluded =
      !isEffectful &&
      entrypoint.classification !== "unresolved" &&
      reachableEdges.length === 0 &&
      entrypoint.executionOwner === "excluded_with_reason" &&
      entrypoint.generationRequirement === "not_applicable" &&
      Boolean(entrypoint.exclusionReason?.trim());
    if (!validEffectful && !validExcluded) {
      findings.push({
        code: "invalid_entrypoint_contract",
        subjectId: entrypoint.entrypointId,
        message:
          "Effectful entrypoints require owned edges; read-only or distinct-authority entrypoints require one bounded exclusion and zero edges.",
      });
    }
    if (
      !registry.sourceNodes.some(
        (sourceNode) =>
          sourceNode.path === entrypoint.path &&
          sourceNode.symbol === entrypoint.symbol &&
          sourceNode.semanticVariant === entrypoint.variant,
      )
    ) {
      findings.push({
        code: "missing_source_node",
        subjectId: entrypoint.entrypointId,
        message: "Every logical entrypoint must own one resolved source node.",
      });
    }
  }

  for (const effect of registry.effectBoundaries) {
    validateEvidence(effect.effectBoundaryId, effect.evidencePaths, findings);
    validateSet(effect.effectBoundaryId, effect.effectFamilies, findings);
    if (
      !registry.consumerEdges.some(
        (edge) => edge.effectBoundaryId === effect.effectBoundaryId,
      )
    ) {
      findings.push({
        code: "orphan_effect_boundary",
        subjectId: effect.effectBoundaryId,
        message:
          "Every effect boundary must be reachable from at least one edge.",
      });
    }
    if (
      !registry.sourceNodes.some(
        (sourceNode) =>
          sourceNode.nodeKind === "effect_owner" &&
          sourceNode.path === effect.ownerPath &&
          sourceNode.symbol === effect.ownerSymbol &&
          sourceNode.semanticVariant === effect.commitLabel,
      )
    ) {
      findings.push({
        code: "missing_source_node",
        subjectId: effect.effectBoundaryId,
        message:
          "Every effect boundary must own one resolved effect-owner source node.",
      });
    }
  }

  for (const edge of registry.consumerEdges) {
    validateEvidence(edge.consumerEdgeId, edge.evidencePaths, findings);
    validateSet(edge.consumerEdgeId, edge.predecessorEdgeIds, findings);
    if (
      !edge.pipelineId.trim() ||
      !edge.branchId.trim() ||
      ![
        "always",
        "success",
        "failure",
        "present",
        "absent",
        "eligible",
        "ineligible",
        "provider_callback",
        "retry",
      ].includes(edge.branchConditionClass)
    ) {
      findings.push({
        code: "invalid_branch_contract",
        subjectId: edge.consumerEdgeId,
        message:
          "Every consumer edge requires one closed branch ID and condition class.",
      });
    }
    if (!entrypoints.has(edge.entrypointId)) {
      findings.push({
        code: "dangling_entrypoint",
        subjectId: edge.consumerEdgeId,
        message: `Unknown entrypoint ${edge.entrypointId}.`,
      });
    }
    if (!effects.has(edge.effectBoundaryId)) {
      findings.push({
        code: "dangling_effect_boundary",
        subjectId: edge.consumerEdgeId,
        message: `Unknown effect boundary ${edge.effectBoundaryId}.`,
      });
    }
    const admission = entrypoints.get(edge.admissionBoundaryId);
    if (!admission || admission.classification !== "effectful") {
      findings.push({
        code: "dangling_admission_boundary",
        subjectId: edge.consumerEdgeId,
        message: `Unknown or non-effectful admission boundary ${edge.admissionBoundaryId}.`,
      });
    }
    for (const predecessorId of edge.predecessorEdgeIds) {
      const predecessor = edges.get(predecessorId);
      if (
        !predecessor ||
        predecessor.entrypointId !== edge.entrypointId ||
        predecessor.pipelineId !== edge.pipelineId
      ) {
        findings.push({
          code: "invalid_predecessor",
          subjectId: edge.consumerEdgeId,
          message: `Predecessor ${predecessorId} is outside the entrypoint pipeline.`,
        });
      }
    }
  }

  for (const cycleMember of findPipelineCycleMembers(registry.consumerEdges)) {
    findings.push({
      code: "pipeline_cycle",
      subjectId: cycleMember,
      message: "Consumer-edge predecessors must form an acyclic pipeline.",
    });
  }

  return findings.sort((left, right) =>
    byteCompare(
      `${left.code}\0${left.subjectId}`,
      `${right.code}\0${right.subjectId}`,
    ),
  );
}

function isRegistryProductionPath(repositoryPath: string): boolean {
  const normalized = normalizeRepositoryPath(repositoryPath);
  if (/\.(?:test|spec|fixture|snapshot)\.[cm]?[jt]sx?$/.test(normalized)) {
    return false;
  }
  const disallowedSegments = new Set([
    ...AUTHENTICATED_MUTATION_SOURCE_POLICY.excludedPathSegments,
    ".next",
    "build",
    "dist",
    "generated",
    "node_modules",
  ]);
  if (
    normalized.split("/").some((segment) => disallowedSegments.has(segment))
  ) {
    return false;
  }
  return (
    normalized === "public/sw.js" ||
    normalized.startsWith("sql/") ||
    normalized.startsWith("src/")
  );
}

export function canonicalizeAuthenticatedMutationRegistry(
  registry: AuthenticatedMutationRegistryV2,
): string {
  const normalized: AuthenticatedMutationRegistryV2 = {
    schemaVersion: registry.schemaVersion,
    toolchain: { ...registry.toolchain },
    sourcePolicy: {
      excludedPathSegments: normalizeSet(
        registry.sourcePolicy.excludedPathSegments,
      ),
      productionRoots: normalizeSet(registry.sourcePolicy.productionRoots),
    },
    prerequisiteReceipts: [...registry.prerequisiteReceipts]
      .map((receipt) => ({ ...receipt }))
      .sort((left, right) =>
        byteCompare(
          `${left.issueId}\0${left.receiptDigest}`,
          `${right.issueId}\0${right.receiptDigest}`,
        ),
      ),
    sourceNodes: [...registry.sourceNodes]
      .map((sourceNode) => ({
        sourceNodeId: sourceNode.sourceNodeId,
        path: normalizeRepositoryPath(sourceNode.path),
        symbol: sourceNode.symbol,
        nodeKind: sourceNode.nodeKind,
        semanticVariant: sourceNode.semanticVariant,
        resolutionState: sourceNode.resolutionState,
        evidencePaths: normalizeSet(
          sourceNode.evidencePaths.map(normalizeRepositoryPath),
        ),
      }))
      .sort((left, right) =>
        byteCompare(left.sourceNodeId, right.sourceNodeId),
      ),
    entrypoints: [...registry.entrypoints]
      .map((item) => ({
        entrypointId: item.entrypointId,
        path: normalizeRepositoryPath(item.path),
        symbol: item.symbol,
        variant: item.variant,
        transport: item.transport,
        authority: item.authority,
        classification: item.classification,
        executionOwner: item.executionOwner,
        generationRequirement: item.generationRequirement,
        exclusionReason: item.exclusionReason,
        evidencePaths: normalizeSet(
          item.evidencePaths.map(normalizeRepositoryPath),
        ),
      }))
      .sort((left, right) =>
        byteCompare(left.entrypointId, right.entrypointId),
      ),
    effectBoundaries: [...registry.effectBoundaries]
      .map((item) => ({
        effectBoundaryId: item.effectBoundaryId,
        ownerPath: normalizeRepositoryPath(item.ownerPath),
        ownerSymbol: item.ownerSymbol,
        commitLabel: item.commitLabel,
        atomicity: item.atomicity,
        effectFamilies: normalizeSet(item.effectFamilies),
        idempotencyOwner: item.idempotencyOwner,
        evidencePaths: normalizeSet(
          item.evidencePaths.map(normalizeRepositoryPath),
        ),
      }))
      .sort((left, right) =>
        byteCompare(left.effectBoundaryId, right.effectBoundaryId),
      ),
    consumerEdges: [...registry.consumerEdges]
      .map((item) => ({
        consumerEdgeId: item.consumerEdgeId,
        entrypointId: item.entrypointId,
        effectBoundaryId: item.effectBoundaryId,
        pipelineId: item.pipelineId,
        branchId: item.branchId,
        branchConditionClass: item.branchConditionClass,
        predecessorEdgeIds: normalizeSet(item.predecessorEdgeIds),
        admissionBoundaryId: item.admissionBoundaryId,
        executionMode: item.executionMode,
        evidencePaths: normalizeSet(
          item.evidencePaths.map(normalizeRepositoryPath),
        ),
      }))
      .sort((left, right) =>
        byteCompare(left.consumerEdgeId, right.consumerEdgeId),
      ),
  };
  return canonicalJson(normalized);
}

export function buildAuthenticatedMutationRegistryReceipt(input: {
  registry: AuthenticatedMutationRegistryV3;
  baselineSha: string;
  sourceEvidence: readonly AuthenticatedMutationSourceEvidence[];
  prerequisiteReceipts?: readonly AuthenticatedMutationPrerequisiteReceiptV3[];
  decisionState: "ready" | "inconclusive";
}): AuthenticatedMutationRegistryReceiptV3 {
  if (!/^[a-f0-9]{40}$/.test(input.baselineSha)) {
    throw new Error(
      "Baseline SHA must be an exact lowercase 40-character Git SHA.",
    );
  }
  const findings = validateAuthenticatedMutationRegistry(input.registry);
  if (input.decisionState === "ready" && findings.length > 0) {
    throw new Error(
      `Cannot issue a ready receipt for an invalid registry: ${findings[0]!.code}.`,
    );
  }
  if (input.sourceEvidence.length === 0) {
    throw new Error("Source evidence must be non-empty.");
  }
  const normalizedEvidencePaths = input.sourceEvidence.map((evidence) =>
    normalizeRepositoryPath(evidence.path),
  );
  if (
    normalizedEvidencePaths.some((evidencePath) => !evidencePath) ||
    new Set(normalizedEvidencePaths).size !== normalizedEvidencePaths.length
  ) {
    throw new Error(
      "Source evidence paths must be unique and repository-relative.",
    );
  }
  const evidencePathSet = new Set(normalizedEvidencePaths);
  if (input.decisionState === "ready") {
    const requiredEvidencePaths = new Set(
      [
        ...input.registry.sourceNodes.flatMap((item) => [
          item.path,
          ...item.evidencePaths,
        ]),
        ...input.registry.entrypoints.flatMap((item) => [
          item.path,
          ...item.evidencePaths,
        ]),
        ...input.registry.effectBoundaries.flatMap((item) => [
          item.ownerPath,
          ...item.evidencePaths,
        ]),
        ...input.registry.consumerEdges.flatMap((item) => item.evidencePaths),
      ].map(normalizeRepositoryPath),
    );
    const missingEvidencePath = [...requiredEvidencePaths]
      .sort(byteCompare)
      .find((evidencePath) => !evidencePathSet.has(evidencePath));
    if (missingEvidencePath) {
      throw new Error(
        `Ready receipt is missing source evidence for ${missingEvidencePath}.`,
      );
    }
  }
  const prerequisiteReceipts = normalizePrerequisiteReceipts(
    input.prerequisiteReceipts ?? input.registry.prerequisiteReceipts,
  );
  const registryPrerequisiteReceipts = normalizePrerequisiteReceipts(
    input.registry.prerequisiteReceipts,
  );
  if (
    prerequisiteReceipts.length === 0 ||
    canonicalJson(prerequisiteReceipts) !==
      canonicalJson(registryPrerequisiteReceipts)
  ) {
    throw new Error(
      "Receipt prerequisite evidence must be non-empty and match the registry.",
    );
  }
  const registryJson = canonicalizeAuthenticatedMutationRegistry(
    input.registry,
  );
  const registryDigest = sha256Hex(registryJson);
  const normalizedSourceEvidence = input.sourceEvidence
    .map((evidence) => ({
      path: normalizeRepositoryPath(evidence.path),
      normalizedSourceSha256: sha256Hex(
        normalizeSourceText(evidence.sourceText),
      ),
    }))
    .sort((left, right) => byteCompare(left.path, right.path));
  const sourceEvidenceDigest = sha256Hex(
    canonicalJson(normalizedSourceEvidence),
  );
  const receiptDigest = sha256Hex(
    `overgarden.authenticated-mutation-registry.receipt.v3\0${canonicalJson({
      baselineSha: input.baselineSha,
      betterAuthVersion: input.registry.toolchain.betterAuthVersion,
      prerequisiteReceipts,
      registryDigest,
      sourceEvidenceDigest,
      typescriptVersion: input.registry.toolchain.typescriptVersion,
    })}`,
  );
  return {
    schemaVersion: AUTHENTICATED_MUTATION_REGISTRY_SCHEMA_VERSION,
    registryDigest,
    sourceEvidenceDigest,
    receiptDigest,
    decisionState: input.decisionState,
  };
}

function normalizePrerequisiteReceipts(
  receipts: readonly AuthenticatedMutationPrerequisiteReceiptV3[],
): AuthenticatedMutationPrerequisiteReceiptV3[] {
  const normalized = receipts
    .map((receipt) => ({
      issueId: receipt.issueId.trim(),
      receiptDigest: receipt.receiptDigest.trim(),
    }))
    .sort((left, right) =>
      byteCompare(
        `${left.issueId}\0${left.receiptDigest}`,
        `${right.issueId}\0${right.receiptDigest}`,
      ),
    );
  if (
    normalized.some(
      (receipt) =>
        !/^OVE-\d+$/.test(receipt.issueId) ||
        !/^[a-f0-9]{64}$/.test(receipt.receiptDigest),
    ) ||
    new Set(normalized.map((receipt) => receipt.issueId)).size !==
      normalized.length
  ) {
    throw new Error(
      "Prerequisite receipts must use unique issue IDs and SHA-256 digests.",
    );
  }
  return normalized;
}

export function normalizeSourceText(sourceText: string): string {
  const withoutBom =
    sourceText.charCodeAt(0) === 0xfeff ? sourceText.slice(1) : sourceText;
  return withoutBom.replace(/\r\n?/g, "\n");
}

function indexUnique<T>(
  items: readonly T[],
  idFor: (item: T) => string,
  code:
    | "duplicate_entrypoint_id"
    | "duplicate_effect_boundary_id"
    | "duplicate_consumer_edge_id",
  findings: AuthenticatedMutationRegistryFinding[],
): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of items) {
    const id = idFor(item);
    if (index.has(id)) {
      findings.push({
        code,
        subjectId: id,
        message: `Duplicate normalized identifier ${id}.`,
      });
    } else {
      index.set(id, item);
    }
  }
  return index;
}

function validateEvidence(
  subjectId: string,
  evidencePaths: readonly string[],
  findings: AuthenticatedMutationRegistryFinding[],
): void {
  if (evidencePaths.length === 0) {
    findings.push({
      code: "missing_evidence",
      subjectId,
      message: "At least one repository-relative evidence path is required.",
    });
  }
  validateSet(subjectId, evidencePaths, findings);
  for (const evidencePath of evidencePaths) {
    if (path.isAbsolute(evidencePath)) {
      findings.push({
        code: "absolute_evidence_path",
        subjectId,
        message: "Absolute paths are forbidden from canonical evidence.",
      });
    }
  }
}

function validateSet(
  subjectId: string,
  values: readonly string[],
  findings: AuthenticatedMutationRegistryFinding[],
): void {
  if (new Set(values).size !== values.length) {
    findings.push({
      code: "duplicate_set_member",
      subjectId,
      message: "Set-like arrays cannot contain duplicates.",
    });
  }
}

function findPipelineCycleMembers(
  edges: readonly AuthenticatedMutationConsumerEdgeV2[],
): string[] {
  const byId = new Map(edges.map((edge) => [edge.consumerEdgeId, edge]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();

  const visit = (edgeId: string): void => {
    if (visiting.has(edgeId)) {
      cyclic.add(edgeId);
      return;
    }
    if (visited.has(edgeId)) return;
    visiting.add(edgeId);
    const edge = byId.get(edgeId);
    if (edge) {
      for (const predecessorId of edge.predecessorEdgeIds) {
        if (byId.has(predecessorId)) visit(predecessorId);
        if (cyclic.has(predecessorId)) cyclic.add(edgeId);
      }
    }
    visiting.delete(edgeId);
    visited.add(edgeId);
  };

  for (const edge of edges) visit(edge.consumerEdgeId);
  return [...cyclic].sort(byteCompare);
}

function normalizeRepositoryPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function normalizeSet<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(byteCompare);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(byteCompare)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function byteCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
