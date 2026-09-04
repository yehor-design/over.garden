import { matchingSupportedKinds } from "@/server/job-queue-manifest";

export const MATCHING_RUNTIME_SCHEMA_VERSION =
  "ove194.matchingRuntime.v1" as const;
export const MATCHING_RUNTIME_SERVICE = "overgarden-matching" as const;
export const MATCHING_RUNTIME_SCHEMA_COMPATIBILITY_CLASS =
  "ove190.matching-schema.v1" as const;
export const MATCHING_RUNTIME_QUEUE_NAME = "matching" as const;

/**
 * Derived, never restated. This list used to be six frozen literals, and the
 * matching image release failed on every push to `main` from 2026-08-28 to
 * 2026-09-04 because `stable_registry_foundation_build` and its two siblings
 * joined the manifest while the copies did not move. The manifest is the
 * builder; everything that needs the set asks for it.
 *
 * Sorted, because the Python runtime reports `sorted(SUPPORTED_JOB_KINDS)` and
 * the comparisons below are order-sensitive on purpose.
 */
export const MATCHING_RUNTIME_REQUIRED_HANDLERS: readonly string[] = [
  ...matchingSupportedKinds(),
].sort();

const DEPENDENCY_STATUSES = {
  postgres: ["available", "unavailable"],
  jobQueue: ["available", "unavailable", "schema_mismatch"],
  meilisearch: ["available", "unavailable"],
  worker: [
    "available",
    // A heartbeat table with no row is not the same as one whose row is stale.
    // The retired endpoints were the only signal that answered before a worker
    // had ever run, so the class they covered is kept explicitly rather than
    // collapsed into `missing`.
    "never_started",
    "missing",
    "stale",
    "release_mismatch",
    "capability_mismatch",
    "unavailable",
  ],
} as const;

const JOB_QUEUE_DEPTH_CLASSES = ["empty", "low", "medium", "high"] as const;
const JOB_QUEUE_LAG_CLASSES = ["none", "fresh", "delayed", "stale"] as const;
const TERMINAL_COUNT_CLASSES = ["empty", "low", "elevated", "high"] as const;
const UNSUPPORTED_RETRYING_CLASSES = ["none", "present", "unknown"] as const;
const CLAIM_COMPATIBLE_STATUSES = [
  "available",
  "unavailable",
  "schema_mismatch",
] as const;
const HANDLER_COMPATIBLE_STATUSES = [
  "available",
  "unavailable",
  "drift",
] as const;

const FORBIDDEN_KEY_FRAGMENTS = [
  "address",
  "authorization",
  "cause",
  "connection",
  "cookie",
  "coordinate",
  "credential",
  "databaseurl",
  "detail",
  "directurl",
  "dsn",
  "email",
  "error",
  "exception",
  "exif",
  "gps",
  "host",
  "hostname",
  "ipaddress",
  "journal",
  "latitude",
  "longitude",
  "message",
  "owner",
  "password",
  "payload",
  "query",
  "secret",
  "session",
  "stack",
  "token",
  "trace",
  "uri",
  "url",
  "user",
] as const;

const FORBIDDEN_EXACT_KEYS = new Set([
  "id",
  "ip",
  "userid",
  "requestid",
  "jobid",
  "entryid",
]);

const FORBIDDEN_VALUE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:https?|postgres(?:ql)?|redis|mysql|mongodb):\/\//i,
  /\b(?:localhost|host\.docker\.internal)\b/i,
  /\b[a-z0-9-]+\.(?:internal|local|invalid|com|net|org|garden)\b/i,
  /\b(?:host|dbname|user|password)=\S+/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\b(?:Traceback|Exception|Error|stack trace|connection refused)\b/i,
] as const;

type RequiredHandler = (typeof MATCHING_RUNTIME_REQUIRED_HANDLERS)[number];
type JobQueueDepthClass = (typeof JOB_QUEUE_DEPTH_CLASSES)[number];
type JobQueueLagClass = (typeof JOB_QUEUE_LAG_CLASSES)[number];

/**
 * Whether the worker's public-projection drain is converging.
 *
 * `unknown` is deliberate and is not a synonym for healthy: it means no
 * heartbeat row said either way. A drain that fails on every attempt used to be
 * indistinguishable from an idle one, and a failed drain is exactly what leaves
 * erased and revoked content in the public index.
 */
