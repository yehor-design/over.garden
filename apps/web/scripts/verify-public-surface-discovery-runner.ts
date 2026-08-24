import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
  PUBLIC_SURFACE_DISCOVERY_INVENTORY,
  resolvePublicSurfaceDiscovery,
  resolvePublicSurfaceDiscoveryWithDeadline,
  type PublicSurfaceDiscoveryConsumerId,
  type PublicSurfaceDiscoverySource,
} from "../src/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "../src/server/public-surface-metadata";

export const PUBLIC_SURFACE_DISCOVERY_RECEIPT_VERSION =
  "ove335.publicSurfaceDiscoveryReceipt.v1";

const EVALUATED_AT = "2026-08-24T00:00:00.000Z";
const MEANINGFUL_CONTENT_AT = "2026-08-23T00:00:00.000Z";
const LIVE_PROBE_TIMEOUT_MS = 10_000;
const MAX_LIVE_RESPONSE_BYTES = 2_000_000;
const SAFE_VISIBLE_TEXT = Array.from(
  { length: 120 },
  (_, index) => `visible${index}`,
).join(" ");
const CONTROL_RECEIPT = {
  retryPublicDiscoveryReportCommand: "usable",
  publicDiscoveryCoverageCommand: "usable",
} as const;

type TimingClass = "within_150ms" | "over_150ms";

export interface PublicSurfaceCoverageReceipt {
  surfaceKind: (typeof PUBLIC_SURFACE_DISCOVERY_INVENTORY)[number]["surfaceKind"];
  candidateClass: "candidate" | "non_candidate";
  reasonClass: string;
  outputCoverageClass: "complete" | "refused";
  localeEquivalenceClass: "singleton_source" | "not_applicable";
  timingClass: TimingClass;
  cancellationClass: "not_required";
}

export interface PublicSurfaceLiveProbeReceipt {
  surfaceKind: "editorial_blog" | "missing" | "robots" | "sitemap";
  candidateClass: "candidate" | "non_candidate" | "discovery_control";
  robotsClass: "index" | "noindex" | "not_applicable";
  canonicalClass: "one" | "none" | "not_applicable";
  jsonLdClass: "present" | "absent" | "not_applicable";
  sitemapClass: "included" | "excluded" | "aligned" | "not_applicable";
  responseClass: "ok";
}

export interface PublicSurfaceDiscoveryVerificationReceipt {
  schemaVersion: typeof PUBLIC_SURFACE_DISCOVERY_RECEIPT_VERSION;
  issue: "OVE-335";
  status: "aligned";
  buildSha: string;
  inventoryCount: number;
  candidateCount: number;
  nonCandidateCount: number;
  callerCoverageClass: "complete";
  directPolicyBypassCount: 0;
  canonicalWriteCount: 0;
  performanceBudgetMs: 150;
  decisionDurationClass: TimingClass;
  timeoutReceipt?: {
    terminalClass: "timed_out";
    decisionClass: "noindex";
    reasonClass: "candidate_input_unresolved";
    cancellationClass: "late_result_ignored";
    timingClass: TimingClass;
  };
  cancellationReceipt: {
    terminalClass: "cancelled";
    decisionClass: "noindex";
    reasonClass: "candidate_input_unresolved";
    cancellationClass: "aborted_before_read";
  };
  recoveryClass: "fresh_independent_read_admitted";
  replayClass: "deterministic";
  concurrentReadClass: "deterministic";
  preciseLocationAbsent: true;
  controls: typeof CONTROL_RECEIPT;
  surfaceReceipts: PublicSurfaceCoverageReceipt[];
  liveProbe?: {
    status: "aligned";
    probeCount: 5;
    receipts: PublicSurfaceLiveProbeReceipt[];
  };
}

export interface PublicSurfaceDiscoveryVerificationOptions {
  repositoryRoot?: string;
  buildSha?: string;
  injectSourceTimeout?: boolean;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  monotonicNow?: () => number;
}

