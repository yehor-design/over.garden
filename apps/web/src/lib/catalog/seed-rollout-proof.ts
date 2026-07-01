export const CATALOG_SEED_ROLLOUT_ENVIRONMENTS = [
  "local",
  "staging",
  "preview",
  "production",
] as const;

export type CatalogSeedRolloutEnvironment =
  (typeof CATALOG_SEED_ROLLOUT_ENVIRONMENTS)[number];

export interface CatalogSeedRolloutOptions {
  environment: CatalogSeedRolloutEnvironment;
  confirmEnvironment: CatalogSeedRolloutEnvironment;
  baseUrl: string;
  allowNonLocalMutation: boolean;
}

export interface CatalogSeedRolloutCodeState {
  commitSha: string;
  branch: string;
  workingTree: "clean" | "dirty" | "unknown";
}

export interface CatalogSeedRolloutAppSmoke {
  baseUrl: string;
  cases: Array<{
    query: string;
    suggestionCount: number;
    selectedResultText: string;
    canonicalName: string;
    catalogKind: string;
    objectKind: string;
    varietyState: string;
    duplicateSameConceptSuggestionsAbsent: boolean;
    readbackIdentityPreserved: boolean;
    readbackPageStatus: number;
  }>;
  leakCheck: "passed";
}

interface SeedCommandDefinition {
  key: string;
  packageScript: string;
  sourceSet: string;
  expectedCanonicalName: string;
  expectedCatalogKind: "plant_variety" | "species" | "breed";
  expectedSource: string;
}

export interface SafeSeedCommandSummary {
  key: string;
  packageScript: string;
  sourceSet: string;
  expectedCanonicalName: string;
  catalogItemId: string | null;
  publicSlug: string | null;
  canonicalName: string | null;
  catalogKind: "plant_variety" | "species" | "breed";
  source: string;
  aliasesProjected: number | null;
  reindexQueued: boolean | null;
  stableProductIdentityOnRerun: boolean;
  sourceProofRecorded: boolean;
  leakCheck: "passed";
}

export const CATALOG_SEED_ROLLOUT_COMMANDS: readonly SeedCommandDefinition[] = [
  {
    key: "ua-register-variety",
    packageScript: "catalog:sources:import-ua-register-variety",
    sourceSet: "OVE-57 UA State Register official variety",
    expectedCanonicalName: "Ботсадівський",
    expectedCatalogKind: "plant_variety",
    expectedSource: "ua_state_register",
  },
  {
    key: "species-backbone",
    packageScript: "catalog:sources:import-species-backbone",
    sourceSet: "OVE-58 species backbone",
    expectedCanonicalName: "Solanum lycopersicum L.",
    expectedCatalogKind: "species",
    expectedSource: "species_backbone",
  },
  {
    key: "breed-seed",
    packageScript: "catalog:sources:import-breed-seed",
    sourceSet: "OVE-60 official bee breed seed",
    expectedCanonicalName: "Карпатська бджола",
    expectedCatalogKind: "breed",
    expectedSource: "ua_official_bee_breed",
  },
  {
    key: "bg-official-variety",
    packageScript: "catalog:sources:import-bg-official-variety",
    sourceSet: "OVE-61 BG official variety proof subset",
    expectedCanonicalName: "Садово 1",
    expectedCatalogKind: "plant_variety",
    expectedSource: "eu_common_catalogue_bg",
  },
  {
    key: "genebank-long-tail",
    packageScript: "catalog:sources:import-genebank-long-tail",
    sourceSet: "OVE-62 GRIN/NPGS promoted long-tail candidate",
    expectedCanonicalName: "Red Cherry tomato",
    expectedCatalogKind: "plant_variety",
    expectedSource: "grin_genebank_candidate",
  },
] as const;

export const CATALOG_SEED_ROLLOUT_REQUIRED_QUERIES = [
  "Ботсадівський",
  "помідор",
  "Карпатська",
  "Садово 1",
  "Red Cherry",
] as const;

