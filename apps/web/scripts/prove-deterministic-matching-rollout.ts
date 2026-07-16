import {
  execFileSync,
  spawn,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Meilisearch } from "meilisearch";
import { Pool } from "pg";

import {
  buildLocalDeterministicMatchingRolloutEvidence,
  buildNonLocalDeterministicMatchingRolloutEvidence,
  parseDeterministicMatchingRolloutArgs,
  validateDeterministicMatchingRolloutOptions,
  type DeterministicMatchingRolloutCodeState,
} from "../src/lib/catalog/deterministic-matching-rollout-proof";
import { extractJsonObjectFromCommandOutput } from "../src/lib/catalog/seed-rollout-proof";
import type { Database } from "../src/db/schema";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import { readCatalogEntityResolutionQaReport } from "../src/server/catalog-source/entity-resolution-qa-repository";
import {
  CATALOG_TYPEAHEAD_INDEX,
  catalogTypeaheadHitToSuggestion,
} from "../src/server/search/catalog-documents";

loadEnv({ path: ".env.local", override: false, quiet: true });

const MATCHING_SERVICE_DIR = path.resolve(
  process.cwd(),
  "../../services/matching",
);
const LOCAL_COMMAND_TIMEOUT_MS = 12 * 60 * 1000;
const LOCAL_APP_READY_TIMEOUT_MS = 2 * 60 * 1000;
const LOCAL_APP_POLL_MS = 500;

async function main() {
  const options = validateDeterministicMatchingRolloutOptions(
    parseDeterministicMatchingRolloutArgs(process.argv.slice(2)),
  );
  const codeState = readCodeState();
  const connection = resolveDatabaseTarget();
  validateDatabaseTarget(options.environment, connection.connectionString);

  if (options.environment === "local") {
    await runLocalProof(options, codeState, connection.connectionString);
    return;
  }

  await runNonLocalProof(options, codeState, connection);
}

async function runLocalProof(
  options: ReturnType<typeof validateDeterministicMatchingRolloutOptions>,
  codeState: DeterministicMatchingRolloutCodeState,
  connectionString: string,
) {
  const app = await ensureLocalApp(options.baseUrl);

  try {
    logStep("canonical suggestion generation and rejection replay");
    const canonicalRefresh = runJsonCommand(
      "uv",
      [
        "run",
        "--frozen",
        "python",
        "-m",
        "scripts.smoke_catalog_match_rejection_replay",
      ],
      MATCHING_SERVICE_DIR,
      { DIRECT_URL: connectionString },
    );

    logStep("canonical approval, rejection, history, and reindex transaction");
    const canonicalMatch = runPackageJsonScript("smoke:catalog-match-approval");

    logStep("review-gated alias approval, rejection, collision, and replay");
    const aliasReview = runPackageJsonScript("smoke:catalog-alias-approval");

    logStep("real gardener typeahead, save, and canonical readback");
    const gardenerReadback = runPackageJsonScript(
      "smoke:catalog-gardener-readback",
      { OVE161_SMOKE_BASE_URL: options.baseUrl },
    );

    logStep("bounded advisory fuzzy duplicate QA");
    const fuzzyDuplicate = runPackageJsonScript(
      "smoke:catalog-fuzzy-duplicate-qa",
    );

    logStep("worker handlers, recovery, retries, and algorithm replay");
    runCommand("uv", ["run", "--frozen", "pytest", "-q"], MATCHING_SERVICE_DIR);

    const evidence = buildLocalDeterministicMatchingRolloutEvidence({
      options,
      codeState,
      canonicalRefresh,
      canonicalMatch,
      aliasReview,
      gardenerReadback,
      fuzzyDuplicate,
      workerRecovery: {
        status: "passed",
        jobKinds: [
          "catalog_match_suggestions_refresh",
          "catalog_alias_suggestions_refresh",
          "catalog_fuzzy_duplicate_qa_refresh",
          "catalog_typeahead_reindex",
        ],
        staleClaimRecovery: true,
        boundedLeaseCoverage: true,
        rerunRequestedCoverage: true,
        idempotentHandlerCoverage: true,
      },
      generatedAt: new Date().toISOString(),
    });

    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await app.stop();
  }
}

