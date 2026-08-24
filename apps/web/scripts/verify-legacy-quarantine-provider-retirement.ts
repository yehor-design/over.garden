import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdtemp,
  open,
  readFile,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv, promisify } from "node:util";

import {
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Pool } from "pg";

import { collectRetiredJournalMediaRuntimeFindings } from "./verify-retired-journal-media-runtime";

export const OVE350_ACCOUNT_ID = "cb03b15042adc74edfe2d8201636300a" as const;
export const OVE350_TARGET_BUCKET = "overgarden-quarantine" as const;
export const OVE350_HORIZON_START_AT = "2026-08-24T13:05:51.416Z" as const;
export const OVE350_FIRST_READ_EARLIEST_AT =
  "2026-08-24T13:45:54.000Z" as const;
export const OVE350_HORIZON_WAIVER_AT = "2026-08-24T13:45:54.000Z" as const;
export const OVE350_APPLY_CONFIRMATION =
  "delete-approved-empty-overgarden-quarantine" as const;
export const OVE350_CORS_SHAPE = {
  ruleId: "overgarden-quarantine-browser-upload",
  origins: [
    "http://localhost:3000",
    "https://over.garden",
    "https://www.over.garden",
    "https://over-garden.vercel.app",
    "https://over-garden-git-codex-ove-27-pr-a698a5-yehors-projects-01221e2b.vercel.app",
  ],
  methods: ["PUT", "HEAD"],
  allowedHeaders: ["*"],
  exposedHeaders: ["ETag"],
  maxAgeSeconds: 3_600,
} as const;
export const OVE350_LIFECYCLE_SHAPE = {
  ruleId: "delete-quarantine-originals-after-1-day",
  enabled: true,
  prefix: "quarantine/",
  objectExpirationDays: 1,
  abortMultipartDays: 1,
} as const;

const MINIMUM_READ_SEPARATION_MS = 60 * 1_000;
const IMMEDIATE_READ_MAX_AGE_MS = 5 * 60 * 1_000;
const VERIFICATION_BUDGET_MS = 60_000;
const PROVIDER_COMMAND_TIMEOUT_MS = 30_000;
const OVE350_ENDPOINT =
  `https://${OVE350_ACCOUNT_ID}.r2.cloudflarestorage.com` as const;
const OVE350_PUBLIC_BUCKET = "overgarden-public" as const;
const OVE350_STAGING_BUCKET = "overgarden-media-staging" as const;
const OVE350_DATABASE = {
  hostname:
    "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com",
  port: "25060",
  pathname: "/defaultdb",
} as const;
const OVE350_RETIRED_ROUTE =
  /^\/api\/(?:garden\/drafts|media\/(?:uploads|process))(?:\/|$)/;
const execFileAsync = promisify(execFile);

export type Ove350CredentialScope =
  | "legacy_exclusive"
  | "shared_public_legacy"
  | "public_only"
  | "unknown";

export interface Ove350ReadReceipt {
  version: "ove350.zeroRead.v1";
  environment: "production";
  accountId: typeof OVE350_ACCOUNT_ID;
  horizonStartAt: typeof OVE350_HORIZON_START_AT;
  observedAt: string;
  target: {
    bucket: typeof OVE350_TARGET_BUCKET;
    exists: boolean;
    objectCount: number;
    totalBytes: number;
    multipartUploads: number;
    corsDigest: string;
    lifecycleDigest: string;
    publicAccess: boolean;
  };
  application: {
    deploymentSha: string;
    deploymentReadyAt: string;
    legacyEnvReferences: number;
    legacyRouteRequests: number;
    server5xx: number;
    logWindowComplete: boolean;
  };
  database: {
    contractedSchema: boolean;
    legacyJobsOrClaims: number;
  };
  repository: {
    legacyRuntimeReferences: number;
  };
  preserved: {
    publicBucketPresent: boolean;
    stagingBucketPresent: boolean;
    publicDomainHealthy: boolean;
    stagingWorkerHealthy: boolean;
  };
  credentials: {
    observerScope: Ove350CredentialScope;
    applicationScope: Ove350CredentialScope;
    observerDetached: boolean;
  };
  durationMs: number;
}

export type Ove350ReadClassification =
  | { state: "eligible_zero"; reason: "exact_zero_state" }
  | { state: "observing"; reason: "horizon_incomplete" }
  | { state: "already_absent"; reason: "exact_target_absent" }
  | { state: "blocked"; reason: string }
  | { state: "drift"; reason: string };

export interface Ove350Plan {
  version: "ove350.providerRetirementPlan.v1";
  environment: "production";
  accountId: typeof OVE350_ACCOUNT_ID;
  targetBucket: typeof OVE350_TARGET_BUCKET;
  horizonStartAt: typeof OVE350_HORIZON_START_AT;
  safetyGate: {
    class: "founder_authorized_immediate_retirement";
    waivedAt: typeof OVE350_HORIZON_WAIVER_AT;
    minimumReadSeparationSeconds: 60;
  };
  firstReadAt: string;
  secondReadAt: string;
  targetConfig: {
    corsDigest: string;
    lifecycleDigest: string;
    publicAccess: false;
    location: "EEUR";
    storageClass: "Standard";
    cors: typeof OVE350_CORS_SHAPE;
    lifecycle: typeof OVE350_LIFECYCLE_SHAPE;
  };
  applicationBaseline: {
    deploymentSha: string;
    deploymentReadyAt: string;
    firstReceiptDigest: string;
    secondReceiptDigest: string;
  };
  credentialAction:
    | "narrow_shared_to_public_only_in_place"
    | "revoke_legacy_exclusive_after_delete";
  intendedMutation: {
    deleteExactEmptyBucket: typeof OVE350_TARGET_BUCKET;
    preservePublicBucket: "overgarden-public";
    preserveStagingBucket: "overgarden-media-staging";
    preservePublicDomain: "media.over.garden";
    preserveStagingDomain: "media-stage.over.garden";
    preserveRetiredEnvAbsence: true;
  };
  rollback: {
    emptyBucketShape: {
      bucket: typeof OVE350_TARGET_BUCKET;
      corsDigest: string;
      lifecycleDigest: string;
      publicAccess: false;
      restoreBytes: false;
      location: "eeur";
      storageClass: "Standard";
      cors: typeof OVE350_CORS_SHAPE;
      lifecycle: typeof OVE350_LIFECYCLE_SHAPE;
    };
  };
  planDigest: string;
}

export interface Ove350ApprovalReceipt {
  version: "ove350.destructiveApproval.v1";
  decision: "approved";
  authorityClass: "maintainer";
  environment: "production";
  accountId: typeof OVE350_ACCOUNT_ID;
  targetBucket: typeof OVE350_TARGET_BUCKET;
  planDigest: string;
  approvedAt: string;
}

export interface Ove350TerminalReceipt {
  version: "ove350.providerRetirement.v1";
  terminalState: "verified";
  replay: boolean;
  environment: "production";
  accountId: typeof OVE350_ACCOUNT_ID;
  targetBucket: typeof OVE350_TARGET_BUCKET;
  planDigest: string;
  targetAbsentReads: 2;
  credentialAction: Ove350Plan["credentialAction"];
  preservedCanaries: "passed";
  rollback: "not_required";
  receiptDigest: string;
}