export const WORKER_DRAIN_CLASSES = [
  "converging",
  "failing",
  "unknown",
] as const;

export type WorkerDrainClass = (typeof WORKER_DRAIN_CLASSES)[number];

export interface MatchingRuntimeCapabilityOptions {
  expectedCommitSha: string;
  expectedImageDigest: string;
}

/**
 * Everything the runtime proof needs, read from Postgres.
 *
 * The worker already writes its release, digest, handler set, and last-seen
 * time into `matching_worker_heartbeats`. Asking an HTTP service whether it is
 * running was always the weaker signal: a healthy response proved the API was
 * up, not that the worker was claiming jobs.
 */
export interface MatchingRuntimeHeartbeatReadback {
  heartbeat: {
    releaseCommitSha: string;
    imageDigest: string;
    schemaCompatibilityClass: string;
    supportedHandlers: readonly string[];
    isFresh: boolean;
    drainClass: WorkerDrainClass;
  } | null;
  jobQueue: {
    status: (typeof DEPENDENCY_STATUSES.jobQueue)[number];
    depthClass: JobQueueDepthClass;
    lagClass: JobQueueLagClass;
  };
  meilisearchStatus: (typeof DEPENDENCY_STATUSES.meilisearch)[number];
  queueRecovery: MatchingRuntimeReadiness["dependencies"]["queueRecovery"];
}

export type MatchingRuntimeHeartbeatReader =
  () => Promise<MatchingRuntimeHeartbeatReadback>;

export interface MatchingRuntimeRelease {
  commitSha: string;
  imageDigest: string;
  schemaCompatibilityClass: typeof MATCHING_RUNTIME_SCHEMA_COMPATIBILITY_CLASS;
}

export interface MatchingRuntimeQueueCapability {
  name: typeof MATCHING_RUNTIME_QUEUE_NAME;
  supportedHandlers: RequiredHandler[];
}

export interface MatchingRuntimeCapabilities {
  schemaVersion: typeof MATCHING_RUNTIME_SCHEMA_VERSION;
  service: typeof MATCHING_RUNTIME_SERVICE;
  status: "available";
  release: MatchingRuntimeRelease;
  queue: MatchingRuntimeQueueCapability;
}

export interface MatchingRuntimeReadiness extends Omit<
  MatchingRuntimeCapabilities,
  "status"
> {
  status: "ready" | "degraded";
  dependencies: {
    postgres: { status: (typeof DEPENDENCY_STATUSES.postgres)[number] };
    jobQueue: {
      status: (typeof DEPENDENCY_STATUSES.jobQueue)[number];
      depthClass: JobQueueDepthClass;
      lagClass: JobQueueLagClass;
    };
    meilisearch: { status: (typeof DEPENDENCY_STATUSES.meilisearch)[number] };
    worker: {
      status: (typeof DEPENDENCY_STATUSES.worker)[number];
      drainClass: WorkerDrainClass;
    };
    queueRecovery: {
      claimCompatible: (typeof CLAIM_COMPATIBLE_STATUSES)[number];
      handlerCompatible: (typeof HANDLER_COMPATIBLE_STATUSES)[number];
      unsupportedRetryingClass: (typeof UNSUPPORTED_RETRYING_CLASSES)[number];
      terminalCountClass: (typeof TERMINAL_COUNT_CLASSES)[number];
      oldestDueAgeClass: JobQueueLagClass;
    };
  };
}

export interface MatchingRuntimeCapabilityEvidence {
  schemaVersion: "ove194.matchingRuntimeCapabilitySmoke.v1";
  issue: "OVE-194";
  evidenceClass: "matching-runtime-capability-smoke";
  release: MatchingRuntimeRelease;
  queue: MatchingRuntimeQueueCapability;
  readiness: {
    status: "ready";
    dependencies: {
      postgres: "available";
      jobQueue: "available";
      meilisearch: "available";
      worker: "available";
      queueRecovery: "available";
    };
    queueDepthClass: JobQueueDepthClass;
    queueLagClass: JobQueueLagClass;
    unsupportedRetryingClass: (typeof UNSUPPORTED_RETRYING_CLASSES)[number];
    terminalCountClass: (typeof TERMINAL_COUNT_CLASSES)[number];
  };
  leakCheck: "passed";
}