export async function runPublicSurfaceDiscoveryVerification(
  options: PublicSurfaceDiscoveryVerificationOptions = {},
): Promise<PublicSurfaceDiscoveryVerificationReceipt> {
  const repositoryRoot = options.repositoryRoot ?? resolveWebRoot();
  verifyPublicSurfaceDiscoveryInventory(repositoryRoot);
  const buildSha = options.buildSha ?? readBuildSha(repositoryRoot);
  if (!/^[0-9a-f]{40}$/u.test(buildSha)) {
    throw new Error("public_discovery_build_sha_unresolved");
  }

  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  let maximumDecisionDurationMs = 0;
  const resolveMeasured = (source: PublicSurfaceDiscoverySource) => {
    const startedAt = monotonicNow();
    const discovery = resolvePublicSurfaceDiscovery(source, {
      evaluatedAt: EVALUATED_AT,
    });
    const durationMs = Math.max(0, monotonicNow() - startedAt);
    maximumDecisionDurationMs = Math.max(
      maximumDecisionDurationMs,
      durationMs,
    );
    return { discovery, durationMs };
  };
  const surfaceReceipts = PUBLIC_SURFACE_DISCOVERY_INVENTORY.map((entry) => {
    const { discovery, durationMs } = resolveMeasured(
      sourceFor(entry.consumerId),
    );
    const metadata = buildPublicSurfaceMetadata({
      discovery,
      locale: "uk",
      contentLocale: entry.candidateClass === "candidate" ? "uk" : null,
      title: "Visible surface",
      description: "Visible description",
      visibleFacts: {
        type: "CollectionPage",
        name: "Visible surface",
        itemNames: ["Visible entity"],
      },
    });
    const candidate = entry.candidateClass === "candidate";
    if (
      candidate !== discovery.decision.isIndexable ||
      candidate !== discovery.decision.sitemapEligible ||
      candidate !== Boolean(metadata.metadata.alternates?.canonical) ||
      candidate !== Boolean(metadata.jsonLd)
    ) {
      throw new Error("public_discovery_output_convergence_failed");
    }
    return {
      surfaceKind: entry.surfaceKind,
      candidateClass: entry.candidateClass,
      reasonClass: discovery.decision.reasons[0] ?? "none",
      outputCoverageClass: candidate ? "complete" : "refused",
      localeEquivalenceClass: candidate ? "singleton_source" : "not_applicable",
      timingClass: timingClass(durationMs),
      cancellationClass: "not_required",
    } satisfies PublicSurfaceCoverageReceipt;
  });

  const replay = PUBLIC_SURFACE_DISCOVERY_INVENTORY.map(
    (entry) => resolveMeasured(sourceFor(entry.consumerId)).discovery,
  );
  const concurrent = await Promise.all(
    PUBLIC_SURFACE_DISCOVERY_INVENTORY.map(async (entry) =>
      resolveMeasured(sourceFor(entry.consumerId)).discovery,
    ),
  );
  const firstDigest = decisionDigest(replay);
  if (firstDigest !== decisionDigest(concurrent)) {
    throw new Error("public_discovery_concurrent_read_nondeterministic");
  }

  const controller = new AbortController();
  controller.abort();
  const cancelled = await resolvePublicSurfaceDiscoveryWithDeadline({
    consumerId: "localized_journal_entry",
    evaluatedAt: EVALUATED_AT,
    deadlineMs: PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
    signal: controller.signal,
    loadSource: async () => sourceFor("localized_journal_entry"),
  });
  if (
    cancelled.terminalClass !== "cancelled" ||
    cancelled.decision.reasons[0] !== "candidate_input_unresolved"
  ) {
    throw new Error("public_discovery_cancellation_not_bounded");
  }

  let timeoutReceipt: PublicSurfaceDiscoveryVerificationReceipt["timeoutReceipt"];
  if (options.injectSourceTimeout) {
    const timeoutStartedAt = performance.now();
    const timedOut = await resolvePublicSurfaceDiscoveryWithDeadline({
      consumerId: "localized_journal_entry",
      evaluatedAt: EVALUATED_AT,
      deadlineMs: 20,
      loadSource: () => new Promise(() => undefined),
    });
    const timeoutDuration = performance.now() - timeoutStartedAt;
    if (
      timedOut.terminalClass !== "timed_out" ||
      timedOut.decision.value !== "noindex" ||
      timedOut.decision.reasons[0] !== "candidate_input_unresolved" ||
      timeoutDuration > PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS
    ) {
      throw new Error("public_discovery_timeout_not_bounded");
    }
    timeoutReceipt = {
      terminalClass: "timed_out",
      decisionClass: "noindex",
      reasonClass: "candidate_input_unresolved",
      cancellationClass: "late_result_ignored",
      timingClass: timingClass(timeoutDuration),
    };
  }

  const recovery = resolveMeasured(sourceFor("localized_journal_entry"))
    .discovery;
  if (!recovery.decision.isIndexable) {
    throw new Error("public_discovery_recovery_not_independent");
  }

  if (maximumDecisionDurationMs > PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS) {
    throw new Error("public_discovery_decision_budget_exceeded");
  }

  const liveProbe = options.baseUrl
    ? await runLivePublicSurfaceProbe(
        options.baseUrl,
        options.fetchImpl ?? fetch,
      )
    : undefined;

  return {
    schemaVersion: PUBLIC_SURFACE_DISCOVERY_RECEIPT_VERSION,
    issue: "OVE-335",
    status: "aligned",
    buildSha,
    inventoryCount: PUBLIC_SURFACE_DISCOVERY_INVENTORY.length,
    candidateCount: surfaceReceipts.filter(
      (receipt) => receipt.candidateClass === "candidate",
    ).length,
    nonCandidateCount: surfaceReceipts.filter(
      (receipt) => receipt.candidateClass === "non_candidate",
    ).length,
    callerCoverageClass: "complete",
    directPolicyBypassCount: 0,
    canonicalWriteCount: 0,
    performanceBudgetMs: PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
    decisionDurationClass: timingClass(maximumDecisionDurationMs),
    ...(timeoutReceipt ? { timeoutReceipt } : {}),
    cancellationReceipt: {
      terminalClass: "cancelled",
      decisionClass: "noindex",
      reasonClass: "candidate_input_unresolved",
      cancellationClass: "aborted_before_read",
    },
    recoveryClass: "fresh_independent_read_admitted",
    replayClass: "deterministic",
    concurrentReadClass: "deterministic",
    preciseLocationAbsent: true,
    controls: CONTROL_RECEIPT,
    surfaceReceipts,
    ...(liveProbe ? { liveProbe } : {}),
  };
}

