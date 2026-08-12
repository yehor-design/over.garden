import { createHash } from "node:crypto";

export const AUTHENTICATED_ARCHITECTURE_SCHEMA_VERSION =
  "overgarden.authenticated-architecture-receipt.v2" as const;
export const AUTHENTICATED_ARCHITECTURE_EVIDENCE_SCHEMA_VERSION =
  "overgarden.authenticated-architecture-evidence-input.v1" as const;

export const AUTHENTICATED_ARCHITECTURE_CHILD_IDS = [
  "OVE-285",
  "OVE-286",
  "OVE-287",
  "OVE-288",
  "OVE-289",
  "OVE-290",
  "OVE-291",
  "OVE-292",
  "OVE-293",
  "OVE-294",
  "OVE-295",
  "OVE-296",
  "OVE-297",
  "OVE-298",
] as const;

export type AuthenticatedArchitectureChildId =
  (typeof AUTHENTICATED_ARCHITECTURE_CHILD_IDS)[number];

export const AUTHENTICATED_ARCHITECTURE_PREREQUISITE_IDS = [
  "OVE-296",
  "OVE-285",
  "OVE-293",
  "OVE-288",
  "OVE-290",
  "OVE-286",
  "OVE-287",
  "OVE-291",
  "OVE-289",
  "OVE-294",
  "OVE-295",
  "OVE-297",
  "OVE-298",
] as const;

export type AuthenticatedArchitecturePrerequisiteId =
  (typeof AUTHENTICATED_ARCHITECTURE_PREREQUISITE_IDS)[number];

export const AUTHENTICATED_ARCHITECTURE_STRICT_CHAIN = [
  "OVE-296",
  "OVE-285",
  "OVE-293",
  "OVE-288",
  "OVE-290",
  "OVE-286",
  "OVE-287",
  "OVE-291",
  "OVE-289",
  "OVE-294",
  "OVE-295",
  "OVE-292",
  "OVE-284",
  "OVE-186",
] as const;

export const AUTHENTICATED_ARCHITECTURE_NON_CHAIN_EDGES = [
  ["OVE-296", "OVE-297"],
  ["OVE-297", "OVE-292"],
  ["OVE-295", "OVE-298"],
  ["OVE-298", "OVE-292"],
] as const;

export type AuthenticatedArchitectureProvenanceClass =
  | "production-observed"
  | "child-inherited"
  | "browser-simulated";