async function runNonLocalProof(
  options: ReturnType<typeof validateDeterministicMatchingRolloutOptions>,
  codeState: DeterministicMatchingRolloutCodeState,
  connection: ReturnType<typeof resolveDatabaseTarget>,
) {
  const pool = new Pool({
    connectionString: connection.connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, connection.resolution),
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    logStep("read-only deployed runtime check");
    const runtime = await readRuntimeProof(options.baseUrl);
    logStep("read-only catalog matching schema and payload constraints");
    const schema = await readSchemaProof(db);
    logStep("read-only derived typeahead safety and visibility");
    const search = await readSearchProof(db);
    logStep("read-only redacted entity-resolution QA summary");
    const report = await readCatalogEntityResolutionQaReport(db);
    const renderedFuzzyClusterCount =
      report.summary.groups.find((group) => group.kind === "fuzzy_duplicate")
        ?.count ?? 0;

    const evidence = buildNonLocalDeterministicMatchingRolloutEvidence({
      options,
      codeState,
      runtime,
      schema,
      search,
      entityResolutionQa: {
        schemaVersion: report.schemaVersion,
        leakCheck: report.leakCheck,
        fullPersistedFuzzyPairCount: report.summary.fuzzyDuplicatePairCount,
        reviewedFuzzyPairCount: report.summary.fuzzyDuplicateRowsReviewed,
        renderedFuzzyClusterCount,
      },
      generatedAt: new Date().toISOString(),
    });

    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await db.destroy();
  }
}

function resolveDatabaseTarget() {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) {
    throw new Error("Missing supported database connection environment.");
  }
  return { resolution, connectionString };
}

function validateDatabaseTarget(environment: string, connectionString: string) {
  const url = new URL(connectionString);
  const loopback = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]).has(
    url.hostname.toLowerCase(),
  );
  if (environment === "local" && !loopback) {
    throw new Error(
      "Local matching rollout proof refuses a non-loopback database.",
    );
  }
  if (environment !== "local" && loopback) {
    throw new Error(
      "Non-local matching rollout proof requires a non-local database.",
    );
  }
}

async function readRuntimeProof(baseUrl: string) {
  const response = await fetch(`${baseUrl}/health`, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json" },
  });
  const requestedOrigin = new URL(baseUrl).origin;
  return {
    healthStatus: response.status,
    canonicalOrigin: new URL(response.url).origin === requestedOrigin,
  };
}

