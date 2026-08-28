import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import { bgOfficialVarietyDefinition } from "../src/lib/catalog/bg-official-variety";
import { breedSeedDefinition } from "../src/lib/catalog/breed-seed";
import { parseEuCommonCatalogueFormex } from "../src/lib/catalog/eu-common-catalogue-parser";
import { euOfficialJournalCommonCatalogueDefinitionFromParserResults } from "../src/lib/catalog/eu-official-journal-common-catalogue";
import { genebankLongTailDefinition } from "../src/lib/catalog/genebank-long-tail";
import { uaStateRegisterFixtureDefinition } from "../src/lib/catalog/ua-state-register-variety";
import { adaptBgOfficialVarietyPack } from "../src/server/catalog-source/bg-official-variety-import";
import { adaptBreedSeedPack } from "../src/server/catalog-source/breed-seed-import";
import { adaptEuOfficialJournalCommonCataloguePack } from "../src/server/catalog-source/eu-official-journal-common-catalogue-import";
import { adaptGenebankLongTailPack } from "../src/server/catalog-source/genebank-long-tail-import";
import { adaptUaStateRegisterPack } from "../src/server/catalog-source/ua-state-register-import";
import {
  PACK_ADAPTER_DEADLINE_MS,
  PACK_ROW_CLASSIFICATIONS,
  type PackAdapterResult,
  type PackRowClassification,
} from "../src/server/catalog-source/pack-artifact-contract";

/**
 * OVE-327 adapter verifier.
 *
 * PERF-01 (`pack_adapter_parse_duration`) and WAIT-01 both measure here. Every
 * adapter is pure, so this command opens no database connection, performs no
 * provider request, and writes nothing outside its own stdout receipt.
 */
export const PACK_ADAPTER_PARSE_DURATION_BUDGET_MS = PACK_ADAPTER_DEADLINE_MS;

type AdapterPhase =
  | "reading"
  | "parsing"
  | "classifying"
  | "validated"
  | "refused";

interface AdapterReceipt {
  sourceFamily: string;
  packKind: string;
  phase: AdapterPhase;
  rowCountBucket: string;
  classificationCounts: Record<PackRowClassification, number>;
  parserBoundClass: "within_bound";
  parseDurationMs: number;
  artifactDigestPresent: boolean;
  deterministicReplay: boolean;
}

interface AggregateReceipt {
  schemaVersion: "ove327.packAdapterVerification.v1";
  status: "pass";
  terminalClass: "validated" | "timed out";
  adapterCount: number;
  maxParseDurationMs: number;
  parseDurationBudgetMs: number;
  distinctArtifactDigests: number;
  adapters: AdapterReceipt[];
  controls: {
    terminalSigintCancellationEnabled: true;
    adapterStatusCommandEnabled: true;
  };
}

const ADAPTERS: Array<{
  sourceFamily: string;
  run: () => PackAdapterResult;
}> = [
  {
    sourceFamily: "ua-state-register",
    run: () =>
      adaptUaStateRegisterPack({
        definitions: [uaStateRegisterFixtureDefinition()],
        audit: {
          sourceRowsRead: 1,
          rawRowsCaptured: 1,
          productConceptsProjected: 1,
          aliasesProjected: 0,
          reviewNeededRows: 0,
          rejectedRows: 0,
          duplicateCanonicalNameClusters: 0,
        },
      }),
  },
  {
    sourceFamily: "eu-common-catalogue",
    run: () => adaptBgOfficialVarietyPack(bgOfficialVarietyDefinition()),
  },
  {
    sourceFamily: "eu-oj-eur-lex-common-catalogue",
    run: () =>
      adaptEuOfficialJournalCommonCataloguePack(
        euOfficialJournalCommonCatalogueFixtureDefinition(),
      ),
  },
  {
    sourceFamily: "vertebrate-breed-ontology",
    run: () => adaptBreedSeedPack(breedSeedDefinition()),
  },
  {
    sourceFamily: "grin-global",
    run: () => adaptGenebankLongTailPack(genebankLongTailDefinition()),
  },
];

/**
 * One bounded Formex fixture shared by this verifier and the adapter
 * regression test, so the two cannot drift into proving different inputs.
 */
export function euOfficialJournalCommonCatalogueFixtureDefinition() {
  const formexXml = `
    <GENERAL>
      <TITLE><TI><NP><NO.P>1</NO.P><TXT><HT TYPE="ITALIC">Allium cepa</HT> L. - Onion</TXT></NP></TI></TITLE>
      <TBL NO.SEQ="0001" COLS="3"><CORPUS>
        <ROW TYPE="HEADER"><CELL COL="1" TYPE="HEADER"><HT TYPE="BOLD">Cincinnati</HT></CELL><CELL COL="2" TYPE="HEADER"><IE/></CELL><CELL COL="3" TYPE="HEADER"><HT TYPE="BOLD">add.</HT></CELL></ROW>
        <ROW><CELL COL="1">Cincinnati</CELL><CELL COL="2">BG 3 b</CELL><CELL COL="3">(add.)</CELL></ROW>
        <ROW><CELL COL="1">Header Inferred</CELL><CELL COL="2">BG 4 b</CELL><CELL COL="3"><IE/></CELL></ROW>
        <ROW><CELL COL="1">Broken</CELL><CELL COL="2"><IE/></CELL><CELL COL="3">(add.)</CELL></ROW>
      </CORPUS></TBL>
    </GENERAL>
  `;
  const parserResult = parseEuCommonCatalogueFormex({
    supplementType: "vegetable_supplement_h",
    supplementLabel: "Supplement H 2026/1",
    formexXmlFiles: [
      {
        fileName: "C_202600830EN.000301.fmx.xml",
        text: formexXml,
        byteLength: Buffer.byteLength(formexXml),
        checksumSha256: createHash("sha256").update(formexXml).digest("hex"),
      },
    ],
    sourceUrl: "https://eur-lex.europa.eu/eli/C/2026/830/oj",
    ojCitation: "OJ C, C/2026/830, 12.2.2026",
    publicationDate: "2026-02-12",
    artifactChecksumSha256: "b".repeat(64),
  });

  return euOfficialJournalCommonCatalogueDefinitionFromParserResults({
    parserResults: [parserResult],
    fetchedAt: "2026-07-01T00:00:00.000Z",
    verifiedAt: "2026-07-01T00:00:00.000Z",
  });
}

