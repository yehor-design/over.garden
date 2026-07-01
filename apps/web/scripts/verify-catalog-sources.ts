import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

type ImportWave =
  | "raw_quarantine_allowed"
  | "product_projection_allowed"
  | "operator_review_required"
  | "legal_blocked"
  | "parser_blocked"
  | "rejected";

type ProductProjectionMode =
  | "bulk_official_varieties"
  | "species_backbone"
  | "species_backbone_corroboration"
  | "codes_and_safe_aliases"
  | "supplemental_aliases_only"
  | "curator_promotion_only"
  | "breed_backbone_limited"
  | "blocked_until_legal_and_parser_gate"
  | "blocked_until_export_reuse_gate"
  | "internal_validation_only"
  | "blocked_until_license_filter"
  | "blocked_until_terms_and_field_filter"
  | "rejected";

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
  attributionText?: string;
  legalValueCaveat?: string;
  parserPrerequisites?: string[];
  productProjectionPolicy?: ProductProjectionPolicy;
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

type ProductProjectionPolicy = {
  requiredProvenanceFields: string[];
  requiredSourceUrlPrefixes: string[];
  requiredProductSources: string[];
  requiredSourceRecordKeyPrefixes: string[];
  exactBlockerLanguage: string;
};

type FullImportSourceVerdict = {
  slug: string;
  sourceVersionOrExport: string;
  exportPathOrAccessMethod: string;
  license: string;
  attributionRequired: boolean;
  volumeEstimate: string;
  parserRisk: "low" | "medium" | "high" | "not_applicable";
  rawQuarantineAllowed: boolean;
  productProjectionAllowed: boolean;
  productProjectionMode: ProductProjectionMode;
  importWaves: ImportWave[];
  sourceOnlyFields: string[];
  productProjectionFields: string[];
  unblockingEvidence: string[];
  nextIssueDependency: string;
};

type FullImportReadiness = {
  issue: "OVE-79";
  title: string;
  verificationDate: string;
  verifiedBy: string;
  operatorDecision: string;
  waveLegend: Record<ImportWave, string>;
  importWaves: Record<ImportWave, string[]>;
  bgOfficialVarietyBulkGate: BgOfficialVarietyBulkGate;
  sourceVerdicts: FullImportSourceVerdict[];
};

type BgOfficialVarietyBulkGate = {
  issue: "OVE-84";
  title: string;
  verificationDate: string;
  verifiedBy: string;
  decision: "blocked" | "allowed";
  sourceSlugs: string[];
  fullRawImportAllowed: boolean;
  productProjectionAllowed: boolean;
  boundedProofProjectionAllowed: boolean;
  sourceVersionOrExport: string;
  exportPathOrAccessMethod: string;
  legalReuseBasis: string;
  attributionRequired: boolean;
  attributionText: string;
  legalValueCaveat: string;
  parserPolicy: {
    bulkParserApproved: boolean;
    acceptedRowMinimumConfidence: number;
    reviewRequiredBelowConfidence: number;
    rejectBelowConfidence: number;
    requiredReviewStates: string[];
  };
  allowedProductProjectionFields: string[];
  sourceOnlyFields: string[];
  blockers: string[];
  nextEvidenceNeeded: string[];
  guardContract: {
    boundedGateIssue: string;
    blockedBulkGateIssue: string;
    requiredBeforeIssue: string;
    blockedProductSourceSlugs: string[];
  };
};

export type Manifest = {
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
  fullImportReadiness: FullImportReadiness;
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
  "eu-oj-eur-lex-common-catalogue",
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

const REQUIRED_IMPORT_WAVES: readonly ImportWave[] = [
  "raw_quarantine_allowed",
  "product_projection_allowed",
  "operator_review_required",
  "legal_blocked",
  "parser_blocked",
  "rejected",
];

const ALLOWED_PRODUCT_PROJECTION_MODES = new Set<ProductProjectionMode>([
  "bulk_official_varieties",
  "species_backbone",
  "species_backbone_corroboration",
  "codes_and_safe_aliases",
  "supplemental_aliases_only",
  "curator_promotion_only",
  "breed_backbone_limited",
  "blocked_until_legal_and_parser_gate",
  "blocked_until_export_reuse_gate",
  "internal_validation_only",
  "blocked_until_license_filter",
  "blocked_until_terms_and_field_filter",
  "rejected",
]);

const ALLOWED_PARSER_RISK = new Set([
  "low",
  "medium",
  "high",
  "not_applicable",
]);

const MANIFEST_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json",
);