export interface Ove350RetirementDependencies {
  acquireLock: () => Promise<() => Promise<void>>;
  collectImmediateRead: () => Promise<Ove350ReadReceipt>;
  deleteExactBucket: (bucket: typeof OVE350_TARGET_BUCKET) => Promise<void>;
  convergeCredential: (action: Ove350Plan["credentialAction"]) => Promise<void>;
  readTargetAbsent: () => Promise<boolean>;
  waitBeforeSecondAbsenceRead: () => Promise<void>;
  verifyPreservedCanaries: () => Promise<boolean>;
  recreateEmptyBucket: (
    shape: Ove350Plan["rollback"]["emptyBucketShape"],
  ) => Promise<void>;
  now: () => Date;
}

export type Ove350OperatorArgs =
  | {
      mode: "read_only_plan";
      environment: "production";
      confirmEnvironment: "production";
      previousReadReceipt?: string;
    }
  | {
      mode: "apply";
      environment: "production";
      confirmEnvironment: "production";
      planFile: string;
      approvalFile: string;
      approvedPlanDigest: string;
      confirmProduction: typeof OVE350_APPLY_CONFIRMATION;
    }
  | {
      mode: "final_readback";
      environment: "production";
      confirmEnvironment: "production";
      expectedGitSha: string;
      planFile: string;
    };

export function parseOve350Args(argv: readonly string[]): Ove350OperatorArgs {
  const flags = new Set(["read-only-plan", "apply", "final-readback"]);
  const values = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error(`Invalid OVE-350 argument near ${token ?? "end"}.`);
    }
    const name = token.slice(2);
    if (values.has(name)) throw new Error(`Duplicate --${name} argument.`);
    if (flags.has(name)) {
      values.set(name, true);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`A value is required for --${name}.`);
    }
    values.set(name, value);
    index += 1;
  }

  const supported = new Set([
    ...flags,
    "environment",
    "confirm-environment",
    "previous-read-receipt",
    "plan-file",
    "approval-file",
    "approved-plan-digest",
    "confirm-production",
    "expected-git-sha",
  ]);
  for (const name of values.keys()) {
    if (!supported.has(name))
      throw new Error(`Unsupported --${name} argument.`);
  }

  if (
    value(values, "environment") !== "production" ||
    value(values, "confirm-environment") !== "production"
  ) {
    throw new Error(
      "OVE-350 requires exact production environment confirmation.",
    );
  }
  const selectedModes = [...flags].filter((flag) => values.get(flag) === true);
  if (selectedModes.length !== 1) {
    throw new Error("Choose exactly one OVE-350 operator mode.");
  }

  if (values.get("read-only-plan") === true) {
    const previousReadReceipt = value(values, "previous-read-receipt");
    return {
      mode: "read_only_plan",
      environment: "production",
      confirmEnvironment: "production",
      ...(previousReadReceipt ? { previousReadReceipt } : {}),
    };
  }
  if (values.get("apply") === true) {
    const planFile = requiredValue(values, "plan-file", "plan file");
    const approvalFile = requiredValue(
      values,
      "approval-file",
      "approval file",
    );
    const approvedPlanDigest = requiredSha256(
      values,
      "approved-plan-digest",
      "approved plan digest",
    );
    const confirmProduction = value(values, "confirm-production");
    if (confirmProduction !== OVE350_APPLY_CONFIRMATION) {
      throw new Error("The exact OVE-350 production confirmation is required.");
    }
    return {
      mode: "apply",
      environment: "production",
      confirmEnvironment: "production",
      planFile,
      approvalFile,
      approvedPlanDigest,
      confirmProduction,
    };
  }

  return {
    mode: "final_readback",
    environment: "production",
    confirmEnvironment: "production",
    expectedGitSha: requiredGitSha(values, "expected-git-sha"),
    planFile: requiredValue(values, "plan-file", "plan file"),
  };
}

export function classifyOve350Read(
  receipt: Ove350ReadReceipt,
): Ove350ReadClassification {
  assertOve350ReceiptRedacted(receipt);
  if (receipt.version !== "ove350.zeroRead.v1") {
    return { state: "drift", reason: "receipt_version_mismatch" };
  }
  if (receipt.environment !== "production") {
    return { state: "drift", reason: "environment_identity_mismatch" };
  }
  if (receipt.accountId !== OVE350_ACCOUNT_ID) {
    return { state: "drift", reason: "account_identity_mismatch" };
  }
  if (
    receipt.target.bucket !== OVE350_TARGET_BUCKET ||
    receipt.horizonStartAt !== OVE350_HORIZON_START_AT
  ) {
    return { state: "drift", reason: "target_identity_mismatch" };
  }
  if (!isIsoInstant(receipt.observedAt)) {
    return { state: "drift", reason: "observed_at_invalid" };
  }
  if (
    Date.parse(receipt.observedAt) < Date.parse(OVE350_FIRST_READ_EARLIEST_AT)
  ) {
    return { state: "observing", reason: "horizon_incomplete" };
  }
  if (
    !Number.isFinite(receipt.durationMs) ||
    receipt.durationMs < 0 ||
    receipt.durationMs > VERIFICATION_BUDGET_MS
  ) {
    return { state: "drift", reason: "verification_budget_invalid" };
  }
  if (!/^[a-f0-9]{40}$/.test(receipt.application.deploymentSha)) {
    return { state: "drift", reason: "deployment_sha_invalid" };
  }
  if (
    !isIsoInstant(receipt.application.deploymentReadyAt) ||
    Date.parse(receipt.application.deploymentReadyAt) <
      Date.parse(OVE350_HORIZON_START_AT)
  ) {
    return { state: "drift", reason: "deployment_identity_mismatch" };
  }
  for (const [name, count] of [
    ["objects", receipt.target.objectCount],
    ["bytes", receipt.target.totalBytes],
    ["multipart", receipt.target.multipartUploads],
    ["legacy_env", receipt.application.legacyEnvReferences],
    ["legacy_routes", receipt.application.legacyRouteRequests],
    ["server_5xx", receipt.application.server5xx],
    ["legacy_jobs", receipt.database.legacyJobsOrClaims],
    ["runtime_references", receipt.repository.legacyRuntimeReferences],
  ] as const) {
    if (!Number.isSafeInteger(count) || count < 0) {
      return { state: "drift", reason: `${name}_count_invalid` };
    }
    if (count !== 0) return { state: "blocked", reason: `${name}_remain` };
  }
  if (!receipt.application.logWindowComplete) {
    return { state: "blocked", reason: "route_log_window_incomplete" };
  }
  if (!receipt.database.contractedSchema) {
    return { state: "blocked", reason: "database_contract_not_converged" };
  }
  if (receipt.target.publicAccess) {
    return { state: "blocked", reason: "target_public_access_enabled" };
  }
  if (
    !isSha256(receipt.target.corsDigest) ||
    !isSha256(receipt.target.lifecycleDigest)
  ) {
    return { state: "drift", reason: "target_config_digest_invalid" };
  }
  if (Object.values(receipt.preserved).some((present) => !present)) {
    return { state: "blocked", reason: "preserved_surface_unhealthy" };
  }
  if (
    receipt.credentials.observerScope === "unknown" ||
    receipt.credentials.applicationScope === "unknown"
  ) {
    return { state: "drift", reason: "credential_scope_unknown" };
  }
  if (!receipt.target.exists) {
    return { state: "already_absent", reason: "exact_target_absent" };
  }
  return { state: "eligible_zero", reason: "exact_zero_state" };
}

