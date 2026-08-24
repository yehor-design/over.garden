import { randomBytes, randomUUID } from "node:crypto";
import {
  execFile as execFileCallback,
  spawn,
  type ChildProcess,
} from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Kysely, PostgresDialect } from "kysely";
import { Meilisearch } from "meilisearch";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import {
  assertMeasuredRto,
  assertProviderBinding,
  buildRecoveryPlan,
  buildRestoreReadinessReport,
  canonicalJson,
  deriveRpoMs,
  digestPlan,
  DigitalOceanDatabaseProvider,
  PRODUCTION_CLUSTER_NAME_CLASS,
  RECOVERY_DRILL_ENVIRONMENT,
  redactIdentifier,
  type ProviderCluster,
  type RecoveryPlan,
} from "../src/server/restore-readiness";
import {
  acquireRecoveryLock,
  pollUntil,
  readSafeRecoveryDiagnostic,
  readRecoveryState,
  RECOVERY_PLAN_FILE,
  RECOVERY_RUNTIME_DIR,
  releaseRecoveryLock,
  requestRecoveryCancellation,
  writeRecoveryState,
  writeSecretFile,
  type RecoveryLifecycleState,
  type RecoveryStateReceipt,
} from "../src/server/restore-readiness/runtime";

const execFile = promisify(execFileCallback);
const APPROVAL_DIGEST =
  "e87bd9c0118bcf88a6fac07c069b01396b5b2c0322b7c961f058b016554a31ae";
const PRODUCTION_ID = "74437c21-0a5b-43c9-be58-f99a3311d5e0";
const APP_PORT = 13_000;
const MEILI_PORT = 17_700;
const MINIO_PORT = 19_000;
const PROVIDER_TIMEOUT_MS = 600_000;
const POLL_INTERVAL_MS = 5_000;
const APP_TIMEOUT_MS = 180_000;
const PROJECT_ROOT = path.resolve(process.cwd(), "../..");
const INFRA_ROOT = path.join(PROJECT_ROOT, "infra");
const cancellationController = new AbortController();

process.on("SIGTERM", () => {
  cancellationController.abort(new Error("recovery drill cancelled"));
});

interface ExecuteContext {
  plan: RecoveryPlan;
  planDigest: string;
  generation: string;
  nonce: string;
  targetId: string | null;
  target: ProviderCluster | null;
  app: ChildProcess | null;
  localNames: {
    meiliContainer: string;
    minioContainer: string;
    meiliVolume: string;
    minioVolume: string;
  };
  envFile: string;
  caFile: string;
  runtimeEnv: NodeJS.ProcessEnv | null;
  localResourcesOwned: boolean;
}

interface ProductReceipt {
  redaction?: string;
}

interface ParityReceipt {
  report?: { zeroGap?: boolean };
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const argv = rawArgv[0] === "--" ? rawArgv.slice(1) : rawArgv;
  const mode = argv[0];
  if (mode === "status") return printStatus();
  if (mode === "cancel") return cancel();
  assertEnvironment(argv);
  const implementationSha = requiredFlag(argv, "--implementation-sha");
  const approvalDigest = requiredFlag(argv, "--approval-digest");
  if (approvalDigest !== APPROVAL_DIGEST) {
    throw new Error(
      "approval digest does not match the authorized OVE-230 envelope",
    );
  }
  if (mode === "plan") return createPlan(implementationSha, approvalDigest);
  if (mode === "execute") return executePlan(implementationSha, approvalDigest);
  throw new Error("Mode must be plan, execute, status, or cancel.");
}

function assertEnvironment(argv: string[]) {
  if (
    readFlag(argv, "--environment") !== RECOVERY_DRILL_ENVIRONMENT ||
    readFlag(argv, "--confirm-environment") !== RECOVERY_DRILL_ENVIRONMENT
  ) {
    throw new Error(
      "Refuse without matching recovery-drill environment confirmation.",
    );
  }
}

