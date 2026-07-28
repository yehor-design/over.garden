import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import {
  PRODUCTION_CLUSTER_NAME_CLASS,
  RECOVERY_DRILL_ENVIRONMENT,
} from "./contract";
import { assertUuid, hostnameFromDatabaseUrl } from "./gates";

const execFile = promisify(execFileCallback);

export interface ProviderCluster {
  id: string;
  name: string;
  engine: string;
  version: string;
  region: string;
  status: string;
  size: string;
}

export interface ProviderConnectionSecret {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ca: string;
}

export interface RecoveryPlan {
  policyVersion: "ove230.managedRecovery.v2";
  issue: "OVE-230";
  environment: typeof RECOVERY_DRILL_ENVIRONMENT;
  approvalDigest: string;
  implementationSha: string;
  source: {
    idFingerprint: string;
    name: typeof PRODUCTION_CLUSTER_NAME_CLASS;
    engine: string;
    version: string;
    region: string;
    status: "online";
    size: string;
  };
  target: {
    name: string;
    restorePointUtc: string;
    inheritedSize: string;
    costClass: "provider_fork_inherited_until_teardown";
  };
  local: {
    networkClass: "loopback_only";
    storageClass: "fresh_task_owned_volumes";
  };
}

export interface CommandRunner {
  (args: string[]): Promise<{ stdout: string; stderr: string }>;
}

const SECRET_FIELD_RE = /(?:URI|Password|Certificate)/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const IMPLEMENTATION_SHA_RE = /^[0-9a-f]{40}$/;

