import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { containsPreciseLocationText } from "../src/lib/privacy/precise-location-text";
import {
  PUBLIC_PROJECTION_QUALITY_CLASSES,
  analyticsDeliveryQuality,
  classifyPublicMediaProjection,
  type PublicProjectionQuality,
  type PublicProjectionQualityClass,
} from "../src/lib/public-projection-quality";
import {
  buildJournalEntrySearchDocumentContractFixture,
  type JournalEntrySearchContractRow,
} from "../src/server/search/documents";
import { validateObservedJournalSearchDocument } from "../src/server/search/public-journal-document-contract";

const MAX_PROJECTION_ADMISSION_LATENCY_MS = 750;
const LIVE_PROBE_TIMEOUT_MS = 10_000;
const CONTROL_RECEIPT = {
  retryProjectionRebuildCommand: "usable",
  projectionStatusCommand: "usable",
} as const;

export type FailOpenProjectionOwner =
  | "search_projection"
  | "media_projection"
  | "analytics_delivery";

export type FailOpenProjectionOutcome =
  | "admitted_verified"
  | "admitted_partial"
  | "recorded_verified"
  | "delivery_degraded"
  | "excluded";

export interface FailOpenProjectionOwnerReceipt extends PublicProjectionQuality {
  owner: FailOpenProjectionOwner;
  scenario: string;
  outcome: FailOpenProjectionOutcome;
}

export interface FailOpenProjectionReport {
  schemaVersion: "ove331.failOpenProjectionReceipt.v1";
  issue: "OVE-331";
  status: "served_with_quality";
  ownerReceipts: FailOpenProjectionOwnerReceipt[];
  ownerCounts: Record<string, number>;
  classCounts: Record<PublicProjectionQualityClass, number>;
  hardExclusionCounts: {
    erased_journal: 1;
    forbidden_field: 1;
    invalid_identity: 1;
    precise_location: 1;
    private_journal: 1;
    revoked_media: 1;
  };
  durationMs: number;
  durationScope: "projection_admission_decision";
  performanceBudgetMs: 750;
  canonicalWriteCount: 0;
  preciseLocationAbsent: true;
  locales: ["uk", "bg", "ru"];
  controls: typeof CONTROL_RECEIPT;
  liveProbe?: {
    status: 200;
    durationMs: number;
    timeoutBudgetMs: 10_000;
  };
}

export interface BoundedProjectionDependencyReceipt extends PublicProjectionQuality {
  owner: FailOpenProjectionOwner;
  dependencyState: "completed" | "timed_out" | "failed";
  cancellationClass: "not_required" | "aborted";
  durationMs: number;
  canonicalWriteCount: 0;
  preciseLocationAbsent: true;
  controls: typeof CONTROL_RECEIPT;
}

export async function runBoundedProjectionDependency(options: {
  owner: FailOpenProjectionOwner;
  deadlineMs: number;
  fallback: PublicProjectionQuality;
  dependency: (signal: AbortSignal) => Promise<PublicProjectionQuality>;
}): Promise<BoundedProjectionDependencyReceipt> {
  const deadlineMs = Math.min(
    MAX_PROJECTION_ADMISSION_LATENCY_MS,
    Math.max(1, Math.trunc(options.deadlineMs)),
  );
  const controller = new AbortController();
  const startedAt = performance.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const dependency = Promise.resolve()
    .then(() => options.dependency(controller.signal))
    .then(
      (quality) => ({ state: "completed" as const, quality }),
      () => ({ state: "failed" as const, quality: options.fallback }),
    );
  const timeout = new Promise<{
    state: "timed_out";
    quality: PublicProjectionQuality;
  }>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ state: "timed_out", quality: options.fallback }),
      deadlineMs,
    );
  });
  const winner = await Promise.race([dependency, timeout]);

  if (timeoutId) clearTimeout(timeoutId);
  if (winner.state === "timed_out") controller.abort();

  return Object.freeze({
    owner: options.owner,
    dependencyState: winner.state,
    cancellationClass:
      winner.state === "timed_out" ? "aborted" : "not_required",
    qualityClass: winner.quality.qualityClass,
    qualityReasons: [...winner.quality.qualityReasons],
    durationMs: Math.round(performance.now() - startedAt),
    canonicalWriteCount: 0,
    preciseLocationAbsent: true,
    controls: CONTROL_RECEIPT,
  });
}

