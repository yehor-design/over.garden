import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

import {
  canonicalizeAuthenticatedMutationRegistry,
  type AuthenticatedMutationConsumerEdgeV2,
  type AuthenticatedMutationExecutionOwner,
  type AuthenticatedMutationRegistryV3,
} from "./authenticated-mutation-registry";
import { runAuthenticatedMutationSurfaceAudit } from "./audit-authenticated-mutation-surface";

export const AUTHENTICATED_MUTATION_ENFORCEMENT_SCHEMA_VERSION =
  "overgarden.authenticated-mutation-enforcement.v1" as const;
export const AUTHENTICATED_MUTATION_ENFORCEMENT_ARTIFACT_PATH =
  "../../contracts/auth/authenticated-mutation-enforcement.v1.json";
export const AUTHENTICATED_MUTATION_DEPLOYMENT_RECEIPT_SCHEMA_VERSION =
  "overgarden.authenticated-mutation-deployment-receipt.v1" as const;
export const AUTHENTICATED_MUTATION_DEPLOYMENT_RECEIPT_ARTIFACT_PATH =
  "../../contracts/auth/authenticated-mutation-deployment-receipt.v1.json";

const HIGH_RISK_OWNER = "high_risk_ove_290" as const;
const REMAINING_OWNER = "remaining_ove_291" as const;
const EXPLICIT_GOOGLE_LINK_OWNER = "owned_by_ove_295" as const;
// OVE-323 removes every browser-offline mutation owner and replay edge. The
// remaining high-risk topology is the server-side admission surface only.
const BASELINE_HIGH_RISK_ENTRYPOINT_COUNT = 14;
const BASELINE_HIGH_RISK_ENTRYPOINT_SET_DIGEST =
  "bdbedb11c601d55116bb63b8a1f79d8d5fafee59f8013aa31ac5bd3791fe6571";
const BASELINE_HIGH_RISK_CONSUMER_EDGE_COUNT = 154;
const BASELINE_HIGH_RISK_EDGE_BINDING_SET_DIGEST =
  "2d489bd93f251dee3a4c383e0ab6d0f58f32ecbbdcfc8bbac7e95b56a48d405c";
const BASELINE_HIGH_RISK_ADMISSION_BOUNDARY_COUNT = 11;
const BASELINE_REMAINING_ENTRYPOINT_COUNT = 125;
const BASELINE_REMAINING_ENTRYPOINT_SET_DIGEST =
  "723715ce31f54396d927402f400db53fdfe1837b2e4c7d299a91482f4df77f94";
const BASELINE_REMAINING_CONSUMER_EDGE_COUNT = 351;
const BASELINE_REMAINING_EDGE_BINDING_SET_DIGEST =
  "13b83af381aebde85316c2217417b0e0c289ba88fbd5cf1b20ae31ce8933adc4";
const BASELINE_REMAINING_ADMISSION_BOUNDARY_COUNT = 67;
const BASELINE_REMAINING_ADMISSION_BOUNDARY_SET_DIGEST =
  "bf06687219e5416f0c368492fabf78fa041997a108b813cde00056cca4cc86e9";
const BASELINE_EXPLICIT_GOOGLE_LINK_ENTRYPOINT_COUNT = 5;
const BASELINE_EXPLICIT_GOOGLE_LINK_CONSUMER_EDGE_COUNT = 15;
const BASELINE_EXPLICIT_GOOGLE_LINK_OWNERSHIP_DIGEST =
  "9f9273ac6222c4e04cc77069dc14bfebc3860218d6791623055c27420687adad";

export type AuthenticatedMutationEntrypointEnforcementState =
  | "enforced_ove_290"
  | "enforced_ove_291"
  | "owned_by_ove_295"
  | "excluded_with_authority";

export type AuthenticatedMutationConsumerEdgeEnforcementState = Exclude<
  AuthenticatedMutationEntrypointEnforcementState,
  "excluded_with_authority"
>;

export interface AuthenticatedMutationEnforcementReceiptV1 {
  schemaVersion: typeof AUTHENTICATED_MUTATION_ENFORCEMENT_SCHEMA_VERSION;
  registryDigest: string;
  sourceRegistryReceiptDigest: string;
  entrypointStates: Array<{
    entrypointId: string;
    enforcementState: AuthenticatedMutationEntrypointEnforcementState;
  }>;
  consumerEdgeStates: Array<{
    consumerEdgeId: string;
    entrypointId: string;
    admissionBoundaryId: string;
    enforcementState: AuthenticatedMutationConsumerEdgeEnforcementState;
  }>;
}