export function parseMatchingRuntimeCapabilityArgs(
  argv: string[],
): Partial<MatchingRuntimeCapabilityOptions> {
  const options: Partial<MatchingRuntimeCapabilityOptions> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;

    switch (arg) {
      case "--base-url":
        throw new Error(
          "--base-url is retired: the matching runtime proof reads the worker heartbeat row, not an HTTP service.",
        );
      case "--expected-commit":
        options.expectedCommitSha = requireOptionValue(argv[index + 1]);
        index += 1;
        break;
      case "--expected-digest":
        options.expectedImageDigest = requireOptionValue(argv[index + 1]);
        index += 1;
        break;
      default:
        throw new Error("Unsupported matching runtime smoke option.");
    }
  }

  return options;
}

export function validateMatchingRuntimeCapabilityOptions(
  options: Partial<MatchingRuntimeCapabilityOptions>,
): MatchingRuntimeCapabilityOptions {
  if (!isCommitSha(options.expectedCommitSha)) {
    throw new Error("--expected-commit must be a lowercase 40-character SHA.");
  }
  if (!isImageDigest(options.expectedImageDigest)) {
    throw new Error("--expected-digest must be a lowercase sha256 digest.");
  }

  return {
    expectedCommitSha: options.expectedCommitSha,
    expectedImageDigest: options.expectedImageDigest,
  };
}

export function buildMatchingRuntimeCapabilityEvidence(input: {
  options: MatchingRuntimeCapabilityOptions;
  capabilities: unknown;
  readiness: unknown;
}): MatchingRuntimeCapabilityEvidence {
  const options = validateMatchingRuntimeCapabilityOptions(input.options);
  assertNoForbiddenMatchingRuntimeEvidence(
    input.capabilities,
    "capability response",
  );
  assertNoForbiddenMatchingRuntimeEvidence(
    input.readiness,
    "readiness response",
  );

  const capabilities = parseCapabilities(input.capabilities, "capabilities");
  const readiness = parseReadiness(input.readiness);

  assertExpectedRelease(capabilities.release, options);
  assertExpectedRelease(readiness.release, options);
  assertSameRelease(capabilities.release, readiness.release);
  assertSameQueue(capabilities.queue, readiness.queue);

  if (readiness.status !== "ready") {
    throw new Error("Matching runtime readiness is degraded.");
  }
  for (const dependency of [
    "postgres",
    "jobQueue",
    "meilisearch",
    "worker",
  ] as const) {
    if (readiness.dependencies[dependency].status !== "available") {
      throw new Error("A required matching runtime dependency is unavailable.");
    }
  }
  if (
    readiness.dependencies.queueRecovery.claimCompatible !== "available" ||
    readiness.dependencies.queueRecovery.handlerCompatible !== "available" ||
    readiness.dependencies.queueRecovery.unsupportedRetryingClass !== "none"
  ) {
    throw new Error("Matching queue recovery readiness is degraded.");
  }

  const evidence: MatchingRuntimeCapabilityEvidence = {
    schemaVersion: "ove194.matchingRuntimeCapabilitySmoke.v1",
    issue: "OVE-194",
    evidenceClass: "matching-runtime-capability-smoke",
    release: capabilities.release,
    queue: capabilities.queue,
    readiness: {
      status: "ready",
      dependencies: {
        postgres: "available",
        jobQueue: "available",
        meilisearch: "available",
        worker: "available",
        queueRecovery: "available",
      },
      queueDepthClass: readiness.dependencies.jobQueue.depthClass,
      queueLagClass: readiness.dependencies.jobQueue.lagClass,
      unsupportedRetryingClass:
        readiness.dependencies.queueRecovery.unsupportedRetryingClass,
      terminalCountClass: readiness.dependencies.queueRecovery.terminalCountClass,
    },
    leakCheck: "passed",
  };

  assertNoForbiddenMatchingRuntimeEvidence(evidence, "smoke evidence");
  return evidence;
}

/**
 * Builds the runtime proof from the worker's own heartbeat row.
 *
 * The retired endpoints reported the worker's release, digest, handler set, and
 * last-seen time — every one of which the worker already writes to Postgres. The
 * contract, its parsers, and its evidence shape are unchanged; only the source
 * moved, and it moved to the stronger one. A healthy HTTP response proved the
 * API was up, never that the worker was claiming jobs.
 */