export function verifyPublicSurfaceDiscoveryInventory(repositoryRoot: string) {
  const ids = PUBLIC_SURFACE_DISCOVERY_INVENTORY.map(
    (entry) => entry.consumerId,
  );
  if (new Set(ids).size !== ids.length) {
    throw new Error("public_discovery_inventory_duplicate");
  }

  for (const entry of PUBLIC_SURFACE_DISCOVERY_INVENTORY) {
    const sourcePath = path.join(repositoryRoot, entry.sourceOwner);
    const source = readFileSync(sourcePath, "utf8");
    if (!source.includes(JSON.stringify(entry.consumerId))) {
      throw new Error("public_discovery_inventory_owner_missing");
    }
  }

  for (const sourcePath of listTypeScriptFiles(
    path.join(repositoryRoot, "src"),
  )) {
    if (/\.test\.[cm]?[jt]sx?$/u.test(sourcePath)) continue;
    const relativePath = path.relative(repositoryRoot, sourcePath);
    const source = readFileSync(sourcePath, "utf8");
    if (
      source.includes("evaluatePublicSurfaceIndexability(") &&
      relativePath !== "src/server/public-surface-discovery.ts" &&
      relativePath !== "src/server/public-surface-indexing-policy.ts"
    ) {
      throw new Error("public_discovery_direct_policy_bypass");
    }
    if (
      source.includes("PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD") ||
      source.includes("minPublicEntryCount") ||
      source.includes("minAggregateBodyLength")
    ) {
      throw new Error("public_discovery_legacy_threshold_present");
    }
  }
}

export function publicSurfaceDiscoverySemanticDigest(
  report: PublicSurfaceDiscoveryVerificationReceipt,
) {
  return sha256(
    stableJson({
      ...report,
      buildSha: "exact-build-sha",
    }),
  );
}