async function createPlan(implementationSha: string, approvalDigest: string) {
  await assertContainedMain(implementationSha);
  const provider = new DigitalOceanDatabaseProvider();
  const source = await provider.getCluster(PRODUCTION_ID);
  if (source.name !== PRODUCTION_CLUSTER_NAME_CLASS) {
    throw new Error("production source registry binding failed");
  }
  const targetName = `overgarden-pitr-drill-${dateStamp(new Date())}`;
  if ((await provider.exactName(targetName)).length !== 0) {
    throw new Error("exact disposable target name is not absent");
  }
  const restorePoint = new Date(Date.now() - 5 * 60_000);
  const plan = buildRecoveryPlan({
    approvalDigest,
    implementationSha,
    source,
    targetName,
    restorePointUtc: restorePoint.toISOString(),
  });
  const planDigest = digestPlan(plan);
  await mkdir(RECOVERY_RUNTIME_DIR, { recursive: true, mode: 0o700 });
  await writeFile(RECOVERY_PLAN_FILE, canonicalJson(plan), { mode: 0o600 });
  await writeRecoveryState({
    issue: "OVE-230",
    generation: randomUUID(),
    state: "planned",
    planDigest,
    implementationSha,
    targetNameClass: targetName,
    pid: 0,
    updatedAtUtc: new Date().toISOString(),
    cancelRequested: false,
  });
  printEvidence({
    ok: true,
    issue: "OVE-230",
    mode: "plan",
    planDigest,
    approvalDigestMatches: true,
    sourceClass: `${source.name}:${source.engine}${source.version}:${source.region}:${source.status}`,
    targetNameClass: targetName,
    exactNameCardinality: 0,
    implementationSha,
    restorePointUtc: plan.target.restorePointUtc,
    inheritedSizeClass: plan.target.inheritedSize,
    costClass: plan.target.costClass,
  });
}