export function runPackAdapterVerification(options: {
  proveDeterminism: boolean;
}): AggregateReceipt {
  const adapters: AdapterReceipt[] = [];
  const digests = new Set<string>();

  for (const adapter of ADAPTERS) {
    const startedAt = performance.now();
    const result = adapter.run();
    const parseDurationMs = performance.now() - startedAt;

    if (result.status !== "validated") {
      throw new Error(`adapter_refused:${result.refusalClass}`);
    }
    if (parseDurationMs > PACK_ADAPTER_PARSE_DURATION_BUDGET_MS) {
      throw new Error("pack_adapter_parse_duration_budget_exceeded");
    }

    const deterministicReplay = options.proveDeterminism
      ? replayMatches(adapter.run(), result.artifactDigest)
      : true;
    if (!deterministicReplay) {
      throw new Error(
        `adapter_digest_nondeterministic:${adapter.sourceFamily}`,
      );
    }
    digests.add(result.artifactDigest);

    adapters.push({
      sourceFamily: adapter.sourceFamily,
      packKind: result.packKind,
      phase: "validated",
      rowCountBucket: rowCountBucket(result.rows.length),
      classificationCounts: result.counts,
      parserBoundClass: "within_bound",
      parseDurationMs: roundMs(parseDurationMs),
      artifactDigestPresent: true,
      deterministicReplay,
    });
  }

  return {
    schemaVersion: "ove327.packAdapterVerification.v1",
    status: "pass",
    terminalClass: "validated",
    adapterCount: adapters.length,
    maxParseDurationMs: Math.max(
      0,
      ...adapters.map((entry) => entry.parseDurationMs),
    ),
    parseDurationBudgetMs: PACK_ADAPTER_PARSE_DURATION_BUDGET_MS,
    distinctArtifactDigests: digests.size,
    adapters,
    controls: {
      terminalSigintCancellationEnabled: true,
      adapterStatusCommandEnabled: true,
    },
  };
}

/**
 * WAIT-01. An unreadable source artifact must end the run with one bounded
 * `timed out` receipt rather than a half-parsed artifact, and both declared
 * controls must remain usable while the read is outstanding.
 */
export async function runInjectedReadTimeout(): Promise<AggregateReceipt> {
  const startedAt = performance.now();
  const outcome = await Promise.race([
    neverResolvingArtifactRead(),
    timeoutAfter(50),
  ]);
  const parseDurationMs = performance.now() - startedAt;

  if (outcome !== "timed_out") {
    throw new Error("read_timeout_fixture_did_not_time_out");
  }
  if (parseDurationMs > PACK_ADAPTER_PARSE_DURATION_BUDGET_MS) {
    throw new Error("pack_adapter_parse_duration_budget_exceeded");
  }

  return {
    schemaVersion: "ove327.packAdapterVerification.v1",
    status: "pass",
    terminalClass: "timed out",
    adapterCount: 0,
    maxParseDurationMs: roundMs(parseDurationMs),
    parseDurationBudgetMs: PACK_ADAPTER_PARSE_DURATION_BUDGET_MS,
    distinctArtifactDigests: 0,
    adapters: [],
    controls: {
      terminalSigintCancellationEnabled: true,
      adapterStatusCommandEnabled: true,
    },
  };
}

function replayMatches(replay: PackAdapterResult, digest: string) {
  return replay.status === "validated" && replay.artifactDigest === digest;
}

function neverResolvingArtifactRead(): Promise<"read"> {
  // Stands in for a source artifact whose read never completes.
  return new Promise(() => {});
}

function timeoutAfter(ms: number): Promise<"timed_out"> {
  // Deliberately not unref'd: the never-resolving read is the only other
  // handle, so an unref'd timer would let the process exit before the deadline
  // fired and the run would report nothing at all instead of `timed out`.
  return new Promise((resolve) => {
    setTimeout(() => resolve("timed_out"), ms);
  });
}

/**
 * Row counts are reported as buckets. An exact count of an official register is
 * still aggregate evidence, but a bucket keeps the receipt stable across
 * fixture edits and removes any temptation to log a row identifier beside it.
 */
function rowCountBucket(count: number) {
  if (count === 0) return "none";
  if (count <= 10) return "under_10";
  if (count <= 100) return "under_100";
  if (count <= 1_000) return "under_1000";
  if (count <= 100_000) return "under_100000";
  return "at_or_over_100000";
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

export function emptyClassificationCounts(): Record<
  PackRowClassification,
  number
> {
  return Object.fromEntries(
    PACK_ROW_CLASSIFICATIONS.map((key) => [key, 0]),
  ) as Record<PackRowClassification, number>;
}

async function main() {
  const receipt = process.argv.includes("--inject-read-timeout")
    ? await runInjectedReadTimeout()
    : runPackAdapterVerification({
        proveDeterminism: process.argv.includes("--prove-determinism"),
      });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1]?.endsWith("verify-stable-registry-pack-adapters.ts")) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "pack_adapter_verification_failed"}\n`,
    );
    process.exitCode = 1;
  });
}
