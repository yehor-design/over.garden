import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

export interface FacebookCleanupCounts {
  facebookAccounts: number;
  facebookOnly: number;
  facebookWithCredential: number;
  facebookWithGoogle: number;
  duplicateFacebookOwners: number;
}

export type FacebookCleanupInventoryClass =
  | "inventory_inconclusive"
  | "facebook_only_blocked"
  | "duplicate_ambiguity"
  | "zero_inventory_proved";

export type FacebookCleanupEnvironment = "local" | "production";

export type FacebookCleanupStep =
  | "meta_login"
  | "vercel_login_env"
  | "database_accounts";

export interface FacebookCleanupPlanV1 {
  schema: "overgarden.facebook-login-external-cleanup-plan.v1";
  issue: "OVE-297";
  environment: "production";
  implementationSha: string;
  sourceDigest: string;
  counts: FacebookCleanupCounts;
  inventoryClass: FacebookCleanupInventoryClass;
  databaseTargetClass: "account_provider_id_facebook";
  metaLoginTargetClass: "facebook_login_product_and_redirects";
  metaLoginConfigClass: "configured" | "absent";
  vercelTargetNames: readonly string[];
  vercelConfigClass: "exact_three_present" | "absent";
  targetDigest: string;
  metaAdsExclusionDigest: string;
  mutationOrder: readonly FacebookCleanupStep[];
}

export interface FacebookCleanupApprovalReceipt {
  status: "pending" | "approved";
  planDigest: string;
  implementationSha: string;
  environment: "production";
  counts: FacebookCleanupCounts;
  targetDigest: string;
  metaAdsExclusionDigest: string;
}

interface CurrentCleanupBoundary {
  implementationSha: string;
  environment: "production";
  counts: FacebookCleanupCounts;
  targetDigest: string;
  metaAdsExclusionDigest: string;
}

export interface FacebookCleanupInventoryReceiptV1 {
  schema: "overgarden.facebook-login-inventory.v1";
  issue: "OVE-297";
  resultClass: FacebookCleanupInventoryClass;
  environment: FacebookCleanupEnvironment;
  implementationSha: string;
  sourceDigest: string;
  durationMs: number;
  counts: FacebookCleanupCounts;
  evidenceSafety: "five_counts_digests_and_classes_only";
}

export interface FacebookCleanupInventoryFailureReceiptV1 {
  schema: "overgarden.facebook-login-inventory-failure.v1";
  issue: "OVE-297";
  resultClass: "inventory_inconclusive";
  environment: FacebookCleanupEnvironment;
  implementationSha: string;
  sourceDigest: string;
  durationMs: number;
  evidenceSafety: "bounded_class_only_error_redacted";
}

export type FacebookCleanupCliArgs = {
  mode: "inventory" | "verify" | "apply-database";
  environment: FacebookCleanupEnvironment;
  implementationSha: string;
  sourceDigest: string;
  timeoutMs: number;
  planFile?: string;
  approvalFile?: string;
  currentTargetDigest?: string;
  currentMetaAdsExclusionDigest?: string;
};