async function executePlan(implementationSha: string, approvalDigest: string) {
  await assertContainedMain(implementationSha);
  const plan = JSON.parse(
    await readFile(RECOVERY_PLAN_FILE, "utf8"),
  ) as RecoveryPlan;
  if (
    plan.implementationSha !== implementationSha ||
    plan.approvalDigest !== approvalDigest
  ) {
    throw new Error("saved plan does not bind the requested SHA and approval");
  }
  const planDigest = digestPlan(plan);
  const previous = await readRecoveryState();
  if (previous.planDigest !== planDigest)
    throw new Error("saved plan digest drifted");
  if (
    Date.now() - new Date(plan.target.restorePointUtc).getTime() >
    60 * 60_000
  ) {
    throw new Error("saved restore point is stale; regenerate the plan");
  }

  const nonce = randomBytes(6).toString("hex");
  const generation = randomUUID();
  const context: ExecuteContext = {
    plan,
    planDigest,
    generation,
    nonce,
    targetId: null,
    target: null,
    app: null,
    localNames: {
      meiliContainer: `ove230-meili-${nonce}`,
      minioContainer: `ove230-minio-${nonce}`,
      meiliVolume: `ove230-meili-data-${nonce}`,
      minioVolume: `ove230-minio-data-${nonce}`,
    },
    envFile: path.join(RECOVERY_RUNTIME_DIR, `database-${nonce}.env`),
    caFile: path.join(RECOVERY_RUNTIME_DIR, `database-${nonce}.ca`),
    runtimeEnv: null,
    localResourcesOwned: false,
  };
  await acquireRecoveryLock(stateReceipt(context, "planned"));

  const provider = new DigitalOceanDatabaseProvider();
  let terminalError: unknown;
  let successReceipt: Record<string, unknown> | null = null;
  try {
    await runChecked("pnpm", ["build"], process.env, 30 * 60_000);
    const expectedSchemaDigest = await readReferenceSchemaDigest();
    await assertProductionHealth(provider, "before");
    const source = await provider.getCluster(PRODUCTION_ID);
    assertSourceMatchesPlan(source, plan);
    await updateState(context, "provider_source_bound");
    if ((await provider.exactName(plan.target.name)).length !== 0) {
      throw new Error("exact target name collided before fork");
    }
    await assertLoopbackPortsAvailable();

    const forkStartedMonotonic = performance.now();
    const forkStartedUtc = new Date().toISOString();
    await provider.fork({
      name: plan.target.name,
      sourceId: PRODUCTION_ID,
      restorePointUtc: plan.target.restorePointUtc,
    });
    const forkAcceptedUtc = new Date().toISOString();
    await updateState(context, "fork_requested");
    context.target = await pollUntil({
      read: async () => {
        const matches = await provider.exactName(plan.target.name);
        if (matches.length > 1) throw new Error("ambiguous target cardinality");
        return matches[0] ?? null;
      },
      done: (target) => target?.status === "online",
      timeoutMs: PROVIDER_TIMEOUT_MS,
      intervalMs: POLL_INTERVAL_MS,
      timeoutClass: "provider online poll timeout",
    });
    if (!context.target) throw new Error("provider target unavailable");
    context.targetId = context.target.id;
    await updateState(context, "fork_online");

    const secret = await provider.getConnectionSecret(context.targetId);
    const databaseUrl = buildDatabaseUrl(secret);
    assertProviderBinding({
      provider: await provider.getCluster(context.targetId),
      expectedId: context.targetId,
      expectedName: plan.target.name,
      expectedEngine: plan.source.engine,
      expectedRegion: plan.source.region,
      providerHost: await provider.getHost(context.targetId),
      databaseUrl,
      productionId: PRODUCTION_ID,
      ca: secret.ca,
    });
    await writeSecretFile(context.caFile, `${secret.ca}\n`);
    await writeSecretFile(
      context.envFile,
      `DATABASE_URL=${quoteDotenv(databaseUrl)}\nDIRECT_URL=${quoteDotenv(databaseUrl)}\nDATABASE_SSL=true\n`,
    );
    context.runtimeEnv = buildRuntimeEnv(context, databaseUrl, secret.ca);
    await updateState(context, "target_bound");

    await runChecked(
      "pnpm",
      [
        "db:bootstrap",
        "--",
        "--env-file",
        context.envFile,
        "--ca-file",
        context.caFile,
        "--environment",
        "recovery-drill",
        "--confirm-environment",
        "recovery-drill",
        "--recovery-cluster-id",
        context.targetId,
        "--production-cluster-id",
        PRODUCTION_ID,
        "--recovery-cluster-name",
        plan.target.name,
        "--recovery-engine",
        plan.source.engine,
        "--recovery-region",
        plan.source.region,
      ],
      context.runtimeEnv,
      15 * 60_000,
    );
    await startIsolatedServices(context);
    await updateState(context, "schema_current");

    const beforeQueue = await queueFingerprint(context.runtimeEnv);
    await assertFreshProviderBinding(provider, context, databaseUrl, secret.ca);
    await runParity(context, "plan");
    await runParity(context, "apply");
    context.app = startApp(context.runtimeEnv);
    await waitForHttp(`http://127.0.0.1:${APP_PORT}/health`, APP_TIMEOUT_MS);
    await assertFreshProviderBinding(provider, context, databaseUrl, secret.ca);
    const product = await runProductSmoke(context);
    await updateState(context, "product_proved");
    const parity = await runParity(context, "classify");
    if (!parity.report?.zeroGap)
      throw new Error("final public parity is not zero-gap");
    await updateState(context, "search_converged");
    await assertFreshProviderBinding(provider, context, databaseUrl, secret.ca);
    const afterQueue = await queueFingerprint(context.runtimeEnv);
    if (beforeQueue !== afterQueue) {
      throw new Error(
        "restored job queue changed during recovery product proof",
      );
    }

    const completedUtc = new Date().toISOString();
    const actualRtoMs = assertMeasuredRto({
      monotonicMs: Math.trunc(performance.now() - forkStartedMonotonic),
      startedUtc: forkStartedUtc,
      completedUtc,
    });
    const actualRpoMs = deriveRpoMs({
      restorePointUtc: plan.target.restorePointUtc,
      forkAcceptedUtc,
    });
    const report = await finalReadiness(
      context.runtimeEnv,
      expectedSchemaDigest,
      actualRpoMs,
      actualRtoMs,
      product,
      parity,
    );
    if (!report.ok) {
      const failedGates = Object.entries(report.gates)
        .filter(([, passed]) => !passed)
        .map(([gate]) => gate)
        .sort()
        .join(",");
      throw new Error(`strict restore readiness did not pass:${failedGates}`);
    }
    await updateState(context, "readiness_passed");

    const targetFingerprint = redactIdentifier(context.targetId);
    await teardownProviderTarget(provider, context);
    await updateState(context, "teardown_absent");
    await assertProductionHealth(provider, "after");
    await updateState(context, "completed");
    successReceipt = {
      ok: true,
      issue: "OVE-230",
      policyVersion: "ove230.managedRecovery.v2",
      implementationSha,
      planDigest,
      targetFingerprint,
      providerBoundDisposable: true,
      productReadback: "passed",
      finalMediaOnly: report.product.finalMediaOnly,
      zeroGap: parity.report.zeroGap,
      actualRpoMs,
      actualRtoMs,
      recoveryDrillDuration: actualRtoMs,
      rpoPass: report.rpo.pass,
      rtoPass: report.rto.pass,
      readiness: report.ok,
      teardown: "absent",
      productionBefore: "online",
      productionAfter: "online",
      canonicalHealthBefore: "available",
      canonicalHealthAfter: "available",
      redaction: "passed",
    };
  } catch (error) {
    terminalError = error;
    await writeRecoveryState(stateReceipt(context, "cleanup_required"));
    if (!context.targetId) {
      const matches = await provider
        .exactName(context.plan.target.name)
        .catch(() => []);
      if (matches.length === 1 && matches[0]?.id !== PRODUCTION_ID) {
        context.target = matches[0]!;
        context.targetId = matches[0]!.id;
      }
    }
    if (context.targetId) {
      try {
        await teardownProviderTarget(provider, context);
      } catch {
        // Preserve cleanup_required. Never widen deletion after a mismatch.
      }
    }
    throw error;
  } finally {
    try {
      await cleanupLocal(context);
    } finally {
      await releaseRecoveryLock();
    }
    if (terminalError) process.exitCode = 1;
  }
  if (!successReceipt)
    throw new Error("recovery completion receipt unavailable");
  printEvidence(successReceipt);
}

