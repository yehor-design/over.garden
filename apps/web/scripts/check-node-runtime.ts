import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REQUIRED_NODE_MAJOR = 22;
export const REQUIRED_NODE_ENGINE = ">=22 <25";

export interface NodeRuntimeConfiguration {
  engine: string | null;
  nvmrcMajor: number | null;
  ciMajor: number | null;
}

export interface NodeRuntimeGuardResult {
  status: "supported" | "unsupported";
  requiredMajor: number;
  detectedVersion: string;
  reason:
    | "supported"
    | "below-floor"
    | "invalid-version"
    | "configuration-mismatch";
  configurationIssues: string[];
}

export function parseNodeMajor(
  value: string | null | undefined,
): number | null {
  const match = value?.trim().match(/^v?(\d+)(?:\.\d+(?:\.\d+)?)?$/);
  if (!match) return null;

  const major = Number(match[1]);
  return Number.isSafeInteger(major) && major >= 0 ? major : null;
}

export function readNodeRuntimeConfiguration(
  repositoryRoot = resolveRepositoryRoot(),
): NodeRuntimeConfiguration {
  const webRoot = path.join(repositoryRoot, "apps", "web");
  const packageJson = JSON.parse(
    readFileSync(path.join(webRoot, "package.json"), "utf8"),
  ) as { engines?: { node?: unknown } };
  const engine =
    typeof packageJson.engines?.node === "string"
      ? packageJson.engines.node.trim()
      : null;
  const nvmrcMajor = parseNodeMajor(
    readFileSync(path.join(repositoryRoot, ".nvmrc"), "utf8"),
  );
  const ci = readFileSync(
    path.join(repositoryRoot, ".github", "workflows", "ci.yml"),
    "utf8",
  );
  const ciMatch = ci.match(/^\s*node-version:\s*["']?(\d+)["']?\s*$/m);

  return {
    engine,
    nvmrcMajor,
    ciMajor: ciMatch ? Number(ciMatch[1]) : null,
  };
}

export function evaluateNodeRuntime(
  detectedVersion: string,
  configuration: NodeRuntimeConfiguration,
): NodeRuntimeGuardResult {
  const configurationIssues = configurationIssueNames(configuration);
  const detectedMajor = parseNodeMajor(detectedVersion);
  const reason =
    configurationIssues.length > 0
      ? "configuration-mismatch"
      : detectedMajor === null
        ? "invalid-version"
        : detectedMajor < REQUIRED_NODE_MAJOR
          ? "below-floor"
          : "supported";

  return {
    status: reason === "supported" ? "supported" : "unsupported",
    requiredMajor: REQUIRED_NODE_MAJOR,
    detectedVersion,
    reason,
    configurationIssues,
  };
}

export function runNodeRuntimeGuard(
  options: {
    detectedVersion?: string;
    repositoryRoot?: string;
  } = {},
): NodeRuntimeGuardResult {
  return evaluateNodeRuntime(
    options.detectedVersion ?? process.versions.node,
    readNodeRuntimeConfiguration(options.repositoryRoot),
  );
}

export function formatNodeRuntimeGuardResult(
  result: NodeRuntimeGuardResult,
): string {
  return JSON.stringify({
    runtime: "node",
    requiredMajor: result.requiredMajor,
    detectedVersion: result.detectedVersion,
    status: result.status,
    reason: result.reason,
    configurationIssues: result.configurationIssues,
  });
}

function configurationIssueNames(
  configuration: NodeRuntimeConfiguration,
): string[] {
  const issues: string[] = [];
  if (configuration.engine !== REQUIRED_NODE_ENGINE) {
    issues.push("package-engine");
  }
  if (configuration.nvmrcMajor !== REQUIRED_NODE_MAJOR) {
    issues.push("nvmrc");
  }
  if (configuration.ciMajor !== REQUIRED_NODE_MAJOR) {
    issues.push("ci-node-version");
  }
  return issues;
}

function resolveRepositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isDirectExecution()) {
  const result = runNodeRuntimeGuard();
  process.stdout.write(`${formatNodeRuntimeGuardResult(result)}\n`);
  if (result.status === "unsupported") process.exitCode = 1;
}