interface AggregateQueryExecutor {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

interface AggregateTransactionClient extends AggregateQueryExecutor {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{
    rows: Array<Record<string, unknown>>;
    rowCount?: number | null;
  }>;
}

const FACEBOOK_AGGREGATE_QUERIES: ReadonlyArray<{
  key: keyof FacebookCleanupCounts;
  text: string;
  values: unknown[];
}> = [
  {
    key: "facebookAccounts",
    text: 'select count(*)::text as count from "account" where "providerId" = $1',
    values: ["facebook"],
  },
  {
    key: "facebookOnly",
    text: `
      select count(*)::text as count
      from (
        select distinct fb."userId"
        from "account" fb
        where fb."providerId" = $1
          and not exists (
            select 1 from "account" retained
            where retained."userId" = fb."userId"
              and retained."providerId" in ($2, $3)
          )
      ) aggregate_only
    `,
    values: ["facebook", "credential", "google"],
  },
  {
    key: "facebookWithCredential",
    text: `
      select count(*)::text as count
      from (
        select distinct fb."userId"
        from "account" fb
        where fb."providerId" = $1
          and exists (
            select 1 from "account" retained
            where retained."userId" = fb."userId"
              and retained."providerId" = $2
          )
      ) aggregate_only
    `,
    values: ["facebook", "credential"],
  },
  {
    key: "facebookWithGoogle",
    text: `
      select count(*)::text as count
      from (
        select distinct fb."userId"
        from "account" fb
        where fb."providerId" = $1
          and exists (
            select 1 from "account" retained
            where retained."userId" = fb."userId"
              and retained."providerId" = $2
          )
      ) aggregate_only
    `,
    values: ["facebook", "google"],
  },
  {
    key: "duplicateFacebookOwners",
    text: `
      select count(*)::text as count
      from (
        select fb."userId"
        from "account" fb
        where fb."providerId" = $1
        group by fb."userId"
        having count(*) > 1
      ) aggregate_only
    `,
    values: ["facebook"],
  },
];

export async function collectFacebookCleanupCounts(
  executor: AggregateQueryExecutor,
): Promise<FacebookCleanupCounts> {
  const collected: Partial<FacebookCleanupCounts> = {};
  for (const query of FACEBOOK_AGGREGATE_QUERIES) {
    const result = await executor.query(query.text, [...query.values]);
    if (
      result.rows.length !== 1 ||
      Object.keys(result.rows[0] ?? {}).length !== 1 ||
      Object.keys(result.rows[0] ?? {})[0] !== "count"
    ) {
      throw new Error("unsafe aggregate count shape");
    }
    const raw = result.rows[0]?.count;
    const count = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("invalid aggregate count shape");
    }
    collected[query.key] = count;
  }

  return collected as FacebookCleanupCounts;
}