export interface BuildAuthenticatedMutationEnforcementReceiptInput {
  registry: AuthenticatedMutationRegistryV3;
  registryDigest: string;
  sourceRegistryReceiptDigest: string;
}

export interface AuthenticatedMutationDeploymentReceiptV1 {
  schemaVersion: typeof AUTHENTICATED_MUTATION_DEPLOYMENT_RECEIPT_SCHEMA_VERSION;
  registry: {
    digest: string;
    sourceReceiptDigest: string;
    entrypointCount: number;
    consumerEdgeCount: number;
  };
  enforcement: {
    receiptDigest: string;
    ove291EntrypointCount: number;
    ove291ConsumerEdgeCount: number;
  };
  explicitGoogleLink: {
    ownershipDigest: string;
    entrypointCount: number;
    consumerEdgeCount: number;
  };
}

export function buildAuthenticatedMutationEnforcementReceipt(
  input: BuildAuthenticatedMutationEnforcementReceiptInput,
): AuthenticatedMutationEnforcementReceiptV1 {
  requireSha256(input.registryDigest, "registry digest");
  requireSha256(input.sourceRegistryReceiptDigest, "source receipt digest");
  assertBaselineHighRiskTopology(input.registry);
  assertBaselineRemainingTopology(input.registry);
  assertFrozenExplicitGoogleLinkOwnership(input.registry);

  const owners = new Map(
    input.registry.entrypoints.map((entrypoint) => [
      entrypoint.entrypointId,
      entrypoint.executionOwner,
    ]),
  );
  const entrypointStates = input.registry.entrypoints
    .map((entrypoint) => ({
      entrypointId: entrypoint.entrypointId,
      enforcementState: entrypointState(entrypoint.executionOwner),
    }))
    .sort((left, right) => byteCompare(left.entrypointId, right.entrypointId));
  const consumerEdgeStates = input.registry.consumerEdges
    .flatMap((edge) => {
      const state = consumerEdgeState(owners.get(edge.entrypointId));
      return state
        ? [
            {
              consumerEdgeId: edge.consumerEdgeId,
              entrypointId: edge.entrypointId,
              admissionBoundaryId: edge.admissionBoundaryId,
              enforcementState: state,
            },
          ]
        : [];
    })
    .sort((left, right) =>
      byteCompare(left.consumerEdgeId, right.consumerEdgeId),
    );

  return {
    schemaVersion: AUTHENTICATED_MUTATION_ENFORCEMENT_SCHEMA_VERSION,
    registryDigest: input.registryDigest,
    sourceRegistryReceiptDigest: input.sourceRegistryReceiptDigest,
    entrypointStates,
    consumerEdgeStates,
  };
}

export function canonicalizeAuthenticatedMutationEnforcementReceipt(
  receipt: AuthenticatedMutationEnforcementReceiptV1,
): string {
  requireSha256(receipt.registryDigest, "registry digest");
  requireSha256(receipt.sourceRegistryReceiptDigest, "source receipt digest");
  if (
    receipt.schemaVersion !== AUTHENTICATED_MUTATION_ENFORCEMENT_SCHEMA_VERSION
  ) {
    throw new TypeError("The enforcement receipt schema is unsupported.");
  }
  return JSON.stringify({
    schemaVersion: receipt.schemaVersion,
    registryDigest: receipt.registryDigest,
    sourceRegistryReceiptDigest: receipt.sourceRegistryReceiptDigest,
    entrypointStates: [...receipt.entrypointStates].sort((left, right) =>
      byteCompare(left.entrypointId, right.entrypointId),
    ),
    consumerEdgeStates: [...receipt.consumerEdgeStates].sort((left, right) =>
      byteCompare(left.consumerEdgeId, right.consumerEdgeId),
    ),
  });
}

