import { readFile } from "node:fs/promises";
import path from "node:path";

import { config as loadEnv } from "dotenv";

import {
  assertPlantNetProofEnvironment,
  assertPlantNetRuntimeEnabled,
  parsePlantNetBenchmarkManifest,
  PlantNetProofContractError,
  redactedBenchmarkPlan,
  sha256,
} from "../src/lib/plantnet-species-proof";
import {
  identifyPlantSpecies,
  PLANTNET_SPECIES_DEADLINE_MS,
  reencodePlantNetImage,
} from "../src/server/plantnet-species-adapter";

loadEnv({ path: ".env.local", override: false, quiet: true });

interface BenchmarkOptions {
  manifestPath: string;
  execute: boolean;
  environment?: string;
  confirmEnvironment?: string;
  allowExternalCall: boolean;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const manifestSource = await readFile(options.manifestPath, "utf8");
  const manifest = parsePlantNetBenchmarkManifest(JSON.parse(manifestSource));
  if (!options.execute) {
    console.log(JSON.stringify(redactedBenchmarkPlan(manifest), null, 2));
    return;
  }

  assertPlantNetProofEnvironment(options);
  assertPlantNetRuntimeEnabled(process.env);
  const outcomes = [];
  for (const fixture of manifest.cases) {
    const source = await readFixture(options.manifestPath, fixture.fixturePath);
    try {
      if (sha256(source) !== fixture.fixtureSha256) {
        throw new PlantNetProofContractError("unsafe_fixture");
      }
      const normalized = await reencodePlantNetImage(source);
      try {
        const result = await identifyPlantSpecies([
          { bytes: normalized.bytes, organ: fixture.organ },
        ]);
        if (
          result.candidates.length < fixture.minimumCandidateCount ||
          result.durationMs > PLANTNET_SPECIES_DEADLINE_MS
        ) {
          throw new PlantNetProofContractError("unsafe_fixture");
        }
        outcomes.push({
          caseId: fixture.id,
          market: fixture.market,
          candidateCount: result.candidates.length,
          durationMs: result.durationMs,
          quotaRemainingReported: result.quotaRemaining !== null,
          modelVersionReported: result.modelVersion !== null,
        });
      } finally {
        normalized.bytes.fill(0);
      }
    } finally {
      source.fill(0);
    }
  }

  console.log(
    JSON.stringify(
      {
        schemaVersion: "ove269.plantnet-benchmark-execution.v1",
        class: "rights_clean_provider_benchmark",
        caseCount: outcomes.length,
        outcomes,
        scoresPresentedAsProbabilities: false,
        productGardenerDataExcluded: true,
      },
      null,
      2,
    ),
  );
}

function parseOptions(argv: string[]): BenchmarkOptions {
  const options: Partial<BenchmarkOptions> = { allowExternalCall: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--manifest") {
      options.manifestPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--execute") {
      options.execute = true;
      continue;
    }
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
    if (argument === "--allow-external-call") {
      options.allowExternalCall = true;
      continue;
    }
    throw new PlantNetProofContractError("invalid_arguments");
  }
  if (!options.manifestPath) {
    throw new PlantNetProofContractError("invalid_arguments");
  }
  return {
    manifestPath: options.manifestPath,
    execute: options.execute ?? false,
    environment: options.environment,
    confirmEnvironment: options.confirmEnvironment,
    allowExternalCall: options.allowExternalCall ?? false,
  };
}

async function readFixture(manifestPath: string, relativeFixturePath: string) {
  const manifestDirectory = path.dirname(path.resolve(manifestPath));
  const fixturePath = path.resolve(manifestDirectory, relativeFixturePath);
  if (!fixturePath.startsWith(`${manifestDirectory}${path.sep}`)) {
    throw new PlantNetProofContractError("unsafe_fixture");
  }
  return readFile(fixturePath);
}

if (process.argv[1]?.endsWith("benchmark-plantnet-species.ts")) {
  void main().catch((error: unknown) => {
    const code =
      error instanceof PlantNetProofContractError
        ? error.code
        : "unexpected_failure";
    console.error(JSON.stringify({ class: "plantnet_benchmark_failed", code }));
    process.exitCode = 1;
  });
}