export async function runMatchingRuntimeCapabilitySmokeFromHeartbeat(
  options: MatchingRuntimeCapabilityOptions,
  readHeartbeat: MatchingRuntimeHeartbeatReader,
): Promise<MatchingRuntimeCapabilityEvidence> {
  const validated = validateMatchingRuntimeCapabilityOptions(options);
  const readback = await readHeartbeat();
  const { capabilities, readiness } = buildRuntimeDocumentsFromHeartbeat(
    readback,
    validated,
  );

  return buildMatchingRuntimeCapabilityEvidence({
    options: validated,
    capabilities,
    readiness,
  });
}

/**
 * Reconstructs the two documents the endpoints used to serve.
 *
 * A worker that has never written a heartbeat gets `never_started`, not
 * `missing`. The endpoints were the only thing that could answer before a first
 * run, so the class they covered is kept rather than collapsed into the one that
 * means "there should be a row here and there is not".
 */
export function buildRuntimeDocumentsFromHeartbeat(
  readback: MatchingRuntimeHeartbeatReadback,
  options: MatchingRuntimeCapabilityOptions,
): { capabilities: unknown; readiness: unknown } {
  const heartbeat = readback.heartbeat;
  const release = {
    commitSha: heartbeat?.releaseCommitSha ?? options.expectedCommitSha,
    imageDigest: heartbeat?.imageDigest ?? options.expectedImageDigest,
    schemaCompatibilityClass:
      heartbeat?.schemaCompatibilityClass ??
      MATCHING_RUNTIME_SCHEMA_COMPATIBILITY_CLASS,
  };
  const queue = {
    name: MATCHING_RUNTIME_QUEUE_NAME,
    supportedHandlers: heartbeat
      ? [...heartbeat.supportedHandlers]
      : [...MATCHING_RUNTIME_REQUIRED_HANDLERS],
  };

  const workerStatus = classifyWorkerFromHeartbeat(heartbeat, options);
  const ready =
    workerStatus === "available" &&
    readback.jobQueue.status === "available" &&
    readback.meilisearchStatus === "available" &&
    readback.queueRecovery.claimCompatible === "available" &&
    readback.queueRecovery.handlerCompatible === "available" &&
    readback.queueRecovery.unsupportedRetryingClass === "none";

  return {
    capabilities: {
      schemaVersion: MATCHING_RUNTIME_SCHEMA_VERSION,
      service: MATCHING_RUNTIME_SERVICE,
      status: "available",
      release,
      queue,
    },
    readiness: {
      schemaVersion: MATCHING_RUNTIME_SCHEMA_VERSION,
      service: MATCHING_RUNTIME_SERVICE,
      status: ready ? "ready" : "degraded",
      release,
      queue,
      dependencies: {
        postgres: { status: "available" },
        jobQueue: {
          status: readback.jobQueue.status,
          depthClass: readback.jobQueue.depthClass,
          lagClass: readback.jobQueue.lagClass,
        },
        meilisearch: { status: readback.meilisearchStatus },
        worker: {
          status: workerStatus,
          drainClass: heartbeat?.drainClass ?? "unknown",
        },
        queueRecovery: { ...readback.queueRecovery },
      },
    },
  };
}

function classifyWorkerFromHeartbeat(
  heartbeat: MatchingRuntimeHeartbeatReadback["heartbeat"],
  options: MatchingRuntimeCapabilityOptions,
): (typeof DEPENDENCY_STATUSES.worker)[number] {
  if (!heartbeat) return "never_started";
  if (!heartbeat.isFresh) return "stale";
  if (
    heartbeat.releaseCommitSha !== options.expectedCommitSha ||
    heartbeat.imageDigest !== options.expectedImageDigest ||
    heartbeat.schemaCompatibilityClass !==
      MATCHING_RUNTIME_SCHEMA_COMPATIBILITY_CLASS
  ) {
    return "release_mismatch";
  }
  const handlers = [...heartbeat.supportedHandlers].sort();
  const required = [...MATCHING_RUNTIME_REQUIRED_HANDLERS].sort();
  if (handlers.join(",") !== required.join(",")) return "capability_mismatch";
  return "available";
}