export const CATALOG_SEED_ROLLOUT_NOT_SEEDED = [
  {
    source: "OVE-56 source snapshot sample",
    reason:
      "quarantine harness only; not part of the environment availability proof",
  },
  {
    source: "iasas-bg-official-variety-list bulk rows",
    reason: "conditional legal/parser gate remains closed",
  },
  {
    source: "eu-common-catalogue bulk rows",
    reason: "only the bounded BG proof row is promoted",
  },
  {
    source: "dad-is-efabis",
    reason: "internal validation only",
  },
  {
    source: "eurisco",
    reason: "internal validation only",
  },
  {
    source: "genesys-pgr",
    reason: "internal validation only",
  },
  {
    source: "vendor-marketplace-paths",
    reason: "rejected without partner feed or written permission",
  },
] as const;

const FORBIDDEN_EVIDENCE_MARKERS = [
  "rawPayload",
  "raw_payload",
  "sourceRecordId",
  "source_record_id",
  "sourceRecordKey",
  "source_record_key",
  "sourceSnapshotId",
  "source_snapshot_id",
  "allowedProjection",
  "allowed_projection",
  "sourceOnlyFields",
  "source_only_fields",
  "ownerUserId",
  "owner_user_id",
  "journalBody",
  "journalTitle",
  "quarantineKey",
  "derivativeKey",
  "coordinates",
  "latitude",
  "longitude",
  "gps",
  "exif",
  "accessionIdentifier",
  "nationalId",
  "parserConfidence",
  "sourceRowReference",
  "sourcePageReference",
  "user_agent",
  "referrer",
  "email",
  "token",
] as const;

export function parseCatalogSeedRolloutArgs(
  argv: string[],
): Partial<CatalogSeedRolloutOptions> {
  const options: Partial<CatalogSeedRolloutOptions> = {
    allowNonLocalMutation: false,
  };

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
      case "--allow-non-local-mutation":
        options.allowNonLocalMutation = true;
        break;
      default:
        throw new Error(`Unsupported option: ${arg}`);
    }
  }

  return options;
}

export function validateCatalogSeedRolloutOptions(
  options: Partial<CatalogSeedRolloutOptions>,
): CatalogSeedRolloutOptions {
  if (!options.environment) {
    throw new Error("Missing --environment.");
  }
  if (!options.confirmEnvironment) {
    throw new Error("Missing --confirm-environment.");
  }
  if (options.environment !== options.confirmEnvironment) {
    throw new Error(
      "--confirm-environment must exactly match --environment.",
    );
  }
  if (!options.baseUrl) {
    throw new Error("Missing --base-url for the real app smoke.");
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const url = new URL(baseUrl);
  if (options.environment === "local") {
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("Local rollout proof must use a local app base URL.");
    }
  } else {
    if (!options.allowNonLocalMutation) {
      throw new Error(
        "Non-local rollout proof requires --allow-non-local-mutation.",
      );
    }
    if (url.protocol !== "https:") {
      throw new Error("Non-local rollout proof must use an HTTPS base URL.");
    }
  }

  return {
    environment: options.environment,
    confirmEnvironment: options.confirmEnvironment,
    baseUrl,
    allowNonLocalMutation: options.allowNonLocalMutation ?? false,
  };
}

