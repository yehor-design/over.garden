import { readFile } from "node:fs/promises";
import path from "node:path";

import { config as loadEnv } from "dotenv";

import {
  assertPlantNetImplementationSha,
  assertPlantNetProofEnvironment,
  assertPlantNetRuntimeEnabled,
  parsePlantNetBenchmarkManifest,
  PlantNetProofContractError,
  sha256,
} from "../src/lib/plantnet-species-proof";
import {
  identifyPlantSpecies,
  PlantNetAdapterError,
  PLANTNET_SPECIES_DEADLINE_MS,
  reencodePlantNetImage,
} from "../src/server/plantnet-species-adapter";

loadEnv({ path: ".env.local", override: false, quiet: true });

interface ProductionProofOptions {
  environment: string;
  confirmEnvironment: string;
  implementationSha: string;
  benchmarkManifest: string;
  fixtureId: string;
  allowExternalCall: boolean;
  baseUrl: string;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  assertPlantNetProofEnvironment(options);
  const implementationSha = assertPlantNetImplementationSha(
    options.implementationSha,
  );
  assertPlantNetRuntimeEnabled(process.env);
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== "https:" || baseUrl.hostname !== "over.garden") {
    throw new PlantNetProofContractError("invalid_arguments");
  }
  const health = await fetch(new URL("/health", baseUrl), {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!health.ok) throw new PlantNetProofContractError("invalid_arguments");

  const manifest = parsePlantNetBenchmarkManifest(
    JSON.parse(await readFile(options.benchmarkManifest, "utf8")),
  );
  const fixture = manifest.cases.find(
    (candidate) => candidate.id === options.fixtureId,
  );
  if (!fixture) throw new PlantNetProofContractError("unsafe_fixture");
  const source = await readFixture(options.benchmarkManifest, fixture.fixturePath);
  try {
    if (sha256(source) !== fixture.fixtureSha256) {
      throw new PlantNetProofContractError("unsafe_fixture");
    }
    const normalized = await reencodePlantNetImage(source);
    try {
      const provider = await identifyPlantSpecies([
        { bytes: normalized.bytes, organ: fixture.organ },
      ]);
      if (
        provider.candidates.length < fixture.minimumCandidateCount ||
        provider.durationMs > PLANTNET_SPECIES_DEADLINE_MS
      ) {
        throw new PlantNetProofContractError("unsafe_fixture");
      }
      const killSwitchStopsSubmission = await proveKillSwitchFence();
      console.log(
        JSON.stringify(
          {
            schemaVersion: "ove269.production-provider-canary.v1",
            class: "provider_canary_verified",
            environment: "production",
            implementationSha,
            healthHttpStatus: 200,
            candidateCount: provider.candidates.length,
            durationMs: provider.durationMs,
            quotaRemainingReported: provider.quotaRemaining !== null,
            modelVersionReported: provider.modelVersion !== null,
            killSwitchStopsSubmission,
            productRowsCreated: 0,
            cleanup: "fixture_buffers_zeroed",
          },
          null,
          2,
        ),
      );
    } finally {
      normalized.bytes.fill(0);
    }
  } finally {
    source.fill(0);
  }
}

async function proveKillSwitchFence() {
  try {
    await identifyPlantSpecies([], { enabled: false });
  } catch (error) {
    return error instanceof PlantNetAdapterError && error.code === "provider_unavailable";
  }
  return false;
}

function parseOptions(argv: string[]): ProductionProofOptions {
  const options: Partial<ProductionProofOptions> = {
    allowExternalCall: false,
    baseUrl: "https://over.garden",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--environment") {
      options.environment = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--confirm-environment") {
      options.confirmEnvironment = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--implementation-sha") {
      options.implementationSha = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--benchmark-manifest") {
      options.benchmarkManifest = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--fixture-id") {
      options.fixtureId = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--allow-external-call") {
      options.allowExternalCall = true;
      continue;
    }
    if (argument === "--base-url") {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    throw new PlantNetProofContractError("invalid_arguments");
  }
  if (
    !options.environment ||
    !options.confirmEnvironment ||
    !options.implementationSha ||
    !options.benchmarkManifest ||
    !options.fixtureId ||
    !options.baseUrl
  ) {
    throw new PlantNetProofContractError("invalid_arguments");
  }
  return options as ProductionProofOptions;
}

async function readFixture(manifestPath: string, relativeFixturePath: string) {
  const manifestDirectory = path.dirname(path.resolve(manifestPath));
  const fixturePath = path.resolve(manifestDirectory, relativeFixturePath);
  if (!fixturePath.startsWith(`${manifestDirectory}${path.sep}`)) {
    throw new PlantNetProofContractError("unsafe_fixture");
  }
  return readFile(fixturePath);
}

if (process.argv[1]?.endsWith("prove-plantnet-production.ts")) {
  void main().catch((error: unknown) => {
    const code =
      error instanceof PlantNetProofContractError
        ? error.code
        : "unexpected_failure";
    console.error(
      JSON.stringify({ class: "plantnet_production_proof_failed", code }),
    );
    process.exitCode = 1;
  });
}