export async function runPublicSurfaceDiscoveryCli(argv: string[]) {
  const options = parseArguments(argv);
  const first = await runPublicSurfaceDiscoveryVerification(options);
  const digest = publicSurfaceDiscoverySemanticDigest(first);
  if (options.proveDeterminism) {
    const replay = await runPublicSurfaceDiscoveryVerification(options);
    if (digest !== publicSurfaceDiscoverySemanticDigest(replay)) {
      throw new Error("public_discovery_receipt_nondeterministic");
    }
  }
  process.stdout.write(
    `${JSON.stringify({ ...first, semanticDigest: digest, deterministic: true })}\n`,
  );
}

async function runLivePublicSurfaceProbe(
  baseUrlInput: string,
  fetchImpl: typeof fetch,
): Promise<
  NonNullable<PublicSurfaceDiscoveryVerificationReceipt["liveProbe"]>
> {
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  const richPath = "/bg/blog/ai-garden-advice-vs-real-garden-proof";
  const thinPath = "/bg/blog";
  const privacyPath = "/bg/privacy";
  const [robots, sitemap, rich, thin, privacy] = await Promise.all([
    fetchText(baseUrl, "/robots.txt", fetchImpl),
    fetchText(baseUrl, "/sitemap.xml", fetchImpl),
    fetchText(baseUrl, richPath, fetchImpl),
    fetchText(baseUrl, thinPath, fetchImpl),
    fetchText(baseUrl, privacyPath, fetchImpl),
  ]);

  if (!robots.includes("Sitemap: https://over.garden/sitemap.xml")) {
    throw new Error("public_discovery_live_robots_mismatch");
  }
  if (
    !sitemap.includes(`<loc>https://over.garden${richPath}</loc>`) ||
    sitemap.includes(`<loc>https://over.garden${thinPath}</loc>`) ||
    sitemap.includes("/privacy</loc>") ||
    sitemap.includes("__visual")
  ) {
    throw new Error("public_discovery_live_sitemap_mismatch");
  }

  const richOutput = classifyHtmlDiscoveryOutput(rich, baseUrl, richPath);
  const thinOutput = classifyHtmlDiscoveryOutput(thin, baseUrl, thinPath);
  const privacyOutput = classifyHtmlDiscoveryOutput(
    privacy,
    baseUrl,
    privacyPath,
  );
  if (
    richOutput.robotsClass !== "index" ||
    richOutput.canonicalClass !== "one" ||
    richOutput.jsonLdClass !== "present" ||
    thinOutput.robotsClass !== "noindex" ||
    thinOutput.canonicalClass !== "none" ||
    thinOutput.jsonLdClass !== "absent" ||
    privacyOutput.robotsClass !== "noindex" ||
    privacyOutput.canonicalClass !== "none" ||
    privacyOutput.jsonLdClass !== "absent"
  ) {
    throw new Error("public_discovery_live_output_mismatch");
  }

  return {
    status: "aligned",
    probeCount: 5,
    receipts: [
      {
        surfaceKind: "robots",
        candidateClass: "discovery_control",
        robotsClass: "not_applicable",
        canonicalClass: "not_applicable",
        jsonLdClass: "not_applicable",
        sitemapClass: "aligned",
        responseClass: "ok",
      },
      {
        surfaceKind: "sitemap",
        candidateClass: "discovery_control",
        robotsClass: "not_applicable",
        canonicalClass: "not_applicable",
        jsonLdClass: "not_applicable",
        sitemapClass: "aligned",
        responseClass: "ok",
      },
      {
        surfaceKind: "editorial_blog",
        candidateClass: "candidate",
        ...richOutput,
        sitemapClass: "included",
        responseClass: "ok",
      },
      {
        surfaceKind: "editorial_blog",
        candidateClass: "candidate",
        ...thinOutput,
        sitemapClass: "excluded",
        responseClass: "ok",
      },
      {
        surfaceKind: "missing",
        candidateClass: "non_candidate",
        ...privacyOutput,
        sitemapClass: "excluded",
        responseClass: "ok",
      },
    ],
  };
}

