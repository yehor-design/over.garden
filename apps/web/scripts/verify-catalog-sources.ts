import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type Verdict =
  | "USE"
  | "USE-WITH-CONDITIONS"
  | "INTERNAL-VALIDATION-ONLY"
  | "REJECT";

type AllowedUsage =
  | "raw_snapshot"
  | "canonical_product_projection"
  | "internal_validation_only"
  | "reject";

type LiveCheck = {
  id: string;
  method: "GET" | "HEAD" | "MANUAL";
  url: string;
  range?: string;
  expectStatus: number | number[];
  expectBodyIncludes: string[];
  notes: string;
};

type SourceReadiness = {
  slug: string;
  name: string;
  category: string;
  verdict: Verdict;
  deferred: boolean;
  currentAccessPath: string;
  endpointUrls: string[];
  license: string;
  commercialUseBasis: string;
  attributionRequired: boolean;
  allowedUsage: AllowedUsage[];
  allowedSensitiveFields: string;
  coordinateTreatment: string;
  sourceVersionOrDate: string;
  verificationDate: string;
  sampleProof: string;
  knownBlockers: string[];
  nextAllowedIssue: string;
  liveChecks: LiveCheck[];
};

type Manifest = {
  manifestVersion: number;
  issue: string;
  title: string;
  verificationDate: string;
  generatedBy: string;
  privacyBoundary: string;
  verdictLegend: Record<Verdict, string>;
  operatorSummary: {
    firstApprovedIngestionSources: string[];
    conditionalOrBlockedSources: string[];
    nextSliceGate: string;
  };
  requiredCoverage: string[];
  sources: SourceReadiness[];
};

const REQUIRED_SLUGS = new Set([
  "ua-state-register",
  "catalogue-of-life-checklistbank",
  "world-flora-online",
  "gbif-backbone",
  "eppo-codes",
  "wikidata",
  "grin-global",
  "vertebrate-breed-ontology",
  "iasas-bg-official-variety-list",
  "eu-common-catalogue",
  "pesi-euro-med",
  "eol-vernaculars",
  "inaturalist",
  "dad-is-efabis",
  "eurisco",
  "genesys-pgr",
  "vendor-marketplace-paths",
]);

const ALLOWED_VERDICTS = new Set<Verdict>([
  "USE",
  "USE-WITH-CONDITIONS",
  "INTERNAL-VALIDATION-ONLY",
  "REJECT",
]);

const ALLOWED_USAGE = new Set<AllowedUsage>([
  "raw_snapshot",
  "canonical_product_projection",
  "internal_validation_only",
  "reject",
]);

const MANIFEST_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json",
);

function fail(message: string): never {
  throw new Error(message);
}

function readManifest(): Manifest {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw) as Manifest;
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`Missing non-empty string: ${field}`);
  }
}

function assertStringArray(
  value: unknown,
  field: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    fail(`Missing non-empty string array: ${field}`);
  }
}

function assertUsageArray(
  value: unknown,
  field: string,
): asserts value is AllowedUsage[] {
  assertStringArray(value, field);
  for (const item of value) {
    if (!ALLOWED_USAGE.has(item as AllowedUsage)) {
      fail(`Invalid allowed usage ${item} in ${field}`);
    }
  }
}

function assertLiveCheck(check: LiveCheck, source: SourceReadiness): void {
  assertString(check.id, `${source.slug}.liveChecks.id`);
  if (!["GET", "HEAD", "MANUAL"].includes(check.method)) {
    fail(`Invalid live check method for ${source.slug}.${check.id}`);
  }
  if (check.method !== "MANUAL") {
    assertString(check.url, `${source.slug}.${check.id}.url`);
  }
  if (
    typeof check.expectStatus !== "number" &&
    (!Array.isArray(check.expectStatus) ||
      check.expectStatus.some((status) => typeof status !== "number"))
  ) {
    fail(`Invalid expectStatus for ${source.slug}.${check.id}`);
  }
  if (!Array.isArray(check.expectBodyIncludes)) {
    fail(`expectBodyIncludes must be an array for ${source.slug}.${check.id}`);
  }
  assertString(check.notes, `${source.slug}.${check.id}.notes`);
}

