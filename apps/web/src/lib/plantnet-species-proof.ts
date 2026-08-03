import { createHash } from "node:crypto";

export const PLANTNET_BENCHMARK_SCHEMA_VERSION =
  "ove269.plantnet-benchmark.v1";
export const PLANTNET_PRODUCTION_PROOF_SCHEMA_VERSION =
  "ove269.production-proof.v1";
export const PLANTNET_PROOF_ENVIRONMENT = "production";

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const CASE_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const ORGANS = new Set(["auto", "leaf", "flower", "fruit", "bark"]);

export class PlantNetProofContractError extends Error {
  constructor(
    readonly code:
      | "invalid_arguments"
      | "invalid_manifest"
      | "unsafe_fixture"
      | "production_confirmation_required"
      | "feature_not_enabled"
      | "implementation_sha_invalid",
  ) {
    super(`Pl@ntNet proof contract failed: ${code}.`);
    this.name = "PlantNetProofContractError";
  }
}

export interface PlantNetBenchmarkCase {
  id: string;
  market: "ua" | "bg";
  organ: "auto" | "leaf" | "flower" | "fruit" | "bark";
  fixturePath: string;
  fixtureSha256: string;
  minimumCandidateCount: number;
}

export interface PlantNetBenchmarkManifest {
  schemaVersion: typeof PLANTNET_BENCHMARK_SCHEMA_VERSION;
  rightsCleanOperatorFixtures: true;
  excludesProductionGardenerData: true;
  cases: PlantNetBenchmarkCase[];
}

export function parsePlantNetBenchmarkManifest(
  value: unknown,
): PlantNetBenchmarkManifest {
  if (!isRecord(value)) invalidManifest();
  if (value.schemaVersion !== PLANTNET_BENCHMARK_SCHEMA_VERSION) {
    invalidManifest();
  }
  if (
    value.rightsCleanOperatorFixtures !== true ||
    value.excludesProductionGardenerData !== true ||
    !Array.isArray(value.cases) ||
    value.cases.length < 2 ||
    value.cases.length > 10
  ) {
    invalidManifest();
  }

  const cases = value.cases.map((candidate) => parseBenchmarkCase(candidate));
  if (
    new Set(cases.map((candidate) => candidate.id)).size !== cases.length ||
    !cases.some((candidate) => candidate.market === "ua") ||
    !cases.some((candidate) => candidate.market === "bg")
  ) {
    invalidManifest();
  }

  return {
    schemaVersion: PLANTNET_BENCHMARK_SCHEMA_VERSION,
    rightsCleanOperatorFixtures: true,
    excludesProductionGardenerData: true,
    cases,
  };
}

export function assertSafePlantNetFixturePath(value: string): string {
  if (
    !value ||
    value.length > 240 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((segment) => segment === ".." || segment === "") ||
    !/\.(?:jpe?g|png)$/i.test(value)
  ) {
    throw new PlantNetProofContractError("unsafe_fixture");
  }
  return value;
}

export function assertPlantNetProofEnvironment(input: {
  environment?: string;
  confirmEnvironment?: string;
  allowExternalCall: boolean;
}) {
  if (
    input.environment !== PLANTNET_PROOF_ENVIRONMENT ||
    input.confirmEnvironment !== PLANTNET_PROOF_ENVIRONMENT ||
    !input.allowExternalCall
  ) {
    throw new PlantNetProofContractError(
      "production_confirmation_required",
    );
  }
}

export function assertPlantNetImplementationSha(value: string | undefined) {
  if (!value || !COMMIT_SHA_PATTERN.test(value)) {
    throw new PlantNetProofContractError("implementation_sha_invalid");
  }
  return value.toLowerCase();
}

export function assertPlantNetRuntimeEnabled(env: Record<string, string | undefined>) {
  if (
    !env.PLANTNET_API_KEY ||
    !["true", "1"].includes(env.PLANTNET_SPECIES_IDENTIFICATION_ENABLED ?? "")
  ) {
    throw new PlantNetProofContractError("feature_not_enabled");
  }
}

export function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function redactedBenchmarkPlan(manifest: PlantNetBenchmarkManifest) {
  return {
    schemaVersion: PLANTNET_BENCHMARK_SCHEMA_VERSION,
    class: "rights_clean_fixture_plan" as const,
    caseCount: manifest.cases.length,
    markets: [...new Set(manifest.cases.map((candidate) => candidate.market))].sort(),
    productGardenerDataExcluded: true as const,
    externalCalls: 0,
  };
}

function parseBenchmarkCase(value: unknown): PlantNetBenchmarkCase {
  if (!isRecord(value)) invalidManifest();
  const id = typeof value.id === "string" ? value.id : "";
  const market = value.market;
  const organ = value.organ;
  const fixturePath =
    typeof value.fixturePath === "string" ? value.fixturePath : "";
  const fixtureSha256 =
    typeof value.fixtureSha256 === "string" ? value.fixtureSha256 : "";
  const minimumCandidateCount =
    typeof value.minimumCandidateCount === "number"
      ? value.minimumCandidateCount
      : null;
  if (
    !CASE_ID_PATTERN.test(id) ||
    (market !== "ua" && market !== "bg") ||
    typeof organ !== "string" ||
    !ORGANS.has(organ) ||
    !SHA256_PATTERN.test(fixtureSha256) ||
    minimumCandidateCount === null ||
    !Number.isInteger(minimumCandidateCount) ||
    minimumCandidateCount < 1 ||
    minimumCandidateCount > 5
  ) {
    invalidManifest();
  }
  return {
    id,
    market,
    organ: organ as PlantNetBenchmarkCase["organ"],
    fixturePath: assertSafePlantNetFixturePath(fixturePath),
    fixtureSha256: fixtureSha256.toLowerCase(),
    minimumCandidateCount,
  };
}

function invalidManifest(): never {
  throw new PlantNetProofContractError("invalid_manifest");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
