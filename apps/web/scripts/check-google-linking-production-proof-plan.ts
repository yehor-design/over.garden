import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

export interface GoogleLinkingProductionCounts {
  googleAccountRowCount: number;
  duplicateGoogleSubjectGroupCount: number;
  duplicateGoogleUserGroupCount: number;
  missingGoogleSubjectCount: number;
  invalidGoogleProviderRowCount: number;
}

export type GoogleLinkingInventoryClass =
  | "safe_to_apply"
  | "blocked_by_inventory"
  | "inventory_inconclusive";

export type GoogleLinkingIndexState =
  | "both_absent"
  | "both_exact"
  | "partial_or_drifted";

export type GoogleLinkingEnvironment = "local" | "production";

export const GOOGLE_INDEX_CANONICAL_DEFINITIONS = {
  providerSubject:
    "unique_index:account_google_provider_subject_unique_idx:public.account(providerId,accountId):where(providerId=google)",
  userProvider:
    "unique_index:account_google_user_provider_unique_idx:public.account(userId,providerId):where(providerId=google)",
} as const;

export interface GoogleLinkingIndexDefinitionDigests {
  providerSubject: string;
  userProvider: string;
}

export interface GoogleLinkingProductionPlanV1 {
  schema: "overgarden.google-linking-production-proof-plan.v1";
  issue: "OVE-298";
  environment: "production";
  implementationSha: string;
  migrationPath: "sql/0022_ove295_google_account_uniqueness.sql";
  migrationDigest: string;
  counts: GoogleLinkingProductionCounts;
  inventoryClass: "safe_to_apply";
  preflightIndexState: "both_absent" | "both_exact";
  expectedIndexDefinitionDigests: GoogleLinkingIndexDefinitionDigests;
  configurationClass: "absent_or_false";
  googleProviderClass: "configured";
  disposableIdentityClass: "ordinary_credential_non_owner_non_admin";
  terminalSuccessConfiguration: "enabled";
  targetDigest: string;
  effectBounds: {
    indexCreates: 2;
    configurationWrites: 1;
    disposableAccountCreates: 1;
    verificationCallbacks: 1;
    linkInitiations: 1;
    callbacks: 1;
    unlinks: 1;
    providerRevocations: 1;
    erasureExecutions: 1;
  };
  mutationOrder: readonly [
    "database_indexes",
    "vercel_flag",
    "disposable_signup",
    "email_verification",
    "disposable_link",
    "authoritative_readback",
    "fresh_session_unlink",
    "provider_revoke",
    "erasure_cleanup",
  ];
}

export interface GoogleLinkingApprovalReceiptV1 {
  status: "pending" | "approved";
  planDigest: string;
  implementationSha: string;
  environment: "production";
  migrationDigest: string;
  counts: GoogleLinkingProductionCounts;
  targetDigest: string;
  disposableIdentityClass: "ordinary_credential_non_owner_non_admin";
  terminalSuccessConfiguration: "enabled";
}

export interface GoogleLinkingProductionInventoryV1 {
  schema: "overgarden.google-linking-production-inventory.v1";
  issue: "OVE-298";
  environment: GoogleLinkingEnvironment;
  implementationSha: string;
  migrationDigest: string;
  targetDigest: string;
  resultClass: GoogleLinkingInventoryClass;
  durationMs: number;
  counts: GoogleLinkingProductionCounts;
  indexState: GoogleLinkingIndexState;
  indexDefinitionDigests: GoogleLinkingIndexDefinitionDigests | null;
  evidenceSafety: "five_counts_digests_and_classes_only";
}

export interface GoogleLinkingProductionReceiptV1 {
  schema: "overgarden.google-linking-production-receipt.v1";
  issue: "OVE-298";
  version: 1;
  planDigest: string;
  implementationSha: string;
  deploymentSha: string;
  migrationDigest: string;
  environmentClass: "production_over_garden";
  state: "completed" | "failed";
  fiveCounts: GoogleLinkingProductionCounts;
  indexDefinitionDigests: GoogleLinkingIndexDefinitionDigests;
  configurationClass: "enabled" | "absent_or_false" | "uncertain";
  linkOutcome: "linked_once" | "not_started" | "uncertain";
  readbackOutcome:
    | "current_user_google_present"
    | "google_absent"
    | "uncertain";
  unlinkOutcome:
    | "google_absent_credential_present"
    | "not_started"
    | "uncertain";
  providerCleanupOutcome: "revoked" | "not_started" | "uncertain";
  sessionCleanupOutcome: "disposable_absent" | "not_started" | "uncertain";
  rollbackOutcome: "not_required" | "disabled" | "uncertain";
  evidenceDigest: string;
}