export function buildAuthenticatedMutationDeploymentReceiptArtifact(input: {
  registry: AuthenticatedMutationRegistryV3;
  enforcementReceipt: AuthenticatedMutationEnforcementReceiptV1;
}): AuthenticatedMutationDeploymentReceiptV1 {
  const explicitGoogleEntrypointIds = input.registry.entrypoints
    .filter(
      (entrypoint) => entrypoint.executionOwner === EXPLICIT_GOOGLE_LINK_OWNER,
    )
    .map((entrypoint) => entrypoint.entrypointId)
    .sort(byteCompare);
  const explicitGoogleEntrypointSet = new Set(explicitGoogleEntrypointIds);
  const explicitGoogleConsumerEdgeIds = input.registry.consumerEdges
    .filter((edge) => explicitGoogleEntrypointSet.has(edge.entrypointId))
    .map((edge) => edge.consumerEdgeId)
    .sort(byteCompare);
  const explicitGoogleLinkOwnershipDigest = digestJson({
    entrypointIds: explicitGoogleEntrypointIds,
    consumerEdgeIds: explicitGoogleConsumerEdgeIds,
  });

  requireExactBaseline(
    explicitGoogleLinkOwnershipDigest,
    BASELINE_EXPLICIT_GOOGLE_LINK_OWNERSHIP_DIGEST,
    "explicit Google-link ownership digest",
  );

  return {
    schemaVersion: AUTHENTICATED_MUTATION_DEPLOYMENT_RECEIPT_SCHEMA_VERSION,
    registry: {
      digest: input.enforcementReceipt.registryDigest,
      sourceReceiptDigest: input.enforcementReceipt.sourceRegistryReceiptDigest,
      entrypointCount: input.registry.entrypoints.length,
      consumerEdgeCount: input.registry.consumerEdges.length,
    },
    enforcement: {
      receiptDigest: digestJson(input.enforcementReceipt),
      ove291EntrypointCount: input.enforcementReceipt.entrypointStates.filter(
        (state) => state.enforcementState === "enforced_ove_291",
      ).length,
      ove291ConsumerEdgeCount:
        input.enforcementReceipt.consumerEdgeStates.filter(
          (state) => state.enforcementState === "enforced_ove_291",
        ).length,
    },
    explicitGoogleLink: {
      ownershipDigest: explicitGoogleLinkOwnershipDigest,
      entrypointCount: explicitGoogleEntrypointIds.length,
      consumerEdgeCount: explicitGoogleConsumerEdgeIds.length,
    },
  };
}

export async function assertHighRiskAdmissionBoundaryEvidence(input: {
  registry: AuthenticatedMutationRegistryV3;
  appRoot: string;
}): Promise<void> {
  const entrypoints = new Map(
    input.registry.entrypoints.map((entrypoint) => [
      entrypoint.entrypointId,
      entrypoint,
    ]),
  );
  const highRiskIds = new Set(
    input.registry.entrypoints
      .filter((entrypoint) => entrypoint.executionOwner === HIGH_RISK_OWNER)
      .map((entrypoint) => entrypoint.entrypointId),
  );
  const admissionBoundaryIds = [
    ...new Set(
      input.registry.consumerEdges
        .filter((edge) => highRiskIds.has(edge.entrypointId))
        .map((edge) => edge.admissionBoundaryId),
    ),
  ].sort(byteCompare);

  for (const admissionBoundaryId of admissionBoundaryIds) {
    const boundary = entrypoints.get(admissionBoundaryId);
    if (!boundary) {
      throw new Error(`Missing admission boundary: ${admissionBoundaryId}`);
    }
    const sourceText = await readFile(
      path.resolve(input.appRoot, boundary.path),
      "utf8",
    );
    const body = extractFunctionBody(
      sourceText,
      boundary.path,
      boundary.symbol,
    );
    assertBoundaryBody(boundary.path, boundary.symbol, body);
  }
}