export const AUTHENTICATED_ARCHITECTURE_MANIFEST = [
  {
    id: "facebook_login_retired_google_link_preserved",
    assertions: [
      "facebook_auth_surface_absent",
      "google_auth_surface_present",
      "meta_ads_unchanged",
    ],
    requiredProvenanceClasses: ["production-observed", "child-inherited"],
    childReceiptIds: ["OVE-296", "OVE-297", "OVE-298"],
  },
  {
    id: "google_link_explicit_existing_credential_account",
    assertions: [
      "explicit_link_preserves_identity",
      "implicit_linking_disabled",
      "sealed_owner_ineligible",
    ],
    requiredProvenanceClasses: ["production-observed", "child-inherited"],
    childReceiptIds: ["OVE-294", "OVE-295", "OVE-298"],
  },
  {
    id: "ordinary_recheck_remains_non_fencing",
    assertions: ["private_tree_visible_during_ordinary_recheck"],
    requiredProvenanceClasses: ["child-inherited", "browser-simulated"],
    childReceiptIds: ["OVE-286"],
  },
  {
    id: "confirmed_invalidation_fences_synchronously",
    assertions: ["private_tree_removed_before_paint"],
    requiredProvenanceClasses: ["child-inherited", "browser-simulated"],
    childReceiptIds: ["OVE-286"],
  },
  {
    id: "owner_inspection_unavailable_retains",
    assertions: ["inspection_failure_retains_owner_work"],
    requiredProvenanceClasses: ["child-inherited", "browser-simulated"],
    childReceiptIds: ["OVE-293"],
  },
  {
    id: "vault_migration_target_readback_exact",
    assertions: ["owner_vault_target_readback_exact"],
    requiredProvenanceClasses: ["child-inherited", "browser-simulated"],
    childReceiptIds: ["OVE-288"],
  },
  {
    id: "matching_owner_foreground_sync_only",
    assertions: [
      "matching_owner_only",
      "one_automatic_attempt_per_revision",
      "failure_enters_manual_recovery",
    ],
    requiredProvenanceClasses: ["child-inherited", "browser-simulated"],
    childReceiptIds: ["OVE-289"],
  },
  {
    id: "mutation_registry_receipt_continuity",
    assertions: ["registry_and_enforcement_receipts_match"],
    requiredProvenanceClasses: ["child-inherited"],
    childReceiptIds: ["OVE-285", "OVE-290", "OVE-291"],
  },
  {
    id: "stale_document_mutation_rejected_with_zero_effect",
    assertions: ["stale_document_effect_count_zero"],
    requiredProvenanceClasses: ["child-inherited", "browser-simulated"],
    childReceiptIds: ["OVE-290", "OVE-291"],
  },
  {
    id: "immediate_exit_before_first_await",
    assertions: [
      "private_tree_removed_before_first_await",
      "owner_work_retained",
    ],
    requiredProvenanceClasses: ["child-inherited", "browser-simulated"],
    childReceiptIds: ["OVE-287"],
  },
  {
    id: "account_a_exit_zero_effect_on_account_b",
    assertions: ["actor_b_private_state_unchanged"],
    requiredProvenanceClasses: ["child-inherited", "browser-simulated"],
    childReceiptIds: ["OVE-287", "OVE-288"],
  },
  {
    id: "bfcache_persistent_marker_blocks_prior_content",
    assertions: ["prior_actor_content_never_reappears"],
    requiredProvenanceClasses: ["child-inherited", "browser-simulated"],
    childReceiptIds: ["OVE-286", "OVE-287", "OVE-288"],
  },
] as const satisfies readonly AuthenticatedArchitectureScenarioDefinition[];

export type AuthenticatedArchitectureScenarioId =
  (typeof AUTHENTICATED_ARCHITECTURE_MANIFEST)[number]["id"];

export interface AuthenticatedArchitectureScenarioDefinition {
  id: string;
  assertions: readonly string[];
  requiredProvenanceClasses: readonly AuthenticatedArchitectureProvenanceClass[];
  childReceiptIds: readonly AuthenticatedArchitecturePrerequisiteId[];
}

export interface AuthenticatedArchitectureRelationProjection {
  blocks: string[];
  blockedBy: string[];
}

export const EXPECTED_CHILD_RELATIONS = {
  "OVE-285": { blocks: ["OVE-293"], blockedBy: ["OVE-296"] },
  "OVE-286": { blocks: ["OVE-287"], blockedBy: ["OVE-290"] },
  "OVE-287": { blocks: ["OVE-291"], blockedBy: ["OVE-286"] },
  "OVE-288": { blocks: ["OVE-290"], blockedBy: ["OVE-293"] },
  "OVE-289": { blocks: ["OVE-294"], blockedBy: ["OVE-291"] },
  "OVE-290": { blocks: ["OVE-286"], blockedBy: ["OVE-288"] },
  "OVE-291": { blocks: ["OVE-289"], blockedBy: ["OVE-287"] },
  "OVE-292": {
    blocks: ["OVE-284"],
    blockedBy: ["OVE-295", "OVE-297", "OVE-298"],
  },
  "OVE-293": { blocks: ["OVE-288"], blockedBy: ["OVE-285"] },
  "OVE-294": { blocks: ["OVE-295"], blockedBy: ["OVE-289", "OVE-314"] },
  "OVE-295": {
    blocks: ["OVE-292", "OVE-298"],
    blockedBy: ["OVE-294"],
  },
  "OVE-296": { blocks: ["OVE-285", "OVE-297"], blockedBy: [] },
  "OVE-297": { blocks: ["OVE-292"], blockedBy: ["OVE-296"] },
  "OVE-298": { blocks: ["OVE-292"], blockedBy: ["OVE-295"] },
} as const satisfies Record<
  AuthenticatedArchitectureChildId,
  AuthenticatedArchitectureRelationProjection
