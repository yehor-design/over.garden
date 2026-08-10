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

const HIGH_RISK_OWNER = "high_risk_ove_290" as const;
const BASELINE_HIGH_RISK_ENTRYPOINT_COUNT = 36;
const BASELINE_HIGH_RISK_ENTRYPOINT_SET_DIGEST =
  "d622fb441a1ae7e864d6c92d5f4e592df1fab9816b4fc90095e026492ca47ba9";
const BASELINE_HIGH_RISK_CONSUMER_EDGE_COUNT = 281;
const BASELINE_HIGH_RISK_EDGE_BINDING_SET_DIGEST =
  "2e7d5929875570c3eae3596996541ddd4d69c534c83c42b91a32add7a793c048";
const BASELINE_HIGH_RISK_ADMISSION_BOUNDARY_COUNT = 24;

export type AuthenticatedMutationEntrypointEnforcementState =
  | "enforced_ove_290"
  | "awaiting_ove_291"
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

export function buildAuthenticatedMutationEnforcementReceipt(
  input: BuildAuthenticatedMutationEnforcementReceiptInput,
): AuthenticatedMutationEnforcementReceiptV1 {
  requireSha256(input.registryDigest, "registry digest");
  requireSha256(input.sourceRegistryReceiptDigest, "source receipt digest");
  assertBaselineHighRiskTopology(input.registry);

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

function entrypointState(
  owner: AuthenticatedMutationExecutionOwner,
): AuthenticatedMutationEntrypointEnforcementState {
  switch (owner) {
    case "high_risk_ove_290":
      return "enforced_ove_290";
    case "remaining_ove_291":
      return "awaiting_ove_291";
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
      return "awaiting_ove_291";
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

function localBoundaryIdentifiers(
  sourcePath: string,
  symbol: string,
): string[] {
  if (sourcePath === "src/lib/offline/drafts.ts") {
    return ["assertOfflineDraftWriteAllowed"];
  }
  if (sourcePath === "src/lib/offline/journal-entry-sync.ts") {
    return symbol === "submitOnlineJournalEntryPayload"
      ? ["enqueueMutation", "documentMutationGeneration", "syncMutation"]
      : [
          "claimOfflineMutationForSync",
          "documentMutationGeneration",
          "submitJournalEntryPayload",
        ];
  }
  if (sourcePath === "src/lib/offline/owner-vault-migration.ts") {
    return [
      "hasOwnerVaultBinding",
      "acquireOwnerVaultExclusiveFence",
      "throwIfCancelled",
    ];
  }
  if (sourcePath === "src/lib/offline/queue.ts") {
    return symbol === "assertOwnerOfflineActivityAllowed"
      ? [
          "localOwnerActivitySessionGenerations",
          "signed_out_fence",
          "OwnerOfflineActivityPausedError",
        ]
      : ["assertOwnerOfflineActivityAllowed"];
  }
  throw new Error(`No admission evidence policy for ${sourcePath}#${symbol}`);
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
  const receipt = buildAuthenticatedMutationEnforcementReceipt({
    registry: audit.registry,
    registryDigest: audit.receipt.registryDigest,
    sourceRegistryReceiptDigest: audit.receipt.receiptDigest,
  });
  const artifactPath = path.resolve(
    appRoot,
    AUTHENTICATED_MUTATION_ENFORCEMENT_ARTIFACT_PATH,
  );
  const pretty = `${JSON.stringify(receipt, null, 2)}\n`;
  if (write) {
    await writeFile(artifactPath, pretty, "utf8");
  } else {
    const artifact = JSON.parse(
      await readFile(artifactPath, "utf8"),
    ) as AuthenticatedMutationEnforcementReceiptV1;
    if (JSON.stringify(artifact) !== JSON.stringify(receipt)) {
      throw new Error(
        "The authenticated mutation enforcement receipt drifted.",
      );
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
        admissionBoundaryCount: BASELINE_HIGH_RISK_ADMISSION_BOUNDARY_COUNT,
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