export function buildOve350Plan(
  first: Ove350ReadReceipt,
  second: Ove350ReadReceipt,
): Ove350Plan {
  const firstClassification = classifyOve350Read(first);
  const secondClassification = classifyOve350Read(second);
  if (firstClassification.state !== "eligible_zero") {
    throw new Error(
      `OVE-350 first read is not eligible zero state: ${firstClassification.reason}.`,
    );
  }
  if (secondClassification.state !== "eligible_zero") {
    throw new Error(
      `OVE-350 second read is not eligible zero state: ${secondClassification.reason}.`,
    );
  }
  if (
    Date.parse(second.observedAt) - Date.parse(first.observedAt) <
    MINIMUM_READ_SEPARATION_MS
  ) {
    throw new Error("OVE-350 zero reads must be at least 60 seconds apart.");
  }
  if (
    first.accountId !== second.accountId ||
    first.target.bucket !== second.target.bucket ||
    first.target.corsDigest !== second.target.corsDigest ||
    first.target.lifecycleDigest !== second.target.lifecycleDigest ||
    first.target.publicAccess !== second.target.publicAccess ||
    first.application.deploymentSha !== second.application.deploymentSha ||
    first.application.deploymentReadyAt !== second.application.deploymentReadyAt
  ) {
    throw new Error("OVE-350 provider identity drifted between zero reads.");
  }
  if (
    first.credentials.observerScope !== second.credentials.observerScope ||
    first.credentials.applicationScope !==
      second.credentials.applicationScope ||
    first.credentials.observerDetached !== second.credentials.observerDetached
  ) {
    throw new Error("OVE-350 credential scope drifted between zero reads.");
  }
  if (first.credentials.observerScope === "public_only") {
    throw new Error(
      "OVE-350 target collector cannot use a public-only credential.",
    );
  }

  const credentialAction: Ove350Plan["credentialAction"] =
    first.credentials.observerScope === "shared_public_legacy"
      ? "narrow_shared_to_public_only_in_place"
      : "revoke_legacy_exclusive_after_delete";
  const planWithoutDigest = {
    version: "ove350.providerRetirementPlan.v1" as const,
    environment: "production" as const,
    accountId: OVE350_ACCOUNT_ID,
    targetBucket: OVE350_TARGET_BUCKET,
    horizonStartAt: OVE350_HORIZON_START_AT,
    safetyGate: {
      class: "founder_authorized_immediate_retirement" as const,
      waivedAt: OVE350_HORIZON_WAIVER_AT,
      minimumReadSeparationSeconds: 60 as const,
    },
    firstReadAt: first.observedAt,
    secondReadAt: second.observedAt,
    targetConfig: {
      corsDigest: first.target.corsDigest,
      lifecycleDigest: first.target.lifecycleDigest,
      publicAccess: false as const,
      location: "EEUR" as const,
      storageClass: "Standard" as const,
      cors: OVE350_CORS_SHAPE,
      lifecycle: OVE350_LIFECYCLE_SHAPE,
    },
    applicationBaseline: {
      deploymentSha: first.application.deploymentSha,
      deploymentReadyAt: first.application.deploymentReadyAt,
      firstReceiptDigest: stableOve350Digest(first),
      secondReceiptDigest: stableOve350Digest(second),
    },
    credentialAction,
    intendedMutation: {
      deleteExactEmptyBucket: OVE350_TARGET_BUCKET,
      preservePublicBucket: "overgarden-public" as const,
      preserveStagingBucket: "overgarden-media-staging" as const,
      preservePublicDomain: "media.over.garden" as const,
      preserveStagingDomain: "media-stage.over.garden" as const,
      preserveRetiredEnvAbsence: true as const,
    },
    rollback: {
      emptyBucketShape: {
        bucket: OVE350_TARGET_BUCKET,
        corsDigest: first.target.corsDigest,
        lifecycleDigest: first.target.lifecycleDigest,
        publicAccess: false as const,
        restoreBytes: false as const,
        location: "eeur" as const,
        storageClass: "Standard" as const,
        cors: OVE350_CORS_SHAPE,
        lifecycle: OVE350_LIFECYCLE_SHAPE,
      },
    },
  };
  const plan: Ove350Plan = {
    ...planWithoutDigest,
    planDigest: stableOve350Digest(planWithoutDigest),
  };
  assertOve350ReceiptRedacted(plan);
  return plan;
}

export function verifyOve350ApplyGate(
  plan: Ove350Plan,
  approval: Ove350ApprovalReceipt,
  immediateRead: Ove350ReadReceipt,
  now: Date,
  options: { allowAbsentReplay?: boolean } = {},
) {
  const expectedPlanDigest = stableOve350Digest(withoutPlanDigest(plan));
  if (!isSha256(plan.planDigest) || plan.planDigest !== expectedPlanDigest) {
    throw new Error("OVE-350 plan digest is invalid or drifted.");
  }
  if (approval.planDigest !== plan.planDigest) {
    throw new Error("OVE-350 approval digest does not match the exact plan.");
  }
  if (
    approval.version !== "ove350.destructiveApproval.v1" ||
    approval.decision !== "approved" ||
    approval.authorityClass !== "maintainer" ||
    approval.environment !== plan.environment ||
    approval.accountId !== plan.accountId ||
    approval.targetBucket !== plan.targetBucket
  ) {
    throw new Error("OVE-350 approval identity does not match the exact plan.");
  }
  if (
    !isIsoInstant(approval.approvedAt) ||
    Date.parse(approval.approvedAt) < Date.parse(plan.secondReadAt)
  ) {
    throw new Error("OVE-350 approval timestamp precedes the immutable plan.");
  }
  const classification = classifyOve350Read(immediateRead);
  const replay = classification.state === "already_absent";
  if (
    classification.state !== "eligible_zero" &&
    !(options.allowAbsentReplay && replay)
  ) {
    throw new Error(
      `OVE-350 immediate read is not exact zero state: ${classification.reason}.`,
    );
  }
  if (
    immediateRead.accountId !== plan.accountId ||
    immediateRead.target.bucket !== plan.targetBucket ||
    immediateRead.target.corsDigest !== plan.targetConfig.corsDigest ||
    immediateRead.target.lifecycleDigest !==
      plan.targetConfig.lifecycleDigest ||
    immediateRead.application.deploymentSha !==
      plan.applicationBaseline.deploymentSha ||
    immediateRead.application.deploymentReadyAt !==
      plan.applicationBaseline.deploymentReadyAt
  ) {
    throw new Error(
      "OVE-350 immediate provider identity differs from the plan.",
    );
  }
  const nowMs = now.getTime();
  const readMs = Date.parse(immediateRead.observedAt);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(readMs) ||
    readMs > nowMs ||
    nowMs - readMs > IMMEDIATE_READ_MAX_AGE_MS
  ) {
    throw new Error(
      "OVE-350 immediate read is older than the five-minute gate.",
    );
  }
  if (
    plan.credentialAction === "narrow_shared_to_public_only_in_place" &&
    (immediateRead.credentials.observerScope !== "public_only" ||
      immediateRead.credentials.applicationScope !== "public_only" ||
      immediateRead.credentials.observerDetached)
  ) {
    throw new Error("OVE-350 shared credential rotation is not complete.");
  }
  if (
    plan.credentialAction === "revoke_legacy_exclusive_after_delete" &&
    (immediateRead.credentials.observerScope !== "legacy_exclusive" ||
      immediateRead.credentials.applicationScope !== "public_only" ||
      !immediateRead.credentials.observerDetached)
  ) {
    throw new Error("OVE-350 exclusive credential identity drifted.");
  }
  return { replay };
}