function fail(message: string): never {
  throw new Error(message);
}

export function readManifest(): Manifest {
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

function assertMaybeEmptyStringArray(
  value: unknown,
  field: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    fail(`Invalid string array: ${field}`);
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

function assertBoolean(
  value: unknown,
  field: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    fail(`Missing boolean: ${field}`);
  }
}

function assertNumberInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): asserts value is number {
  if (typeof value !== "number" || value < min || value > max) {
    fail(`Expected ${field} to be a number from ${min} to ${max}`);
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

export function validateManifest(manifest: Manifest): void {
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
    if (
      ![
        manifest.verificationDate,
        manifest.fullImportReadiness.verificationDate,
      ].includes(source.verificationDate)
    ) {
      fail(
        `${source.slug}.verificationDate must match manifest or full-import verification date`,
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
    validateProductProjectionPolicy(source);
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

  validateFullImportReadiness(manifest);
}

function validateProductProjectionPolicy(source: SourceReadiness): void {
  const policy = source.productProjectionPolicy;
  if (!policy) return;

  assertStringArray(
    policy.requiredProvenanceFields,
    `${source.slug}.productProjectionPolicy.requiredProvenanceFields`,
  );
  assertStringArray(
    policy.requiredSourceUrlPrefixes,
    `${source.slug}.productProjectionPolicy.requiredSourceUrlPrefixes`,
  );
  assertStringArray(
    policy.requiredProductSources,
    `${source.slug}.productProjectionPolicy.requiredProductSources`,
  );
  assertStringArray(
    policy.requiredSourceRecordKeyPrefixes,
    `${source.slug}.productProjectionPolicy.requiredSourceRecordKeyPrefixes`,
  );
  assertString(
    policy.exactBlockerLanguage,
    `${source.slug}.productProjectionPolicy.exactBlockerLanguage`,
  );
  if (!source.allowedUsage.includes("canonical_product_projection")) {
    fail(
      `${source.slug} has a productProjectionPolicy but cannot project canonically`,
    );
  }
  if (source.attributionRequired) {
    assertString(source.attributionText, `${source.slug}.attributionText`);
  }
  assertString(source.legalValueCaveat, `${source.slug}.legalValueCaveat`);
  assertStringArray(
    source.parserPrerequisites,
    `${source.slug}.parserPrerequisites`,
  );
}

function validateFullImportReadiness(manifest: Manifest): void {
  const readiness = manifest.fullImportReadiness;
  if (!readiness || readiness.issue !== "OVE-79") {
    fail("fullImportReadiness.issue must be OVE-79");
  }
  assertString(readiness.title, "fullImportReadiness.title");
  assertString(
    readiness.verificationDate,
    "fullImportReadiness.verificationDate",
  );
  assertString(readiness.verifiedBy, "fullImportReadiness.verifiedBy");
  assertString(
    readiness.operatorDecision,
    "fullImportReadiness.operatorDecision",
  );

  const sourceBySlug = new Map(
    manifest.sources.map((source) => [source.slug, source]),
  );
  const verdictBySlug = new Map<string, FullImportSourceVerdict>();

  validateBgOfficialVarietyBulkGate(readiness, sourceBySlug);

  for (const wave of REQUIRED_IMPORT_WAVES) {
    assertString(
      readiness.waveLegend?.[wave],
      `fullImportReadiness.waveLegend.${wave}`,
    );
    assertStringArray(
      readiness.importWaves?.[wave],
      `fullImportReadiness.importWaves.${wave}`,
    );
    for (const slug of readiness.importWaves[wave]) {
      if (!sourceBySlug.has(slug)) {
        fail(`fullImportReadiness import wave ${wave} references ${slug}`);
      }
    }
  }

  if (
    !Array.isArray(readiness.sourceVerdicts) ||
    readiness.sourceVerdicts.length !== manifest.sources.length
  ) {
    fail(
      "fullImportReadiness.sourceVerdicts must cover every manifest source exactly once",
    );
  }

  for (const verdict of readiness.sourceVerdicts) {
    assertString(verdict.slug, "fullImportReadiness.sourceVerdicts.slug");
    if (!sourceBySlug.has(verdict.slug)) {
      fail(`Full-import verdict references missing source: ${verdict.slug}`);
    }
    if (verdictBySlug.has(verdict.slug)) {
      fail(`Duplicate full-import verdict: ${verdict.slug}`);
    }
    verdictBySlug.set(verdict.slug, verdict);

    assertString(
      verdict.sourceVersionOrExport,
      `${verdict.slug}.sourceVersionOrExport`,
    );
    assertString(
      verdict.exportPathOrAccessMethod,
      `${verdict.slug}.exportPathOrAccessMethod`,
    );
    assertString(verdict.license, `${verdict.slug}.license`);
    assertBoolean(
      verdict.attributionRequired,
      `${verdict.slug}.attributionRequired`,
    );
    assertString(verdict.volumeEstimate, `${verdict.slug}.volumeEstimate`);
    if (!ALLOWED_PARSER_RISK.has(verdict.parserRisk)) {
      fail(`Invalid parserRisk for ${verdict.slug}: ${verdict.parserRisk}`);
    }
    assertBoolean(
      verdict.rawQuarantineAllowed,
      `${verdict.slug}.rawQuarantineAllowed`,
    );
    assertBoolean(
      verdict.productProjectionAllowed,
      `${verdict.slug}.productProjectionAllowed`,
    );
    if (!ALLOWED_PRODUCT_PROJECTION_MODES.has(verdict.productProjectionMode)) {
      fail(
        `Invalid productProjectionMode for ${verdict.slug}: ${verdict.productProjectionMode}`,
      );
    }
    assertStringArray(verdict.importWaves, `${verdict.slug}.importWaves`);
    assertStringArray(
      verdict.sourceOnlyFields,
      `${verdict.slug}.sourceOnlyFields`,
    );
    assertMaybeEmptyStringArray(
      verdict.productProjectionFields,
      `${verdict.slug}.productProjectionFields`,
    );
    assertStringArray(
      verdict.unblockingEvidence,
      `${verdict.slug}.unblockingEvidence`,
    );
    assertString(
      verdict.nextIssueDependency,
      `${verdict.slug}.nextIssueDependency`,
    );

    for (const wave of verdict.importWaves) {
      if (!REQUIRED_IMPORT_WAVES.includes(wave)) {
        fail(`Invalid import wave for ${verdict.slug}: ${wave}`);
      }
      if (!readiness.importWaves[wave].includes(verdict.slug)) {
        fail(`${verdict.slug} declares ${wave} but wave list omits it`);
      }
    }

    const source = sourceBySlug.get(verdict.slug);
    if (!source) continue;

    if (
      verdict.rawQuarantineAllowed &&
      !verdict.importWaves.includes("raw_quarantine_allowed")
    ) {
      fail(`${verdict.slug} allows raw quarantine but is missing its wave`);
    }
    if (
      verdict.productProjectionAllowed &&
      !source.allowedUsage.includes("canonical_product_projection")
    ) {
      fail(
        `${verdict.slug} allows product projection without canonical_product_projection in OVE-55 usage`,
      );
    }
    if (
      verdict.productProjectionAllowed &&
      !verdict.importWaves.includes("product_projection_allowed")
    ) {
      fail(`${verdict.slug} allows product projection but is missing its wave`);
    }
    if (
      verdict.productProjectionAllowed &&
      verdict.productProjectionFields.length === 0
    ) {
      fail(`${verdict.slug} allows product projection with no product fields`);
    }
    if (
      !verdict.productProjectionAllowed &&
      verdict.productProjectionFields.length > 0
    ) {
      fail(
        `${verdict.slug} blocks product projection but lists product fields`,
      );
    }
    if (
      source.verdict === "REJECT" &&
      (verdict.rawQuarantineAllowed || verdict.productProjectionAllowed)
    ) {
      fail(`${verdict.slug} is REJECT but allows import or projection`);
    }
  }

  for (const source of manifest.sources) {
    if (!verdictBySlug.has(source.slug)) {
      fail(`Missing full-import verdict for ${source.slug}`);
    }
  }

  for (const wave of REQUIRED_IMPORT_WAVES) {
    for (const slug of readiness.importWaves[wave]) {
      const verdict = verdictBySlug.get(slug);
      if (!verdict?.importWaves.includes(wave)) {
        fail(`Wave ${wave} lists ${slug}, but source verdict does not`);
      }
    }
  }
}

function validateBgOfficialVarietyBulkGate(
  readiness: FullImportReadiness,
  sourceBySlug: Map<string, SourceReadiness>,
): void {
  const gate = readiness.bgOfficialVarietyBulkGate;
  if (!gate || gate.issue !== "OVE-84") {
    fail("fullImportReadiness.bgOfficialVarietyBulkGate.issue must be OVE-84");
  }

  assertString(gate.title, "bgOfficialVarietyBulkGate.title");
  assertString(
    gate.verificationDate,
    "bgOfficialVarietyBulkGate.verificationDate",
  );
  assertString(gate.verifiedBy, "bgOfficialVarietyBulkGate.verifiedBy");
  if (!["blocked", "allowed"].includes(gate.decision)) {
    fail(`Invalid bgOfficialVarietyBulkGate decision: ${gate.decision}`);
  }
  assertStringArray(gate.sourceSlugs, "bgOfficialVarietyBulkGate.sourceSlugs");
  for (const requiredSlug of [
    "iasas-bg-official-variety-list",
    "eu-common-catalogue",
  ]) {
    if (!gate.sourceSlugs.includes(requiredSlug)) {
      fail(`bgOfficialVarietyBulkGate must cover ${requiredSlug}`);
    }
  }
  for (const slug of gate.sourceSlugs) {
    if (!sourceBySlug.has(slug)) {
      fail(`bgOfficialVarietyBulkGate references missing source ${slug}`);
    }
  }

  assertBoolean(
    gate.fullRawImportAllowed,
    "bgOfficialVarietyBulkGate.fullRawImportAllowed",
  );
  assertBoolean(
    gate.productProjectionAllowed,
    "bgOfficialVarietyBulkGate.productProjectionAllowed",
  );
  assertBoolean(
    gate.boundedProofProjectionAllowed,
    "bgOfficialVarietyBulkGate.boundedProofProjectionAllowed",
  );
  assertString(
    gate.sourceVersionOrExport,
    "bgOfficialVarietyBulkGate.sourceVersionOrExport",
  );
  assertString(
    gate.exportPathOrAccessMethod,
    "bgOfficialVarietyBulkGate.exportPathOrAccessMethod",
  );
  assertString(
    gate.legalReuseBasis,
    "bgOfficialVarietyBulkGate.legalReuseBasis",
  );
  assertBoolean(
    gate.attributionRequired,
    "bgOfficialVarietyBulkGate.attributionRequired",
  );
  assertString(
    gate.attributionText,
    "bgOfficialVarietyBulkGate.attributionText",
  );
  assertString(
    gate.legalValueCaveat,
    "bgOfficialVarietyBulkGate.legalValueCaveat",
  );

  const parserPolicy = gate.parserPolicy;
  if (!parserPolicy || typeof parserPolicy !== "object") {
    fail("bgOfficialVarietyBulkGate.parserPolicy must be an object");
  }
  assertBoolean(
    parserPolicy.bulkParserApproved,
    "bgOfficialVarietyBulkGate.parserPolicy.bulkParserApproved",
  );
  assertNumberInRange(
    parserPolicy.acceptedRowMinimumConfidence,
    "bgOfficialVarietyBulkGate.parserPolicy.acceptedRowMinimumConfidence",
    0,
    1,
  );
  assertNumberInRange(
    parserPolicy.reviewRequiredBelowConfidence,
    "bgOfficialVarietyBulkGate.parserPolicy.reviewRequiredBelowConfidence",
    0,
    1,
  );
  assertNumberInRange(
    parserPolicy.rejectBelowConfidence,
    "bgOfficialVarietyBulkGate.parserPolicy.rejectBelowConfidence",
    0,
    1,
  );
  if (
    parserPolicy.rejectBelowConfidence >
    parserPolicy.reviewRequiredBelowConfidence
  ) {
    fail(
      "bgOfficialVarietyBulkGate parser reject threshold exceeds review threshold",
    );
  }
  if (
    parserPolicy.reviewRequiredBelowConfidence >
    parserPolicy.acceptedRowMinimumConfidence
  ) {
    fail(
      "bgOfficialVarietyBulkGate parser review threshold exceeds accept threshold",
    );
  }
  assertStringArray(
    parserPolicy.requiredReviewStates,
    "bgOfficialVarietyBulkGate.parserPolicy.requiredReviewStates",
  );
  for (const state of [
    "accepted",
    "review_needed",
    "rejected",
    "quarantined",
  ]) {
    if (!parserPolicy.requiredReviewStates.includes(state)) {
      fail(`bgOfficialVarietyBulkGate parser policy must include ${state}`);
    }
  }

  assertMaybeEmptyStringArray(
    gate.allowedProductProjectionFields,
    "bgOfficialVarietyBulkGate.allowedProductProjectionFields",
  );
  assertStringArray(
    gate.sourceOnlyFields,
    "bgOfficialVarietyBulkGate.sourceOnlyFields",
  );
  assertStringArray(gate.blockers, "bgOfficialVarietyBulkGate.blockers");
  assertStringArray(
    gate.nextEvidenceNeeded,
    "bgOfficialVarietyBulkGate.nextEvidenceNeeded",
  );

  const guard = gate.guardContract;
  if (!guard || typeof guard !== "object") {
    fail("bgOfficialVarietyBulkGate.guardContract must be an object");
  }
  assertString(
    guard.boundedGateIssue,
    "bgOfficialVarietyBulkGate.guardContract.boundedGateIssue",
  );
  assertString(
    guard.blockedBulkGateIssue,
    "bgOfficialVarietyBulkGate.guardContract.blockedBulkGateIssue",
  );
  assertString(
    guard.requiredBeforeIssue,
    "bgOfficialVarietyBulkGate.guardContract.requiredBeforeIssue",
  );
  assertStringArray(
    guard.blockedProductSourceSlugs,
    "bgOfficialVarietyBulkGate.guardContract.blockedProductSourceSlugs",
  );
  if (guard.boundedGateIssue !== "OVE-61") {
    fail("bgOfficialVarietyBulkGate bounded proof must remain OVE-61");
  }
  if (guard.blockedBulkGateIssue !== "OVE-84") {
    fail("bgOfficialVarietyBulkGate bulk blocker must be OVE-84");
  }
  if (guard.requiredBeforeIssue !== "OVE-85") {
    fail("bgOfficialVarietyBulkGate must guard OVE-85");
  }

  if (gate.decision === "blocked") {
    if (gate.fullRawImportAllowed || gate.productProjectionAllowed) {
      fail(
        "blocked bgOfficialVarietyBulkGate cannot allow raw import or product projection",
      );
    }
    if (gate.allowedProductProjectionFields.length > 0) {
      fail(
        "blocked bgOfficialVarietyBulkGate cannot list product projection fields",
      );
    }
    if (parserPolicy.bulkParserApproved) {
      fail("blocked bgOfficialVarietyBulkGate cannot approve a bulk parser");
    }
  }

  if (gate.productProjectionAllowed) {
    for (const slug of gate.sourceSlugs) {
      const source = sourceBySlug.get(slug);
      if (!source?.allowedUsage.includes("canonical_product_projection")) {
        fail(
          `bgOfficialVarietyBulkGate allows product projection but ${slug} lacks canonical_product_projection`,
        );
      }
    }
    if (gate.allowedProductProjectionFields.length === 0) {
      fail(
        "allowed bgOfficialVarietyBulkGate must list product projection fields",
      );
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

export async function runLiveChecks(manifest: Manifest): Promise<void> {
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
  const fullImport = manifest.fullImportReadiness;
  console.log(
    `OVE-79 full import readiness manifest OK (${fullImport.verificationDate}).`,
  );
  console.log(
    `Import waves: raw=${fullImport.importWaves.raw_quarantine_allowed.length}; product=${fullImport.importWaves.product_projection_allowed.length}; review=${fullImport.importWaves.operator_review_required.length}; legal=${fullImport.importWaves.legal_blocked.length}; parser=${fullImport.importWaves.parser_blocked.length}; rejected=${fullImport.importWaves.rejected.length}.`,
  );
}

async function main(): Promise<void> {
  const manifest = readManifest();
  validateManifest(manifest);
  await runLiveChecks(manifest);
  printSummary(manifest);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