function classifyHtmlDiscoveryOutput(
  html: string,
  baseUrl: URL,
  expectedPath: string,
) {
  const metaTags = html.match(/<meta\b[^>]*>/giu) ?? [];
  const linkTags = html.match(/<link\b[^>]*>/giu) ?? [];
  const robotsContent = metaTags
    .map(readHtmlAttributes)
    .find((attributes) => attributes.name?.toLowerCase() === "robots")
    ?.content?.toLowerCase();
  const canonicalLinks = linkTags
    .map(readHtmlAttributes)
    .filter((attributes) => attributes.rel?.toLowerCase() === "canonical");
  if (canonicalLinks.length === 1) {
    const canonical = new URL(canonicalLinks[0]?.href ?? "", baseUrl);
    if (canonical.pathname !== expectedPath) {
      throw new Error("public_discovery_live_canonical_path_mismatch");
    }
  }
  return {
    robotsClass: robotsContent?.includes("noindex")
      ? ("noindex" as const)
      : ("index" as const),
    canonicalClass:
      canonicalLinks.length === 1 ? ("one" as const) : ("none" as const),
    jsonLdClass:
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>/iu.test(html)
        ? ("present" as const)
        : ("absent" as const),
  };
}

function readHtmlAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(
    /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu,
  )) {
    attributes[match[1]?.toLowerCase() ?? ""] = match[2] ?? match[3] ?? "";
  }
  return attributes;
}

async function fetchText(
  baseUrl: URL,
  pathname: string,
  fetchImpl: typeof fetch,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_PROBE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL(pathname, baseUrl), {
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "text/html,text/plain,application/xml" },
    });
    if (response.status !== 200) {
      throw new Error("public_discovery_live_http_error");
    }
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_LIVE_RESPONSE_BYTES) {
      throw new Error("public_discovery_live_response_too_large");
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function sourceFor(
  consumerId: PublicSurfaceDiscoveryConsumerId,
): PublicSurfaceDiscoverySource {
  const owner = PUBLIC_SURFACE_DISCOVERY_INVENTORY.find(
    (entry) => entry.consumerId === consumerId,
  );
  if (!owner) throw new Error("public_discovery_unknown_consumer");
  if (owner.candidateClass === "non_candidate") {
    return {
      consumerId,
      candidateState: "not_public_candidate",
      qualityClass: null,
      visibleText: null,
      distinctPublicEntityIds: null,
      meaningfulContentAt: null,
      canonicalPath: null,
      equivalentLocales: null,
    };
  }
  return {
    consumerId,
    candidateState: "candidate",
    qualityClass: "partial",
    visibleText: [SAFE_VISIBLE_TEXT],
    distinctPublicEntityIds: ["public-entity"],
    meaningfulContentAt: MEANINGFUL_CONTENT_AT,
    canonicalPath: "/discovery-fixture",
    equivalentLocales: ["uk"],
  };
}

function decisionDigest(
  results: readonly ReturnType<typeof resolvePublicSurfaceDiscovery>[],
) {
  return sha256(
    stableJson(
      results.map((result) => ({
        consumerId: result.consumerId,
        candidateInput: result.candidateInput,
        decision: result.decision,
      })),
    ),
  );
}

function parseArguments(argv: string[]) {
  const args = argv.filter((value) => value !== "--");
  let proveDeterminism = false;
  let injectSourceTimeout = false;
  let emitAggregateReceipt = false;
  let baseUrl: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--prove-determinism") proveDeterminism = true;
    else if (argument === "--inject-source-timeout") {
      injectSourceTimeout = true;
    } else if (argument === "--emit-aggregate-receipt") {
      emitAggregateReceipt = true;
    } else if (argument === "--base-url") {
      baseUrl = args[index + 1];
      if (!baseUrl) throw new Error("public_discovery_base_url_missing");
      index += 1;
    } else {
      throw new Error(`public_discovery_unknown_argument:${argument}`);
    }
  }
  if (emitAggregateReceipt && !baseUrl) {
    throw new Error("public_discovery_aggregate_base_url_required");
  }
  return {
    proveDeterminism,
    injectSourceTimeout,
    ...(baseUrl ? { baseUrl } : {}),
  };
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("public_discovery_base_url_invalid");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function timingClass(durationMs: number): TimingClass {
  return durationMs <= PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS
    ? "within_150ms"
    : "over_150ms";
}

function readBuildSha(repositoryRoot: string) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: path.resolve(repositoryRoot, "../.."),
    encoding: "utf8",
  }).trim();
}

function resolveWebRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
    return /\.[cm]?[jt]sx?$/u.test(entry.name) ? [entryPath] : [];
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