export async function executeOve350Retirement(
  plan: Ove350Plan,
  approval: Ove350ApprovalReceipt,
  dependencies: Ove350RetirementDependencies,
): Promise<Ove350TerminalReceipt> {
  const release = await dependencies.acquireLock();
  let deleted = false;
  try {
    await dependencies.convergeCredential(plan.credentialAction);
    const immediateRead = await dependencies.collectImmediateRead();
    const gate = verifyOve350ApplyGate(
      plan,
      approval,
      immediateRead,
      dependencies.now(),
      { allowAbsentReplay: true },
    );

    if (!gate.replay) {
      await dependencies.deleteExactBucket(OVE350_TARGET_BUCKET);
      deleted = true;
    }
    if (!(await dependencies.readTargetAbsent())) {
      throw new Error("OVE-350 target absence first read failed.");
    }
    await dependencies.waitBeforeSecondAbsenceRead();
    if (!(await dependencies.readTargetAbsent())) {
      throw new Error("OVE-350 target absence second read failed.");
    }
    if (!(await dependencies.verifyPreservedCanaries())) {
      throw new Error("OVE-350 preserved canary verification failed.");
    }

    const receiptWithoutDigest = {
      version: "ove350.providerRetirement.v1" as const,
      terminalState: "verified" as const,
      replay: gate.replay,
      environment: "production" as const,
      accountId: OVE350_ACCOUNT_ID,
      targetBucket: OVE350_TARGET_BUCKET,
      planDigest: plan.planDigest,
      targetAbsentReads: 2 as const,
      credentialAction: plan.credentialAction,
      preservedCanaries: "passed" as const,
      rollback: "not_required" as const,
    };
    const receipt: Ove350TerminalReceipt = {
      ...receiptWithoutDigest,
      receiptDigest: stableOve350Digest(receiptWithoutDigest),
    };
    assertOve350ReceiptRedacted(receipt);
    return receipt;
  } catch (error) {
    if (deleted) {
      await dependencies.recreateEmptyBucket(plan.rollback.emptyBucketShape);
    }
    throw error;
  } finally {
    await release();
  }
}

export async function collectOve350LiveRead(): Promise<Ove350ReadReceipt> {
  const startedAt = Date.now();
  const appRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  return withProductionEnvironment(appRoot, async (productionEnv) => {
    const [target, provider, application, database, preserved] =
      await Promise.all([
        collectTargetState(productionEnv),
        collectProviderControlState(appRoot),
        collectApplicationState(appRoot),
        collectDatabaseState(productionEnv),
        collectPreservedDomainState(),
      ]);
    if (target.objectCount !== provider.targetObjectCount) {
      throw new Error(
        "OVE-350 target object counts disagree across providers.",
      );
    }
    const receipt: Ove350ReadReceipt = {
      version: "ove350.zeroRead.v1",
      environment: "production",
      accountId: OVE350_ACCOUNT_ID,
      horizonStartAt: OVE350_HORIZON_START_AT,
      observedAt: new Date().toISOString(),
      target: {
        bucket: OVE350_TARGET_BUCKET,
        exists: provider.targetPresent,
        objectCount: target.objectCount,
        totalBytes: target.totalBytes,
        multipartUploads: target.multipartUploads,
        corsDigest: stableOve350Digest(OVE350_CORS_SHAPE),
        lifecycleDigest: stableOve350Digest(OVE350_LIFECYCLE_SHAPE),
        publicAccess: provider.targetPublicAccess,
      },
      application,
      database,
      repository: {
        legacyRuntimeReferences:
          collectRetiredJournalMediaRuntimeFindings(appRoot).length,
      },
      preserved: {
        publicBucketPresent: provider.publicBucketPresent,
        stagingBucketPresent: provider.stagingBucketPresent,
        ...preserved,
      },
      credentials: {
        observerScope: target.credentialScope,
        applicationScope: target.credentialScope,
        observerDetached: false,
      },
      durationMs: Date.now() - startedAt,
    };
    assertOve350ReceiptRedacted(receipt);
    return receipt;
  });
}

async function collectOve350PostNarrowingRead(
  plan: Ove350Plan,
): Promise<Ove350ReadReceipt> {
  const startedAt = Date.now();
  const appRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  return withProductionEnvironment(appRoot, async (productionEnv) => {
    const [credentialScope, provider, application, database, preserved] =
      await Promise.all([
        collectApplicationCredentialScope(productionEnv),
        collectProviderControlState(appRoot),
        collectApplicationState(appRoot),
        collectDatabaseState(productionEnv),
        collectPreservedDomainState(),
      ]);
    if (credentialScope !== "public_only") {
      throw new Error(
        "OVE-350 application credential is not narrowed to public-only scope.",
      );
    }
    if (provider.targetObjectCount !== 0) {
      throw new Error("OVE-350 target bucket is no longer empty.");
    }

    // The approved read pair proves zero multipart uploads immediately before
    // IAM narrowing. Once the sole shared application credential is public-only,
    // no application writer remains; Cloudflare still rejects deletion if the
    // empty-only provider precondition has changed.
    const receipt: Ove350ReadReceipt = {
      version: "ove350.zeroRead.v1",
      environment: "production",
      accountId: OVE350_ACCOUNT_ID,
      horizonStartAt: OVE350_HORIZON_START_AT,
      observedAt: new Date().toISOString(),
      target: {
        bucket: OVE350_TARGET_BUCKET,
        exists: provider.targetPresent,
        objectCount: provider.targetObjectCount,
        totalBytes: 0,
        multipartUploads: 0,
        corsDigest: plan.targetConfig.corsDigest,
        lifecycleDigest: plan.targetConfig.lifecycleDigest,
        publicAccess: provider.targetPublicAccess,
      },
      application,
      database,
      repository: {
        legacyRuntimeReferences:
          collectRetiredJournalMediaRuntimeFindings(appRoot).length,
      },
      preserved: {
        publicBucketPresent: provider.publicBucketPresent,
        stagingBucketPresent: provider.stagingBucketPresent,
        ...preserved,
      },
      credentials: {
        observerScope: credentialScope,
        applicationScope: credentialScope,
        observerDetached: false,
      },
      durationMs: Date.now() - startedAt,
    };
    assertOve350ReceiptRedacted(receipt);
    return receipt;
  });
}