async function runParity(
  context: ExecuteContext,
  mode: "plan" | "apply" | "classify",
) {
  if (!context.runtimeEnv || !context.targetId)
    throw new Error("target runtime unavailable");
  const args = [
    "smoke:public-index-parity",
    "--",
    "--environment",
    "recovery-drill",
    "--confirm-environment",
    "recovery-drill",
    "--confirm-cluster-id",
    context.targetId,
    "--production-cluster-id",
    PRODUCTION_ID,
    "--disposable-cluster-name",
    context.plan.target.name,
    "--expected-engine",
    context.plan.source.engine,
    "--expected-region",
    context.plan.source.region,
    "--mode",
    mode,
  ];
  if (mode === "apply") args.push("--allow-non-local-mutation");
  return parseJsonReceipt(
    await runChecked("pnpm", args, context.runtimeEnv, APP_TIMEOUT_MS),
  ) as ParityReceipt;
}

async function runProductSmoke(context: ExecuteContext) {
  if (!context.runtimeEnv) throw new Error("target runtime unavailable");
  const base = `http://127.0.0.1:${APP_PORT}`;
  const [health, landing] = await Promise.all([
    fetch(`${base}/health`, { signal: AbortSignal.timeout(30_000) }),
    fetch(base, { signal: AbortSignal.timeout(30_000) }),
  ]);
  if (!health.ok || !landing.ok) {
    throw new Error("recovered final-only application read-back failed");
  }
  return { redaction: "passed" } satisfies ProductReceipt;
}