export function assertNoForbiddenMatchingRuntimeEvidence(
  value: unknown,
  label: string,
): void {
  const seen = new Set<object>();

  function visit(candidate: unknown): void {
    if (typeof candidate === "string") {
      if (FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(candidate))) {
        throw new Error(`${label} contains a forbidden value.`);
      }
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    if (seen.has(candidate)) {
      throw new Error(`${label} contains a recursive object.`);
    }
    seen.add(candidate);

    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      seen.delete(candidate);
      return;
    }

    for (const [key, nested] of Object.entries(candidate)) {
      const normalizedKey = normalizeKey(key);
      if (
        FORBIDDEN_EXACT_KEYS.has(normalizedKey) ||
        normalizedKey.endsWith("id") ||
        normalizedKey.endsWith("ids") ||
        FORBIDDEN_KEY_FRAGMENTS.some((fragment) =>
          normalizedKey.includes(fragment),
        )
      ) {
        throw new Error(`${label} contains a forbidden key.`);
      }
      visit(nested);
    }
    seen.delete(candidate);
  }

  visit(value);
}


function parseCapabilities(
  value: unknown,
  label: "capabilities" | "readiness",
): MatchingRuntimeCapabilities {
  const record = requireRecord(value, `${label} response`);
  assertExactKeys(
    record,
    ["schemaVersion", "service", "status", "release", "queue"],
    `${label} response`,
  );
  if (record.schemaVersion !== MATCHING_RUNTIME_SCHEMA_VERSION) {
    throw new Error(`Matching runtime ${label} schema is incompatible.`);
  }
  if (record.service !== MATCHING_RUNTIME_SERVICE) {
    throw new Error(`Matching runtime ${label} service is incompatible.`);
  }
  if (record.status !== "available") {
    throw new Error(`Matching runtime ${label} status is incompatible.`);
  }

  return {
    schemaVersion: MATCHING_RUNTIME_SCHEMA_VERSION,
    service: MATCHING_RUNTIME_SERVICE,
    status: "available",
    release: parseRelease(record.release, label),
    queue: parseQueue(record.queue, label),
  };
}

function parseReadiness(value: unknown): MatchingRuntimeReadiness {
  const record = requireRecord(value, "readiness response");
  assertExactKeys(
    record,
    ["schemaVersion", "service", "release", "queue", "status", "dependencies"],
    "readiness response",
  );
  const capabilityFields = parseCapabilities(
    {
      schemaVersion: record.schemaVersion,
      service: record.service,
      status: "available",
      release: record.release,
      queue: record.queue,
    },
    "readiness",
  );
  if (record.status !== "ready" && record.status !== "degraded") {
    throw new Error("Matching runtime readiness status is not bounded.");
  }

  const dependencies = requireRecord(
    record.dependencies,
    "readiness dependencies",
  );
  assertExactKeys(
    dependencies,
    ["postgres", "jobQueue", "meilisearch", "worker", "queueRecovery"],
    "readiness dependencies",
  );

  return {
    schemaVersion: capabilityFields.schemaVersion,
    service: capabilityFields.service,
    release: capabilityFields.release,
    queue: capabilityFields.queue,
    status: record.status,
    dependencies: {
      postgres: parseDependencyStatus(dependencies.postgres, "postgres"),
      jobQueue: parseJobQueueStatus(dependencies.jobQueue),
      meilisearch: parseDependencyStatus(
        dependencies.meilisearch,
        "meilisearch",
      ),
      worker: parseWorkerDependency(dependencies.worker),
      queueRecovery: parseQueueRecovery(dependencies.queueRecovery),
    },
  };
}