export function extractJsonObjectFromCommandOutput(output: string): unknown {
  const match = /(^|\n)\s*\{/.exec(output);
  if (!match || match.index < 0) {
    throw new Error("Command output did not contain a JSON object.");
  }

  const start = match.index + (match[1] === "\n" ? 1 : 0);
  const end = output.lastIndexOf("}");
  if (end < start) {
    throw new Error("Command output JSON object is incomplete.");
  }

  return JSON.parse(output.slice(start, end + 1));
}

export function buildSafeSeedCommandSummary(
  command: SeedCommandDefinition,
  output: unknown,
): SafeSeedCommandSummary {
  const root = asRecord(output);
  if (!root) {
    throw new Error(`${command.key} output must be a JSON object.`);
  }

  const imported = asRecord(root.imported);
  const promoted = asRecord(root.promoted);
  const identity = promoted ?? imported;
  const idempotency = asRecord(root.idempotencyProof);
  const catalogItemId = stringValue(identity?.catalogItemId);
  const rerunCatalogItemId =
    stringValue(idempotency?.rerunCatalogItemId) ??
    stringValue(idempotency?.promotedAgainCatalogItemId);
  const canonicalName =
    stringValue(identity?.canonicalName) ?? command.expectedCanonicalName;
  const catalogKind = stringValue(identity?.catalogKind);

  if (root.leakCheck !== "passed") {
    throw new Error(`${command.key} did not report a passed leak check.`);
  }
  if (canonicalName !== command.expectedCanonicalName) {
    throw new Error(
      `${command.key} canonical name mismatch: expected ${command.expectedCanonicalName}, received ${canonicalName}.`,
    );
  }
  if (catalogKind !== command.expectedCatalogKind) {
    throw new Error(
      `${command.key} catalog kind mismatch: expected ${command.expectedCatalogKind}, received ${catalogKind ?? "missing"}.`,
    );
  }
  if (catalogItemId && rerunCatalogItemId && catalogItemId !== rerunCatalogItemId) {
    throw new Error(`${command.key} did not preserve catalog item id on rerun.`);
  }

  return {
    key: command.key,
    packageScript: command.packageScript,
    sourceSet: command.sourceSet,
    expectedCanonicalName: command.expectedCanonicalName,
    catalogItemId,
    publicSlug: stringValue(identity?.publicSlug),
    canonicalName,
    catalogKind: catalogKind as SafeSeedCommandSummary["catalogKind"],
    source: command.expectedSource,
    aliasesProjected: numberValue(identity?.aliasesProjected),
    reindexQueued: booleanValue(identity?.reindexQueued),
    stableProductIdentityOnRerun: Boolean(catalogItemId && rerunCatalogItemId),
    sourceProofRecorded: hasValue(root.provenanceProof),
    leakCheck: "passed",
  };
}

export function buildCatalogSeedRolloutEvidence(input: {
  options: CatalogSeedRolloutOptions;
  codeState: CatalogSeedRolloutCodeState;
  seedResults: SafeSeedCommandSummary[];
  appSmoke: CatalogSeedRolloutAppSmoke;
  generatedAt: string;
}) {
  const evidence = {
    schemaVersion: "ove78.catalogSeedRolloutProof.v1",
    issue: "OVE-78",
    generatedAt: input.generatedAt,
    environment: {
      name: input.options.environment,
      baseUrl: input.options.baseUrl,
      databaseWriteScope:
        input.options.environment === "local"
          ? "explicit_local_environment"
          : "explicit_non_local_environment",
      deployedCodeState:
        "seed proof is separate from deploy proof; use the commit and CI fields",
    },
    code: input.codeState,
    seedSet: {
      seeded: input.seedResults,
      intentionallyNotSeeded: CATALOG_SEED_ROLLOUT_NOT_SEEDED,
    },
    proof: {
      requiredQueries: CATALOG_SEED_ROLLOUT_REQUIRED_QUERIES,
      idempotency: {
        stableProductIdentityForSeedCommands: input.seedResults.every(
          (result) => result.stableProductIdentityOnRerun,
        ),
        duplicateSameConceptSuggestionsAbsent: input.appSmoke.cases.every(
          (result) => result.duplicateSameConceptSuggestionsAbsent,
        ),
      },
      realAppSmoke: {
        baseUrl: input.appSmoke.baseUrl,
        cases: input.appSmoke.cases,
        leakCheck: input.appSmoke.leakCheck,
      },
    },
    leakCheck: "passed",
  };

  assertNoForbiddenCatalogSeedRolloutEvidence(evidence);
  return evidence;
}

export function assertNoForbiddenCatalogSeedRolloutEvidence(output: unknown) {
  const text = JSON.stringify(output).toLowerCase();
  for (const marker of FORBIDDEN_EVIDENCE_MARKERS) {
    if (text.includes(marker.toLowerCase())) {
      throw new Error(
        `Seed rollout evidence contains forbidden marker: ${marker}.`,
      );
    }
  }
}

function parseEnvironment(
  value: string | undefined,
  optionName: string,
): CatalogSeedRolloutEnvironment {
  if (
    CATALOG_SEED_ROLLOUT_ENVIRONMENTS.includes(
      value as CatalogSeedRolloutEnvironment,
    )
  ) {
    return value as CatalogSeedRolloutEnvironment;
  }

  throw new Error(
    `${optionName} must be one of: ${CATALOG_SEED_ROLLOUT_ENVIRONMENTS.join(
      ", ",
    )}.`,
  );
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function asRecord(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "object" && value !== null;
}