export async function assertRemainingAdmissionBoundaryEvidence(input: {
  registry: AuthenticatedMutationRegistryV3;
  appRoot: string;
}): Promise<void> {
  const entrypoints = new Map(
    input.registry.entrypoints.map((entrypoint) => [
      entrypoint.entrypointId,
      entrypoint,
    ]),
  );
  const remainingIds = new Set(
    input.registry.entrypoints
      .filter((entrypoint) => entrypoint.executionOwner === REMAINING_OWNER)
      .map((entrypoint) => entrypoint.entrypointId),
  );
  const admissionBoundaryIds = [
    ...new Set(
      input.registry.consumerEdges
        .filter((edge) => remainingIds.has(edge.entrypointId))
        .map((edge) => edge.admissionBoundaryId),
    ),
  ].sort(byteCompare);
  const inspectedSourceBoundaries = new Set<string>();

  for (const admissionBoundaryId of admissionBoundaryIds) {
    const boundary = entrypoints.get(admissionBoundaryId);
    if (!boundary) {
      throw new Error(`Missing admission boundary: ${admissionBoundaryId}`);
    }
    const sourceBoundary = `${boundary.path}\0${boundary.symbol}`;
    if (inspectedSourceBoundaries.has(sourceBoundary)) continue;
    inspectedSourceBoundaries.add(sourceBoundary);
    const sourceText = await readFile(
      path.resolve(input.appRoot, boundary.path),
      "utf8",
    );
    const body = extractFunctionBody(
      sourceText,
      boundary.path,
      boundary.symbol,
    );
    assertRemainingBoundaryBody(boundary.path, boundary.symbol, body);
  }
}

export function assertBaselineHighRiskTopology(
  registry: AuthenticatedMutationRegistryV3,
): void {
  const highRiskEntrypointIds = registry.entrypoints
    .filter((entrypoint) => entrypoint.executionOwner === HIGH_RISK_OWNER)
    .map((entrypoint) => entrypoint.entrypointId)
    .sort(byteCompare);
  const highRiskSet = new Set(highRiskEntrypointIds);
  const highRiskEdges = registry.consumerEdges
    .filter((edge) => highRiskSet.has(edge.entrypointId))
    .map(edgeBinding)
    .sort((left, right) =>
      byteCompare(left.consumerEdgeId, right.consumerEdgeId),
    );
  const admissionBoundaries = new Set(
    highRiskEdges.map((edge) => edge.admissionBoundaryId),
  );

  requireExactBaseline(
    highRiskEntrypointIds.length,
    BASELINE_HIGH_RISK_ENTRYPOINT_COUNT,
    "high-risk entrypoint count",
  );
  requireExactBaseline(
    digestJson(highRiskEntrypointIds),
    BASELINE_HIGH_RISK_ENTRYPOINT_SET_DIGEST,
    "high-risk entrypoint stable-ID set",
  );
  requireExactBaseline(
    highRiskEdges.length,
    BASELINE_HIGH_RISK_CONSUMER_EDGE_COUNT,
    "high-risk consumer-edge count",
  );
  requireExactBaseline(
    digestJson(highRiskEdges),
    BASELINE_HIGH_RISK_EDGE_BINDING_SET_DIGEST,
    "high-risk edge/admission/effect binding set",
  );
  requireExactBaseline(
    admissionBoundaries.size,
    BASELINE_HIGH_RISK_ADMISSION_BOUNDARY_COUNT,
    "high-risk admission-boundary count",
  );
}

export function assertBaselineRemainingTopology(
  registry: AuthenticatedMutationRegistryV3,
): void {
  const entrypointIds = registry.entrypoints
    .filter((entrypoint) => entrypoint.executionOwner === REMAINING_OWNER)
    .map((entrypoint) => entrypoint.entrypointId)
    .sort(byteCompare);
  const owned = new Set(entrypointIds);
  const edges = registry.consumerEdges
    .filter((edge) => owned.has(edge.entrypointId))
    .map(edgeBinding)
    .sort((left, right) =>
      byteCompare(left.consumerEdgeId, right.consumerEdgeId),
    );
  const admissionBoundaryIds = [
    ...new Set(edges.map((edge) => edge.admissionBoundaryId)),
  ].sort(byteCompare);

  requireExactBaseline(
    entrypointIds.length,
    BASELINE_REMAINING_ENTRYPOINT_COUNT,
    "OVE-291 remainder entrypoint count",
  );
  requireExactBaseline(
    digestJson(entrypointIds),
    BASELINE_REMAINING_ENTRYPOINT_SET_DIGEST,
    "OVE-291 remainder entrypoint stable-ID set",
  );
  requireExactBaseline(
    edges.length,
    BASELINE_REMAINING_CONSUMER_EDGE_COUNT,
    "OVE-291 remainder consumer-edge count",
  );
  requireExactBaseline(
    digestJson(edges),
    BASELINE_REMAINING_EDGE_BINDING_SET_DIGEST,
    "OVE-291 remainder edge/admission/effect binding set",
  );
  requireExactBaseline(
    admissionBoundaryIds.length,
    BASELINE_REMAINING_ADMISSION_BOUNDARY_COUNT,
    "OVE-291 remainder admission-boundary count",
  );
  requireExactBaseline(
    digestJson(admissionBoundaryIds),
    BASELINE_REMAINING_ADMISSION_BOUNDARY_SET_DIGEST,
    "OVE-291 remainder admission-boundary stable-ID set",
  );
}