export async function readFacebookCleanupInventory({
  client,
  environment,
  implementationSha,
  sourceDigest,
  deadlineMs = 30_000,
  now = () => performance.now(),
}: {
  client: AggregateTransactionClient;
  environment: FacebookCleanupEnvironment;
  implementationSha: string;
  sourceDigest: string;
  deadlineMs?: number;
  now?: () => number;
}): Promise<FacebookCleanupInventoryReceiptV1> {
  const startedAt = now();
  await client.query("begin isolation level repeatable read read only");
  try {
    await client.query("set local statement_timeout = '5000ms'");
    const counts = await settleExternalReadbackWithinDeadline(
      () => collectFacebookCleanupCounts(client),
      deadlineMs,
    );
    await client.query("commit");
    return buildFacebookCleanupInventoryReceipt({
      counts,
      environment,
      implementationSha,
      sourceDigest,
      durationMs: Math.min(
        deadlineMs,
        Math.max(0, Math.ceil(now() - startedAt)),
      ),
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

export async function applyFacebookAccountCleanup({
  client,
  plan,
  planDigest,
  approval,
  currentTargetDigest,
  currentMetaAdsExclusionDigest,
}: {
  client: AggregateTransactionClient;
  plan: FacebookCleanupPlanV1;
  planDigest: string;
  approval: FacebookCleanupApprovalReceipt;
  currentTargetDigest: string;
  currentMetaAdsExclusionDigest: string;
}): Promise<{
  class: "zero";
  effectClass: "deleted_expected_facebook_accounts" | "already_zero";
  before: FacebookCleanupCounts;
  after: FacebookCleanupCounts;
}> {
  const immutableApproval = validateFacebookCleanupApproval({
    plan,
    planDigest,
    approval,
    current: {
      implementationSha: plan.implementationSha,
      environment: plan.environment,
      counts: plan.counts,
      targetDigest: currentTargetDigest,
      metaAdsExclusionDigest: currentMetaAdsExclusionDigest,
    },
  });
  if (!immutableApproval.ok) {
    throw new Error("approved cleanup plan is missing or drifted");
  }

  await client.query("begin isolation level serializable read write");
  try {
    await client.query("set local statement_timeout = '5000ms'");
    const before = await collectFacebookCleanupCounts(client);
    if (allCountsZero(before)) {
      await client.query("commit");
      return {
        class: "zero",
        effectClass: "already_zero",
        before,
        after: before,
      };
    }

    const currentApproval = validateFacebookCleanupApproval({
      plan,
      planDigest,
      approval,
      current: {
        implementationSha: plan.implementationSha,
        environment: plan.environment,
        counts: before,
        targetDigest: currentTargetDigest,
        metaAdsExclusionDigest: currentMetaAdsExclusionDigest,
      },
    });
    if (!currentApproval.ok) {
      throw new Error("production account counts drifted from approved plan");
    }

    const deleted = await client.query(
      'delete from "account" where "providerId" = $1',
      ["facebook"],
    );
    if (deleted.rowCount !== plan.counts.facebookAccounts) {
      throw new Error("Facebook account cleanup affected an unexpected count");
    }
    const after = await collectFacebookCleanupCounts(client);
    if (!allCountsZero(after)) {
      throw new Error("Facebook account cleanup did not reach zero");
    }
    await client.query("commit");
    return {
      class: "zero",
      effectClass: "deleted_expected_facebook_accounts",
      before,
      after,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

export function buildFacebookCleanupInventoryReceipt({
  counts,
  environment,
  implementationSha,
  sourceDigest,
  durationMs,
}: {
  counts: FacebookCleanupCounts;
  environment: FacebookCleanupEnvironment;
  implementationSha: string;
  sourceDigest: string;
  durationMs: number;
}): FacebookCleanupInventoryReceiptV1 {
  assertSha(implementationSha, 40, "implementation SHA");
  assertSha(sourceDigest, 64, "source digest");
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 30_000) {
    throw new Error("inventory duration must be between 0 and 30000ms");
  }

  return {
    schema: "overgarden.facebook-login-inventory.v1",
    issue: "OVE-297",
    resultClass: classifyFacebookCleanupInventory(counts),
    environment,
    implementationSha,
    sourceDigest,
    durationMs,
    counts: { ...counts },
    evidenceSafety: "five_counts_digests_and_classes_only",
  };
}

export function buildFacebookCleanupFailureReceipt({
  environment,
  implementationSha,
  sourceDigest,
  durationMs,
  failureClass,
  unsafeError,
}: {
  environment: FacebookCleanupEnvironment;
  implementationSha: string;
  sourceDigest: string;
  durationMs: number;
  failureClass: "inventory_inconclusive";
  unsafeError: unknown;
}): FacebookCleanupInventoryFailureReceiptV1 {
  void unsafeError;
  assertSha(implementationSha, 40, "implementation SHA");
  assertSha(sourceDigest, 64, "source digest");
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 30_000) {
    throw new Error("inventory duration must be between 0 and 30000ms");
  }

  return {
    schema: "overgarden.facebook-login-inventory-failure.v1",
    issue: "OVE-297",
    resultClass: failureClass,
    environment,
    implementationSha,
    sourceDigest,
    durationMs,
    evidenceSafety: "bounded_class_only_error_redacted",
  };
}

export function parseFacebookCleanupCliArgs(
  argv: readonly string[],
): FacebookCleanupCliArgs {
  const mode = flagValue(argv, "--mode");
  if (mode !== "inventory" && mode !== "verify" && mode !== "apply-database") {
    throw new Error("--mode must be inventory, verify, or apply-database");
  }
  const environment = flagValue(argv, "--environment");
  if (environment !== "local" && environment !== "production") {
    throw new Error("--environment must be local or production");
  }
  if (flagValue(argv, "--confirm-environment") !== environment) {
    throw new Error(`requires --confirm-environment ${environment}`);
  }

  const implementationSha = requiredFlag(argv, "--implementation-sha");
  const sourceDigest = requiredFlag(argv, "--source-digest");
  assertSha(implementationSha, 40, "implementation SHA");
  assertSha(sourceDigest, 64, "source digest");
  const timeoutMs = Number(flagValue(argv, "--timeout-ms") ?? "30000");
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 30_000
  ) {
    throw new Error("--timeout-ms must be an integer between 1 and 30000");
  }

  const parsed: FacebookCleanupCliArgs = {
    mode,
    environment,
    implementationSha,
    sourceDigest,
    timeoutMs,
  };
  if (mode !== "apply-database") return parsed;
  if (environment !== "production") {
    throw new Error("apply-database is production-only");
  }

  parsed.planFile = requiredFlag(argv, "--plan-file");
  parsed.approvalFile = requiredFlag(argv, "--approval-file");
  parsed.currentTargetDigest = requiredFlag(argv, "--current-target-digest");
  parsed.currentMetaAdsExclusionDigest = requiredFlag(
    argv,
    "--current-meta-ads-exclusion-digest",
  );
  assertSha(parsed.currentTargetDigest, 64, "current target digest");
  assertSha(
    parsed.currentMetaAdsExclusionDigest,
    64,
    "current Meta Ads exclusion digest",
  );
  return parsed;
}

export function digestFacebookCleanupArtifact(artifact: string): string {
  return createHash("sha256")
    .update(Buffer.from(artifact, "utf8"))
    .digest("hex");
}

export function parseFacebookCleanupPlanArtifact(
  artifact: string,
  implementationSha: string,
): FacebookCleanupPlanV1 {
  assertSha(implementationSha, 40, "implementation SHA");
  const blocks = [
    ...artifact.matchAll(/```json ove297-plan-v1\n([^]*?)\n```/g),
  ];
  if (blocks.length !== 1) {
    throw new Error("plan must contain exactly one ove297-plan-v1 JSON block");
  }
  const parsed = JSON.parse(blocks[0]?.[1] ?? "null") as unknown;
  if (
    !isRecord(parsed) ||
    parsed.implementationSha !== "$OVE297_IMPLEMENTATION_SHA"
  ) {
    throw new Error("plan must use the approval-envelope SHA token");
  }
  const plan = { ...parsed, implementationSha };
  assertFacebookCleanupPlan(plan);
  return plan as unknown as FacebookCleanupPlanV1;
}

export function parseFacebookCleanupApprovalArtifact(
  artifact: string,
): FacebookCleanupApprovalReceipt & { status: "approved" } {
  const parsed = JSON.parse(artifact) as unknown;
  if (!isRecord(parsed)) throw new Error("approval receipt must be an object");
  const expectedKeys = [
    "status",
    "planDigest",
    "implementationSha",
    "environment",
    "counts",
    "targetDigest",
    "metaAdsExclusionDigest",
  ].sort();
  if (
    JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(expectedKeys)
  ) {
    throw new Error("approval receipt has an unexpected field set");
  }
  if (parsed.status !== "approved") {
    throw new Error("approval receipt must be explicitly approved");
  }
  if (parsed.environment !== "production") {
    throw new Error("approval receipt must target production");
  }
  assertSha(String(parsed.planDigest), 64, "plan digest");
  assertSha(String(parsed.implementationSha), 40, "implementation SHA");
  assertSha(String(parsed.targetDigest), 64, "target digest");
  assertSha(
    String(parsed.metaAdsExclusionDigest),
    64,
    "Meta Ads exclusion digest",
  );
  if (!isRecord(parsed.counts)) throw new Error("approval counts are missing");
  assertExactCounts(parsed.counts);
  if (
    classifyFacebookCleanupInventory(
      parsed.counts as unknown as FacebookCleanupCounts,
    ) !== "zero_inventory_proved"
  ) {
    throw new Error("approval counts do not satisfy the zero-account gate");
  }
  return parsed as unknown as FacebookCleanupApprovalReceipt & {
    status: "approved";
  };
}

export function classifyFacebookCleanupInventory(
  counts: FacebookCleanupCounts,
): FacebookCleanupInventoryClass {
  const values = Object.values(counts);
  if (
    values.length !== 5 ||
    values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    counts.facebookWithCredential > counts.facebookAccounts ||
    counts.facebookWithGoogle > counts.facebookAccounts ||
    counts.duplicateFacebookOwners > counts.facebookAccounts ||
    (counts.facebookAccounts === 0 && values.some((value) => value !== 0))
  ) {
    return "inventory_inconclusive";
  }
  if (counts.facebookOnly > 0) return "facebook_only_blocked";
  if (counts.duplicateFacebookOwners > 0) return "duplicate_ambiguity";
  return "zero_inventory_proved";
}

export function validateFacebookCleanupApproval({
  plan,
  planDigest,
  approval,
  current,
}: {
  plan: FacebookCleanupPlanV1;
  planDigest: string;
  approval: FacebookCleanupApprovalReceipt;
  current: CurrentCleanupBoundary;
}):
  | { ok: true; class: "approved_exact_plan" }
  | { ok: false; class: "approval_missing_or_drifted" } {
  const exact =
    approval.status === "approved" &&
    plan.inventoryClass === "zero_inventory_proved" &&
    classifyFacebookCleanupInventory(plan.counts) === "zero_inventory_proved" &&
    plan.environment === "production" &&
    planDigest === approval.planDigest &&
    plan.implementationSha === approval.implementationSha &&
    plan.implementationSha === current.implementationSha &&
    plan.environment === approval.environment &&
    plan.environment === current.environment &&
    countsEqual(plan.counts, approval.counts) &&
    countsEqual(plan.counts, current.counts) &&
    plan.targetDigest === approval.targetDigest &&
    plan.targetDigest === current.targetDigest &&
    plan.metaAdsExclusionDigest === approval.metaAdsExclusionDigest &&
    plan.metaAdsExclusionDigest === current.metaAdsExclusionDigest;

  return exact
    ? { ok: true, class: "approved_exact_plan" }
    : { ok: false, class: "approval_missing_or_drifted" };
}

export async function runApprovedCleanupSteps({
  steps,
  order,
}: {
  steps: Record<FacebookCleanupStep, () => Promise<{ class: string }>>;
  order: readonly FacebookCleanupStep[];
}): Promise<{
  resultClass: "completed" | "failed_verification";
  completedSteps: FacebookCleanupStep[];
  failedStep: FacebookCleanupStep | null;
  cleanupClaim: boolean;
}> {
  const expectedOrder: readonly FacebookCleanupStep[] = [
    "meta_login",
    "vercel_login_env",
    "database_accounts",
  ];
  if (JSON.stringify(order) !== JSON.stringify(expectedOrder)) {
    return {
      resultClass: "failed_verification",
      completedSteps: [],
      failedStep: order[0] ?? "meta_login",
      cleanupClaim: false,
    };
  }

  const expectedClasses: Record<FacebookCleanupStep, string> = {
    meta_login: "absent",
    vercel_login_env: "absent",
    database_accounts: "zero",
  };
  const completedSteps: FacebookCleanupStep[] = [];
  for (const step of order) {
    try {
      const result = await steps[step]();
      if (result.class !== expectedClasses[step]) {
        throw new Error("authoritative read-back class mismatch");
      }
      completedSteps.push(step);
    } catch {
      return {
        resultClass: "failed_verification",
        completedSteps,
        failedStep: step,
        cleanupClaim: false,
      };
    }
  }

  return {
    resultClass: "completed",
    completedSteps,
    failedStep: null,
    cleanupClaim: true,
  };
}

export async function settleExternalReadbackWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new Error("external read-back deadline must be positive");
  }

  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (result: { value: T } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if ("error" in result) reject(result.error);
      else resolve(result.value);
    };
    const timeout = setTimeout(() => {
      controller.abort();
      settle({
        error: new Error(
          `external read-back exceeded ${deadlineMs}ms deadline`,
        ),
      });
    }, deadlineMs);

    void operation(controller.signal).then(
      (value) => settle({ value }),
      (error) => settle({ error }),
    );
  });
}