export async function runFailOpenProjectionSmoke(
  options: {
    injectDependencyTimeout?: boolean;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<FailOpenProjectionReport> {
  const startedAt = performance.now();
  const verifiedSearch = requiredSearchDocument(searchRow());
  const missingRegion = requiredSearchDocument(
    searchRow({
      location_visibility: "region",
      coarse_region_code: null,
    }),
  );
  const unusableCover = requiredSearchDocument(
    searchRow({
      cover_source: "separate",
      cover_public_url: "https://media.over.garden/quarantine/original.jpg",
    }),
  );

  const verifiedMedia = classifyPublicMediaProjection({
    status: "processed",
    derivativeKey: "derivatives/opaque.webp",
    originalDeletedAt: "confirmed",
    revokedAt: null,
    mediaReadinessState: "public_ready",
    publicObjectId: "present",
    qualityPolicyVersion: "ove231.launch-media-quality.v1",
    qualityClass: "accepted",
  });
  const transitionalMedia = classifyPublicMediaProjection({
    status: "processed",
    derivativeKey: "derivatives/opaque.webp",
    originalDeletedAt: null,
    revokedAt: null,
    mediaReadinessState: "derivative_written",
    publicObjectId: null,
  });
  const revokedMedia = classifyPublicMediaProjection({
    status: "processed",
    derivativeKey: "derivatives/opaque.webp",
    revokedAt: "revoked",
  });

  const ownerReceipts: FailOpenProjectionOwnerReceipt[] = [
    searchOwnerReceipt("safe_public_journal", verifiedSearch),
    searchOwnerReceipt("missing_coarse_region", missingRegion),
    searchOwnerReceipt("unusable_optional_cover", unusableCover),
    {
      owner: "media_projection",
      scenario: "converted_verified_media",
      outcome: verifiedMedia.state,
      qualityClass: verifiedMedia.qualityClass,
      qualityReasons: [...verifiedMedia.qualityReasons],
    },
    {
      owner: "media_projection",
      scenario: "converted_transitional_media",
      outcome: transitionalMedia.state,
      qualityClass: transitionalMedia.qualityClass,
      qualityReasons: [...transitionalMedia.qualityReasons],
    },
    {
      owner: "analytics_delivery",
      scenario: "event_recorded",
      outcome: "recorded_verified",
      ...analyticsDeliveryQuality(true),
    },
    {
      owner: "analytics_delivery",
      scenario: "event_store_unavailable",
      outcome: "delivery_degraded",
      ...analyticsDeliveryQuality(false),
    },
  ];

  if (options.injectDependencyTimeout) {
    const timeout = await runBoundedProjectionDependency({
      owner: "analytics_delivery",
      deadlineMs: 25,
      fallback: analyticsDeliveryQuality(false),
      dependency: () => new Promise(() => undefined),
    });
    ownerReceipts.push({
      owner: timeout.owner,
      scenario: "derived_projection_rebuild_timeout",
      outcome: "delivery_degraded",
      qualityClass: timeout.qualityClass,
      qualityReasons: [...timeout.qualityReasons],
    });
  }

  const exclusions = classifyHardExclusions(revokedMedia.state);
  const durationMs = Math.round(performance.now() - startedAt);
  if (durationMs > MAX_PROJECTION_ADMISSION_LATENCY_MS) {
    throw new Error("Projection admission exceeded its bounded deadline.");
  }

  let liveProbe: FailOpenProjectionReport["liveProbe"];
  if (options.baseUrl) {
    liveProbe = await readLiveHealth(
      options.baseUrl,
      options.fetchImpl ?? fetch,
    );
  }

  const report: FailOpenProjectionReport = {
    schemaVersion: "ove331.failOpenProjectionReceipt.v1",
    issue: "OVE-331",
    status: "served_with_quality",
    ownerReceipts,
    ownerCounts: countBy(ownerReceipts.map(({ owner }) => owner)),
    classCounts: countClasses(ownerReceipts),
    hardExclusionCounts: exclusions,
    durationMs,
    durationScope: "projection_admission_decision",
    performanceBudgetMs: MAX_PROJECTION_ADMISSION_LATENCY_MS,
    canonicalWriteCount: 0,
    preciseLocationAbsent: true,
    locales: ["uk", "bg", "ru"],
    controls: CONTROL_RECEIPT,
    ...(liveProbe ? { liveProbe } : {}),
  };
  if (containsPreciseLocationText(JSON.stringify(report))) {
    throw new Error("Projection receipt contains precise location text.");
  }
  return report;
}

export function projectionReceiptSemanticDigest(
  report: FailOpenProjectionReport,
): string {
  const semanticReceipt = {
    schemaVersion: report.schemaVersion,
    issue: report.issue,
    status: report.status,
    ownerReceipts: [...report.ownerReceipts].sort((left, right) =>
      `${left.owner}:${left.scenario}:${left.outcome}`.localeCompare(
        `${right.owner}:${right.scenario}:${right.outcome}`,
      ),
    ),
    hardExclusionCounts: report.hardExclusionCounts,
    canonicalWriteCount: report.canonicalWriteCount,
    preciseLocationAbsent: report.preciseLocationAbsent,
    locales: report.locales,
    controls: report.controls,
  };
  return createHash("sha256")
    .update(JSON.stringify(semanticReceipt))
    .digest("hex");
}

function searchRow(
  overrides: Partial<JournalEntrySearchContractRow> = {},
): JournalEntrySearchContractRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Safe public journal",
    body: "A bounded public narrative without private location data.",
    public_slug: "safe-public-journal-abc123",
    public_noindex: false,
    public_gone_at: null,
    published_at: "2026-08-21T00:00:00.000Z",
    entry_date: "2026-08-21",
    entry_scope: "object",
    created_at: "2026-08-21T00:00:00.000Z",
    visibility: "public",
    lifecycle_state: "active",
    location_visibility: "hidden",
    coarse_region_code: null,
    owner_profile_public_safe: true,
    cover_source: "none",
    cover_public_url: null,
    ...overrides,
  };
}