async function readSchemaProof(db: Kysely<Database>) {
  const result = await sql<{
    match_suggestions: boolean;
    alias_projections: boolean;
    fuzzy_duplicate_suggestions: boolean;
    job_queue: boolean;
    match_refresh: boolean;
    alias_refresh: boolean;
    fuzzy_refresh: boolean;
  }>`
    select
      to_regclass('public.catalog_match_suggestions') is not null
        as match_suggestions,
      to_regclass('public.catalog_alias_projections') is not null
        as alias_projections,
      to_regclass('public.catalog_fuzzy_duplicate_suggestions') is not null
        as fuzzy_duplicate_suggestions,
      to_regclass('public.job_queue') is not null as job_queue,
      exists (
        select 1 from pg_constraint
        where conname = 'job_queue_catalog_match_payload_check'
      ) as match_refresh,
      exists (
        select 1 from pg_constraint
        where conname = 'job_queue_catalog_alias_payload_check'
      ) as alias_refresh,
      exists (
        select 1 from pg_constraint
        where conname = 'job_queue_catalog_fuzzy_duplicate_payload_check'
      ) as fuzzy_refresh
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new Error("Matching rollout schema proof returned no row.");

  return {
    tablesPresent: {
      matchSuggestions: row.match_suggestions,
      aliasProjections: row.alias_projections,
      fuzzyDuplicateSuggestions: row.fuzzy_duplicate_suggestions,
      jobQueue: row.job_queue,
    },
    payloadConstraintsPresent: {
      matchRefresh: row.match_refresh,
      aliasRefresh: row.alias_refresh,
      fuzzyRefresh: row.fuzzy_refresh,
    },
  };
}

async function readSearchProof(db: Kysely<Database>) {
  const candidates = await db
    .selectFrom("catalog_items")
    .innerJoin(
      "catalog_item_names",
      "catalog_item_names.catalog_item_id",
      "catalog_items.id",
    )
    .select([
      "catalog_items.id as catalogItemId",
      "catalog_item_names.display_name as displayName",
    ])
    .where("catalog_items.status", "in", ["seeded", "confirmed"])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_item_names.is_primary", "=", true)
    .orderBy("catalog_items.updated_at", "desc")
    .limit(24)
    .execute();
  if (candidates.length === 0) {
    throw new Error("Production search proof has no safe catalog candidate.");
  }

  const host = process.env.MEILISEARCH_HOST?.trim();
  if (!host) throw new Error("Missing MEILISEARCH_HOST for search proof.");
  const client = new Meilisearch({
    host,
    apiKey: process.env.MEILISEARCH_API_KEY?.trim() || undefined,
  });
  const index = client.index(CATALOG_TYPEAHEAD_INDEX);

  let safeDocumentContract = true;
  let canonicalResultVisible = false;
  let reachable = false;
  for (const candidate of candidates) {
    const result = await index.search(candidate.displayName, {
      limit: 20,
      matchingStrategy: "all",
    });
    reachable = true;
    const suggestions = result.hits.map(catalogTypeaheadHitToSuggestion);
    if (suggestions.some((suggestion) => suggestion === null)) {
      safeDocumentContract = false;
      break;
    }
    if (
      suggestions.some(
        (suggestion) => suggestion?.id === candidate.catalogItemId,
      )
    ) {
      canonicalResultVisible = true;
      break;
    }
  }

  return { reachable, safeDocumentContract, canonicalResultVisible };
}

function runPackageJsonScript(
  script: string,
  extraEnv: Record<string, string> = {},
) {
  return runJsonCommand("pnpm", ["run", script], process.cwd(), extraEnv);
}

function runJsonCommand(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
) {
  return extractJsonObjectFromCommandOutput(
    runCommand(command, args, cwd, extraEnv),
  );
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
) {
  try {
    return execFileSync(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: LOCAL_COMMAND_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const details = safeCommandFailureDetails(error);
    throw new Error(`${command} ${args.join(" ")} failed${details}.`);
  }
}

async function ensureLocalApp(
  baseUrl: string,
): Promise<{ stop(): Promise<void> }> {
  if (await appIsReady(baseUrl)) {
    logStep("reusing the existing local app runtime");
    return { stop: async () => undefined };
  }

  const url = new URL(baseUrl);
  const port = url.port || "80";
  const child = spawn(
    "pnpm",
    ["dev", "--hostname", url.hostname, "--port", port],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PUBLIC_SITE_URL: baseUrl,
        BETTER_AUTH_URL: baseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const output = captureProcessTail(child);
  const deadline = Date.now() + LOCAL_APP_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Local app exited before readiness${safeTextTail(output())}.`,
      );
    }
    if (await appIsReady(baseUrl)) {
      logStep("started an isolated local app runtime");
      return { stop: () => stopChild(child) };
    }
    await delay(LOCAL_APP_POLL_MS);
  }

  await stopChild(child);
  throw new Error(`Local app did not become ready${safeTextTail(output())}.`);
}

async function appIsReady(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      redirect: "follow",
      signal: AbortSignal.timeout(2_000),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

function captureProcessTail(child: ChildProcess) {
  let tail = "";
  const append = (chunk: Buffer | string) => {
    tail = `${tail}${String(chunk)}`.slice(-16_000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return () => tail;
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(5_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

function readCodeState(): DeterministicMatchingRolloutCodeState {
  const commitSha = runGit(["rev-parse", "HEAD"]);
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const workingTree = runGit(["status", "--porcelain"])
    ? ("dirty" as const)
    : ("clean" as const);
  return { commitSha, branch, workingTree };
}

function runGit(args: string[]) {
  const result = spawnSync("git", args, {
    cwd: path.resolve(process.cwd(), "../.."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed.`);
  }
  return result.stdout.trim();
}

function safeCommandFailureDetails(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const record = error as {
    status?: unknown;
    stderr?: unknown;
    stdout?: unknown;
  };
  const status =
    typeof record.status === "number" ? ` (exit ${record.status})` : "";
  const output = `${String(record.stderr ?? "")}\n${String(record.stdout ?? "")}`;
  return `${status}${safeTextTail(output)}`;
}

function safeTextTail(value: string) {
  const redacted = value
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url-redacted]")
    .replace(
      /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
      "[pem-redacted]",
    )
    .replace(
      /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY)[A-Z0-9_]*\s*=\s*[^\s]+/gi,
      "[secret-redacted]",
    )
    .trim();
  if (!redacted) return "";
  return `: ${redacted.slice(-2_000)}`;
}

function logStep(message: string) {
  console.error(`[OVE-163] ${message}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
