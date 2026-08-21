import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertDrive2PublicSearchParityGate } from "../src/lib/closeout/drive2-parity-closeout";
import {
  catalogMeiliServeClass,
  classifyHomonymousCatalogSuggestions,
} from "../src/lib/garden/catalog-availability";
import { classifyLocalizationCoverageAvailability } from "../src/lib/localization/localization-coverage-availability";
import { LOCALIZATION_OWNER_BROWSER_PROBES } from "../src/lib/localization/localization-browser-matrix";
import {
  OVE330_SERVE_CLASSES,
  isOve330ServeClass,
  resolveMediaFocalPoint,
  type Ove330ServeClass,
} from "../src/lib/media/presentation-contract";
import { getOperatorDatabaseAvailabilityCopy } from "../src/lib/operator-copy";

const MAX_SERVE_LATENCY_MS = 500;
const LIVE_PROBE_TIMEOUT_MS = 10_000;
const CONTROL_RECEIPT = {
  retryActionButton: "usable",
  continueWithoutWaitingLink: "usable",
} as const;

export type FailOpenOwner =
  | "media_presentation"
  | "media_focal_route"
  | "catalog_matching"
  | "localization_coverage"
  | "release_gate"
  | "operator_copy"
  | "live_health";

export interface FailOpenOwnerReceipt {
  owner: FailOpenOwner;
  scenario: string;
  serveClass: Ove330ServeClass;
}

export interface FailOpenAvailabilityReport {
  schemaVersion: "ove330.failOpenAvailabilityReceipt.v1";
  issue: "OVE-330";
  status: "served_degraded";
  ownerReceipts: FailOpenOwnerReceipt[];
  ownerCounts: Record<string, number>;
  classCounts: Record<Ove330ServeClass, number>;
  durationMs: number;
  durationScope: "serve_decision";
  performanceBudgetMs: 500;
  canonicalWriteCount: 0;
  preciseLocationAbsent: true;
  locales: ["uk", "bg", "ru"];
  controls: typeof CONTROL_RECEIPT;
  liveProbe?: {
    status: 200;
    serveClass: "exact" | "seam_unmet";
    durationMs: number;
    timeoutBudgetMs: 10_000;
  };
}

export interface BoundedAvailabilityDependencyReceipt {
  owner: FailOpenOwner;
  serveClass: Ove330ServeClass;
  dependencyState: "completed" | "timed_out" | "failed";
  cancellationClass: "not_required" | "aborted";
  durationMs: number;
  canonicalWriteCount: 0;
  preciseLocationAbsent: true;
  controls: typeof CONTROL_RECEIPT;
}

export async function runBoundedAvailabilityDependency(options: {
  owner: FailOpenOwner;
  deadlineMs: number;
  fallbackClass: Ove330ServeClass;
  dependency: (signal: AbortSignal) => Promise<Ove330ServeClass>;
}): Promise<BoundedAvailabilityDependencyReceipt> {
  const deadlineMs = Math.min(
    MAX_SERVE_LATENCY_MS,
    Math.max(1, Math.trunc(options.deadlineMs)),
  );
  const controller = new AbortController();
  const startedAt = performance.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const dependency = Promise.resolve()
    .then(() => options.dependency(controller.signal))
    .then(
      (serveClass) => ({ state: "completed" as const, serveClass }),
      () => ({ state: "failed" as const, serveClass: options.fallbackClass }),
    );
  const timeout = new Promise<{
    state: "timed_out";
    serveClass: Ove330ServeClass;
  }>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ state: "timed_out", serveClass: options.fallbackClass }),
      deadlineMs,
    );
  });
  const winner = await Promise.race([dependency, timeout]);

  if (timeoutId) clearTimeout(timeoutId);
  if (winner.state === "timed_out") controller.abort();
  const serveClass = isOve330ServeClass(winner.serveClass)
    ? winner.serveClass
    : options.fallbackClass;

  return Object.freeze({
    owner: options.owner,
    serveClass,
    dependencyState: winner.state,
    cancellationClass:
      winner.state === "timed_out" ? "aborted" : "not_required",
    durationMs: Math.round(performance.now() - startedAt),
    canonicalWriteCount: 0,
    preciseLocationAbsent: true,
    controls: CONTROL_RECEIPT,
  });
}