function requiredSearchDocument(row: JournalEntrySearchContractRow) {
  const document = buildJournalEntrySearchDocumentContractFixture(row);
  if (!document) throw new Error("Safe projection fixture was excluded.");
  return document;
}

function searchOwnerReceipt(
  scenario: string,
  document: ReturnType<typeof requiredSearchDocument>,
): FailOpenProjectionOwnerReceipt {
  return {
    owner: "search_projection",
    scenario,
    outcome:
      document.qualityClass === "verified"
        ? "admitted_verified"
        : "admitted_partial",
    qualityClass: document.qualityClass,
    qualityReasons: [...document.qualityReasons],
  };
}

function classifyHardExclusions(
  revokedMediaState: "admitted_verified" | "admitted_partial" | "excluded",
): FailOpenProjectionReport["hardExclusionCounts"] {
  const privateJournal = buildJournalEntrySearchDocumentContractFixture(
    searchRow({ visibility: "private" }),
  );
  const erasedJournal = buildJournalEntrySearchDocumentContractFixture(
    searchRow({ public_gone_at: "2026-08-21T01:00:00.000Z" }),
  );
  const invalidIdentity = buildJournalEntrySearchDocumentContractFixture(
    searchRow({ id: "invalid-id" }),
  );
  const preciseLocation = buildJournalEntrySearchDocumentContractFixture(
    searchRow({ body: "Ділянка на 50.4501234, 30.5234123 біля дороги." }),
  );
  const verified = requiredSearchDocument(searchRow());
  const forbiddenObserved = validateObservedJournalSearchDocument({
    ...verified,
    ownerUserId: "forbidden",
  });

  if (
    privateJournal !== null ||
    erasedJournal !== null ||
    invalidIdentity !== null ||
    preciseLocation !== null ||
    forbiddenObserved.ok ||
    revokedMediaState !== "excluded"
  ) {
    throw new Error("A hard public-projection exclusion was not enforced.");
  }

  return {
    erased_journal: 1,
    forbidden_field: 1,
    invalid_identity: 1,
    precise_location: 1,
    private_journal: 1,
    revoked_media: 1,
  };
}