>;

const PREREQUISITE_RECEIPT_VERSIONS = Object.fromEntries(
  AUTHENTICATED_ARCHITECTURE_PREREQUISITE_IDS.map((issue) => [
    issue,
    "overgarden.linear-sdd.v1",
  ]),
) as Record<
  AuthenticatedArchitecturePrerequisiteId,
  "overgarden.linear-sdd.v1"
>;

export interface AuthenticatedArchitectureEvidenceInputV1 {
  schemaVersion: typeof AUTHENTICATED_ARCHITECTURE_EVIDENCE_SCHEMA_VERSION;
  childDescriptionDigests: Record<AuthenticatedArchitectureChildId, string>;
  childStates: Record<AuthenticatedArchitectureChildId, "Done" | "In Progress">;
  childRelations: Record<
    AuthenticatedArchitectureChildId,
    AuthenticatedArchitectureRelationProjection
  >;
}

export interface ValidatedAuthenticatedArchitectureEvidence {
  childDescriptionDigests: Record<AuthenticatedArchitectureChildId, string>;
  childStates: Record<AuthenticatedArchitectureChildId, "Done" | "In Progress">;
  childRelations: Record<
    AuthenticatedArchitectureChildId,
    AuthenticatedArchitectureRelationProjection
  >;
  relationDigest: string;
}

export interface AuthenticatedArchitectureScenarioResultV2 {
  scenarioId: AuthenticatedArchitectureScenarioId;
  scenarioEpoch: number;
  resultClass: "passed" | "degraded_recovered";
  durationClass: "under_20s";
  syntheticWritesTransmitted: 0;
}

export interface AuthenticatedArchitectureClaimV1 {
  claimId: string;
  scenarioId: AuthenticatedArchitectureScenarioId;
  provenanceClass: AuthenticatedArchitectureProvenanceClass;
  evidenceDigest: string;
  resultClass: "satisfied";
}

export interface AuthenticatedArchitectureReceiptV2 {
  schemaVersion: typeof AUTHENTICATED_ARCHITECTURE_SCHEMA_VERSION;
  runIdDigest: string;
  childDescriptionDigests: Record<AuthenticatedArchitectureChildId, string>;
  manifestDigest: string;
  scenarioCount: 12;
  scenarioResults: AuthenticatedArchitectureScenarioResultV2[];
  claimReceipts: AuthenticatedArchitectureClaimV1[];
  integrationSha: string;
  deploymentClass: "local_integration" | "production_runtime_exact_sha";
  relationDigest: string;
  cleanupClass:
    | "ephemeral_browser_closed_no_session_created"
    | "ephemeral_browser_closed_local";
  effectCounts: {
    syntheticWritesTransmitted: 0;
    productMutations: 0;
    providerMutations: 0;
    sessionEffects: 0;
    analyticsEvents: 0;
  };
  performanceClass: "confirmed_private_tree_removal_within_100ms";
  waitClass: "public_navigation_and_locale_switcher_responsive";
}

export function canonicalizeArchitectureValue(value: unknown): string {
  return JSON.stringify(canonicalArchitectureValue(value));
}

function canonicalArchitectureValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalArchitectureValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalArchitectureValue(child)]),
    );
  }
  return value;
}