async function collectApplicationCredentialScope(
  environment: NodeJS.ProcessEnv,
): Promise<Ove350CredentialScope> {
  const endpoint = requiredEnvironment(environment, "R2_ENDPOINT");
  const publicBucket = requiredEnvironment(environment, "R2_PUBLIC_BUCKET");
  if (
    endpoint !== OVE350_ENDPOINT ||
    publicBucket !== OVE350_PUBLIC_BUCKET ||
    requiredEnvironment(environment, "R2_FORCE_PATH_STYLE") !== "true"
  ) {
    throw new Error("OVE-350 production R2 identity drifted.");
  }
  const client = createOve350R2Client(environment);
  const [legacy, publicProbe, staging] = await Promise.all([
    probeBucketScope(client, OVE350_TARGET_BUCKET),
    probeBucketScope(client, OVE350_PUBLIC_BUCKET),
    probeBucketScope(client, OVE350_STAGING_BUCKET),
  ]);
  return classifyCredentialScope(legacy, publicProbe, staging);
}

async function collectBucketNames(appRoot: string) {
  const output = await runCommand(
    "cloudflare_bucket_list",
    "pnpm",
    ["exec", "wrangler", "r2", "bucket", "list"],
    appRoot,
  );
  return new Set(
    [...output.matchAll(/^name:\s+([a-z0-9-]+)\s*$/gm)].map(
      (match) => match[1] ?? "",
    ),
  );
}

async function verifyOve350PostDeleteCanaries(
  appRoot: string,
  expectedGitSha: string,
) {
  const [names, application, preserved, credentialAndDatabase] =
    await Promise.all([
      collectBucketNames(appRoot),
      collectApplicationState(appRoot),
      collectPreservedDomainState(),
      withProductionEnvironment(appRoot, async (productionEnv) => ({
        credentialScope: await collectApplicationCredentialScope(productionEnv),
        database: await collectDatabaseState(productionEnv),
      })),
    ]);
  return (
    !names.has(OVE350_TARGET_BUCKET) &&
    names.has(OVE350_PUBLIC_BUCKET) &&
    names.has(OVE350_STAGING_BUCKET) &&
    application.deploymentSha === expectedGitSha &&
    application.legacyEnvReferences === 0 &&
    application.legacyRouteRequests === 0 &&
    application.server5xx === 0 &&
    application.logWindowComplete &&
    credentialAndDatabase.credentialScope === "public_only" &&
    credentialAndDatabase.database.contractedSchema &&
    credentialAndDatabase.database.legacyJobsOrClaims === 0 &&
    preserved.publicDomainHealthy &&
    preserved.stagingWorkerHealthy &&
    collectRetiredJournalMediaRuntimeFindings(appRoot).length === 0
  );
}

async function acquireOve350OperatorLock() {
  const lockPath = path.join(tmpdir(), "overgarden-ove350-provider.lock");
  const handle = await open(lockPath, "wx", 0o600).catch(() => {
    throw new Error("OVE-350 operator lock is already held.");
  });
  return async () => {
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
  };
}