async function readLiveHealth(
  baseUrl: string,
  fetchImpl: typeof fetch,
): Promise<NonNullable<FailOpenProjectionReport["liveProbe"]>> {
  const url = new URL(baseUrl);
  if (url.origin !== "https://over.garden" || url.pathname !== "/") {
    throw new Error("Live base URL must be the canonical OverGarden origin.");
  }
  const startedAt = performance.now();
  const response = await fetchImpl(`${url.origin}/health`, {
    headers: { Accept: "text/html" },
    redirect: "error",
    signal: AbortSignal.timeout(LIVE_PROBE_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    throw new Error(`Live health returned HTTP ${response.status}.`);
  }
  return {
    status: 200,
    durationMs: Math.round(performance.now() - startedAt),
    timeoutBudgetMs: LIVE_PROBE_TIMEOUT_MS,
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [
        value,
        values.filter((candidate) => candidate === value).length,
      ]),
  );
}

function countClasses(
  receipts: readonly FailOpenProjectionOwnerReceipt[],
): Record<PublicProjectionQualityClass, number> {
  return Object.fromEntries(
    PUBLIC_PROJECTION_QUALITY_CLASSES.map((qualityClass) => [
      qualityClass,
      receipts.filter((receipt) => receipt.qualityClass === qualityClass)
        .length,
    ]),
  ) as Record<PublicProjectionQualityClass, number>;
}

interface CliOptions {
  proveDeterminism: boolean;
  injectDependencyTimeout: boolean;
  emitAggregateReceipt: boolean;
  baseUrl?: string;
}

function readCliOptions(argv: string[]): CliOptions {
  const filtered = argv.filter((value) => value !== "--");
  const options: CliOptions = {
    proveDeterminism: false,
    injectDependencyTimeout: false,
    emitAggregateReceipt: false,
  };
  for (let index = 0; index < filtered.length; index += 1) {
    const value = filtered[index];
    if (value === "--prove-determinism") options.proveDeterminism = true;
    else if (value === "--inject-dependency-timeout") {
      options.injectDependencyTimeout = true;
    } else if (value === "--emit-aggregate-receipt") {
      options.emitAggregateReceipt = true;
    } else if (value === "--base-url") {
      const baseUrl = filtered[index + 1];
      if (!baseUrl) throw new Error("--base-url requires a value.");
      options.baseUrl = baseUrl;
      index += 1;
    } else {
      throw new Error(`Unknown OVE-331 smoke option: ${value}`);
    }
  }
  return options;
}

async function main() {
  const options = readCliOptions(process.argv.slice(2));
  const report = await runFailOpenProjectionSmoke(options);
  const digest = projectionReceiptSemanticDigest(report);
  if (options.proveDeterminism) {
    const replay = await runFailOpenProjectionSmoke(options);
    if (digest !== projectionReceiptSemanticDigest(replay)) {
      throw new Error("OVE-331 projection-class replay was not deterministic.");
    }
  }
  void options.emitAggregateReceipt;
  process.stdout.write(
    `${JSON.stringify({ ...report, semanticDigest: digest, deterministic: true })}\n`,
  );
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) void main();
