export const DETERMINISTIC_MATCHING_ROLLOUT_ENVIRONMENTS = [
  "local",
  "preview",
  "staging",
  "production",
] as const;

export type DeterministicMatchingRolloutEnvironment =
  (typeof DETERMINISTIC_MATCHING_ROLLOUT_ENVIRONMENTS)[number];

export interface DeterministicMatchingRolloutOptions {
  environment: DeterministicMatchingRolloutEnvironment;
  confirmEnvironment: DeterministicMatchingRolloutEnvironment;
  baseUrl: string;
}

export interface DeterministicMatchingRolloutCodeState {
  commitSha: string;
  branch: string;
  workingTree: "clean" | "dirty" | "unknown";
}

const REQUIRED_JOB_KINDS = [
  "catalog_match_suggestions_refresh",
  "catalog_alias_suggestions_refresh",
  "catalog_fuzzy_duplicate_qa_refresh",
  "catalog_typeahead_reindex",
] as const;

const REQUIRED_SEARCH_KINDS = [
  "typo",
  "transliteration",
  "synonym",
  "cross_locale",
] as const;

const REQUIRED_POSTGRES_FALLBACK_KINDS = [
  "transliteration",
  "synonym",
  "cross_locale",
] as const;

const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "rawpayload",
  "payload",
  "sourcerecordid",
  "sourcerecordkey",
  "sourcesnapshotid",
  "sourceonlyfields",
  "owneruserid",
  "revieweruserid",
  "sessionid",
  "journalbody",
  "journaltitle",
  "quarantinekey",
  "derivativekey",
  "coordinates",
  "latitude",
  "longitude",
  "gps",
  "exif",
  "email",
  "ip",
  "ipaddress",
  "useragent",
  "referrer",
  "cookie",
  "token",
  "secret",
  "password",
  "databaseurl",
  "directurl",
  "certificate",
]);

const FORBIDDEN_EVIDENCE_VALUE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /postgres(?:ql)?:\/\//i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
] as const;

export function parseDeterministicMatchingRolloutArgs(
  argv: string[],
): Partial<DeterministicMatchingRolloutOptions> {
  const options: Partial<DeterministicMatchingRolloutOptions> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;

    switch (arg) {
      case "--environment":
        options.environment = parseEnvironment(argv[index + 1], arg);
        index += 1;
        break;
      case "--confirm-environment":
        options.confirmEnvironment = parseEnvironment(argv[index + 1], arg);
        index += 1;
        break;
      case "--base-url":
        options.baseUrl = argv[index + 1];
        index += 1;
        break;
      default:
        throw new Error(`Unsupported option: ${arg}`);
    }
  }

  return options;
}

export function validateDeterministicMatchingRolloutOptions(
  options: Partial<DeterministicMatchingRolloutOptions>,
): DeterministicMatchingRolloutOptions {
  if (!options.environment) throw new Error("Missing --environment.");
  if (!options.confirmEnvironment) {
    throw new Error("Missing --confirm-environment.");
  }
  if (options.environment !== options.confirmEnvironment) {
    throw new Error("--confirm-environment must exactly match --environment.");
  }
  if (!options.baseUrl?.trim()) throw new Error("Missing --base-url.");

  const url = new URL(options.baseUrl);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "Rollout proof base URL must not contain credentials or state.",
    );
  }
  if (url.pathname !== "/") {
    throw new Error(
      "Rollout proof base URL must be the environment origin root.",
    );
  }

  const loopback = isLoopbackHostname(url.hostname);
  if (options.environment === "local") {
    if (!loopback || url.protocol !== "http:") {
      throw new Error(
        "Local rollout proof requires an HTTP loopback base URL.",
      );
    }
  } else {
    if (loopback || url.protocol !== "https:") {
      throw new Error(
        "Non-local rollout proof requires a non-loopback HTTPS URL.",
      );
    }
  }

  return {
    environment: options.environment,
    confirmEnvironment: options.confirmEnvironment,
    baseUrl: url.toString().replace(/\/$/, ""),
  };
}