async function finalReadiness(
  env: NodeJS.ProcessEnv,
  expectedSchemaDigest: string,
  actualRpoMs: number,
  actualRtoMs: number,
  product: ProductReceipt,
  parity: ParityReceipt,
) {
  const pool = createRecoveryPool(env);
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    return await buildRestoreReadinessReport(db, {
      actualRpoMs,
      actualRtoMs,
      expectedSchemaManifestDigest: expectedSchemaDigest,
      productReadbackPassed: product.redaction === "passed",
      exactParityZeroGap: parity.report?.zeroGap === true,
      sameTargetAndSha: true,
    });
  } finally {
    await db.destroy();
  }
}

async function queueFingerprint(env: NodeJS.ProcessEnv) {
  const pool = createRecoveryPool(env);
  try {
    const result = await pool.query<{ fingerprint: string }>(`
      select md5(string_agg(status || ':' || count, '|' order by status)) as fingerprint
      from (
        select status, count(*)::text as count from job_queue group by status
      ) q
    `);
    return result.rows[0]?.fingerprint ?? "empty";
  } finally {
    await pool.end();
  }
}

function createRecoveryPool(env: NodeJS.ProcessEnv) {
  const resolution = resolveDatabaseConnection(env);
  const connectionString = resolvePgConnectionString(env, resolution);
  if (!connectionString) {
    throw new Error("recovery database connection unavailable");
  }
  return new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(env, resolution),
  });
}

async function readReferenceSchemaDigest() {
  const output = await runChecked(
    path.join(INFRA_ROOT, "run-with-local-infra-env"),
    ["pnpm", "restore:schema-manifest:fresh"],
    process.env,
    120_000,
  );
  const parsed = parseJsonReceipt(output) as { schemaManifestDigest?: string };
  if (!/^[0-9a-f]{64}$/.test(parsed.schemaManifestDigest ?? "")) {
    throw new Error("exact-main reference schema digest unavailable");
  }
  return parsed.schemaManifestDigest as string;
}

async function startIsolatedServices(context: ExecuteContext) {
  const names = context.localNames;
  context.localResourcesOwned = true;
  for (const volume of [names.meiliVolume, names.minioVolume]) {
    await runChecked(
      "container",
      ["volume", "create", volume],
      process.env,
      30_000,
    );
  }
  await runChecked(
    "container",
    [
      "run",
      "--detach",
      "--name",
      names.meiliContainer,
      "--publish",
      `127.0.0.1:${MEILI_PORT}:7700`,
      "--env",
      "MEILI_MASTER_KEY=ove230-recovery-only-master-key-123456",
      "--env",
      "MEILI_ENV=production",
      "--volume",
      `${names.meiliVolume}:/meili_data`,
      "docker.io/getmeili/meilisearch:v1.48.1",
    ],
    process.env,
    120_000,
  );
  await runChecked(
    "container",
    [
      "run",
      "--detach",
      "--name",
      names.minioContainer,
      "--publish",
      `127.0.0.1:${MINIO_PORT}:9000`,
      "--env",
      "MINIO_ROOT_USER=ove230",
      "--env",
      "MINIO_ROOT_PASSWORD=ove230-recovery-only-secret",
      "--volume",
      `${names.minioVolume}:/data`,
      "docker.io/minio/minio:latest",
      "server",
      "/data",
    ],
    process.env,
    120_000,
  );
  await waitForHttp(`http://127.0.0.1:${MEILI_PORT}/health`, 90_000);
  await waitForHttp(
    `http://127.0.0.1:${MINIO_PORT}/minio/health/ready`,
    90_000,
  );
  await createSearchIndex();
  await createBuckets();
}