function validateManifest(manifest: Manifest): void {
  if (manifest.manifestVersion !== 1) {
    fail("manifestVersion must be 1");
  }
  if (manifest.issue !== "OVE-55") {
    fail("manifest issue must be OVE-55");
  }
  assertString(manifest.verificationDate, "verificationDate");
  assertString(manifest.privacyBoundary, "privacyBoundary");
  assertString(
    manifest.operatorSummary.nextSliceGate,
    "operatorSummary.nextSliceGate",
  );
  assertStringArray(
    manifest.operatorSummary.firstApprovedIngestionSources,
    "operatorSummary.firstApprovedIngestionSources",
  );
  assertStringArray(
    manifest.operatorSummary.conditionalOrBlockedSources,
    "operatorSummary.conditionalOrBlockedSources",
  );
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    fail("manifest.sources must be non-empty");
  }

  const seen = new Set<string>();
  for (const source of manifest.sources) {
    assertString(source.slug, "source.slug");
    if (seen.has(source.slug)) {
      fail(`Duplicate source slug: ${source.slug}`);
    }
    seen.add(source.slug);

    assertString(source.name, `${source.slug}.name`);
    assertString(source.category, `${source.slug}.category`);
    if (!ALLOWED_VERDICTS.has(source.verdict)) {
      fail(`Invalid verdict for ${source.slug}: ${source.verdict}`);
    }
    if (typeof source.deferred !== "boolean") {
      fail(`deferred must be boolean for ${source.slug}`);
    }
    assertString(source.currentAccessPath, `${source.slug}.currentAccessPath`);
    if (!Array.isArray(source.endpointUrls)) {
      fail(`endpointUrls must be an array for ${source.slug}`);
    }
    assertString(source.license, `${source.slug}.license`);
    assertString(
      source.commercialUseBasis,
      `${source.slug}.commercialUseBasis`,
    );
    if (typeof source.attributionRequired !== "boolean") {
      fail(`attributionRequired must be boolean for ${source.slug}`);
    }
    assertUsageArray(source.allowedUsage, `${source.slug}.allowedUsage`);
    assertString(
      source.allowedSensitiveFields,
      `${source.slug}.allowedSensitiveFields`,
    );
    assertString(
      source.coordinateTreatment,
      `${source.slug}.coordinateTreatment`,
    );
    assertString(
      source.sourceVersionOrDate,
      `${source.slug}.sourceVersionOrDate`,
    );
    assertString(source.verificationDate, `${source.slug}.verificationDate`);
    if (source.verificationDate !== manifest.verificationDate) {
      fail(
        `${source.slug}.verificationDate must match manifest verificationDate`,
      );
    }
    assertString(source.sampleProof, `${source.slug}.sampleProof`);
    assertStringArray(source.knownBlockers, `${source.slug}.knownBlockers`);
    assertString(source.nextAllowedIssue, `${source.slug}.nextAllowedIssue`);
    if (!Array.isArray(source.liveChecks) || source.liveChecks.length === 0) {
      fail(`${source.slug}.liveChecks must be non-empty`);
    }
    for (const check of source.liveChecks) {
      assertLiveCheck(check, source);
    }

    if (
      source.verdict === "USE" &&
      !source.allowedUsage.includes("canonical_product_projection")
    ) {
      fail(
        `${source.slug} is USE but does not allow canonical_product_projection`,
      );
    }
    if (source.verdict === "REJECT") {
      const onlyReject =
        source.allowedUsage.length === 1 && source.allowedUsage[0] === "reject";
      if (!onlyReject) {
        fail(`${source.slug} is REJECT but allowedUsage is not only reject`);
      }
    }
    if (
      source.verdict === "INTERNAL-VALIDATION-ONLY" &&
      !source.allowedUsage.includes("internal_validation_only")
    ) {
      fail(
        `${source.slug} is INTERNAL-VALIDATION-ONLY without internal_validation_only`,
      );
    }
    if (
      source.coordinateTreatment.toLowerCase().includes("product") &&
      !source.coordinateTreatment.toLowerCase().includes("no_product")
    ) {
      fail(
        `${source.slug} coordinate treatment must not approve product location use`,
      );
    }
  }

  for (const slug of REQUIRED_SLUGS) {
    if (!seen.has(slug)) {
      fail(`Required OVE-55 source is missing: ${slug}`);
    }
  }

  for (const slug of manifest.operatorSummary.firstApprovedIngestionSources) {
    const source = manifest.sources.find((item) => item.slug === slug);
    if (!source) {
      fail(`Approved source summary references missing source: ${slug}`);
    }
    if (source.verdict !== "USE") {
      fail(`Approved source summary includes non-USE source: ${slug}`);
    }
  }
}