export function buildLocalDeterministicMatchingRolloutEvidence(input: {
  options: DeterministicMatchingRolloutOptions;
  codeState: DeterministicMatchingRolloutCodeState;
  canonicalRefresh: unknown;
  canonicalMatch: unknown;
  aliasReview: unknown;
  gardenerReadback: unknown;
  fuzzyDuplicate: unknown;
  workerRecovery: unknown;
  generatedAt: string;
}) {
  const options = validateDeterministicMatchingRolloutOptions(input.options);
  if (options.environment !== "local") {
    throw new Error("Local matching proof requires the local environment.");
  }
  assertCodeState(input.codeState);

  const canonicalRefresh = requireRecord(
    input.canonicalRefresh,
    "canonical refresh proof",
  );
  requireIssue(canonicalRefresh, "OVE-159", "canonical refresh proof");
  requireTrue(
    canonicalRefresh,
    "unchangedEvidenceKeepsRejection",
    "canonical suggestion replay",
  );
  requireTrue(
    canonicalRefresh,
    "timestampOnlyTouchKeepsRejection",
    "timestamp-only canonical replay",
  );
  requireTrue(
    canonicalRefresh,
    "objectCountOnlyKeepsRejection",
    "object-count canonical replay",
  );
  requireTrue(
    canonicalRefresh,
    "materialEvidenceChangeReopensSuggestion",
    "material canonical evidence refresh",
  );
  requireTrue(
    canonicalRefresh,
    "previousDecisionClearedOnReopen",
    "canonical decision reset",
  );
  requireNoProductionMutation(canonicalRefresh, "canonical refresh proof");

  const canonicalMatch = requireRecord(
    input.canonicalMatch,
    "canonical match proof",
  );
  requireIssue(canonicalMatch, "OVE-159", "canonical match proof");
  for (const [key, label] of [
    ["rejectionIsSuggestionOnly", "canonical match rejection"],
    ["staleSuggestionCannotApprove", "stale canonical evidence"],
    ["approvalIsAtomic", "canonical match approval"],
    ["journalHistoryStable", "canonical journal history"],
    ["auditMetadataRecorded", "canonical decision audit"],
    [
      "completedReindexJobRequeuedOnlyForApproval",
      "canonical approval reindex",
    ],
    ["concurrentObjectCreationSerialized", "canonical approval serialization"],
    [
      "legacyWorkerCompatibilityPreservesSuggestionOnly",
      "legacy canonical worker compatibility",
    ],
  ] as const) {
    requireTrue(canonicalMatch, key, label);
  }
  requireExactString(
    canonicalMatch,
    "approvedCanonicalServeClass",
    "exact",
    "approved canonical served class",
  );
  requireNoProductionMutation(canonicalMatch, "canonical match proof");

  const aliasReview = requireRecord(input.aliasReview, "alias review proof");
  requireIssue(aliasReview, "OVE-160", "alias review proof");
  for (const [key, label] of [
    ["workerContractExecuted", "alias worker contract"],
    ["generatedVariantsReviewGated", "generated alias review gate"],
    ["collisionApprovalBlocked", "alias collision hold"],
    ["rejectionLeavesTypeaheadUntouched", "alias rejection"],
    ["approvalProjectsAliasAtomically", "alias approval"],
    ["approvedAliasFoundThroughTypeahead", "approved alias typeahead"],
    [
      "staleSourceApprovalPreservesCanonicalState",
      "stale alias approval state",
    ],
    ["replayPreservesAcceptedAndRejectedDecisions", "alias decision replay"],
  ] as const) {
    requireTrue(aliasReview, key, label);
  }
  requireExactString(
    aliasReview,
    "approvedAliasServeClass",
    "generated",
    "approved alias served class",
  );
  requireNoProductionMutation(aliasReview, "alias review proof");

  const gardener = requireRecord(
    input.gardenerReadback,
    "gardener readback proof",
  );
  requireIssue(gardener, "OVE-161", "gardener readback proof");
  requireExactString(
    gardener,
    "gardenSurface",
    "operational_home",
    "authenticated gardener surface",
  );
  for (const [key, label] of [
    ["firstEntryCanonicalReadback", "first-entry canonical readback"],
    ["existingObjectCanonicalReadback", "existing-object canonical readback"],
    ["unknownFallback", "Unknown fallback"],
    ["addMissingFallback", "own-name fallback"],
    ["duplicateProvisionalAliasAbsent", "duplicate provisional alias guard"],
    ["unsafeMeiliMetadataAbsent", "typeahead privacy contract"],
    ["journalHistoryPreserved", "gardener journal history"],
  ] as const) {
    requireTrue(gardener, key, label);
  }
  requirePassedLeakCheck(gardener, "gardener readback proof");
  requireNoProductionMutation(gardener, "gardener readback proof");
  const searchCases = requireRecordArray(
    gardener.searchCases,
    "gardener search cases",
  );
  const provenSearchKinds = new Set(
    searchCases.map((row) => requireString(row, "kind", "search case")),
  );
  requireSetMembers(
    provenSearchKinds,
    REQUIRED_SEARCH_KINDS,
    "gardener search cases",
  );
  const postgresFallbackKinds = new Set(
    requireStringArray(
      gardener.postgresFallbackAliases,
      "Postgres fallback aliases",
    ),
  );
  requireSetMembers(
    postgresFallbackKinds,
    REQUIRED_POSTGRES_FALLBACK_KINDS,
    "Postgres fallback aliases",
  );

  const fuzzyDuplicate = requireRecord(
    input.fuzzyDuplicate,
    "fuzzy duplicate proof",
  );
  if (
    fuzzyDuplicate.schemaVersion !== "ove162.catalogFuzzyDuplicateQaSmoke.v1"
  ) {
    throw new Error("Fuzzy duplicate proof schema is missing or stale.");
  }
  if (fuzzyDuplicate.mode !== "prove") {
    throw new Error("Fuzzy duplicate proof must run in prove mode.");
  }
  requireTrue(fuzzyDuplicate, "advisoryOnly", "fuzzy advisory boundary");
  requirePassedLeakCheck(fuzzyDuplicate, "fuzzy duplicate proof");
  const suggestionCount = requireNonNegativeNumber(
    fuzzyDuplicate,
    "suggestionCount",
    "fuzzy suggestion count",
  );
  if (suggestionCount < 1) {
    throw new Error("Fuzzy duplicate proof did not persist a fixture pair.");
  }

  const workerRecovery = requireRecord(
    input.workerRecovery,
    "worker recovery proof",
  );
  if (workerRecovery.status !== "passed") {
    throw new Error("Worker recovery proof did not pass.");
  }
  for (const [key, label] of [
    ["staleClaimRecovery", "stale claim recovery"],
    ["boundedLeaseCoverage", "bounded catalog job lease"],
    ["rerunRequestedCoverage", "rerun-requested recovery"],
    ["idempotentHandlerCoverage", "idempotent matching handlers"],
  ] as const) {
    requireTrue(workerRecovery, key, label);
  }
  const jobKinds = new Set(
    requireStringArray(workerRecovery.jobKinds, "worker job kinds"),
  );
  requireSetMembers(jobKinds, REQUIRED_JOB_KINDS, "worker job kinds");

  const evidence = {
    schemaVersion: "ove163.deterministicMatchingRolloutProof.v1",
    issue: "OVE-163",
    generatedAt: input.generatedAt,
    environment: {
      name: "local" as const,
      baseUrl: options.baseUrl,
      mutationScope: "disposable_local_fixtures" as const,
    },
    code: input.codeState,
    proof: {
      canonicalMatch: {
        suggestionGeneration: "passed" as const,
        approval: "passed" as const,
        rejection: "passed" as const,
        staleEvidence: "passed" as const,
        servedClass: "exact" as const,
        legacyWorkerCompatibility: "suggestion_only" as const,
        journalHistory: "preserved" as const,
        reindexAfterApprovalOnly: true,
        concurrentSaveSerialized: true,
      },
      aliases: {
        generationReviewGate: "passed" as const,
        approval: "passed" as const,
        rejection: "passed" as const,
        collisionHold: "passed" as const,
        servedClass: "generated" as const,
        staleSourceApproval: "canonical_state_preserved" as const,
        acceptedAndRejectedReplayStable: true,
      },
      gardenerReadback: {
        authenticatedSurface: "operational_home" as const,
        typeahead: "passed" as const,
        searchKinds: [...REQUIRED_SEARCH_KINDS],
        postgresFallbackKinds: [...REQUIRED_POSTGRES_FALLBACK_KINDS],
        firstEntry: "passed" as const,
        existingObject: "passed" as const,
        unknownAndOwnNameEscapes: "passed" as const,
        journalHistory: "preserved" as const,
      },
      fuzzyDuplicates: {
        fixturePair: requireString(
          fuzzyDuplicate,
          "fixturePair",
          "fuzzy duplicate proof",
        ),
        fullPersistedPairCount: suggestionCount,
        advisoryOnly: true,
      },
      workerRecovery: {
        status: "passed" as const,
        jobKinds: [...REQUIRED_JOB_KINDS],
        staleClaimRecovery: true,
        boundedLeaseCoverage: true,
        rerunRequestedCoverage: true,
        idempotentHandlerCoverage: true,
      },
      privacy: {
        suggestionEvidence: "passed" as const,
        typeaheadDocuments: "passed" as const,
        forbiddenEvidenceAbsent: true,
      },
    },
    productionDataTouched: false,
    nonGoals: [
      "no_llm_or_embedding_matching",
      "no_broad_catalog_import",
      "no_automatic_merge_or_alias_publication",
      "no_thin_public_page_indexing_promotion",
    ],
    leakCheck: "passed" as const,
  };

  assertNoForbiddenDeterministicMatchingEvidence(evidence);
  return evidence;
}