export function assertFrozenExplicitGoogleLinkOwnership(
  registry: AuthenticatedMutationRegistryV3,
): void {
  const entrypointIds = registry.entrypoints
    .filter(
      (entrypoint) => entrypoint.executionOwner === EXPLICIT_GOOGLE_LINK_OWNER,
    )
    .map((entrypoint) => entrypoint.entrypointId)
    .sort(byteCompare);
  const owned = new Set(entrypointIds);
  const consumerEdgeIds = registry.consumerEdges
    .filter((edge) => owned.has(edge.entrypointId))
    .map((edge) => edge.consumerEdgeId)
    .sort(byteCompare);

  requireExactBaseline(
    entrypointIds.length,
    BASELINE_EXPLICIT_GOOGLE_LINK_ENTRYPOINT_COUNT,
    "explicit Google-link entrypoint count",
  );
  requireExactBaseline(
    consumerEdgeIds.length,
    BASELINE_EXPLICIT_GOOGLE_LINK_CONSUMER_EDGE_COUNT,
    "explicit Google-link consumer-edge count",
  );
  requireExactBaseline(
    digestJson({ entrypointIds, consumerEdgeIds }),
    BASELINE_EXPLICIT_GOOGLE_LINK_OWNERSHIP_DIGEST,
    "explicit Google-link ownership set",
  );
}

function entrypointState(
  owner: AuthenticatedMutationExecutionOwner,
): AuthenticatedMutationEntrypointEnforcementState {
  switch (owner) {
    case "high_risk_ove_290":
      return "enforced_ove_290";
    case "remaining_ove_291":
      return "enforced_ove_291";
    case "owned_by_ove_295":
      return "owned_by_ove_295";
    case "capability_runtime_ove_286":
    case "excluded_with_reason":
      return "excluded_with_authority";
  }
}

function consumerEdgeState(
  owner: AuthenticatedMutationExecutionOwner | undefined,
): AuthenticatedMutationConsumerEdgeEnforcementState | null {
  switch (owner) {
    case "high_risk_ove_290":
      return "enforced_ove_290";
    case "remaining_ove_291":
      return "enforced_ove_291";
    case "owned_by_ove_295":
      return "owned_by_ove_295";
    case "capability_runtime_ove_286":
    case "excluded_with_reason":
    case undefined:
      return null;
  }
}

function edgeBinding(edge: AuthenticatedMutationConsumerEdgeV2) {
  return {
    consumerEdgeId: edge.consumerEdgeId,
    entrypointId: edge.entrypointId,
    admissionBoundaryId: edge.admissionBoundaryId,
    effectBoundaryId: edge.effectBoundaryId,
  };
}

function extractFunctionBody(
  sourceText: string,
  sourcePath: string,
  symbol: string,
): string {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let body: ts.ConciseBody | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === symbol &&
      node.body
    ) {
      body = node.body;
    } else if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === symbol
    ) {
      const initializer = node.initializer;
      if (
        initializer &&
        (ts.isArrowFunction(initializer) ||
          ts.isFunctionExpression(initializer))
      ) {
        body = initializer.body;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!body) throw new Error(`Missing boundary body: ${sourcePath}#${symbol}`);
  return body.getText(sourceFile);
}