interface QueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
}

interface QueryExecutor {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
}

interface CurrentApprovalBoundary {
  implementationSha: string;
  migrationDigest: string;
  counts: GoogleLinkingProductionCounts;
  targetDigest: string;
  indexState: GoogleLinkingIndexState;
}

const COUNT_KEYS = [
  "googleAccountRowCount",
  "duplicateGoogleSubjectGroupCount",
  "duplicateGoogleUserGroupCount",
  "missingGoogleSubjectCount",
  "invalidGoogleProviderRowCount",
] as const satisfies readonly (keyof GoogleLinkingProductionCounts)[];

const GOOGLE_AGGREGATE_QUERIES: ReadonlyArray<{
  key: keyof GoogleLinkingProductionCounts;
  text: string;
  values: unknown[];
}> = [
  {
    key: "googleAccountRowCount",
    text: `/* googleAccountRowCount */
      select count(*)::text as count
      from public.account
      where "providerId" = $1`,
    values: ["google"],
  },
  {
    key: "duplicateGoogleSubjectGroupCount",
    text: `/* duplicateGoogleSubjectGroupCount */
      select count(*)::text as count
      from (
        select 1
        from public.account
        where "providerId" = $1
        group by "providerId", "accountId"
        having count(*) > 1
      ) aggregate_only`,
    values: ["google"],
  },
  {
    key: "duplicateGoogleUserGroupCount",
    text: `/* duplicateGoogleUserGroupCount */
      select count(*)::text as count
      from (
        select 1
        from public.account
        where "providerId" = $1
        group by "userId", "providerId"
        having count(*) > 1
      ) aggregate_only`,
    values: ["google"],
  },
  {
    key: "missingGoogleSubjectCount",
    text: `/* missingGoogleSubjectCount */
      select count(*)::text as count
      from public.account
      where "providerId" = $1
        and ("accountId" is null or btrim("accountId") = '')`,
    values: ["google"],
  },
  {
    key: "invalidGoogleProviderRowCount",
    text: `/* invalidGoogleProviderRowCount */
      select count(*)::text as count
      from public.account
      where lower(btrim("providerId")) = $1
        and "providerId" <> $1`,
    values: ["google"],
  },
];

const INDEX_READBACK_SQL = `/* googleLinkingIndexReadback */
  select indexname, indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'account'
    and indexname = any($1::text[])
  order by indexname`;

const EXPECTED_INDEX_NAMES = [
  "account_google_provider_subject_unique_idx",
  "account_google_user_provider_unique_idx",
] as const;

const EXPECTED_MUTATION_ORDER = [
  "database_indexes",
  "vercel_flag",
  "disposable_signup",
  "email_verification",
  "disposable_link",
  "authoritative_readback",
  "fresh_session_unlink",
  "provider_revoke",
  "erasure_cleanup",
] as const;

const EFFECT_BOUNDS = {
  indexCreates: 2,
  configurationWrites: 1,
  disposableAccountCreates: 1,
  verificationCallbacks: 1,
  linkInitiations: 1,
  callbacks: 1,
  unlinks: 1,
  providerRevocations: 1,
  erasureExecutions: 1,
} as const;

export function classifyGoogleLinkingCounts(
  counts: GoogleLinkingProductionCounts,
): GoogleLinkingInventoryClass {
  if (!hasExactCountShape(counts)) return "inventory_inconclusive";
  if (
    counts.duplicateGoogleSubjectGroupCount > counts.googleAccountRowCount ||
    counts.duplicateGoogleUserGroupCount > counts.googleAccountRowCount ||
    counts.missingGoogleSubjectCount > counts.googleAccountRowCount
  ) {
    return "inventory_inconclusive";
  }
  return counts.duplicateGoogleSubjectGroupCount === 0 &&
    counts.duplicateGoogleUserGroupCount === 0 &&
    counts.missingGoogleSubjectCount === 0 &&
    counts.invalidGoogleProviderRowCount === 0
    ? "safe_to_apply"
    : "blocked_by_inventory";
}