export function buildNonLocalDeterministicMatchingRolloutEvidence(input: {
  options: DeterministicMatchingRolloutOptions;
  codeState: DeterministicMatchingRolloutCodeState;
  runtime: {
    healthStatus: number;
    canonicalOrigin: boolean;
  };
  schema: {
    tablesPresent: {
      matchSuggestions: boolean;
      aliasProjections: boolean;
      fuzzyDuplicateSuggestions: boolean;
      jobQueue: boolean;
    };
    payloadConstraintsPresent: {
      matchRefresh: boolean;
      aliasRefresh: boolean;
      fuzzyRefresh: boolean;
    };
  };
  search: {
    reachable: boolean;
    safeDocumentContract: boolean;
    canonicalResultVisible: boolean;
  };
  entityResolutionQa: {
    schemaVersion: string;
    leakCheck: string;
    fullPersistedFuzzyPairCount: number;
    reviewedFuzzyPairCount: number;
    renderedFuzzyClusterCount: number;
  };
  generatedAt: string;
}) {
  const options = validateDeterministicMatchingRolloutOptions(input.options);
  if (options.environment === "local") {
    throw new Error("Non-local matching proof cannot target local.");
  }
  assertCodeState(input.codeState);

  if (input.runtime.healthStatus !== 200 || !input.runtime.canonicalOrigin) {
    throw new Error("Production runtime proof did not pass.");
  }
  if (
    !Object.values(input.schema.tablesPresent).every(Boolean) ||
    !Object.values(input.schema.payloadConstraintsPresent).every(Boolean)
  ) {
    throw new Error("Production schema proof is incomplete.");
  }
  if (
    !input.search.reachable ||
    !input.search.safeDocumentContract ||
    !input.search.canonicalResultVisible
  ) {
    throw new Error("Production search proof did not pass.");
  }
  if (
    input.entityResolutionQa.schemaVersion !==
      "ove162.catalogEntityResolutionQa.v2" ||
    input.entityResolutionQa.leakCheck !== "passed"
  ) {
    throw new Error("Production entity-resolution QA proof did not pass.");
  }
  for (const value of [
    input.entityResolutionQa.fullPersistedFuzzyPairCount,
    input.entityResolutionQa.reviewedFuzzyPairCount,
    input.entityResolutionQa.renderedFuzzyClusterCount,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Production entity-resolution QA counts are invalid.");
    }
  }
  if (
    input.entityResolutionQa.reviewedFuzzyPairCount >
      input.entityResolutionQa.fullPersistedFuzzyPairCount ||
    input.entityResolutionQa.renderedFuzzyClusterCount >
      input.entityResolutionQa.reviewedFuzzyPairCount
  ) {
    throw new Error("Production entity-resolution QA counts are inconsistent.");
  }

  const evidence = {
    schemaVersion: "ove163.deterministicMatchingNonLocalProof.v1",
    issue: "OVE-163",
    generatedAt: input.generatedAt,
    environment: {
      name: options.environment,
      baseUrl: options.baseUrl,
      mutationScope: "read_only" as const,
    },
    code: input.codeState,
    proof: {
      runtime: "passed" as const,
      schema: "passed" as const,
      search: "passed" as const,
      entityResolutionQa: "passed" as const,
      fuzzyQaCounts: {
        fullPersisted: input.entityResolutionQa.fullPersistedFuzzyPairCount,
        boundedReviewed: input.entityResolutionQa.reviewedFuzzyPairCount,
        rendered: input.entityResolutionQa.renderedFuzzyClusterCount,
      },
      localMutationProofRequiredForBehavioralClaims: true,
    },
    productionDataTouched: false,
    leakCheck: "passed" as const,
  };

  assertNoForbiddenDeterministicMatchingEvidence(evidence);
  return evidence;
}