async function recreateOve350EmptyBucket(
  appRoot: string,
  shape: Ove350Plan["rollback"]["emptyBucketShape"],
) {
  if (
    shape.bucket !== OVE350_TARGET_BUCKET ||
    shape.restoreBytes ||
    shape.publicAccess ||
    shape.location !== "eeur" ||
    shape.storageClass !== "Standard"
  ) {
    throw new Error("OVE-350 rollback shape is not the exact empty target.");
  }
  const directory = await mkdtemp(path.join(tmpdir(), "ove350-rollback-"));
  const corsFile = path.join(directory, "cors.json");
  try {
    await writeFile(
      corsFile,
      `${JSON.stringify(
        {
          rules: [
            {
              allowed: {
                origins: [...shape.cors.origins],
                methods: [...shape.cors.methods],
                headers: [...shape.cors.allowedHeaders],
              },
              exposedHeaders: [...shape.cors.exposedHeaders],
              maxAgeSeconds: shape.cors.maxAgeSeconds,
            },
          ],
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    await runCommand(
      "cloudflare_rollback_create",
      "pnpm",
      [
        "exec",
        "wrangler",
        "r2",
        "bucket",
        "create",
        shape.bucket,
        "--location",
        shape.location,
        "--storage-class",
        shape.storageClass,
      ],
      appRoot,
    );
    await runCommand(
      "cloudflare_rollback_cors",
      "pnpm",
      [
        "exec",
        "wrangler",
        "r2",
        "bucket",
        "cors",
        "set",
        shape.bucket,
        "--file",
        corsFile,
        "--force",
      ],
      appRoot,
    );
    await runCommand(
      "cloudflare_rollback_lifecycle",
      "pnpm",
      [
        "exec",
        "wrangler",
        "r2",
        "bucket",
        "lifecycle",
        "add",
        shape.bucket,
        shape.lifecycle.ruleId,
        shape.lifecycle.prefix,
        "--expire-days",
        String(shape.lifecycle.objectExpirationDays),
        "--abort-multipart-days",
        String(shape.lifecycle.abortMultipartDays),
        "--force",
      ],
      appRoot,
    );
  } finally {
    await unlink(corsFile).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
  }
}

async function withProductionEnvironment<T>(
  appRoot: string,
  operation: (environment: NodeJS.ProcessEnv) => Promise<T>,
) {
  const directory = await mkdtemp(path.join(tmpdir(), "ove350-production-"));
  const environmentFile = path.join(directory, "production.env");
  try {
    await runCommand(
      "vercel_environment_pull",
      "npx",
      [
        "vercel",
        "env",
        "pull",
        environmentFile,
        "--environment",
        "production",
        "--yes",
      ],
      appRoot,
    );
    await chmod(environmentFile, 0o600);
    const production = parseEnv(await readFile(environmentFile, "utf8"));
    return await operation({
      ...process.env,
      ...production,
      VERCEL_ENV: "production",
    });
  } finally {
    await unlink(environmentFile).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
  }
}

async function collectTargetState(environment: NodeJS.ProcessEnv) {
  const endpoint = requiredEnvironment(environment, "R2_ENDPOINT");
  const publicBucket = requiredEnvironment(environment, "R2_PUBLIC_BUCKET");
  if (
    endpoint !== OVE350_ENDPOINT ||
    publicBucket !== OVE350_PUBLIC_BUCKET ||
    requiredEnvironment(environment, "R2_FORCE_PATH_STYLE") !== "true"
  ) {
    throw new Error("OVE-350 production R2 identity drifted.");
  }
  const applicationClient = createOve350R2Client(environment);
  const [legacyProbe, publicProbe, stagingProbe] = await Promise.all([
    probeBucketScope(applicationClient, OVE350_TARGET_BUCKET),
    probeBucketScope(applicationClient, OVE350_PUBLIC_BUCKET),
    probeBucketScope(applicationClient, OVE350_STAGING_BUCKET),
  ]);
  const credentialScope = classifyCredentialScope(
    legacyProbe,
    publicProbe,
    stagingProbe,
  );
  if (legacyProbe !== "allowed") {
    throw new Error(
      "OVE-350 active credential cannot perform the target zero read.",
    );
  }

  let continuationToken: string | undefined;
  let objectCount = 0;
  let totalBytes = 0;
  do {
    const page = await applicationClient.send(
      new ListObjectsV2Command({
        Bucket: OVE350_TARGET_BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1_000,
      }),
      { abortSignal: AbortSignal.timeout(PROVIDER_COMMAND_TIMEOUT_MS) },
    );
    for (const object of page.Contents ?? []) {
      objectCount += 1;
      totalBytes += Number(object.Size ?? 0);
    }
    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken);

  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  let multipartUploads = 0;
  do {
    const page = await applicationClient.send(
      new ListMultipartUploadsCommand({
        Bucket: OVE350_TARGET_BUCKET,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
        MaxUploads: 1_000,
      }),
      { abortSignal: AbortSignal.timeout(PROVIDER_COMMAND_TIMEOUT_MS) },
    );
    multipartUploads += page.Uploads?.length ?? 0;
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
  } while (keyMarker || uploadIdMarker);

  return { objectCount, totalBytes, multipartUploads, credentialScope };
}

async function collectProviderControlState(appRoot: string) {
  const [target, publicBucket, stagingBucket, devUrl, cors, lifecycle] =
    await Promise.all([
      readWranglerBucket(appRoot, OVE350_TARGET_BUCKET),
      readWranglerBucket(appRoot, OVE350_PUBLIC_BUCKET),
      readWranglerBucket(appRoot, OVE350_STAGING_BUCKET),
      runCommand(
        "cloudflare_dev_url",
        "pnpm",
        [
          "exec",
          "wrangler",
          "r2",
          "bucket",
          "dev-url",
          "get",
          OVE350_TARGET_BUCKET,
        ],
        appRoot,
      ),
      runCommand(
        "cloudflare_cors",
        "pnpm",
        [
          "exec",
          "wrangler",
          "r2",
          "bucket",
          "cors",
          "list",
          OVE350_TARGET_BUCKET,
        ],
        appRoot,
      ),
      runCommand(
        "cloudflare_lifecycle",
        "pnpm",
        [
          "exec",
          "wrangler",
          "r2",
          "bucket",
          "lifecycle",
          "list",
          OVE350_TARGET_BUCKET,
        ],
        appRoot,
      ),
    ]);
  assertWranglerConfig(cors, lifecycle);
  if (
    target.location !== "EEUR" ||
    target.default_storage_class !== "Standard" ||
    target.bucket_size !== "0 B"
  ) {
    throw new Error(
      "OVE-350 target bucket placement or zero-byte state drifted.",
    );
  }
  return {
    targetPresent: target.name === OVE350_TARGET_BUCKET,
    targetObjectCount: parseProviderCount(target.object_count),
    targetPublicAccess: !/public access[^\n]*disabled/i.test(devUrl),
    publicBucketPresent: publicBucket.name === OVE350_PUBLIC_BUCKET,
    stagingBucketPresent: stagingBucket.name === OVE350_STAGING_BUCKET,
  };
}

async function collectApplicationState(
  appRoot: string,
): Promise<Ove350ReadReceipt["application"]> {
  const [environmentOutput, deploymentOutput, logOutput] = await Promise.all([
    runCommand(
      "vercel_env_read",
      "npx",
      ["vercel", "env", "ls", "--json"],
      appRoot,
    ),
    runCommand(
      "vercel_deployment_read",
      "npx",
      [
        "vercel",
        "ls",
        "over-garden",
        "--environment",
        "production",
        "--status",
        "READY",
        "--limit",
        "5",
        "--json",
      ],
      appRoot,
    ),
    runCommand(
      "vercel_log_read",
      "npx",
      [
        "vercel",
        "logs",
        "--environment",
        "production",
        "--branch",
        "main",
        "--since",
        "55m",
        "--json",
        "--limit",
        "4000",
      ],
      appRoot,
    ),
  ]);
  const environment = parseJson<{ envs?: Array<{ key?: string }> }>(
    environmentOutput,
    "Vercel environment",
  );
  const legacyEnvReferences = (environment.envs ?? []).filter((entry) =>
    ["R2_QUARANTINE_BUCKET", "R2_UPLOAD_URL_TTL_SECONDS"].includes(
      entry.key ?? "",
    ),
  ).length;
  const deployment = parseJson<{
    deployments?: Array<{
      state?: string;
      ready?: number;
      target?: string;
      meta?: { githubCommitSha?: string; githubCommitRef?: string };
    }>;
  }>(deploymentOutput, "Vercel deployment").deployments?.find(
    (candidate) =>
      candidate.state === "READY" &&
      candidate.target === "production" &&
      candidate.meta?.githubCommitRef === "main" &&
      /^[a-f0-9]{40}$/.test(candidate.meta.githubCommitSha ?? ""),
  );
  if (!deployment?.ready || !deployment.meta?.githubCommitSha) {
    throw new Error("OVE-350 exact production deployment is not READY.");
  }
  const logs = logOutput
    .split("\n")
    .filter(Boolean)
    .map((line) =>
      parseJson<{ requestPath?: string; responseStatusCode?: number }>(
        line,
        "Vercel log row",
      ),
    );
  const retiredLogs = logs.filter((row) =>
    OVE350_RETIRED_ROUTE.test(row.requestPath ?? ""),
  );
  return {
    deploymentSha: deployment.meta.githubCommitSha,
    deploymentReadyAt: new Date(deployment.ready).toISOString(),
    legacyEnvReferences,
    legacyRouteRequests: retiredLogs.length,
    server5xx: retiredLogs.filter((row) => (row.responseStatusCode ?? 0) >= 500)
      .length,
    logWindowComplete: logs.length < 4_000,
  };
}

async function collectDatabaseState(
  environment: NodeJS.ProcessEnv,
): Promise<Ove350ReadReceipt["database"]> {
  const databaseUrl = new URL(requiredEnvironment(environment, "DATABASE_URL"));
  if (
    databaseUrl.hostname !== OVE350_DATABASE.hostname ||
    databaseUrl.port !== OVE350_DATABASE.port ||
    databaseUrl.pathname !== OVE350_DATABASE.pathname
  ) {
    throw new Error("OVE-350 production database identity drifted.");
  }
  databaseUrl.searchParams.delete("sslmode");
  const ca = requiredEnvironment(environment, "DATABASE_SSL_CA").replaceAll(
    "\\n",
    "\n",
  );
  const pool = new Pool({
    connectionString: databaseUrl.toString(),
    max: 1,
    ssl: { ca, rejectUnauthorized: true },
  });
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    await client.query("set local statement_timeout = '30000ms'");
    const result = await client.query<{
      draft_table_absent: boolean;
      retired_columns_absent: boolean;
      legacy_jobs_or_claims: number;
    }>(`
      select
        to_regclass('public.journal_entry_drafts') is null as draft_table_absent,
        (select count(*)::int
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'media_assets'
            and column_name in (
              'quarantine_key', 'status', 'original_deleted_at',
              'declared_media_type', 'admitted_media_type',
              'media_readiness_state', 'processing_claim_token',
              'processing_claimed_at', 'upload_generation_id',
              'public_object_id', 'quality_policy_version', 'quality_class',
              'quality_reason_codes', 'quality_metrics', 'quality_evaluated_at'
            )) = 0 as retired_columns_absent,
        (select count(*)::int
           from job_queue
          where status in ('pending', 'processing', 'failed')
            and payload->>'kind' in (
              'media_quarantine_expire', 'media_staging_finalize',
              'media_derivative_revoke'
            )) as legacy_jobs_or_claims
    `);
    await client.query("commit");
    const row = result.rows[0];
    if (!row)
      throw new Error("OVE-350 production database read returned no row.");
    return {
      contractedSchema: row.draft_table_absent && row.retired_columns_absent,
      legacyJobsOrClaims: Number(row.legacy_jobs_or_claims),
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function collectPreservedDomainState(): Promise<
  Pick<
    Ove350ReadReceipt["preserved"],
    "publicDomainHealthy" | "stagingWorkerHealthy"
  >
> {
  const [publicDomain, stagingWorker] = await Promise.all([
    fetch("https://media.over.garden/", {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    }),
    fetch("https://media-stage.over.garden/", {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    }),
  ]);
  return {
    publicDomainHealthy:
      publicDomain.status >= 200 && publicDomain.status < 500,
    stagingWorkerHealthy:
      stagingWorker.status >= 200 && stagingWorker.status < 500,
  };
}

function createOve350R2Client(environment: NodeJS.ProcessEnv) {
  return new S3Client({
    region: "auto",
    endpoint: requiredEnvironment(environment, "R2_ENDPOINT"),
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: requiredEnvironment(environment, "R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnvironment(environment, "R2_SECRET_ACCESS_KEY"),
    },
  });
}

async function probeBucketScope(client: S3Client, bucket: string) {
  try {
    await client.send(
      new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }),
      { abortSignal: AbortSignal.timeout(PROVIDER_COMMAND_TIMEOUT_MS) },
    );
    return "allowed" as const;
  } catch (error) {
    const candidate = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    if (
      candidate.name === "AccessDenied" ||
      candidate.$metadata?.httpStatusCode === 403
    ) {
      return "denied" as const;
    }
    return "error" as const;
  }
}

function classifyCredentialScope(
  legacy: "allowed" | "denied" | "error",
  publicBucket: "allowed" | "denied" | "error",
  staging: "allowed" | "denied" | "error",
): Ove350CredentialScope {
  if ([legacy, publicBucket, staging].includes("error")) return "unknown";
  if (legacy === "allowed" && publicBucket === "allowed") {
    return "shared_public_legacy";
  }
  if (legacy === "allowed" && publicBucket === "denied") {
    return "legacy_exclusive";
  }
  if (legacy === "denied" && publicBucket === "allowed") return "public_only";
  return "unknown";
}

async function readWranglerBucket(appRoot: string, bucket: string) {
  return parseJson<{
    name?: string;
    object_count?: string;
    bucket_size?: string;
    location?: string;
    default_storage_class?: string;
  }>(
    await runCommand(
      `cloudflare_bucket_${bucket.replaceAll("-", "_")}`,
      "pnpm",
      ["exec", "wrangler", "r2", "bucket", "info", bucket, "--json"],
      appRoot,
    ),
    `Cloudflare bucket ${bucket}`,
  );
}

function assertWranglerConfig(cors: string, lifecycle: string) {
  const corsValues = [
    ...OVE350_CORS_SHAPE.origins,
    ...OVE350_CORS_SHAPE.methods,
    ...OVE350_CORS_SHAPE.allowedHeaders,
    ...OVE350_CORS_SHAPE.exposedHeaders,
    String(OVE350_CORS_SHAPE.maxAgeSeconds),
  ];
  const lifecycleValues = [
    OVE350_LIFECYCLE_SHAPE.ruleId,
    OVE350_LIFECYCLE_SHAPE.prefix,
    "Expire objects after 1 days",
    "Abort incomplete multipart uploads after 1 days",
  ];
  if (
    corsValues.some((value) => !cors.includes(value)) ||
    lifecycleValues.some((value) => !lifecycle.includes(value))
  ) {
    throw new Error("OVE-350 target bucket configuration drifted.");
  }
}

async function runCommand(
  name: string,
  command: string,
  args: readonly string[],
  cwd: string,
) {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error("OVE-350 provider command identity is invalid.");
  }
  try {
    const result = await execFileAsync(command, [...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: PROVIDER_COMMAND_TIMEOUT_MS,
      env: process.env,
    });
    return result.stdout;
  } catch {
    throw new Error(`OVE-350 ${name} command failed.`);
  }
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`OVE-350 ${label} read-back was not valid JSON.`);
  }
}

function parseProviderCount(value: string | undefined) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("OVE-350 provider object count is invalid.");
  }
  return count;
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string) {
  const result = environment[name]?.trim();
  if (!result) throw new Error(`OVE-350 production environment lacks ${name}.`);
  return result;
}

export function withBoundedCollector<T>(
  name: string,
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
) {
  if (!/^[a-z0-9_]+$/.test(name) || timeoutMs <= 0 || timeoutMs > 30_000) {
    throw new Error("OVE-350 collector boundary is invalid.");
  }
  const controller = new AbortController();
  let collectorStatus: "running" | "completed" | "cancelled" | "timed_out" =
    "running";
  let rejectResult: ((reason: Error) => void) | undefined;
  const result = new Promise<T>((resolve, reject) => {
    rejectResult = reject;
    void Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => {
          if (collectorStatus !== "running") return;
          collectorStatus = "completed";
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          if (collectorStatus !== "running") return;
          collectorStatus = "completed";
          clearTimeout(timer);
          reject(error);
        },
      );
  });
  const timer = setTimeout(() => {
    if (collectorStatus !== "running") return;
    collectorStatus = "timed_out";
    controller.abort();
    rejectResult?.(new Error(`OVE-350 ${name} timed out.`));
  }, timeoutMs);

  return {
    result,
    cancel: () => {
      if (collectorStatus !== "running") return false;
      collectorStatus = "cancelled";
      clearTimeout(timer);
      controller.abort();
      rejectResult?.(new Error(`OVE-350 ${name} cancelled.`));
      return true;
    },
    status: () => collectorStatus,
  };
}

export function stableOve350Digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function assertOve350ReceiptRedacted(value: unknown) {
  const serialized = JSON.stringify(value);
  if (
    /(?:object[_-]?key|access[_-]?key|secret|capability|media[_-]?key|user[_-]?id|owner[_-]?id|email|ip[_-]?address|user[_-]?agent|latitude|longitude|precise[_-]?location)/i.test(
      serialized,
    ) ||
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(serialized)
  ) {
    throw new Error("OVE-350 receipt violates the redaction boundary.");
  }
}

function withoutPlanDigest(plan: Ove350Plan) {
  return Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== "planDigest"),
  ) as Omit<Ove350Plan, "planDigest">;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function value(values: Map<string, string | true>, name: string) {
  const result = values.get(name);
  return typeof result === "string" ? result : undefined;
}

function requiredValue(
  values: Map<string, string | true>,
  name: string,
  label: string,
) {
  const result = value(values, name);
  if (!result) throw new Error(`OVE-350 requires the ${label}.`);
  return result;
}

function requiredSha256(
  values: Map<string, string | true>,
  name: string,
  label: string,
) {
  const result = requiredValue(values, name, label);
  if (!isSha256(result)) {
    throw new Error(`OVE-350 ${label} must be a lowercase SHA-256.`);
  }
  return result;
}

function requiredGitSha(values: Map<string, string | true>, name: string) {
  const result = requiredValue(values, name, "expected git SHA");
  if (!/^[a-f0-9]{40}$/.test(result)) {
    throw new Error(
      "OVE-350 expected git SHA must be 40 lowercase hex characters.",
    );
  }
  return result;
}

function isSha256(value: string) {
  return /^[a-f0-9]{64}$/.test(value);
}

function isIsoInstant(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

async function readOve350Plan(file: string) {
  const parsed = parseJson<Ove350Plan | { plan?: Ove350Plan }>(
    await readFile(file, "utf8"),
    "immutable plan",
  );
  const plan = "version" in parsed ? (parsed as Ove350Plan) : parsed.plan;
  if (!plan) throw new Error("OVE-350 immutable plan is absent.");
  const digest = stableOve350Digest(withoutPlanDigest(plan));
  if (plan.planDigest !== digest) {
    throw new Error("OVE-350 immutable plan digest drifted.");
  }
  return plan;
}

async function runOve350ApprovedApply(
  args: Extract<Ove350OperatorArgs, { mode: "apply" }>,
) {
  const appRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const plan = await readOve350Plan(args.planFile);
  const approval = parseJson<Ove350ApprovalReceipt>(
    await readFile(args.approvalFile, "utf8"),
    "approval receipt",
  );
  if (
    args.approvedPlanDigest !== plan.planDigest ||
    approval.planDigest !== args.approvedPlanDigest
  ) {
    throw new Error("OVE-350 command, plan, and approval digests differ.");
  }
  let immediateRead: Ove350ReadReceipt | undefined;
  const receipt = await executeOve350Retirement(plan, approval, {
    acquireLock: acquireOve350OperatorLock,
    convergeCredential: async (action) => {
      if (action !== "narrow_shared_to_public_only_in_place") {
        throw new Error(
          "OVE-350 live apply supports only the observed shared-token narrowing plan.",
        );
      }
      immediateRead = await collectOve350PostNarrowingRead(plan);
    },
    collectImmediateRead: async () => {
      if (!immediateRead) {
        throw new Error("OVE-350 post-narrowing read is absent.");
      }
      return immediateRead;
    },
    deleteExactBucket: async (bucket) => {
      if (bucket !== OVE350_TARGET_BUCKET) {
        throw new Error("OVE-350 refused a non-target bucket deletion.");
      }
      await runCommand(
        "cloudflare_exact_empty_bucket_delete",
        "pnpm",
        ["exec", "wrangler", "r2", "bucket", "delete", bucket],
        appRoot,
      );
    },
    readTargetAbsent: async () =>
      !(await collectBucketNames(appRoot)).has(OVE350_TARGET_BUCKET),
    waitBeforeSecondAbsenceRead: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    },
    verifyPreservedCanaries: async () =>
      verifyOve350PostDeleteCanaries(
        appRoot,
        plan.applicationBaseline.deploymentSha,
      ),
    recreateEmptyBucket: async (shape) =>
      recreateOve350EmptyBucket(appRoot, shape),
    now: () => new Date(),
  });
  assertOve350ReceiptRedacted(receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

async function runOve350FinalReadback(
  args: Extract<Ove350OperatorArgs, { mode: "final_readback" }>,
) {
  const appRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const plan = await readOve350Plan(args.planFile);
  if (plan.applicationBaseline.deploymentSha !== args.expectedGitSha) {
    throw new Error("OVE-350 expected SHA differs from the immutable plan.");
  }
  const first = await collectBucketNames(appRoot);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const second = await collectBucketNames(appRoot);
  if (
    first.has(OVE350_TARGET_BUCKET) ||
    second.has(OVE350_TARGET_BUCKET) ||
    !first.has(OVE350_PUBLIC_BUCKET) ||
    !second.has(OVE350_PUBLIC_BUCKET) ||
    !first.has(OVE350_STAGING_BUCKET) ||
    !second.has(OVE350_STAGING_BUCKET)
  ) {
    throw new Error("OVE-350 terminal bucket inventory is not converged.");
  }
  if (!(await verifyOve350PostDeleteCanaries(appRoot, args.expectedGitSha))) {
    throw new Error("OVE-350 terminal preserved canaries failed.");
  }
  const receiptWithoutDigest = {
    version: "ove350.providerRetirement.v1" as const,
    terminalState: "verified" as const,
    replay: true,
    environment: "production" as const,
    accountId: OVE350_ACCOUNT_ID,
    targetBucket: OVE350_TARGET_BUCKET,
    planDigest: plan.planDigest,
    targetAbsentReads: 2 as const,
    credentialAction: plan.credentialAction,
    preservedCanaries: "passed" as const,
    rollback: "not_required" as const,
  };
  const receipt: Ove350TerminalReceipt = {
    ...receiptWithoutDigest,
    receiptDigest: stableOve350Digest(receiptWithoutDigest),
  };
  assertOve350ReceiptRedacted(receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

async function runOve350Cli() {
  const args = parseOve350Args(process.argv.slice(2));
  if (args.mode === "apply") {
    await runOve350ApprovedApply(args);
    return;
  }
  if (args.mode === "final_readback") {
    await runOve350FinalReadback(args);
    return;
  }
  const receipt = await collectOve350LiveRead();
  const classification = classifyOve350Read(receipt);
  let plan: Ove350Plan | undefined;
  if (args.previousReadReceipt) {
    const parsed = parseJson<
      Ove350ReadReceipt | { receipt?: Ove350ReadReceipt }
    >(
      await readFile(args.previousReadReceipt, "utf8"),
      "previous read receipt",
    );
    const previous =
      "version" in parsed ? (parsed as Ove350ReadReceipt) : parsed.receipt;
    if (!previous) throw new Error("OVE-350 previous read receipt is absent.");
    plan = buildOve350Plan(previous, receipt);
  }
  const output = {
    receipt,
    classification,
    receiptDigest: stableOve350Digest(receipt),
    ...(plan ? { plan } : {}),
  };
  assertOve350ReceiptRedacted(output);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (["blocked", "drift"].includes(classification.state)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runOve350Cli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "OVE-350 failed."}\n`,
    );
    process.exitCode = 1;
  });
}