async function createSearchIndex() {
  const client = new Meilisearch({
    host: `http://127.0.0.1:${MEILI_PORT}`,
    apiKey: "ove230-recovery-only-master-key-123456",
  });
  const task = await client.createIndex("journal_entries", {
    primaryKey: "id",
  });
  const completed = await client.tasks.waitForTask(task.taskUid, {
    timeout: 90_000,
    interval: 250,
  });
  if (completed.status !== "succeeded") {
    throw new Error("isolated recovery search index initialization failed");
  }
}

async function createBuckets() {
  const client = new S3Client({
    region: "auto",
    endpoint: `http://127.0.0.1:${MINIO_PORT}`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: "ove230",
      secretAccessKey: "ove230-recovery-only-secret",
    },
  });
  await client.send(new CreateBucketCommand({ Bucket: "ove230-public" }));
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: "ove230-public",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: ["s3:GetObject"],
            Resource: ["arn:aws:s3:::ove230-public/*"],
          },
        ],
      }),
    }),
  );
}

function startApp(env: NodeJS.ProcessEnv) {
  return spawn(
    "pnpm",
    ["start", "--hostname", "127.0.0.1", "--port", String(APP_PORT)],
    {
      cwd: process.cwd(),
      env,
      stdio: "ignore",
      detached: true,
    },
  );
}

async function teardownProviderTarget(
  provider: DigitalOceanDatabaseProvider,
  context: ExecuteContext,
) {
  if (!context.targetId) return;
  const target = await provider.getCluster(context.targetId);
  if (
    target.id === PRODUCTION_ID ||
    target.name !== context.plan.target.name ||
    target.engine !== context.plan.source.engine ||
    target.region !== context.plan.source.region
  ) {
    throw new Error("refuse teardown after provider identity drift");
  }
  await updateState(context, "teardown_requested");
  await provider.delete(target.id);
  await pollUntil({
    read: async () => {
      const clusters = await provider.listClusters();
      return clusters.filter((cluster) => cluster.id === target.id).length;
    },
    done: (cardinality) => cardinality === 0,
    timeoutMs: PROVIDER_TIMEOUT_MS,
    intervalMs: POLL_INTERVAL_MS,
    timeoutClass: "provider absence poll timeout",
  });
  context.targetId = null;
}

async function cleanupLocal(context: ExecuteContext) {
  await stopApp(context.app);
  await rm(context.envFile, { force: true });
  await rm(context.caFile, { force: true });
  if (!context.localResourcesOwned) return;
  for (const container of [
    context.localNames.meiliContainer,
    context.localNames.minioContainer,
  ]) {
    await execFile("container", ["delete", "--force", container]).catch(
      () => undefined,
    );
  }
  for (const volume of [
    context.localNames.meiliVolume,
    context.localNames.minioVolume,
  ]) {
    await execFile("container", ["volume", "delete", volume]).catch(
      () => undefined,
    );
  }
  const containers = JSON.parse(
    (await execFile("container", ["list", "--all", "--format", "json"])).stdout,
  ) as Array<{ id?: string }>;
  const volumes = JSON.parse(
    (await execFile("container", ["volume", "list", "--format", "json"]))
      .stdout,
  ) as Array<{ id?: string; configuration?: { name?: string } }>;
  const ownedContainers = new Set([
    context.localNames.meiliContainer,
    context.localNames.minioContainer,
  ]);
  const ownedVolumes = new Set([
    context.localNames.meiliVolume,
    context.localNames.minioVolume,
  ]);
  if (containers.some((entry) => entry.id && ownedContainers.has(entry.id))) {
    throw new Error("task-owned recovery container cleanup failed");
  }
  if (
    volumes.some((entry) => {
      const name = entry.id ?? entry.configuration?.name;
      return Boolean(name && ownedVolumes.has(name));
    })
  ) {
    throw new Error("task-owned recovery volume cleanup failed");
  }
  await pollUntil({
    read: async () =>
      Promise.all([APP_PORT, MEILI_PORT, MINIO_PORT].map(isPortListening)),
    done: (listening) => listening.every((value) => !value),
    timeoutMs: 30_000,
    intervalMs: 500,
    timeoutClass: "task-owned loopback port cleanup timeout",
  });
}