export async function collectGoogleLinkingCounts(
  executor: QueryExecutor,
): Promise<GoogleLinkingProductionCounts> {
  const counts: Partial<GoogleLinkingProductionCounts> = {};
  for (const query of GOOGLE_AGGREGATE_QUERIES) {
    const result = await executor.query(query.text, [...query.values]);
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !row ||
      JSON.stringify(Object.keys(row)) !== JSON.stringify(["count"])
    ) {
      throw new Error("unsafe aggregate count shape");
    }
    const count = typeof row.count === "number" ? row.count : Number(row.count);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("invalid aggregate count shape");
    }
    counts[query.key] = count;
  }
  const complete = counts as GoogleLinkingProductionCounts;
  if (!hasExactCountShape(complete)) {
    throw new Error("aggregate count set is incomplete");
  }
  return complete;
}

export async function settleGoogleLinkingReadbackWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > 30_000
  ) {
    throw new Error("read-back deadline must be between 1 and 30000ms");
  }
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(() => {
      controller.abort();
      reject(new Error("read-back deadline exceeded"));
    }, deadlineMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timedOut]);
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
  }
}

export async function readGoogleLinkingProductionInventory({
  client,
  environment,
  implementationSha,
  migrationDigest,
  targetDigest,
  deadlineMs = 30_000,
  now = () => performance.now(),
}: {
  client: QueryExecutor;
  environment: GoogleLinkingEnvironment;
  implementationSha: string;
  migrationDigest: string;
  targetDigest: string;
  deadlineMs?: number;
  now?: () => number;
}): Promise<GoogleLinkingProductionInventoryV1> {
  assertSha(implementationSha, 40, "implementation SHA");
  assertSha(migrationDigest, 64, "migration digest");
  assertSha(targetDigest, 64, "target digest");
  const startedAt = now();
  await client.query("begin isolation level repeatable read read only");
  try {
    await client.query("set local statement_timeout = '5000ms'");
    const boundary = await settleGoogleLinkingReadbackWithinDeadline(
      async () => captureBoundary(client),
      deadlineMs,
    );
    await client.query("commit");
    return {
      schema: "overgarden.google-linking-production-inventory.v1",
      issue: "OVE-298",
      environment,
      implementationSha,
      migrationDigest,
      targetDigest,
      resultClass: classifyGoogleLinkingCounts(boundary.counts),
      durationMs: Math.min(
        deadlineMs,
        Math.max(0, Math.ceil(now() - startedAt)),
      ),
      counts: boundary.counts,
      indexState: boundary.indexState,
      indexDefinitionDigests: boundary.indexDefinitionDigests,
      evidenceSafety: "five_counts_digests_and_classes_only",
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

export function digestGoogleLinkingArtifact(artifact: string) {
  return createHash("sha256")
    .update(Buffer.from(artifact, "utf8"))
    .digest("hex");
}

export function parseGoogleLinkingPlanArtifact(
  artifact: string,
  implementationSha: string,
): GoogleLinkingProductionPlanV1 {
  assertSha(implementationSha, 40, "implementation SHA");
  const blocks = [
    ...artifact.matchAll(/```json ove298-plan-v1\n([^]*?)\n```/g),
  ];
  if (blocks.length !== 1) {
    throw new Error("plan must contain exactly one ove298-plan-v1 JSON block");
  }
  const parsed = JSON.parse(blocks[0]?.[1] ?? "null") as unknown;
  if (
    !isRecord(parsed) ||
    parsed.implementationSha !== "$OVE298_IMPLEMENTATION_SHA"
  ) {
    throw new Error("plan must use the approval-envelope SHA token");
  }
  const plan = { ...parsed, implementationSha };
  assertGoogleLinkingPlan(plan);
  return plan as unknown as GoogleLinkingProductionPlanV1;
}

export function parseGoogleLinkingApprovalArtifact(
  artifact: string,
): GoogleLinkingApprovalReceiptV1 & { status: "approved" } {
  const parsed = JSON.parse(artifact) as unknown;
  if (!isRecord(parsed)) throw new Error("approval receipt must be an object");
  assertExactKeys(
    parsed,
    [
      "status",
      "planDigest",
      "implementationSha",
      "environment",
      "migrationDigest",
      "counts",
      "targetDigest",
      "disposableIdentityClass",
      "terminalSuccessConfiguration",
    ],
    "approval receipt",
  );
  if (parsed.status !== "approved") {
    throw new Error("approval receipt must be explicitly approved");
  }
  if (
    parsed.environment !== "production" ||
    parsed.disposableIdentityClass !==
      "ordinary_credential_non_owner_non_admin" ||
    parsed.terminalSuccessConfiguration !== "enabled"
  ) {
    throw new Error("approval receipt scope is invalid");
  }
  assertSha(String(parsed.planDigest), 64, "plan digest");
  assertSha(String(parsed.implementationSha), 40, "implementation SHA");
  assertSha(String(parsed.migrationDigest), 64, "migration digest");
  assertSha(String(parsed.targetDigest), 64, "target digest");
  if (!isRecord(parsed.counts) || !hasExactCountShape(parsed.counts)) {
    throw new Error("approval counts are invalid");
  }
  return parsed as unknown as GoogleLinkingApprovalReceiptV1 & {
    status: "approved";
  };
}

export function validateGoogleLinkingApproval({
  plan,
  planDigest,
  approval,
  current,
}: {
  plan: GoogleLinkingProductionPlanV1;
  planDigest: string;
  approval: GoogleLinkingApprovalReceiptV1;
  current: CurrentApprovalBoundary;
}):
  | { ok: true; class: "approved_exact_plan" }
  | { ok: false; class: "approval_missing_or_drifted" } {
  const exact =
    approval.status === "approved" &&
    plan.inventoryClass === "safe_to_apply" &&
    classifyGoogleLinkingCounts(plan.counts) === "safe_to_apply" &&
    plan.environment === "production" &&
    planDigest === approval.planDigest &&
    plan.implementationSha === approval.implementationSha &&
    plan.implementationSha === current.implementationSha &&
    plan.migrationDigest === approval.migrationDigest &&
    plan.migrationDigest === current.migrationDigest &&
    plan.environment === approval.environment &&
    countsEqual(plan.counts, approval.counts) &&
    countsEqual(plan.counts, current.counts) &&
    plan.targetDigest === approval.targetDigest &&
    plan.targetDigest === current.targetDigest &&
    plan.preflightIndexState === current.indexState &&
    approval.disposableIdentityClass ===
      "ordinary_credential_non_owner_non_admin" &&
    approval.terminalSuccessConfiguration === "enabled";
  return exact
    ? { ok: true, class: "approved_exact_plan" }
    : { ok: false, class: "approval_missing_or_drifted" };
}

export async function applyGoogleLinkingIndexes({
  client,
  plan,
  planDigest,
  approval,
  implementationSha,
  migrationSql,
  targetDigest,
}: {
  client: QueryExecutor;
  plan: GoogleLinkingProductionPlanV1;
  planDigest: string;
  approval: GoogleLinkingApprovalReceiptV1;
  implementationSha: string;
  migrationSql: string;
  targetDigest: string;
}): Promise<{
  resultClass: "indexes_verified";
  effectClass: "created_two_indexes" | "already_exact";
  before: Awaited<ReturnType<typeof captureBoundary>>;
  after: Awaited<ReturnType<typeof captureBoundary>>;
}> {
  if (digestGoogleLinkingArtifact(migrationSql) !== plan.migrationDigest) {
    throw new Error("tracked migration digest drifted");
  }
  await client.query("begin isolation level serializable read write");
  try {
    await client.query("set local statement_timeout = '30000ms'");
    await client.query("set local lock_timeout = '5000ms'");
    const before = await captureBoundary(client);
    const approvalResult = validateGoogleLinkingApproval({
      plan,
      planDigest,
      approval,
      current: {
        implementationSha,
        migrationDigest: digestGoogleLinkingArtifact(migrationSql),
        counts: before.counts,
        targetDigest,
        indexState: before.indexState,
      },
    });
    if (!approvalResult.ok) {
      throw new Error("approved index plan is missing or drifted");
    }
    if (before.indexState === "partial_or_drifted") {
      throw new Error("approved index plan is missing or drifted");
    }

    const effectClass =
      before.indexState === "both_exact"
        ? "already_exact"
        : "created_two_indexes";
    if (before.indexState === "both_absent") {
      await client.query(migrationSql);
    }
    const after = await captureBoundary(client);
    if (
      after.indexState !== "both_exact" ||
      classifyGoogleLinkingCounts(after.counts) !== "safe_to_apply" ||
      !countsEqual(before.counts, after.counts)
    ) {
      throw new Error("index apply read-back failed");
    }
    await client.query("commit");
    return {
      resultClass: "indexes_verified",
      effectClass,
      before,
      after,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

export function validateGoogleLinkingTerminalReceipt(
  input: unknown,
):
  | { ok: true; class: "completed" }
  | { ok: false; class: "incomplete_or_drifted" } {
  if (!isRecord(input)) throw new Error("terminal receipt must be an object");
  assertExactKeys(
    input,
    [
      "schema",
      "issue",
      "version",
      "planDigest",
      "implementationSha",
      "deploymentSha",
      "migrationDigest",
      "environmentClass",
      "state",
      "fiveCounts",
      "indexDefinitionDigests",
      "configurationClass",
      "linkOutcome",
      "readbackOutcome",
      "unlinkOutcome",
      "providerCleanupOutcome",
      "sessionCleanupOutcome",
      "rollbackOutcome",
      "evidenceDigest",
    ],
    "terminal receipt",
  );
  for (const [key, length] of [
    ["planDigest", 64],
    ["implementationSha", 40],
    ["deploymentSha", 40],
    ["migrationDigest", 64],
    ["evidenceDigest", 64],
  ] as const) {
    assertSha(String(input[key]), length, key);
  }
  if (!isRecord(input.fiveCounts) || !hasExactCountShape(input.fiveCounts)) {
    throw new Error("terminal receipt counts are invalid");
  }
  assertIndexDefinitionDigests(input.indexDefinitionDigests);

  const completed =
    input.schema === "overgarden.google-linking-production-receipt.v1" &&
    input.issue === "OVE-298" &&
    input.version === 1 &&
    input.environmentClass === "production_over_garden" &&
    input.state === "completed" &&
    classifyGoogleLinkingCounts(
      input.fiveCounts as unknown as GoogleLinkingProductionCounts,
    ) === "safe_to_apply" &&
    input.configurationClass === "enabled" &&
    input.linkOutcome === "linked_once" &&
    input.readbackOutcome === "current_user_google_present" &&
    input.unlinkOutcome === "google_absent_credential_present" &&
    input.providerCleanupOutcome === "revoked" &&
    input.sessionCleanupOutcome === "disposable_absent" &&
    input.rollbackOutcome === "not_required";
  return completed
    ? { ok: true, class: "completed" }
    : { ok: false, class: "incomplete_or_drifted" };
}

async function captureBoundary(executor: QueryExecutor) {
  const counts = await collectGoogleLinkingCounts(executor);
  const indexes = await readGoogleLinkingIndexState(executor);
  return { counts, ...indexes };
}

async function readGoogleLinkingIndexState(executor: QueryExecutor): Promise<{
  indexState: GoogleLinkingIndexState;
  indexDefinitionDigests: GoogleLinkingIndexDefinitionDigests | null;
}> {
  const result = await executor.query(INDEX_READBACK_SQL, [
    [...EXPECTED_INDEX_NAMES],
  ]);
  if (result.rows.length === 0) {
    return { indexState: "both_absent", indexDefinitionDigests: null };
  }
  if (result.rows.length !== 2) {
    return { indexState: "partial_or_drifted", indexDefinitionDigests: null };
  }
  const byName = new Map<string, string>();
  for (const row of result.rows) {
    if (typeof row.indexname !== "string" || typeof row.indexdef !== "string") {
      return { indexState: "partial_or_drifted", indexDefinitionDigests: null };
    }
    byName.set(row.indexname, row.indexdef);
  }
  const providerSubject = canonicalizeIndexDefinition(
    "account_google_provider_subject_unique_idx",
    byName.get("account_google_provider_subject_unique_idx"),
  );
  const userProvider = canonicalizeIndexDefinition(
    "account_google_user_provider_unique_idx",
    byName.get("account_google_user_provider_unique_idx"),
  );
  if (!providerSubject || !userProvider) {
    return { indexState: "partial_or_drifted", indexDefinitionDigests: null };
  }
  return {
    indexState: "both_exact",
    indexDefinitionDigests: {
      providerSubject: digestGoogleLinkingArtifact(providerSubject),
      userProvider: digestGoogleLinkingArtifact(userProvider),
    },
  };
}

function canonicalizeIndexDefinition(
  name: (typeof EXPECTED_INDEX_NAMES)[number],
  definition: string | undefined,
) {
  if (!definition) return null;
  const compact = definition
    .toLowerCase()
    .replaceAll('"', "")
    .replaceAll("::text", "")
    .replace(/\s+/g, "")
    .replaceAll("usingbtree", "")
    .replace(/[()]/g, "");
  const expected =
    name === "account_google_provider_subject_unique_idx"
      ? "createuniqueindexaccount_google_provider_subject_unique_idxonpublic.accountproviderid,accountidwhereproviderid='google'"
      : "createuniqueindexaccount_google_user_provider_unique_idxonpublic.accountuserid,provideridwhereproviderid='google'";
  if (compact !== expected) return null;
  return name === "account_google_provider_subject_unique_idx"
    ? GOOGLE_INDEX_CANONICAL_DEFINITIONS.providerSubject
    : GOOGLE_INDEX_CANONICAL_DEFINITIONS.userProvider;
}

function assertGoogleLinkingPlan(
  value: unknown,
): asserts value is GoogleLinkingProductionPlanV1 {
  if (!isRecord(value)) throw new Error("plan must be an object");
  assertExactKeys(
    value,
    [
      "schema",
      "issue",
      "environment",
      "implementationSha",
      "migrationPath",
      "migrationDigest",
      "counts",
      "inventoryClass",
      "preflightIndexState",
      "expectedIndexDefinitionDigests",
      "configurationClass",
      "googleProviderClass",
      "disposableIdentityClass",
      "terminalSuccessConfiguration",
      "targetDigest",
      "effectBounds",
      "mutationOrder",
    ],
    "plan",
  );
  if (
    value.schema !== "overgarden.google-linking-production-proof-plan.v1" ||
    value.issue !== "OVE-298" ||
    value.environment !== "production" ||
    value.migrationPath !== "sql/0022_ove295_google_account_uniqueness.sql" ||
    value.inventoryClass !== "safe_to_apply" ||
    (value.preflightIndexState !== "both_absent" &&
      value.preflightIndexState !== "both_exact") ||
    value.configurationClass !== "absent_or_false" ||
    value.googleProviderClass !== "configured" ||
    value.disposableIdentityClass !==
      "ordinary_credential_non_owner_non_admin" ||
    value.terminalSuccessConfiguration !== "enabled"
  ) {
    throw new Error("plan scope or disposable identity is invalid");
  }
  assertSha(String(value.implementationSha), 40, "implementation SHA");
  assertSha(String(value.migrationDigest), 64, "migration digest");
  assertSha(String(value.targetDigest), 64, "target digest");
  if (!isRecord(value.counts) || !hasExactCountShape(value.counts)) {
    throw new Error("plan counts are invalid");
  }
  if (
    classifyGoogleLinkingCounts(
      value.counts as unknown as GoogleLinkingProductionCounts,
    ) !== value.inventoryClass
  ) {
    throw new Error("plan counts do not satisfy the safe gate");
  }
  assertIndexDefinitionDigests(value.expectedIndexDefinitionDigests);
  if (!isRecord(value.effectBounds)) {
    throw new Error("plan effect bounds are missing");
  }
  assertExactKeys(
    value.effectBounds,
    Object.keys(EFFECT_BOUNDS),
    "effect bounds",
  );
  if (JSON.stringify(value.effectBounds) !== JSON.stringify(EFFECT_BOUNDS)) {
    throw new Error("plan effect bounds drifted");
  }
  if (
    JSON.stringify(value.mutationOrder) !==
    JSON.stringify(EXPECTED_MUTATION_ORDER)
  ) {
    throw new Error("plan mutation order drifted");
  }
}

function assertIndexDefinitionDigests(value: unknown) {
  if (!isRecord(value)) throw new Error("index definition digests are missing");
  assertExactKeys(
    value,
    ["providerSubject", "userProvider"],
    "index definition digests",
  );
  const expected = {
    providerSubject: digestGoogleLinkingArtifact(
      GOOGLE_INDEX_CANONICAL_DEFINITIONS.providerSubject,
    ),
    userProvider: digestGoogleLinkingArtifact(
      GOOGLE_INDEX_CANONICAL_DEFINITIONS.userProvider,
    ),
  };
  if (
    value.providerSubject !== expected.providerSubject ||
    value.userProvider !== expected.userProvider
  ) {
    throw new Error("index definition digest drifted");
  }
}

function hasExactCountShape(
  value: unknown,
): value is GoogleLinkingProductionCounts {
  if (!isRecord(value)) return false;
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...COUNT_KEYS].sort())
  ) {
    return false;
  }
  return COUNT_KEYS.every(
    (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0,
  );
}

function countsEqual(
  left: GoogleLinkingProductionCounts,
  right: GoogleLinkingProductionCounts,
) {
  return COUNT_KEYS.every((key) => left[key] === right[key]);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...expected].sort())
  ) {
    throw new Error(`${label} has an unexpected field set`);
  }
}

function assertSha(value: string, length: 40 | 64, label: string) {
  const pattern = length === 40 ? /^[0-9a-f]{40}$/ : /^[0-9a-f]{64}$/;
  if (!pattern.test(value)) throw new Error(`${label} is invalid`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type CliMode =
  | "inventory"
  | "verify-indexes"
  | "apply-indexes"
  | "verify-receipt";

interface CliArgs {
  mode: CliMode;
  environment?: GoogleLinkingEnvironment;
  implementationSha?: string;
  timeoutMs: number;
  planFile?: string;
  approvalFile?: string;
  receiptFile?: string;
}

function parseCliArgs(argv: readonly string[]): CliArgs {
  const mode = flagValue(argv, "--mode");
  if (
    mode !== "inventory" &&
    mode !== "verify-indexes" &&
    mode !== "apply-indexes" &&
    mode !== "verify-receipt"
  ) {
    throw new Error("unsupported mode");
  }
  const timeoutMs = Number(flagValue(argv, "--timeout-ms") ?? "30000");
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 30_000
  ) {
    throw new Error("invalid timeout");
  }
  if (mode === "verify-receipt") {
    return {
      mode,
      timeoutMs,
      receiptFile: requiredFlag(argv, "--receipt-file"),
    };
  }
  const environment = requiredFlag(argv, "--environment");
  if (environment !== "local" && environment !== "production") {
    throw new Error("invalid environment");
  }
  if (flagValue(argv, "--confirm-environment") !== environment) {
    throw new Error("environment confirmation mismatch");
  }
  const implementationSha = requiredFlag(argv, "--implementation-sha");
  assertSha(implementationSha, 40, "implementation SHA");
  const parsed: CliArgs = { mode, environment, implementationSha, timeoutMs };
  if (mode === "apply-indexes") {
    if (environment !== "production") {
      throw new Error("apply-indexes is production-only");
    }
    parsed.planFile = requiredFlag(argv, "--plan-file");
    parsed.approvalFile = requiredFlag(argv, "--approval-file");
  }
  return parsed;
}

export async function runGoogleLinkingProductionCli(
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
) {
  let args: CliArgs | undefined;
  let pool: Pool | undefined;
  try {
    args = parseCliArgs(argv);
    if (args.mode === "verify-receipt") {
      const receipt = JSON.parse(
        await loadArtifact(args.receiptFile!),
      ) as unknown;
      const result = validateGoogleLinkingTerminalReceipt(receipt);
      emit({
        schema: "overgarden.google-linking-production-receipt-check.v1",
        issue: "OVE-298",
        ...result,
        evidenceSafety: "digests_counts_and_classes_only",
      });
      return result.ok ? 0 : 1;
    }

    const resolution = resolveDatabaseConnection(env);
    const connectionString = resolvePgConnectionString(env, resolution);
    if (!connectionString) throw new Error("database connection unavailable");
    assertTargetClass(connectionString, args.environment!);
    const targetDigest = digestDatabaseTarget(
      connectionString,
      args.environment!,
    );
    const migrationPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "sql",
      "0022_ove295_google_account_uniqueness.sql",
    );
    const migrationSql = await loadArtifact(migrationPath);
    const migrationDigest = digestGoogleLinkingArtifact(migrationSql);

    pool = new Pool({
      connectionString,
      max: 1,
      ssl: resolveDatabaseSslConfig(env, resolution),
      statement_timeout: args.timeoutMs,
    });
    const client = await pool.connect();
    try {
      if (args.mode === "inventory" || args.mode === "verify-indexes") {
        const receipt = await readGoogleLinkingProductionInventory({
          client,
          environment: args.environment!,
          implementationSha: args.implementationSha!,
          migrationDigest,
          targetDigest,
          deadlineMs: args.timeoutMs,
        });
        emit(receipt);
        const safe = receipt.resultClass === "safe_to_apply";
        const indexSafe =
          receipt.indexState === "both_absent" ||
          receipt.indexState === "both_exact";
        if (args.mode === "verify-indexes") {
          return safe && receipt.indexState === "both_exact" ? 0 : 1;
        }
        return safe && indexSafe ? 0 : 1;
      }

      const planArtifact = await loadArtifact(args.planFile!);
      const approvalArtifact = await loadArtifact(args.approvalFile!);
      const planDigest = digestGoogleLinkingArtifact(planArtifact);
      const plan = parseGoogleLinkingPlanArtifact(
        planArtifact,
        args.implementationSha!,
      );
      const approval = parseGoogleLinkingApprovalArtifact(approvalArtifact);
      const result = await applyGoogleLinkingIndexes({
        client,
        plan,
        planDigest,
        approval,
        implementationSha: args.implementationSha!,
        migrationSql,
        targetDigest,
      });
      emit({
        schema: "overgarden.google-linking-production-index-apply.v1",
        issue: "OVE-298",
        environment: "production",
        implementationSha: args.implementationSha,
        planDigest,
        migrationDigest,
        targetDigest,
        resultClass: result.resultClass,
        effectClass: result.effectClass,
        before: result.before,
        after: result.after,
        evidenceSafety: "five_counts_digests_and_classes_only",
      });
      return 0;
    } finally {
      client.release();
    }
  } catch {
    emit({
      schema: "overgarden.google-linking-production-command-refusal.v1",
      issue: "OVE-298",
      resultClass: "refused_or_inconclusive",
      evidenceSafety: "bounded_class_only_error_redacted",
    });
    return 1;
  } finally {
    await pool?.end().catch(() => undefined);
  }
}

function assertTargetClass(
  connectionString: string,
  environment: GoogleLinkingEnvironment,
) {
  const hostname = new URL(connectionString).hostname.toLowerCase();
  const loopback =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (
    (environment === "production" && loopback) ||
    (environment === "local" && !loopback)
  ) {
    throw new Error("database target class mismatch");
  }
}

function digestDatabaseTarget(
  connectionString: string,
  environment: GoogleLinkingEnvironment,
) {
  const parsed = new URL(connectionString);
  const payload = JSON.stringify({
    schema: "overgarden.google-linking-database-target.v1",
    environment,
    protocol: parsed.protocol,
    hostname: parsed.hostname.toLowerCase(),
    port: parsed.port || "5432",
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    schemaName: "public",
    tableName: "account",
  });
  return digestGoogleLinkingArtifact(payload);
}

function requiredFlag(argv: readonly string[], name: string) {
  const value = flagValue(argv, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function flagValue(argv: readonly string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const invokedAsMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsMain) {
  const envFile = flagValue(process.argv, "--env-file") ?? ".env.local";
  loadEnv({ path: envFile, override: false, quiet: true });
  void runGoogleLinkingProductionCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