function expectedStatuses(check: LiveCheck): number[] {
  return Array.isArray(check.expectStatus)
    ? check.expectStatus
    : [check.expectStatus];
}

function decodeBody(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return Buffer.from(bytes).toString("utf16le");
  }
  if (bytes.length >= 2) {
    let oddNulls = 0;
    let evenNulls = 0;
    const inspected = Math.min(bytes.length, 512);
    for (let index = 0; index < inspected; index += 1) {
      if (bytes[index] === 0 && index % 2 === 0) {
        evenNulls += 1;
      }
      if (bytes[index] === 0 && index % 2 === 1) {
        oddNulls += 1;
      }
    }
    if (oddNulls > inspected / 5 && evenNulls < inspected / 20) {
      return Buffer.from(bytes).toString("utf16le");
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

async function fetchWithTimeout(check: LiveCheck): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const headers: Record<string, string> = {
      "user-agent":
        "OverGarden source readiness verifier (OVE-55; contact via over.garden)",
    };
    if (check.range) {
      headers.range = check.range;
    }
    return await fetch(check.url, {
      method: check.method,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function runLiveChecks(manifest: Manifest): Promise<void> {
  const failures: string[] = [];
  for (const source of manifest.sources) {
    for (const check of source.liveChecks) {
      if (check.method === "MANUAL") {
        console.log(`manual ${source.slug}/${check.id}: ${check.notes}`);
        continue;
      }

      try {
        const response = await fetchWithTimeout(check);
        const statuses = expectedStatuses(check);
        if (!statuses.includes(response.status)) {
          failures.push(
            `${source.slug}/${check.id}: expected HTTP ${statuses.join(
              " or ",
            )}, got ${response.status}`,
          );
          continue;
        }

        if (check.method !== "HEAD" && check.expectBodyIncludes.length > 0) {
          const body = decodeBody(await response.arrayBuffer());
          const missing = check.expectBodyIncludes.filter(
            (needle) => !body.includes(needle),
          );
          if (missing.length > 0) {
            failures.push(
              `${source.slug}/${check.id}: response missing ${missing.join(", ")}`,
            );
            continue;
          }
        }

        console.log(`ok ${source.slug}/${check.id}: HTTP ${response.status}`);
      } catch (error) {
        failures.push(
          `${source.slug}/${check.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  if (failures.length > 0) {
    fail(`Live source checks failed:\n- ${failures.join("\n- ")}`);
  }
}

function printSummary(manifest: Manifest): void {
  const counts = manifest.sources.reduce<Record<Verdict, number>>(
    (accumulator, source) => {
      accumulator[source.verdict] += 1;
      return accumulator;
    },
    {
      USE: 0,
      "USE-WITH-CONDITIONS": 0,
      "INTERNAL-VALIDATION-ONLY": 0,
      REJECT: 0,
    },
  );
  console.log(
    `OVE-55 source readiness manifest OK (${manifest.verificationDate}).`,
  );
  console.log(
    `Sources: ${manifest.sources.length}; USE=${counts.USE}; USE-WITH-CONDITIONS=${counts["USE-WITH-CONDITIONS"]}; INTERNAL-VALIDATION-ONLY=${counts["INTERNAL-VALIDATION-ONLY"]}; REJECT=${counts.REJECT}.`,
  );
  console.log(
    `Approved first ingestion sources: ${manifest.operatorSummary.firstApprovedIngestionSources.join(
      ", ",
    )}.`,
  );
}

async function main(): Promise<void> {
  const manifest = readManifest();
  validateManifest(manifest);
  await runLiveChecks(manifest);
  printSummary(manifest);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