function assertBoundaryBody(
  sourcePath: string,
  symbol: string,
  body: string,
): void {
  if (
    sourcePath.startsWith("src/app/api/") ||
    sourcePath === "src/app/garden/actions.ts" ||
    sourcePath === "src/app/garden/objects/[objectId]/actions.ts"
  ) {
    const admissionIndex = body.indexOf("await admitDocumentMutation");
    const firstAwaitedCallIndex = body.search(
      /await\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(/,
    );
    const requestBodyReadIndex = body.indexOf("request.json(");
    if (
      admissionIndex < 0 ||
      admissionIndex !== firstAwaitedCallIndex ||
      (requestBodyReadIndex >= 0 && admissionIndex > requestBodyReadIndex)
    ) {
      throw new Error(
        `Server admission does not precede the first effect boundary: ${sourcePath}#${symbol}`,
      );
    }
    return;
  }

  const requiredIdentifiers = localBoundaryIdentifiers(sourcePath, symbol);
  for (const identifier of requiredIdentifiers) {
    if (!body.includes(identifier)) {
      throw new Error(
        `Missing ${identifier} at local admission boundary: ${sourcePath}#${symbol}`,
      );
    }
  }
}

function assertRemainingBoundaryBody(
  sourcePath: string,
  symbol: string,
  body: string,
): void {
  const admissionIndex = body.indexOf("await admitDocumentMutation");
  if (admissionIndex < 0) {
    throw new Error(`Missing OVE-291 admission at ${sourcePath}#${symbol}`);
  }

  if (sourcePath === "src/app/api/auth/[...all]/route.ts") {
    const accountMutationPredicateIndex = body.indexOf(
      "isAuthenticatedAccountMutationRequest(request)",
    );
    const delegatedEffectIndex = body.lastIndexOf("handler.POST(request)");
    if (
      accountMutationPredicateIndex < 0 ||
      delegatedEffectIndex < 0 ||
      admissionIndex < accountMutationPredicateIndex ||
      admissionIndex > delegatedEffectIndex ||
      !body.includes("documentMutationGenerationFromRequest(request)") ||
      !body.includes("documentMutationAdmissionResponse(admission)")
    ) {
      throw new Error(
        "Better Auth account mutations do not have a branch-local OVE-291 admission boundary.",
      );
    }
    return;
  }

  const prefix = body.slice(0, admissionIndex);
  const awaitsBeforeAdmission = [
    ...prefix.matchAll(
      /await\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\(/g,
    ),
  ].map((match) => match[1]);
  const allowedPreAdmissionReads = sourcePath.startsWith("src/app/api/")
    ? new Set(["request.formData"])
    : new Set<string>();
  if (
    awaitsBeforeAdmission.some(
      (awaitedCall) => !allowedPreAdmissionReads.has(awaitedCall),
    )
  ) {
    throw new Error(
      `OVE-291 admission does not precede the first effect boundary: ${sourcePath}#${symbol}`,
    );
  }
  const expectedTransport = sourcePath.startsWith("src/app/api/")
    ? "documentMutationGenerationFromRequest(request)"
    : sourcePath === "src/app/garden/profile/account-method-actions.ts"
      ? "transport: documentMutationGeneration"
      : "documentMutationGenerationFromFormData(formData)";
  if (
    !body.includes(expectedTransport) ||
    (!body.includes('admission.status === "rejected"') &&
      !body.includes('admission?.status === "rejected"'))
  ) {
    throw new Error(
      `OVE-291 admission transport or rejection is missing: ${sourcePath}#${symbol}`,
    );
  }
}

function localBoundaryIdentifiers(
  sourcePath: string,
  symbol: string,
): string[] {
  throw new Error(
    `No browser-local mutation policy exists for ${sourcePath}#${symbol}`,
  );
}

function requireSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`A canonical ${label} is required.`);
  }
}

