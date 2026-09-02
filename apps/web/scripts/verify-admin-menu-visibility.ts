import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  OPERATOR_MENU_LINKS,
  getOperatorMenuCopy,
} from "@/lib/operator-menu-copy";
import { isRetiredControlPlanePath } from "@/lib/retired-control-plane-routes";

import {
  ADMIN_MENU_LOCALES,
  ADMIN_MENU_VISIBILITY_RECEIPT_VERSION,
  EXPECTED_ACCOUNT_MODERATION_PATHS,
  RETIRED_ADMIN_PATH_PROBES,
  createAdminRoleResolutionCheck,
  evaluateAdminMenuContract,
} from "./verify-admin-menu-visibility-runner";

const REQUEST_TIMEOUT_MS = 10_000;
const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(webRoot, "../..");

interface CliArgs {
  environment: "local" | "production";
  baseUrl: string | null;
  implementationSha: string;
  proveDeterminism: boolean;
  injectDependencyTimeout: boolean;
  emitAggregateReceipt: boolean;
  staticControlsOnly: boolean;
}

export function verifyAdminMenuRepository() {
  const runtimeAdminOwners = listSourceFiles(
    path.join(webRoot, "src/app/admin"),
  );
  const accountFiles = [
    "src/app/(default)/account/layout.tsx",
    "src/app/(default)/account/communities/page.tsx",
    "src/app/(default)/account/communities/[slug]/page.tsx",
    "src/app/(default)/account/communities/[slug]/actions.ts",
    "src/app/(default)/account/moderation/comments/page.tsx",
    "src/app/(default)/account/moderation/comments/actions.ts",
  ];
  const accountGuarded = accountFiles.every((relativePath) => {
    const absolutePath = path.join(webRoot, relativePath);
    if (!existsSync(absolutePath)) return false;
    const source = readFileSync(absolutePath, "utf8");
    if (relativePath.endsWith("layout.tsx")) {
      return /evaluateNonDiscoveryRouteIndexability\("operator"\)/.test(source);
    }
    return source.includes("resolveAdminCapabilityAccessBounded");
  });
  const accessSource = readFileSync(
    path.join(webRoot, "src/server/admin-access.ts"),
    "utf8",
  );
  const communityRepositorySource = readFileSync(
    path.join(webRoot, "src/server/community-repository.ts"),
    "utf8",
  );
  const publicCommunitySource = readFileSync(
    path.join(webRoot, "src/components/public/public-community.tsx"),
    "utf8",
  );
  const activeAdminCallers = listSourceFiles(path.join(webRoot, "src"))
    .filter((absolutePath) => !absolutePath.endsWith(".test.ts"))
    .filter((absolutePath) => !absolutePath.endsWith(".test.tsx"))
    .filter(
      (absolutePath) =>
        !absolutePath.endsWith("retired-control-plane-routes.ts"),
    )
    .filter((absolutePath) =>
      /["'`]\/admin(?:\/|["'`])/.test(readFileSync(absolutePath, "utf8")),
    );
  const roleBoundaryAligned =
    accessSource.includes("ADMIN_ROLE_RESOLUTION_DEADLINE_MS = 250") &&
    accessSource.includes("resolveAdminCapabilityAccessBounded") &&
    communityRepositorySource.includes(
      'assertAdminCapabilityForScope(scope, "operator:mutate", executor)',
    );
  const publicShortcutAbsent =
    !/["'`]\/admin\/communities/.test(publicCommunitySource) &&
    !/["'`]\/account\/communities/.test(publicCommunitySource);

  const links = OPERATOR_MENU_LINKS.map(({ href }) => href);
  const localeLinkSets = Object.fromEntries(
    ADMIN_MENU_LOCALES.map((locale) => {
      const copy = getOperatorMenuCopy(locale);
      const copyComplete = OPERATOR_MENU_LINKS.every(
        ({ key }) => copy.links[key].trim().length > 0,
      );
      return [locale, copyComplete ? links : []];
    }),
  );
  const retiredRouteStatuses = Object.fromEntries(
    RETIRED_ADMIN_PATH_PROBES.map((retiredPath) => [
      retiredPath,
      isRetiredControlPlanePath(retiredPath) && runtimeAdminOwners.length === 0
        ? 404
        : 200,
    ]),
  );
  const reachableAccountPaths =
    accountGuarded &&
    roleBoundaryAligned &&
    publicShortcutAbsent &&
    activeAdminCallers.length === 0
      ? EXPECTED_ACCOUNT_MODERATION_PATHS
      : [];

  const owner = evaluateAdminMenuContract({
    actorClass: "sealed_owner",
    accessStatus: "allowed",
    links,
    localeLinkSets,
    retiredRouteStatuses,
    reachableAccountPaths,
    queueReadCount: 1,
    mutationCount: 1,
    durationMs: 1,
    evidence: {},
  });
  const ordinary = evaluateAdminMenuContract({
    actorClass: "ordinary",
    accessStatus: "denied",
    links: publicShortcutAbsent ? [] : ["/account/communities"],
    localeLinkSets: { uk: [], bg: [], ru: [] },
    retiredRouteStatuses,
    reachableAccountPaths: [],
    queueReadCount: 0,
    mutationCount: 0,
    durationMs: 1,
    evidence: {},
  });

  return {
    schemaVersion: ADMIN_MENU_VISIBILITY_RECEIPT_VERSION,
    issue: "OVE-338",
    status:
      owner.status === "aligned" && ordinary.status === "aligned"
        ? "aligned"
        : "contract_drift",
    owner,
    ordinary,
    activeAdminCallerCount: activeAdminCallers.length,
    runtimeAdminOwnerCount: runtimeAdminOwners.length,
  };
}

export async function verifyAdminMenuStaticControls(
  baseUrl: string,
  implementationSha: string,
) {
  const retiredRouteStatuses: Record<string, number> = {};
  const retiredControls: Array<{
    pathClass: string;
    getStatus: number;
    headStatus: number;
  }> = [];
  for (const [index, retiredPath] of RETIRED_ADMIN_PATH_PROBES.entries()) {
    const [getResponse, headResponse] = await Promise.all([
      fetch(new URL(retiredPath, baseUrl), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
      fetch(new URL(retiredPath, baseUrl), {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    ]);
    retiredRouteStatuses[retiredPath] =
      getResponse.status === 404 && headResponse.status === 404
        ? 404
        : getResponse.status;
    retiredControls.push({
      pathClass: `retired_admin_${index + 1}`,
      getStatus: getResponse.status,
      headStatus: headResponse.status,
    });
  }

  const accountControls = [];
  for (const [
    index,
    accountPath,
  ] of EXPECTED_ACCOUNT_MODERATION_PATHS.entries()) {
    const response = await fetch(new URL(accountPath, baseUrl), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    accountControls.push({
      pathClass: `account_moderation_${index + 1}`,
      status: response.status,
      noindex: /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(body),
      ownerQueueAbsent:
        !/data-site-shell-operator-menu=["']true["']/i.test(body) &&
        !/data-private-moderation-queue/i.test(body),
    });
  }

  const contract = evaluateAdminMenuContract({
    actorClass: "guest",
    accessStatus: "denied",
    links: [],
    localeLinkSets: { uk: [], bg: [], ru: [] },
    retiredRouteStatuses,
    reachableAccountPaths: [],
    queueReadCount: 0,
    mutationCount: 0,
    durationMs: 1,
    evidence: {},
  });
  const accountControlsAligned = accountControls.every(
    (control) =>
      control.status === 200 && control.noindex && control.ownerQueueAbsent,
  );

  return {
    schemaVersion: ADMIN_MENU_VISIBILITY_RECEIPT_VERSION,
    issue: "OVE-338",
    status:
      contract.status === "aligned" && accountControlsAligned
        ? "aligned"
        : "contract_drift",
    environment: "production",
    buildSha: implementationSha,
    probeClass: "static_controls_only",
    dynamicUserProbeCount: 0,
    productionMutationCount: 0,
    retiredControls,
    accountControls,
    semanticDigest: contract.digest,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.environment === "production" || args.staticControlsOnly) {
    if (!args.baseUrl || !args.emitAggregateReceipt) {
      throw new Error(
        "Production verification requires --base-url and --emit-aggregate-receipt.",
      );
    }
    const receipt = await verifyAdminMenuStaticControls(
      args.baseUrl,
      args.implementationSha,
    );
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    if (receipt.status !== "aligned") process.exitCode = 1;
    return;
  }

  const first = verifyAdminMenuRepository();
  const second = args.proveDeterminism ? verifyAdminMenuRepository() : first;
  const timeout = args.injectDependencyTimeout
    ? await createAdminRoleResolutionCheck(
        () => new Promise<"allowed">(() => undefined),
        { timeoutMs: 5 },
      ).result
    : null;
  const receipt = {
    ...first,
    buildSha: args.implementationSha,
    deterministic:
      first.owner.digest === second.owner.digest &&
      first.ordinary.digest === second.ordinary.digest,
    dependencyTimeoutClass: timeout?.status ?? "not_injected",
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (
    receipt.status !== "aligned" ||
    !receipt.deterministic ||
    (args.injectDependencyTimeout &&
      receipt.dependencyTimeoutClass !== "timed_out")
  ) {
    process.exitCode = 1;
  }
}

function parseArgs(argv: readonly string[]): CliArgs {
  const environment = flagValue(argv, "--environment") ?? "local";
  if (environment !== "local" && environment !== "production") {
    throw new Error("--environment must be local or production.");
  }
  const baseUrl = flagValue(argv, "--base-url");
  if (baseUrl) new URL(baseUrl);
  const implementationSha =
    flagValue(argv, "--sha") ??
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  if (!/^[a-f0-9]{40}$/i.test(implementationSha)) {
    throw new Error("--sha must be a full 40-character Git SHA.");
  }
  return {
    environment,
    baseUrl,
    implementationSha,
    proveDeterminism: argv.includes("--prove-determinism"),
    injectDependencyTimeout: argv.includes("--inject-dependency-timeout"),
    emitAggregateReceipt: argv.includes("--emit-aggregate-receipt"),
    staticControlsOnly: argv.includes("--static-controls-only"),
  };
}

function flagValue(argv: readonly string[], name: string) {
  const index = argv.indexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

function listSourceFiles(directory: string): string[] {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(absolutePath);
    return /\.tsx?$/.test(entry.name) ? [absolutePath] : [];
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error) => {
    const message =
      error instanceof Error ? error.message : "Verification failed.";
    process.stderr.write(`OVE-338 verifier failed: ${message}\n`);
    process.exitCode = 1;
  });
}
