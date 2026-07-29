import path from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_ORIGIN = "https://over.garden";
const GARDEN_ROUTE = "/garden";
const GARDEN_TIMEOUT_MS = 10_000;

export interface ExactShaSelfServeSmokeOptions {
  environment: string;
  confirmedEnvironment: string;
  baseUrl: string;
  immutableDeploymentUrl: string;
  expectedCommitSha: string;
  deployedCommitSha: string;
  fetchImpl?: typeof fetch;
}

export interface ExactShaSelfServeSmokeReport {
  issue: "OVE-226";
  evidenceClass: "exact-sha-garden-shell";
  commitMatch: true;
  canonicalGarden: {
    status: 200;
    elapsedMs: number;
    guestShell: true;
  };
  immutableGarden: {
    status: 200;
    elapsedMs: number;
    guestShell: true;
  };
}

export async function runExactShaSelfServeSmoke(
  options: ExactShaSelfServeSmokeOptions,
): Promise<ExactShaSelfServeSmokeReport> {
  if (
    options.environment !== "production" ||
    options.confirmedEnvironment !== "production"
  ) {
    throw new Error(
      "Requires --environment production --confirm-environment production.",
    );
  }
  const canonicalBase = normalizeCanonicalBase(options.baseUrl);
  const immutableBase = normalizeImmutableDeploymentBase(
    options.immutableDeploymentUrl,
  );
  assertCommit(options.expectedCommitSha, "expected commit");
  assertCommit(options.deployedCommitSha, "deployed commit");
  if (options.expectedCommitSha !== options.deployedCommitSha) {
    throw new Error("Exact deployment commit does not match expected commit.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const [canonicalGarden, immutableGarden] = await Promise.all([
    readGuestGarden(fetchImpl, canonicalBase, "canonical"),
    readGuestGarden(fetchImpl, immutableBase, "immutable"),
  ]);

  return {
    issue: "OVE-226",
    evidenceClass: "exact-sha-garden-shell",
    commitMatch: true,
    canonicalGarden,
    immutableGarden,
  };
}

async function readGuestGarden(
  fetchImpl: typeof fetch,
  baseUrl: string,
  label: string,
): Promise<{ status: 200; elapsedMs: number; guestShell: true }> {
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${GARDEN_ROUTE}`, {
      headers: { Accept: "text/html" },
      redirect: "error",
      signal: AbortSignal.timeout(GARDEN_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${label} garden response did not complete within 10000 ms.`);
  }
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (response.status !== 200) {
    throw new Error(`${label} garden returned HTTP ${response.status}.`);
  }
  const html = await response.text();
  if (!html.includes('data-garden-workspace="guest"')) {
    throw new Error(`${label} garden did not render the guest shell.`);
  }
  return { status: 200, elapsedMs, guestShell: true };
}

function normalizeCanonicalBase(value: string) {
  const url = new URL(value);
  if (url.origin !== CANONICAL_ORIGIN || url.pathname !== "/") {
    throw new Error("Base URL must be the canonical https://over.garden origin.");
  }
  return url.origin;
}

function normalizeImmutableDeploymentBase(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".vercel.app") ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Immutable deployment URL must be an HTTPS Vercel deployment origin.",
    );
  }
  return url.origin;
}

function assertCommit(value: string, label: string) {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} must be a lowercase 40-character Git SHA.`);
  }
}

function readCliOptions(argv: string[]): ExactShaSelfServeSmokeOptions {
  const values = new Map<string, string>();
  const filtered = argv.filter((value) => value !== "--");
  for (let index = 0; index < filtered.length; index += 2) {
    const key = filtered[index];
    const value = filtered[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error("Smoke options must use --name value pairs.");
    }
    values.set(key, value);
  }
  const required = (flag: string) => {
    const value = values.get(flag);
    if (!value) throw new Error(`${flag} is required.`);
    return value;
  };
  return {
    environment: required("--environment"),
    confirmedEnvironment: required("--confirm-environment"),
    baseUrl: required("--base-url"),
    immutableDeploymentUrl: required("--immutable-deployment-url"),
    expectedCommitSha: required("--expected-commit"),
    deployedCommitSha: required("--deployed-commit"),
  };
}

async function main() {
  const report = await runExactShaSelfServeSmoke(
    readCliOptions(process.argv.slice(2)),
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) void main();