export function redactIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value))}\n`;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
}

export function digestPlan(plan: RecoveryPlan): string {
  return createHash("sha256").update(canonicalJson(plan)).digest("hex");
}

export function buildRecoveryPlan(input: {
  approvalDigest: string;
  implementationSha: string;
  source: ProviderCluster;
  targetName: string;
  restorePointUtc: string;
}): RecoveryPlan {
  if (!SHA256_RE.test(input.approvalDigest)) {
    throw new Error("approval digest must be lowercase SHA-256");
  }
  if (!IMPLEMENTATION_SHA_RE.test(input.implementationSha)) {
    throw new Error("implementation SHA must be a lowercase full git SHA");
  }
  if (input.source.name !== PRODUCTION_CLUSTER_NAME_CLASS) {
    throw new Error("provider source name does not match production registry");
  }
  if (input.source.status !== "online") {
    throw new Error("provider source must be online before planning");
  }
  const restorePoint = new Date(input.restorePointUtc);
  if (!Number.isFinite(restorePoint.getTime())) {
    throw new Error("restore point must be a valid UTC instant");
  }
  return {
    policyVersion: "ove230.managedRecovery.v2",
    issue: "OVE-230",
    environment: RECOVERY_DRILL_ENVIRONMENT,
    approvalDigest: input.approvalDigest,
    implementationSha: input.implementationSha,
    source: {
      idFingerprint: redactIdentifier(input.source.id),
      name: PRODUCTION_CLUSTER_NAME_CLASS,
      engine: input.source.engine,
      version: input.source.version,
      region: input.source.region,
      status: "online",
      size: input.source.size,
    },
    target: {
      name: input.targetName,
      restorePointUtc: restorePoint.toISOString(),
      inheritedSize: input.source.size,
      costClass: "provider_fork_inherited_until_teardown",
    },
    local: {
      networkClass: "loopback_only",
      storageClass: "fresh_task_owned_volumes",
    },
  };
}

export function parseClusterRow(row: string): ProviderCluster {
  const columns = row.trim().split(/\s+/);
  if (columns.length !== 7) {
    throw new Error("provider cluster metadata shape changed");
  }
  const [id, name, engine, version, region, status, size] = columns;
  return {
    id: assertUuid(id ?? "", "provider cluster id"),
    name: name ?? "",
    engine: engine ?? "",
    version: version ?? "",
    region: region ?? "",
    status: status ?? "",
    size: size ?? "",
  };
}

export function assertProviderBinding(input: {
  provider: ProviderCluster;
  expectedId: string;
  expectedName: string;
  expectedEngine: string;
  expectedRegion: string;
  providerHost: string;
  databaseUrl: string;
  productionId: string;
  ca: string;
}): void {
  const expectedId = assertUuid(input.expectedId, "expected target id");
  const productionId = assertUuid(input.productionId, "production id");
  if (expectedId === productionId || input.provider.id === productionId) {
    throw new Error("refuse provider binding to production id");
  }
  if (
    input.provider.id !== expectedId ||
    input.provider.name !== input.expectedName ||
    input.provider.engine !== input.expectedEngine ||
    input.provider.region !== input.expectedRegion ||
    input.provider.status !== "online"
  ) {
    throw new Error("provider target identity drifted");
  }
  if (hostnameFromDatabaseUrl(input.databaseUrl) !== input.providerHost) {
    throw new Error("DATABASE_URL hostname differs from provider hostname");
  }
  if (!input.ca.includes("BEGIN CERTIFICATE")) {
    throw new Error("provider CA is missing or malformed");
  }
}

export function createDoctlRunner(): CommandRunner {
  return async (args) => {
    if (args.some((arg) => SECRET_FIELD_RE.test(arg))) {
      throw new Error(
        "secret-bearing doctl fields are forbidden in metadata reads",
      );
    }
    try {
      const result = await execFile("doctl", args, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      throw new Error(classifyProviderError(error));
    }
  };
}

export function createSecretDoctlRunner(): CommandRunner {
  return async (args) => {
    try {
      const result = await execFile("doctl", args, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      throw new Error(classifyProviderError(error));
    }
  };
}

function classifyProviderError(error: unknown): string {
  const candidate = error as { code?: number | string; stderr?: string };
  const stderr = candidate.stderr ?? "";
  if (/401|unauthori[sz]ed/i.test(stderr)) return "provider_auth_failed";
  if (/403|forbidden/i.test(stderr)) return "provider_permission_denied";
  if (/429|rate.?limit/i.test(stderr)) return "provider_throttled";
  if (/404|not found|could not be found/i.test(stderr)) {
    return "provider_not_found";
  }
  if (/5\d\d|server error|temporarily unavailable/i.test(stderr)) {
    return "provider_server_error";
  }
  return `provider_command_failed:${String(candidate.code ?? "unknown")}`;
}

export class DigitalOceanDatabaseProvider {
  constructor(
    private readonly runner: CommandRunner = createDoctlRunner(),
    private readonly secretRunner: CommandRunner = createSecretDoctlRunner(),
  ) {}

  async getCluster(id: string): Promise<ProviderCluster> {
    const result = await this.runner([
      "databases",
      "get",
      assertUuid(id, "cluster id"),
      "--format",
      "ID,Name,Engine,Version,Region,Status,Size",
      "--no-header",
    ]);
    return parseClusterRow(result.stdout);
  }

  async listClusters(): Promise<ProviderCluster[]> {
    const result = await this.runner([
      "databases",
      "list",
      "--format",
      "ID,Name,Engine,Version,Region,Status,Size",
      "--no-header",
    ]);
    return result.stdout
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean)
      .map(parseClusterRow);
  }

  async exactName(name: string): Promise<ProviderCluster[]> {
    return (await this.listClusters()).filter(
      (cluster) => cluster.name === name,
    );
  }

  async getHost(id: string): Promise<string> {
    const result = await this.runner([
      "databases",
      "connection",
      assertUuid(id, "cluster id"),
      "--format",
      "Host",
      "--no-header",
    ]);
    const host = result.stdout.trim();
    if (!host || /\s/.test(host))
      throw new Error("provider host shape changed");
    return host;
  }

  async getConnectionSecret(id: string): Promise<ProviderConnectionSecret> {
    const clusterId = assertUuid(id, "cluster id");
    const connection = await this.secretRunner([
      "databases",
      "connection",
      clusterId,
      "--format",
      "Host,Port,Database,User,Password",
      "--no-header",
    ]);
    const columns = connection.stdout.trim().split(/\s+/);
    if (columns.length !== 5) {
      throw new Error("provider connection secret shape changed");
    }
    const ca = await this.secretRunner([
      "databases",
      "get-ca",
      clusterId,
      "--format",
      "Certificate",
      "--no-header",
    ]);
    return {
      host: columns[0] ?? "",
      port: columns[1] ?? "",
      database: columns[2] ?? "",
      user: columns[3] ?? "",
      password: columns[4] ?? "",
      ca: ca.stdout.trim(),
    };
  }

  async fork(input: {
    name: string;
    sourceId: string;
    restorePointUtc: string;
  }): Promise<void> {
    await this.runner([
      "databases",
      "fork",
      input.name,
      "--restore-from-cluster-id",
      assertUuid(input.sourceId, "source id"),
      "--restore-from-timestamp",
      formatDoctlTimestamp(input.restorePointUtc),
    ]);
  }

  async delete(id: string): Promise<void> {
    await this.runner([
      "databases",
      "delete",
      assertUuid(id, "delete id"),
      "--force",
    ]);
  }
}

export function formatDoctlTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid restore time");
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " +0000 UTC");
}