function requireExactBaseline(
  actual: string | number,
  expected: string | number,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(`${label} drifted from the OVE-285 baseline.`);
  }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function byteCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const write = process.argv.includes("--write");
  if (check === write) {
    throw new Error("Choose exactly one of --check or --write.");
  }

  const appRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
  const audit = await runAuthenticatedMutationSurfaceAudit({ appRoot });
  if (
    audit.terminalState !== "ready" ||
    !audit.registry ||
    !audit.receipt ||
    audit.registryFindings.length > 0 ||
    audit.semanticFindings.length > 0 ||
    audit.sourcePolicyFindings.length > 0
  ) {
    throw new Error("The authenticated mutation source audit is not ready.");
  }

  const registryArtifact = JSON.parse(
    await readFile(
      path.resolve(
        appRoot,
        "../../contracts/auth/authenticated-mutation-registry.v3.json",
      ),
      "utf8",
    ),
  ) as AuthenticatedMutationRegistryV3;
  if (
    canonicalizeAuthenticatedMutationRegistry(registryArtifact) !==
    canonicalizeAuthenticatedMutationRegistry(audit.registry)
  ) {
    throw new Error("The authenticated mutation registry artifact is stale.");
  }
  await assertHighRiskAdmissionBoundaryEvidence({
    registry: audit.registry,
    appRoot,
  });
  await assertRemainingAdmissionBoundaryEvidence({
    registry: audit.registry,
    appRoot,
  });
  const receipt = buildAuthenticatedMutationEnforcementReceipt({
    registry: audit.registry,
    registryDigest: audit.receipt.registryDigest,
    sourceRegistryReceiptDigest: audit.receipt.receiptDigest,
  });
  const artifactPath = path.resolve(
    appRoot,
    AUTHENTICATED_MUTATION_ENFORCEMENT_ARTIFACT_PATH,
  );
  const deploymentReceipt = buildAuthenticatedMutationDeploymentReceiptArtifact(
    {
      registry: audit.registry,
      enforcementReceipt: receipt,
    },
  );
  const deploymentArtifactPath = path.resolve(
    appRoot,
    AUTHENTICATED_MUTATION_DEPLOYMENT_RECEIPT_ARTIFACT_PATH,
  );
  const pretty = `${JSON.stringify(receipt, null, 2)}\n`;
  const deploymentPretty = `${JSON.stringify(deploymentReceipt, null, 2)}\n`;
  if (write) {
    await Promise.all([
      writeFile(artifactPath, pretty, "utf8"),
      writeFile(deploymentArtifactPath, deploymentPretty, "utf8"),
    ]);
  } else {
    const artifact = JSON.parse(
      await readFile(artifactPath, "utf8"),
    ) as AuthenticatedMutationEnforcementReceiptV1;
    if (JSON.stringify(artifact) !== JSON.stringify(receipt)) {
      throw new Error(
        "The authenticated mutation enforcement receipt drifted.",
      );
    }
    const deploymentArtifact = JSON.parse(
      await readFile(deploymentArtifactPath, "utf8"),
    ) as AuthenticatedMutationDeploymentReceiptV1;
    if (
      JSON.stringify(deploymentArtifact) !== JSON.stringify(deploymentReceipt)
    ) {
      throw new Error("The authenticated mutation deployment receipt drifted.");
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: receipt.schemaVersion,
        state: check ? "matching" : "written",
        registryDigest: receipt.registryDigest,
        sourceRegistryReceiptDigest: receipt.sourceRegistryReceiptDigest,
        entrypointStateCount: receipt.entrypointStates.length,
        consumerEdgeStateCount: receipt.consumerEdgeStates.length,
        highRiskEntrypointCount: BASELINE_HIGH_RISK_ENTRYPOINT_COUNT,
        highRiskConsumerEdgeCount: BASELINE_HIGH_RISK_CONSUMER_EDGE_COUNT,
        highRiskAdmissionBoundaryCount:
          BASELINE_HIGH_RISK_ADMISSION_BOUNDARY_COUNT,
        remainingEntrypointCount: BASELINE_REMAINING_ENTRYPOINT_COUNT,
        remainingConsumerEdgeCount: BASELINE_REMAINING_CONSUMER_EDGE_COUNT,
        remainingAdmissionBoundaryCount:
          BASELINE_REMAINING_ADMISSION_BOUNDARY_COUNT,
        explicitGoogleLinkEntrypointCount:
          BASELINE_EXPLICIT_GOOGLE_LINK_ENTRYPOINT_COUNT,
        explicitGoogleLinkConsumerEdgeCount:
          BASELINE_EXPLICIT_GOOGLE_LINK_CONSUMER_EDGE_COUNT,
        explicitGoogleLinkOwnershipDigest:
          BASELINE_EXPLICIT_GOOGLE_LINK_OWNERSHIP_DIGEST,
        deploymentReceiptSchemaVersion: deploymentReceipt.schemaVersion,
        deploymentReceiptDigest: digestJson(deploymentReceipt),
        evidenceSafety: "counts_digests_and_bounded_state_only",
      },
      null,
      2,
    )}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        schemaVersion: AUTHENTICATED_MUTATION_ENFORCEMENT_SCHEMA_VERSION,
        state: "inconclusive",
        errorClass: error instanceof Error ? error.name : "unknown_error",
        evidenceSafety: "no_source_or_protected_payload",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