function parseQueueRecovery(value: unknown): MatchingRuntimeReadiness["dependencies"]["queueRecovery"] {
  const recovery = requireRecord(value, "queueRecovery");
  assertExactKeys(
    recovery,
    [
      "claimCompatible",
      "handlerCompatible",
      "unsupportedRetryingClass",
      "terminalCountClass",
      "oldestDueAgeClass",
    ],
    "queueRecovery",
  );
  if (
    !CLAIM_COMPATIBLE_STATUSES.includes(
      recovery.claimCompatible as (typeof CLAIM_COMPATIBLE_STATUSES)[number],
    )
  ) {
    throw new Error("Matching runtime queueRecovery claimCompatible is invalid.");
  }
  if (
    !HANDLER_COMPATIBLE_STATUSES.includes(
      recovery.handlerCompatible as (typeof HANDLER_COMPATIBLE_STATUSES)[number],
    )
  ) {
    throw new Error(
      "Matching runtime queueRecovery handlerCompatible is invalid.",
    );
  }
  if (
    !UNSUPPORTED_RETRYING_CLASSES.includes(
      recovery.unsupportedRetryingClass as (typeof UNSUPPORTED_RETRYING_CLASSES)[number],
    )
  ) {
    throw new Error(
      "Matching runtime queueRecovery unsupportedRetryingClass is invalid.",
    );
  }
  if (
    !TERMINAL_COUNT_CLASSES.includes(
      recovery.terminalCountClass as (typeof TERMINAL_COUNT_CLASSES)[number],
    )
  ) {
    throw new Error(
      "Matching runtime queueRecovery terminalCountClass is invalid.",
    );
  }
  if (
    !JOB_QUEUE_LAG_CLASSES.includes(
      recovery.oldestDueAgeClass as JobQueueLagClass,
    )
  ) {
    throw new Error(
      "Matching runtime queueRecovery oldestDueAgeClass is invalid.",
    );
  }

  return {
    claimCompatible:
      recovery.claimCompatible as (typeof CLAIM_COMPATIBLE_STATUSES)[number],
    handlerCompatible:
      recovery.handlerCompatible as (typeof HANDLER_COMPATIBLE_STATUSES)[number],
    unsupportedRetryingClass:
      recovery.unsupportedRetryingClass as (typeof UNSUPPORTED_RETRYING_CLASSES)[number],
    terminalCountClass:
      recovery.terminalCountClass as (typeof TERMINAL_COUNT_CLASSES)[number],
    oldestDueAgeClass: recovery.oldestDueAgeClass as JobQueueLagClass,
  };
}

function parseRelease(value: unknown, label: string): MatchingRuntimeRelease {
  const release = requireRecord(value, `${label} release`);
  assertExactKeys(
    release,
    ["commitSha", "imageDigest", "schemaCompatibilityClass"],
    `${label} release`,
  );
  if (!isCommitSha(release.commitSha)) {
    throw new Error(`Matching runtime ${label} commit SHA is invalid.`);
  }
  if (!isImageDigest(release.imageDigest)) {
    throw new Error(`Matching runtime ${label} image digest is invalid.`);
  }
  if (
    release.schemaCompatibilityClass !==
    MATCHING_RUNTIME_SCHEMA_COMPATIBILITY_CLASS
  ) {
    throw new Error(`Matching runtime ${label} schema class is incompatible.`);
  }

  return {
    commitSha: release.commitSha,
    imageDigest: release.imageDigest,
    schemaCompatibilityClass: MATCHING_RUNTIME_SCHEMA_COMPATIBILITY_CLASS,
  };
}

function parseQueue(
  value: unknown,
  label: string,
): MatchingRuntimeQueueCapability {
  const queue = requireRecord(value, `${label} queue`);
  assertExactKeys(queue, ["name", "supportedHandlers"], `${label} queue`);
  if (queue.name !== MATCHING_RUNTIME_QUEUE_NAME) {
    throw new Error(`Matching runtime ${label} queue is incompatible.`);
  }
  if (!Array.isArray(queue.supportedHandlers)) {
    throw new Error(`Matching runtime ${label} handlers are invalid.`);
  }
  if (
    queue.supportedHandlers.length !==
      MATCHING_RUNTIME_REQUIRED_HANDLERS.length ||
    queue.supportedHandlers.some(
      (handler, index) => handler !== MATCHING_RUNTIME_REQUIRED_HANDLERS[index],
    )
  ) {
    throw new Error(
      `Matching runtime ${label} handlers do not match the required set.`,
    );
  }

  return {
    name: MATCHING_RUNTIME_QUEUE_NAME,
    supportedHandlers: [...MATCHING_RUNTIME_REQUIRED_HANDLERS],
  };
}