export function architectureSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildAuthenticatedArchitectureManifestDigest(
  manifest: readonly AuthenticatedArchitectureScenarioDefinition[] = AUTHENTICATED_ARCHITECTURE_MANIFEST,
): string {
  const normalizedManifest = [...manifest]
    .map((scenario) => ({
      id: scenario.id,
      assertions: [...scenario.assertions].sort(),
      requiredProvenanceClasses: [...scenario.requiredProvenanceClasses].sort(),
      childReceiptIds: [...scenario.childReceiptIds].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return architectureSha256(
    canonicalizeArchitectureValue({
      scenarios: normalizedManifest,
      prerequisiteReceiptVersions: PREREQUISITE_RECEIPT_VERSIONS,
      strictChain: AUTHENTICATED_ARCHITECTURE_STRICT_CHAIN,
      nonChainEdges: AUTHENTICATED_ARCHITECTURE_NON_CHAIN_EDGES,
    }),
  );
}

export function buildRelationDigest(
  relations: Record<
    AuthenticatedArchitectureChildId,
    AuthenticatedArchitectureRelationProjection
  >,
): string {
  const normalized = Object.fromEntries(
    AUTHENTICATED_ARCHITECTURE_CHILD_IDS.map((issue) => [
      issue,
      {
        blocks: [...relations[issue].blocks].sort(),
        blockedBy: [...relations[issue].blockedBy].sort(),
      },
    ]),
  );
  return architectureSha256(canonicalizeArchitectureValue(normalized));
}

export function validateAuthenticatedArchitectureEvidence(
  input: AuthenticatedArchitectureEvidenceInputV1,
): ValidatedAuthenticatedArchitectureEvidence {
  if (
    input.schemaVersion !== AUTHENTICATED_ARCHITECTURE_EVIDENCE_SCHEMA_VERSION
  ) {
    throw new Error(
      "OVE-292 evidence input has an unsupported schema version.",
    );
  }
  assertExactKeys(
    input.childDescriptionDigests,
    AUTHENTICATED_ARCHITECTURE_CHILD_IDS,
    "OVE-292 requires exactly fourteen child description digests.",
  );
  assertExactKeys(
    input.childStates,
    AUTHENTICATED_ARCHITECTURE_CHILD_IDS,
    "OVE-292 requires exactly fourteen child states.",
  );
  assertExactKeys(
    input.childRelations,
    AUTHENTICATED_ARCHITECTURE_CHILD_IDS,
    "OVE-292 requires exactly fourteen child relation projections.",
  );

  for (const issue of AUTHENTICATED_ARCHITECTURE_CHILD_IDS) {
    assertSha256(
      input.childDescriptionDigests[issue],
      `${issue} description digest`,
    );
    const expectedState = issue === "OVE-292" ? "In Progress" : "Done";
    if (input.childStates[issue] !== expectedState) {
      throw new Error(`${issue} must be ${expectedState}.`);
    }
    const actual = normalizeRelation(input.childRelations[issue]);
    const expected = normalizeRelation(EXPECTED_CHILD_RELATIONS[issue]);
    if (
      canonicalizeArchitectureValue(actual) !==
      canonicalizeArchitectureValue(expected)
    ) {
      throw new Error(`${issue} relation drift detected.`);
    }
  }

  const childRelations = structuredClone(
    EXPECTED_CHILD_RELATIONS,
  ) as unknown as Record<
    AuthenticatedArchitectureChildId,
    AuthenticatedArchitectureRelationProjection
  >;
  const validated = {
    childDescriptionDigests: { ...input.childDescriptionDigests },
    childStates: { ...input.childStates },
    childRelations,
    relationDigest: buildRelationDigest(childRelations),
  };
  assertRecursivelyRedactedArchitectureEvidence(validated);
  return validated;
}

function normalizeRelation(
  relation: AuthenticatedArchitectureRelationProjection,
): AuthenticatedArchitectureRelationProjection {
  return {
    blocks: [...relation.blocks].sort(),
    blockedBy: [...relation.blockedBy].sort(),
  };
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  message: string,
) {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (
    canonicalizeArchitectureValue(actualKeys) !==
    canonicalizeArchitectureValue(expectedKeys)
  ) {
    throw new Error(message);
  }
}

const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "email",
  "password",
  "otp",
  "token",
  "cookie",
  "secret",
  "userid",
  "ownerid",
  "sessionid",
  "provideraccountid",
  "providersubject",
  "oauthstate",
  "oauthcode",
  "callbackquery",
  "privatecontent",
  "mediakey",
  "objectkey",
  "capabilityurl",
  "ip",
  "ipaddress",
  "useragent",
  "referrer",
  "coordinates",
  "latitude",
  "longitude",
  "screenshot",
]);

export function assertRecursivelyRedactedArchitectureEvidence(
  value: unknown,
  path = "$",
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      assertRecursivelyRedactedArchitectureEvidence(child, `${path}[${index}]`),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const normalizedKey = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
      if (FORBIDDEN_EVIDENCE_KEYS.has(normalizedKey)) {
        throw new Error(`OVE-292 forbidden evidence key at ${path}.${key}.`);
      }
      assertRecursivelyRedactedArchitectureEvidence(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    if (
      /(?:^|[;?&\s])(token|cookie|password|secret|otp)=/iu.test(value) ||
      /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u.test(value) ||
      /(?:^|\s)-?\d{1,2}\.\d{3,}\s*[,; ]\s*-?\d{1,3}\.\d{3,}(?:$|\s)/u.test(
        value,
      )
    ) {
      throw new Error(`OVE-292 forbidden evidence value at ${path}.`);
    }
  }
}

export function assertAuthenticatedArchitectureReceipt(
  receipt: AuthenticatedArchitectureReceiptV2,
  options: { environment: "local" | "production" },
): void {
  assertRecursivelyRedactedArchitectureEvidence(receipt);
  if (receipt.schemaVersion !== AUTHENTICATED_ARCHITECTURE_SCHEMA_VERSION) {
    throw new Error("OVE-292 receipt schema mismatch.");
  }
  assertSha256(receipt.runIdDigest, "runIdDigest");
  assertSha256(receipt.manifestDigest, "manifestDigest");
  assertSha256(receipt.relationDigest, "relationDigest");
  assertCommitSha(receipt.integrationSha, "integrationSha");
  if (
    receipt.manifestDigest !== buildAuthenticatedArchitectureManifestDigest()
  ) {
    throw new Error("OVE-292 manifest digest mismatch.");
  }
  if (
    receipt.relationDigest !== buildRelationDigest(EXPECTED_CHILD_RELATIONS)
  ) {
    throw new Error("OVE-292 relation digest mismatch.");
  }
  if (receipt.scenarioCount !== 12 || receipt.scenarioResults.length !== 12) {
    throw new Error("OVE-292 receipt requires exactly twelve scenarios.");
  }
  assertExactKeys(
    receipt.childDescriptionDigests,
    AUTHENTICATED_ARCHITECTURE_CHILD_IDS,
    "OVE-292 receipt requires exactly fourteen child digests.",
  );
  for (const issue of AUTHENTICATED_ARCHITECTURE_CHILD_IDS) {
    assertSha256(receipt.childDescriptionDigests[issue], `${issue} digest`);
  }

  const expectedScenarioIds = AUTHENTICATED_ARCHITECTURE_MANIFEST.map(
    ({ id }) => id,
  ).sort();
  const resultIds = receipt.scenarioResults
    .map(({ scenarioId }) => scenarioId)
    .sort();
  if (
    canonicalizeArchitectureValue(resultIds) !==
    canonicalizeArchitectureValue(expectedScenarioIds)
  ) {
    throw new Error("OVE-292 scenario result IDs drifted.");
  }
  receipt.scenarioResults.forEach((result, index) => {
    if (result.scenarioId !== AUTHENTICATED_ARCHITECTURE_MANIFEST[index].id) {
      throw new Error("OVE-292 scenario result order drifted.");
    }
    if (
      result.scenarioEpoch !== index + 1 ||
      (result.resultClass !== "passed" &&
        result.resultClass !== "degraded_recovered") ||
      result.durationClass !== "under_20s" ||
      result.syntheticWritesTransmitted !== 0
    ) {
      throw new Error("OVE-292 scenario result contract failed.");
    }
  });

  const claimClasses = new Map<
    string,
    AuthenticatedArchitectureProvenanceClass
  >();
  for (const claim of receipt.claimReceipts) {
    assertSha256(claim.evidenceDigest, `${claim.claimId} evidence digest`);
    if (claim.resultClass !== "satisfied") {
      throw new Error("OVE-292 claim did not satisfy its assertion.");
    }
    const prior = claimClasses.get(claim.claimId);
    if (prior && prior !== claim.provenanceClass) {
      throw new Error("OVE-292 claim crossed provenance classes.");
    }
    if (prior) throw new Error("OVE-292 duplicate claim ID.");
    claimClasses.set(claim.claimId, claim.provenanceClass);
  }
  const expectedClaims = AUTHENTICATED_ARCHITECTURE_MANIFEST.flatMap(
    (scenario) =>
      scenario.requiredProvenanceClasses
        .filter(
          (provenanceClass) =>
            options.environment === "production" ||
            provenanceClass !== "production-observed",
        )
        .map((provenanceClass) => ({
          claimId: `${scenario.id}:${claimSuffix(provenanceClass)}`,
          scenarioId: scenario.id,
          provenanceClass,
        })),
  ).sort((left, right) => left.claimId.localeCompare(right.claimId));
  const actualClaims = receipt.claimReceipts
    .map(({ claimId, scenarioId, provenanceClass }) => ({
      claimId,
      scenarioId,
      provenanceClass,
    }))
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
  if (
    canonicalizeArchitectureValue(actualClaims) !==
    canonicalizeArchitectureValue(expectedClaims)
  ) {
    throw new Error("OVE-292 claim set drift detected.");
  }
  for (const scenario of AUTHENTICATED_ARCHITECTURE_MANIFEST) {
    const actualClasses = new Set(
      receipt.claimReceipts
        .filter(({ scenarioId }) => scenarioId === scenario.id)
        .map(({ provenanceClass }) => provenanceClass),
    );
    for (const requiredClass of scenario.requiredProvenanceClasses) {
      if (
        options.environment === "local" &&
        requiredClass === "production-observed"
      ) {
        continue;
      }
      if (!actualClasses.has(requiredClass)) {
        throw new Error(
          `OVE-292 ${scenario.id} lacks ${requiredClass} provenance.`,
        );
      }
    }
  }

  const effects = receipt.effectCounts;
  if (
    effects.syntheticWritesTransmitted !== 0 ||
    effects.productMutations !== 0 ||
    effects.providerMutations !== 0 ||
    effects.sessionEffects !== 0 ||
    effects.analyticsEvents !== 0
  ) {
    throw new Error("OVE-292 receipt contains an unauthorized effect.");
  }
  if (
    receipt.performanceClass !==
      "confirmed_private_tree_removal_within_100ms" ||
    receipt.waitClass !== "public_navigation_and_locale_switcher_responsive"
  ) {
    throw new Error("OVE-292 performance or wait receipt is incomplete.");
  }
  if (
    options.environment === "production" &&
    (receipt.deploymentClass !== "production_runtime_exact_sha" ||
      receipt.cleanupClass !== "ephemeral_browser_closed_no_session_created")
  ) {
    throw new Error("OVE-292 production identity or cleanup class mismatch.");
  }
  if (
    options.environment === "local" &&
    (receipt.deploymentClass !== "local_integration" ||
      receipt.cleanupClass !== "ephemeral_browser_closed_local")
  ) {
    throw new Error("OVE-292 local identity or cleanup class mismatch.");
  }
}

function claimSuffix(
  provenanceClass: AuthenticatedArchitectureProvenanceClass,
): string {
  switch (provenanceClass) {
    case "production-observed":
      return "production_runtime_and_auth_surface";
    case "child-inherited":
      return "immutable_child_receipts";
    case "browser-simulated":
      return "ephemeral_browser_simulation";
  }
}

export function assertSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`OVE-292 ${label} must be a lowercase SHA-256 digest.`);
  }
}

export function assertCommitSha(value: string, label: string): void {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`OVE-292 ${label} must be a lowercase Git SHA.`);
  }
}