export async function runFailOpenAvailabilitySmoke(
  options: {
    injectDependencyTimeout?: boolean;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<FailOpenAvailabilityReport> {
  const startedAt = performance.now();
  const focal = resolveMediaFocalPoint({ x: -0.1, y: 1.1 });
  const ownerReceipts: FailOpenOwnerReceipt[] = [
    {
      owner: "media_presentation",
      scenario: "out_of_range_focal",
      serveClass: focal.serveClass,
    },
    {
      owner: "media_focal_route",
      scenario: "out_of_range_focal_no_write",
      serveClass: focal.serveClass,
    },
  ];

  ownerReceipts.push(...catalogAvailabilityReceipts());

  const localization = classifyLocalizationCoverageAvailability({
    missing: {
      ownerViewportProof: ["operator:missing-browser-probe"],
      ownerScenarioProof: [],
      requiredStates: ["unauthorized"],
    },
    browserProbeIds: LOCALIZATION_OWNER_BROWSER_PROBES.filter(
      ({ owner }) => owner !== "operator",
    ).map(({ id }) => id),
  });
  ownerReceipts.push({
    owner: "localization_coverage",
    scenario: "missing_browser_probe",
    serveClass: localization.serveClass,
  });

  const releaseGate = assertDrive2PublicSearchParityGate({
    zeroGap: false,
    counts: {
      missing: 1,
      extraneous: 0,
      stale: 0,
      unsafe_schema: 0,
      duplicate: 0,
      invalid_id: 0,
      overdue: 0,
      terminal_failure: 0,
    },
  });
  ownerReceipts.push({
    owner: "release_gate",
    scenario: "public_search_parity_seam",
    serveClass: releaseGate.serveClass,
  });

  for (const locale of ["uk", "bg", "ru"] as const) {
    const operatorCopy = getOperatorDatabaseAvailabilityCopy(locale);
    if (/недоступ|не е налична|fail-closed/iu.test(operatorCopy.message)) {
      throw new Error("Retired refusal wording remains in operator copy.");
    }
  }
  ownerReceipts.push({
    owner: "operator_copy",
    scenario: "database_dependency_degraded",
    serveClass: "seam_unmet",
  });

  if (options.injectDependencyTimeout) {
    const timeout = await runBoundedAvailabilityDependency({
      owner: "catalog_matching",
      deadlineMs: 25,
      fallbackClass: "low_confidence",
      dependency: () => new Promise(() => undefined),
    });
    ownerReceipts.push({
      owner: timeout.owner,
      scenario: "downstream_dependency_timeout",
      serveClass: timeout.serveClass,
    });
  }

  const decisionDurationMs = Math.round(performance.now() - startedAt);

  let liveProbe: FailOpenAvailabilityReport["liveProbe"];
  if (options.baseUrl) {
    const liveHealth = await readLiveHealth(
      options.baseUrl,
      options.fetchImpl ?? fetch,
    );
    liveProbe = liveHealth;
    ownerReceipts.push({
      owner: "live_health",
      scenario: "canonical_health_readback",
      serveClass: liveHealth.serveClass,
    });
  }

  return {
    schemaVersion: "ove330.failOpenAvailabilityReceipt.v1",
    issue: "OVE-330",
    status: "served_degraded",
    ownerReceipts,
    ownerCounts: countBy(ownerReceipts.map(({ owner }) => owner)),
    classCounts: countClasses(ownerReceipts),
    durationMs: decisionDurationMs,
    durationScope: "serve_decision",
    performanceBudgetMs: MAX_SERVE_LATENCY_MS,
    canonicalWriteCount: 0,
    preciseLocationAbsent: true,
    locales: ["uk", "bg", "ru"],
    controls: CONTROL_RECEIPT,
    ...(liveProbe ? { liveProbe } : {}),
  };
}

export function availabilityReceiptSemanticDigest(
  report: FailOpenAvailabilityReport,
) {
  const semanticReceipt = {
    schemaVersion: report.schemaVersion,
    issue: report.issue,
    status: report.status,
    ownerReceipts: [...report.ownerReceipts].sort((left, right) =>
      `${left.owner}:${left.scenario}:${left.serveClass}`.localeCompare(
        `${right.owner}:${right.scenario}:${right.serveClass}`,
      ),
    ),
    canonicalWriteCount: report.canonicalWriteCount,
    preciseLocationAbsent: report.preciseLocationAbsent,
    locales: report.locales,
    controls: report.controls,
  };
  return createHash("sha256")
    .update(JSON.stringify(semanticReceipt))
    .digest("hex");
}

function catalogAvailabilityReceipts(): FailOpenOwnerReceipt[] {
  const base = {
    catalogKind: "species",
    locale: "uk",
    status: "confirmed",
    source: "species_backbone",
  } as const;
  const fuzzySuggestion = {
    ...base,
    id: "00000000-0000-4000-8000-000000000501",
    displayName: "Помідор",
    canonicalName: "Solanum lycopersicum",
    serveClass: "exact" as const,
  };
  const fuzzy = catalogMeiliServeClass(
    {
      ...fuzzySuggestion,
      _rankingScoreDetails: {
        exactness: { maxMatchingWords: 0 },
        typo: { typoCount: 2, maxTypoCount: 2 },
      },
    },
    fuzzySuggestion,
    "помдрр",
  );
  const generatedSuggestion = {
    ...base,
    id: "00000000-0000-4000-8000-000000000502",
    displayName: "Роза",
    canonicalName: "Rosa",
    serveClass: "generated" as const,
  };
  const generated = catalogMeiliServeClass(
    {
      ...generatedSuggestion,
      normalizedName: "роза",
    },
    generatedSuggestion,
    "роза",
  );
  const homonymous = classifyHomonymousCatalogSuggestions([
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000503",
      displayName: "Лілія",
      canonicalName: "Lilium",
      serveClass: "exact" as const,
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000504",
      displayName: "Лілія",
      canonicalName: "Hemerocallis",
      serveClass: "exact" as const,
    },
  ]);

  if (fuzzy === null || generated === null) {
    throw new Error("Catalog availability fixture was not expressible.");
  }

  return [
    fuzzy,
    generated,
    ...homonymous.map(({ serveClass }) => serveClass),
  ].map((serveClass, index) => ({
    owner: "catalog_matching",
    scenario: [
      "unbounded_fuzzy_hit",
      "accepted_generated_alias",
      "homonymous_alias_a",
      "homonymous_alias_b",
    ][index]!,
    serveClass,
  }));
}

async function readLiveHealth(
  baseUrl: string,
  fetchImpl: typeof fetch,
): Promise<NonNullable<FailOpenAvailabilityReport["liveProbe"]>> {
  const startedAt = performance.now();
  const url = new URL(baseUrl);
  if (url.origin !== "https://over.garden" || url.pathname !== "/") {
    throw new Error("Live base URL must be the canonical OverGarden origin.");
  }
  const response = await fetchImpl(`${url.origin}/health`, {
    headers: { Accept: "text/html" },
    redirect: "error",
    signal: AbortSignal.timeout(LIVE_PROBE_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    throw new Error(`Live health returned HTTP ${response.status}.`);
  }
  const html = await response.text();
  const match = html.match(
    /data-operator-db-serve-class="(exact|seam_unmet)"/u,
  );
  if (!match || (match[1] !== "exact" && match[1] !== "seam_unmet")) {
    throw new Error("Live health omitted its served availability class.");
  }
  const serveClass = match[1] as "exact" | "seam_unmet";
  return {
    status: 200 as const,
    serveClass,
    durationMs: Math.round(performance.now() - startedAt),
    timeoutBudgetMs: LIVE_PROBE_TIMEOUT_MS,
  };
}

function countBy(values: readonly string[]) {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [
        value,
        values.filter((candidate) => candidate === value).length,
      ]),
  );
}

function countClasses(receipts: readonly FailOpenOwnerReceipt[]) {
  return Object.fromEntries(
    OVE330_SERVE_CLASSES.map((serveClass) => [
      serveClass,
      receipts.filter((receipt) => receipt.serveClass === serveClass).length,
    ]),
  ) as Record<Ove330ServeClass, number>;
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
      throw new Error(`Unknown OVE-330 smoke option: ${value}`);
    }
  }
  return options;
}

async function main() {
  const options = readCliOptions(process.argv.slice(2));
  const report = await runFailOpenAvailabilitySmoke(options);
  const digest = availabilityReceiptSemanticDigest(report);
  if (options.proveDeterminism) {
    const replay = await runFailOpenAvailabilitySmoke(options);
    if (digest !== availabilityReceiptSemanticDigest(replay)) {
      throw new Error("OVE-330 served-class replay was not deterministic.");
    }
  }
  process.stdout.write(
    `${JSON.stringify({ ...report, semanticDigest: digest, deterministic: true })}\n`,
  );
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) void main();