async function assertLoopbackPortsAvailable() {
  const listening = await Promise.all(
    [APP_PORT, MEILI_PORT, MINIO_PORT].map(isPortListening),
  );
  if (listening.some(Boolean)) {
    throw new Error("task-owned loopback port is already in use");
  }
}

function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function stopApp(app: ChildProcess | null) {
  if (!app?.pid || app.exitCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    app.once("exit", () => resolve()),
  );
  try {
    process.kill(-app.pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    return;
  }
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 10_000)),
  ]);
  if (!graceful) {
    try {
      process.kill(-app.pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    await exited;
  }
}

async function assertFreshProviderBinding(
  provider: DigitalOceanDatabaseProvider,
  context: ExecuteContext,
  databaseUrl: string,
  ca: string,
) {
  if (!context.targetId) throw new Error("target id unavailable");
  assertProviderBinding({
    provider: await provider.getCluster(context.targetId),
    expectedId: context.targetId,
    expectedName: context.plan.target.name,
    expectedEngine: context.plan.source.engine,
    expectedRegion: context.plan.source.region,
    providerHost: await provider.getHost(context.targetId),
    databaseUrl,
    productionId: PRODUCTION_ID,
    ca,
  });
}

async function assertProductionHealth(
  provider: DigitalOceanDatabaseProvider,
  phase: string,
) {
  const source = await provider.getCluster(PRODUCTION_ID);
  if (
    source.name !== PRODUCTION_CLUSTER_NAME_CLASS ||
    source.status !== "online"
  ) {
    throw new Error(`production database health failed ${phase}`);
  }
  const response = await fetch("https://over.garden/health", {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`canonical health failed ${phase}`);
}

function assertSourceMatchesPlan(source: ProviderCluster, plan: RecoveryPlan) {
  if (
    redactIdentifier(source.id) !== plan.source.idFingerprint ||
    source.name !== plan.source.name ||
    source.engine !== plan.source.engine ||
    source.version !== plan.source.version ||
    source.region !== plan.source.region ||
    source.status !== plan.source.status ||
    source.size !== plan.source.size
  ) {
    throw new Error("provider source drift invalidated the plan");
  }
}

function buildRuntimeEnv(
  context: ExecuteContext,
  databaseUrl: string,
  ca: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    DATABASE_SSL: "true",
    DATABASE_SSL_CA: ca,
    DATABASE_POOL_MAX: "2",
    BETTER_AUTH_URL: `http://127.0.0.1:${APP_PORT}`,
    PUBLIC_SITE_URL: `http://127.0.0.1:${APP_PORT}`,
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${APP_PORT}`,
    // The drill deliberately exercises the serving versioned policy. This
    // process-local material is never logged or persisted outside the drill.
    BETTER_AUTH_SECRET: `ove230-${context.nonce}-${randomBytes(24).toString("hex")}`,
    BETTER_AUTH_SECRETS: `2:${randomBytes(32).toString("base64url")}`,
    BETTER_AUTH_CURRENT_SECRET_VERSION: "2",
    R2_ENDPOINT: `http://127.0.0.1:${MINIO_PORT}`,
    R2_ACCESS_KEY_ID: "ove230",
    R2_SECRET_ACCESS_KEY: "ove230-recovery-only-secret",
    R2_FORCE_PATH_STYLE: "true",
    R2_PUBLIC_BUCKET: "ove230-public",
    R2_PUBLIC_BASE_URL: `http://127.0.0.1:${MINIO_PORT}/ove230-public`,
    MEILISEARCH_HOST: `http://127.0.0.1:${MEILI_PORT}`,
    MEILISEARCH_API_KEY: "ove230-recovery-only-master-key-123456",
    MATCHING_SERVICE_URL: "http://127.0.0.1:1",
    MATCHING_SERVICE_TOKEN: "disabled-recovery-drill",
    RESEND_API_KEY: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED: "false",
    NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID: "",
    NEXT_PUBLIC_META_PIXEL_ID: "",
    NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED: "false",
    META_CONVERSIONS_API_ACCESS_TOKEN: "",
    META_CONVERSIONS_API_TEST_EVENT_CODE: "",
    META_CONVERSIONS_API_GRAPH_VERSION: "",
    VERCEL: "",
    VERCEL_ENV: "",
    OVE230_RECOVERY_DRILL: "true",
  };
}

function buildDatabaseUrl(secret: {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
}) {
  return `postgresql://${encodeURIComponent(secret.user)}:${encodeURIComponent(secret.password)}@${secret.host}:${secret.port}/${encodeURIComponent(secret.database)}?sslmode=require`;
}

function quoteDotenv(value: string) {
  return JSON.stringify(value);
}

async function updateState(
  context: ExecuteContext,
  state: RecoveryLifecycleState,
) {
  const current = await readRecoveryState();
  if (
    current.cancelRequested &&
    state !== "cleanup_required" &&
    state !== "teardown_requested"
  ) {
    throw new Error("recovery drill cancelled");
  }
  await writeRecoveryState(stateReceipt(context, state));
}

function stateReceipt(
  context: ExecuteContext,
  state: RecoveryLifecycleState,
): RecoveryStateReceipt {
  return {
    issue: "OVE-230",
    generation: context.generation,
    state,
    planDigest: context.planDigest,
    implementationSha: context.plan.implementationSha,
    targetNameClass: context.plan.target.name,
    pid: process.pid,
    updatedAtUtc: new Date().toISOString(),
    cancelRequested: false,
  };
}

async function printStatus() {
  printEvidence(await readRecoveryState());
}

async function cancel() {
  printEvidence(await requestRecoveryCancellation());
}

async function assertContainedMain(sha: string) {
  const result = await execFile(
    "git",
    ["merge-base", "--is-ancestor", sha, "origin/main"],
    { cwd: PROJECT_ROOT },
  );
  if (result.stderr) throw new Error("main containment check emitted an error");
}

async function runChecked(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout: number,
) {
  try {
    const result = await execFile(command, args, {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      signal: cancellationController.signal,
    });
    return result.stdout.trim();
  } catch (error) {
    const candidate = error as {
      code?: string | number;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
    };
    if (candidate.killed) throw new Error("bounded child timeout");
    const childClass = /^[a-z0-9:_-]+$/i.test(args[0] ?? "")
      ? args[0]
      : "child";
    const diagnostic = readSafeRecoveryDiagnostic(
      `${candidate.stdout ?? ""}\n${candidate.stderr ?? ""}`,
    );
    throw new Error(
      `bounded child failed:${childClass}:${String(candidate.code ?? "unknown")}${diagnostic ? `:${diagnostic.stage}:${diagnostic.code}` : ""}`,
    );
  }
}

async function waitForHttp(url: string, timeoutMs: number) {
  await pollUntil({
    read: async () => {
      try {
        return (await fetch(url, { signal: AbortSignal.timeout(5_000) })).ok;
      } catch {
        return false;
      }
    },
    done: Boolean,
    timeoutMs,
    intervalMs: 1_000,
    timeoutClass: "loopback service readiness timeout",
  });
}

function readFlag(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index < 0 ? null : (argv[index + 1] ?? null);
}

function requiredFlag(argv: string[], name: string) {
  const value = readFlag(argv, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function dateStamp(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function printEvidence(value: unknown) {
  const serialized = JSON.stringify(value, null, 2);
  if (
    /@|password|certificate|database_url|cookie|journal_entry|media_asset|precise|latitude|longitude/i.test(
      serialized,
    )
  ) {
    throw new Error("recursive recovery evidence redaction failed");
  }
  console.log(serialized);
}

function parseJsonReceipt(output: string): unknown {
  const start = output.lastIndexOf("\n{");
  const candidate = start >= 0 ? output.slice(start + 1) : output;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error("bounded child did not return a JSON receipt");
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "recovery drill failed",
  );
  process.exitCode = 1;
});