function parseDependencyStatus<Name extends "postgres" | "meilisearch">(
  value: unknown,
  name: Name,
): { status: (typeof DEPENDENCY_STATUSES)[Name][number] } {
  const dependency = requireRecord(value, `${name} dependency`);
  assertExactKeys(dependency, ["status"], `${name} dependency`);
  const allowed = DEPENDENCY_STATUSES[name] as readonly unknown[];
  if (!allowed.includes(dependency.status)) {
    throw new Error("Matching runtime dependency status is not bounded.");
  }
  return {
    status: dependency.status as (typeof DEPENDENCY_STATUSES)[Name][number],
  };
}

/**
 * The worker dependency carries one field the others do not.
 *
 * It is parsed separately rather than made optional: an absent `drainClass`
 * would read as healthy, and the whole reason the field exists is that silence
 * used to be indistinguishable from a drain failing on every attempt.
 */
function parseWorkerDependency(
  value: unknown,
): MatchingRuntimeReadiness["dependencies"]["worker"] {
  const dependency = requireRecord(value, "worker dependency");
  assertExactKeys(dependency, ["status", "drainClass"], "worker dependency");
  const allowed = DEPENDENCY_STATUSES.worker as readonly unknown[];
  if (!allowed.includes(dependency.status)) {
    throw new Error("Matching runtime dependency status is not bounded.");
  }
  if (!(WORKER_DRAIN_CLASSES as readonly unknown[]).includes(dependency.drainClass)) {
    throw new Error("Matching runtime worker drain class is not bounded.");
  }
  return {
    status: dependency.status as (typeof DEPENDENCY_STATUSES.worker)[number],
    drainClass: dependency.drainClass as WorkerDrainClass,
  };
}

function parseJobQueueStatus(
  value: unknown,
): MatchingRuntimeReadiness["dependencies"]["jobQueue"] {
  const dependency = requireRecord(value, "job queue dependency");
  assertExactKeys(
    dependency,
    ["status", "depthClass", "lagClass"],
    "job queue dependency",
  );
  if (!includes(DEPENDENCY_STATUSES.jobQueue, dependency.status)) {
    throw new Error("Matching runtime job queue status is not bounded.");
  }
  if (!includes(JOB_QUEUE_DEPTH_CLASSES, dependency.depthClass)) {
    throw new Error("Matching runtime job queue depth class is not bounded.");
  }
  if (!includes(JOB_QUEUE_LAG_CLASSES, dependency.lagClass)) {
    throw new Error("Matching runtime job queue lag class is not bounded.");
  }

  return {
    status: dependency.status,
    depthClass: dependency.depthClass,
    lagClass: dependency.lagClass,
  };
}

function assertExpectedRelease(
  release: MatchingRuntimeRelease,
  options: MatchingRuntimeCapabilityOptions,
): void {
  if (release.commitSha !== options.expectedCommitSha) {
    throw new Error("Matching runtime commit does not match the expected SHA.");
  }
  if (release.imageDigest !== options.expectedImageDigest) {
    throw new Error(
      "Matching runtime image does not match the expected digest.",
    );
  }
}

function assertSameRelease(
  capabilities: MatchingRuntimeRelease,
  readiness: MatchingRuntimeRelease,
): void {
  if (
    capabilities.commitSha !== readiness.commitSha ||
    capabilities.imageDigest !== readiness.imageDigest ||
    capabilities.schemaCompatibilityClass !== readiness.schemaCompatibilityClass
  ) {
    throw new Error(
      "Matching runtime capability and readiness releases differ.",
    );
  }
}

function assertSameQueue(
  capabilities: MatchingRuntimeQueueCapability,
  readiness: MatchingRuntimeQueueCapability,
): void {
  if (
    capabilities.name !== readiness.name ||
    capabilities.supportedHandlers.some(
      (handler, index) => handler !== readiness.supportedHandlers[index],
    )
  ) {
    throw new Error("Matching runtime capability and readiness queues differ.");
  }
}

function assertExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new Error(`${label} contains an incompatible field set.`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireOptionValue(value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error("Matching runtime smoke option is missing a value.");
  }
  return value;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isCommitSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function isImageDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}



function includes<const Values extends readonly string[]>(
  values: Values,
  candidate: unknown,
): candidate is Values[number] {
  return typeof candidate === "string" && values.includes(candidate);
}