export function assertNoForbiddenDeterministicMatchingEvidence(
  output: unknown,
) {
  visitEvidence(output, "evidence");
}

function visitEvidence(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitEvidence(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (FORBIDDEN_EVIDENCE_KEYS.has(normalizedKey)) {
        throw new Error(
          `Rollout evidence contains forbidden field at ${path}.`,
        );
      }
      visitEvidence(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    for (const pattern of FORBIDDEN_EVIDENCE_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error(
          `Rollout evidence contains a forbidden value at ${path}.`,
        );
      }
    }
  }
}

function parseEnvironment(
  value: string | undefined,
  optionName: string,
): DeterministicMatchingRolloutEnvironment {
  if (
    DETERMINISTIC_MATCHING_ROLLOUT_ENVIRONMENTS.includes(
      value as DeterministicMatchingRolloutEnvironment,
    )
  ) {
    return value as DeterministicMatchingRolloutEnvironment;
  }
  throw new Error(
    `${optionName} must be one of: ${DETERMINISTIC_MATCHING_ROLLOUT_ENVIRONMENTS.join(
      ", ",
    )}.`,
  );
}

function isLoopbackHostname(hostname: string) {
  return new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(
    hostname.toLowerCase(),
  );
}

function assertCodeState(code: DeterministicMatchingRolloutCodeState) {
  if (!/^[0-9a-f]{40}$/.test(code.commitSha)) {
    throw new Error("Rollout proof requires a full commit SHA.");
  }
  if (!code.branch.trim()) throw new Error("Rollout proof branch is missing.");
  if (!new Set(["clean", "dirty", "unknown"]).has(code.workingTree)) {
    throw new Error("Rollout proof working-tree state is invalid.");
  }
}

function requireRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function requireRecordArray(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item) => requireRecord(item, label));
}

function requireStringArray(value: unknown, label: string) {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(`${label} must contain strings only.`);
  }
  return value as string[];
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is missing ${key}.`);
  }
  return value;
}

function requireExactString(
  record: Record<string, unknown>,
  key: string,
  expected: string,
  label: string,
) {
  const actual = requireString(record, key, label);
  if (actual !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }
  return actual;
}

function requireTrue(
  record: Record<string, unknown>,
  key: string,
  label: string,
) {
  if (record[key] !== true) throw new Error(`${label} did not pass.`);
}

function requireIssue(
  record: Record<string, unknown>,
  issue: string,
  label: string,
) {
  if (record.issue !== issue || record.ok !== true) {
    throw new Error(`${label} did not report ${issue} success.`);
  }
}

function requireNoProductionMutation(
  record: Record<string, unknown>,
  label: string,
) {
  if (record.productionDataTouched !== false) {
    throw new Error(`${label} did not prove production isolation.`);
  }
}

function requirePassedLeakCheck(
  record: Record<string, unknown>,
  label: string,
) {
  if (record.leakCheck !== "passed") {
    throw new Error(`${label} leak check did not pass.`);
  }
}

function requireNonNegativeNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requireSetMembers(
  actual: Set<string>,
  expected: readonly string[],
  label: string,
) {
  for (const value of expected) {
    if (!actual.has(value)) throw new Error(`${label} is missing ${value}.`);
  }
}