function countsEqual(
  left: FacebookCleanupCounts,
  right: FacebookCleanupCounts,
) {
  return (
    left.facebookAccounts === right.facebookAccounts &&
    left.facebookOnly === right.facebookOnly &&
    left.facebookWithCredential === right.facebookWithCredential &&
    left.facebookWithGoogle === right.facebookWithGoogle &&
    left.duplicateFacebookOwners === right.duplicateFacebookOwners
  );
}

function allCountsZero(counts: FacebookCleanupCounts) {
  return Object.values(counts).every((count) => count === 0);
}

function assertSha(value: string, length: 40 | 64, label: string) {
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(value)) {
    throw new Error(`${label} must be an exact lowercase hex value`);
  }
}

function flagValue(argv: readonly string[], name: string): string | undefined {
  const indexes = argv.flatMap((argument, index) =>
    argument === name ? [index] : [],
  );
  if (indexes.length > 1) throw new Error(`${name} must be supplied once`);
  const index = indexes[0];
  if (index === undefined) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${name} requires a value`);
  return value;
}

function requiredFlag(argv: readonly string[], name: string): string {
  const value = flagValue(argv, name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertFacebookCleanupPlan(value: Record<string, unknown>): void {
  const expectedKeys = [
    "schema",
    "issue",
    "environment",
    "implementationSha",
    "sourceDigest",
    "counts",
    "inventoryClass",
    "databaseTargetClass",
    "metaLoginTargetClass",
    "metaLoginConfigClass",
    "vercelTargetNames",
    "vercelConfigClass",
    "targetDigest",
    "metaAdsExclusionDigest",
    "mutationOrder",
  ].sort();
  if (
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)
  ) {
    throw new Error("plan has an unexpected field set");
  }
  if (
    value.schema !== "overgarden.facebook-login-external-cleanup-plan.v1" ||
    value.issue !== "OVE-297" ||
    value.environment !== "production" ||
    value.databaseTargetClass !== "account_provider_id_facebook" ||
    value.metaLoginTargetClass !== "facebook_login_product_and_redirects" ||
    (value.metaLoginConfigClass !== "configured" &&
      value.metaLoginConfigClass !== "absent") ||
    (value.vercelConfigClass !== "exact_three_present" &&
      value.vercelConfigClass !== "absent")
  ) {
    throw new Error("plan has an invalid fixed contract field");
  }
  assertSha(String(value.implementationSha), 40, "implementation SHA");
  assertSha(String(value.sourceDigest), 64, "source digest");
  assertSha(String(value.targetDigest), 64, "target digest");
  assertSha(
    String(value.metaAdsExclusionDigest),
    64,
    "Meta Ads exclusion digest",
  );
  if (!isRecord(value.counts)) throw new Error("plan counts are missing");
  assertExactCounts(value.counts);
  const counts = value.counts as unknown as FacebookCleanupCounts;
  if (classifyFacebookCleanupInventory(counts) !== value.inventoryClass) {
    throw new Error("plan counts and inventory class disagree");
  }
  const expectedVercelNames = [
    "FACEBOOK_CLIENT_ID",
    "FACEBOOK_CLIENT_SECRET",
    "FACEBOOK_LOGIN_PUBLIC_READY",
  ];
  if (
    JSON.stringify(value.vercelTargetNames) !==
      JSON.stringify(expectedVercelNames) ||
    JSON.stringify(value.mutationOrder) !==
      JSON.stringify(["meta_login", "vercel_login_env", "database_accounts"])
  ) {
    throw new Error("plan target set or mutation order drifted");
  }
}

function assertExactCounts(value: Record<string, unknown>) {
  const expectedKeys = [
    "facebookAccounts",
    "facebookOnly",
    "facebookWithCredential",
    "facebookWithGoogle",
    "duplicateFacebookOwners",
  ].sort();
  if (
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)
  ) {
    throw new Error("aggregate counts have an unexpected field set");
  }
  if (
    Object.values(value).some(
      (count) => !Number.isSafeInteger(count) || Number(count) < 0,
    )
  ) {
    throw new Error("aggregate counts are invalid");
  }
}

export async function runFacebookCleanupCli(
  argv: readonly string[],
  {
    env = process.env,
    emit = (receipt: unknown) => console.log(JSON.stringify(receipt)),
    loadArtifact = (filePath: string) => readFile(filePath, "utf8"),
  }: {
    env?: Record<string, string | undefined>;
    emit?: (receipt: unknown) => void;
    loadArtifact?: (filePath: string) => Promise<string>;
  } = {},
): Promise<number> {
  let args: FacebookCleanupCliArgs | undefined;
  const startedAt = performance.now();
  let pool: Pool | undefined;
  try {
    args = parseFacebookCleanupCliArgs(argv);
    const resolution = resolveDatabaseConnection(env);
    const connectionString = resolvePgConnectionString(env, resolution);
    if (!connectionString) throw new Error("database connection unavailable");
    pool = new Pool({
      connectionString,
      max: 1,
      ssl: resolveDatabaseSslConfig(env, resolution),
      statement_timeout: args.timeoutMs,
    });
    const client = await pool.connect();
    try {
      if (args.mode === "inventory" || args.mode === "verify") {
        const receipt = await readFacebookCleanupInventory({
          client,
          environment: args.environment,
          implementationSha: args.implementationSha,
          sourceDigest: args.sourceDigest,
          deadlineMs: args.timeoutMs,
        });
        emit(receipt);
        if (args.mode === "verify" && !allCountsZero(receipt.counts)) return 1;
        return receipt.resultClass === "zero_inventory_proved" ? 0 : 1;
      }

      const planArtifact = await loadArtifact(args.planFile!);
      const approvalArtifact = await loadArtifact(args.approvalFile!);
      const planDigest = digestFacebookCleanupArtifact(planArtifact);
      const plan = parseFacebookCleanupPlanArtifact(
        planArtifact,
        args.implementationSha,
      );
      const approval = parseFacebookCleanupApprovalArtifact(approvalArtifact);
      if (plan.sourceDigest !== args.sourceDigest) {
        throw new Error("source digest drifted");
      }
      const result = await applyFacebookAccountCleanup({
        client,
        plan,
        planDigest,
        approval,
        currentTargetDigest: args.currentTargetDigest!,
        currentMetaAdsExclusionDigest: args.currentMetaAdsExclusionDigest!,
      });
      emit({
        schema: "overgarden.facebook-login-database-cleanup.v1",
        issue: "OVE-297",
        environment: "production",
        implementationSha: args.implementationSha,
        sourceDigest: args.sourceDigest,
        planDigest,
        resultClass: result.class,
        effectClass: result.effectClass,
        before: result.before,
        after: result.after,
        evidenceSafety: "five_counts_digests_and_classes_only",
      });
      return 0;
    } finally {
      client.release();
    }
  } catch (unsafeError) {
    if (args) {
      emit(
        buildFacebookCleanupFailureReceipt({
          environment: args.environment,
          implementationSha: args.implementationSha,
          sourceDigest: args.sourceDigest,
          durationMs: Math.min(
            30_000,
            Math.max(0, Math.ceil(performance.now() - startedAt)),
          ),
          failureClass: "inventory_inconclusive",
          unsafeError,
        }),
      );
    } else {
      emit({
        schema: "overgarden.facebook-login-command-refusal.v1",
        issue: "OVE-297",
        resultClass: "refused",
        evidenceSafety: "bounded_class_only_error_redacted",
      });
    }
    return 1;
  } finally {
    await pool?.end().catch(() => undefined);
  }
}

const invokedAsMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsMain) {
  const envFileIndex = process.argv.indexOf("--env-file");
  const envFile =
    envFileIndex >= 0 ? process.argv[envFileIndex + 1] : ".env.local";
  if (envFile) loadEnv({ path: envFile, override: false, quiet: true });
  void runFacebookCleanupCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      console.log(
        JSON.stringify({
          schema: "overgarden.facebook-login-command-refusal.v1",
          issue: "OVE-297",
          resultClass: "refused",
          evidenceSafety: "bounded_class_only_error_redacted",
        }),
      );
      process.exitCode = 1;
    });
}
