import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STATIC_SCAN_DEADLINE_MS = 30_000;
const RETIRED_PROVIDER_PATTERN = /facebook/gi;
const CURRENT_LOGIN_SURFACE_PATTERN =
  /facebook\s+login|facebook[_-](?:sign|link|oauth)|facebookSignInEnabled|hasFacebook|FACEBOOK_(?:CLIENT|LOGIN)/gi;

const RUNTIME_EXCLUSIONS = [
  "src/lib/auth/retired-social-provider.ts",
  "src/app/meta-marketing.tsx",
  "src/server/meta-marketing/",
  "src/app/api/meta/",
] as const;

const CURRENT_AUTH_DOCS = [
  ".env.example",
  "../../docs/ADMIN_ROLE_BOOTSTRAP.md",
  "../../docs/INFRASTRUCTURE_REGISTRY.md",
  "../../docs/MVP_SCOPE_RECHECK_2026-07-03.md",
  "../../docs/SCAFFOLD_STATUS.md",
  "../../docs/WALKING_SKELETON.md",
] as const;

const META_RUNTIME_BASELINE_DIGESTS = {
  "src/app/api/meta/conversions/route.ts":
    "9fbf0689e06b1657b88fed3db9a36b4aa1dbd625f0fd983dae1e7476a745dffa",
  "src/app/meta-marketing.tsx":
    "15f0ac10a15879e6e2182798ebd838ae705a79f2cf480305ae871ecbd5eaa874",
  "src/lib/meta-marketing/client.ts":
    "26bbaaa8f6dbf2e4ef102701e73a581316f48607d2720cd92c5b46563a97d98d",
  "src/lib/meta-marketing/events.ts":
    "9c13130e9823e145f54ad245c24f3f1f2e93c99dfc1038e87d797e381cff7f4d",
  "src/server/meta-marketing/conversions-api.ts":
    "16ed01cdc34786f474ea6b64d55aa0356ed7ad3c4876acc98b915a3674af1de9",
} as const;

const META_TEST_BASELINE_DIGESTS = {
  "src/app/api/meta/conversions/route.test.ts":
    "9363ceef165574146f19152348beb056a8767a0dc87ae5efedd29323189df3a9",
  "src/app/meta-marketing.test.tsx":
    "c9f7f29dc49fbd7d9868e9f74b339b754cca6110b74588face9bc4a258e4a27e",
  "src/server/meta-marketing/conversions-api.test.ts":
    "e6cf50b7ee20c9623dba0d3cb1b3de549f00ddab852a150d4042db90db2fcf74",
} as const;

const META_ENV_CONTRACT = [
  'NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED="false"',
  'NEXT_PUBLIC_META_PIXEL_ID=""',
  'META_CONVERSIONS_API_ACCESS_TOKEN=""',
  'META_CONVERSIONS_API_TEST_EVENT_CODE=""',
  'META_CONVERSIONS_API_GRAPH_VERSION="v23.0"',
] as const;

const RECEIPT_SOURCE_PATHS = [
  "src/lib/auth.ts",
  "src/lib/auth/facebook-oauth.test.ts",
  "src/lib/auth/retired-social-provider.ts",
  "src/lib/auth/social-account-policy.test.ts",
  "src/lib/auth/social-account-policy.ts",
  "src/lib/auth/social-oauth.test.ts",
  "src/lib/auth/social-oauth.ts",
  "src/app/api/auth/[...all]/route.ts",
  "src/app/auth/intent/auth-intent-surface.tsx",
  "src/app/auth/intent/page.tsx",
  "src/app/garden/garden-auth-panel.tsx",
  "src/app/garden/garden-auth-panel.test.tsx",
  "src/app/garden/account-methods-panel.tsx",
  "src/app/garden/account-methods-panel.test.tsx",
  "src/app/garden/page.tsx",
  "src/app/garden/profile/page.tsx",
  "src/components/auth/blocked-session-account-methods.tsx",
  "src/server/auth/account-methods.ts",
  "scripts/smoke-account-sign-out.ts",
  "scripts/smoke-canonical-launch.ts",
  "scripts/smoke-public-identity.ts",
  "scripts/smoke-restore-readiness.ts",
  "scripts/smoke-self-serve-providers.ts",
  "scripts/verify-facebook-login-retirement.ts",
  "scripts/verify-facebook-login-retirement.test.ts",
  "tests/auth-provider-retirement.spec.ts",
  "playwright.config.ts",
  "vitest.config.ts",
  "../../docs/META_ADS_ATTRIBUTION_READINESS.md",
  "../../docs/PRODUCTION_PILOT_SMOKE.md",
  "../../docs/runbooks/OVE_296_FACEBOOK_LOGIN_SURFACE_REMOVAL.md",
  ...CURRENT_AUTH_DOCS,
  ...Object.keys(META_RUNTIME_BASELINE_DIGESTS),
  ...Object.keys(META_TEST_BASELINE_DIGESTS),
] as const;

export interface FacebookSurfaceRetirementReceiptV1 {
  version: 1;
  issue: "OVE-296";
  resultClass: "removed" | "inconclusive" | "regressed";
  failureClass: "none" | "deadline" | "inventory" | "invariant";
  scanDurationMs: number;
  sourceDigest: string | null;
  runtimeReferenceCount: number | null;
  currentDocReferenceCount: number | null;
  providerRegistrationClass:
    | "google_only_no_retired_provider_module"
    | "unverified";
  GoogleCredentialRegressionClass:
    | "credential_and_google_preserved"
    | "unverified";
  MetaAdsUnchangedClass: "unchanged_from_ove296_baseline" | "unverified";
  sha: string;
  deploymentClass: string;
  evidenceSafety: "counts_digests_and_classes_only";
}

type CompletedRetirementScan = Omit<
  FacebookSurfaceRetirementReceiptV1,
  "resultClass" | "failureClass" | "scanDurationMs"
>;

export async function verifyFacebookLoginRetirement({
  root = process.cwd(),
  sha = process.env.OVE296_IMPLEMENTATION_SHA ?? "local-uncommitted",
  deploymentClass = "local_verification",
  deadlineMs = STATIC_SCAN_DEADLINE_MS,
}: {
  root?: string;
  sha?: string;
  deploymentClass?: string;
  deadlineMs?: number;
} = {}): Promise<FacebookSurfaceRetirementReceiptV1> {
  return runRetirementScanWithReceipt({
    operation: (signal) =>
      scanRetirementContract({ root, sha, deploymentClass, signal }),
    sha,
    deploymentClass,
    deadlineMs,
  });
}

export async function runRetirementScanWithReceipt({
  operation,
  sha,
  deploymentClass,
  deadlineMs,
  now = () => performance.now(),
}: {
  operation: (signal: AbortSignal) => Promise<CompletedRetirementScan>;
  sha: string;
  deploymentClass: string;
  deadlineMs: number;
  now?: () => number;
}): Promise<FacebookSurfaceRetirementReceiptV1> {
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("retirement receipt requires an exact lowercase Git SHA");
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(deploymentClass)) {
    throw new Error("retirement deployment class is invalid");
  }
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new Error("retirement scan deadline must be a positive finite value");
  }

  const startedAt = now();
  try {
    const receipt = await settleScanWithinDeadline(operation, deadlineMs);
    return {
      ...receipt,
      resultClass: "removed",
      failureClass: "none",
      scanDurationMs: boundedDuration(now() - startedAt, deadlineMs),
    };
  } catch (error) {
    const scanDurationMs = boundedDuration(now() - startedAt, deadlineMs);
    if (error instanceof RetirementInventoryError) {
      return {
        ...error.receipt,
        resultClass: "regressed",
        failureClass: "inventory",
        scanDurationMs,
      };
    }
    if (error instanceof RetirementScanDeadlineError) {
      return unverifiedReceipt({
        sha,
        deploymentClass,
        resultClass: "inconclusive",
        failureClass: "deadline",
        scanDurationMs,
      });
    }
    return unverifiedReceipt({
      sha,
      deploymentClass,
      resultClass: "regressed",
      failureClass: "invariant",
      scanDurationMs,
    });
  }
}

export async function settleScanWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new Error("retirement scan deadline must be a positive finite value");
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
        error: new RetirementScanDeadlineError(deadlineMs),
      });
    }, deadlineMs);

    void operation(controller.signal).then(
      (value) => settle({ value }),
      (error) => settle({ error }),
    );
  });
}

export class RetirementScanDeadlineError extends Error {
  constructor(readonly deadlineMs: number) {
    super(`retirement static scan exceeded ${deadlineMs}ms deadline`);
    this.name = "RetirementScanDeadlineError";
  }
}

async function scanRetirementContract({
  root,
  sha,
  deploymentClass,
  signal,
}: {
  root: string;
  sha: string;
  deploymentClass: string;
  signal: AbortSignal;
}): Promise<CompletedRetirementScan> {
  const runtimePaths = (await listSourceFiles(path.join(root, "src"), signal))
    .map((absolutePath) => path.relative(root, absolutePath))
    .filter(isRuntimeSource)
    .filter(
      (relativePath) =>
        !RUNTIME_EXCLUSIONS.some(
          (excluded) =>
            relativePath === excluded || relativePath.startsWith(excluded),
        ),
    );

  const runtimeReferenceCount = await countPatternReferences(
    root,
    runtimePaths,
    RETIRED_PROVIDER_PATTERN,
    signal,
  );
  const currentDocReferenceCount = await countPatternReferences(
    root,
    CURRENT_AUTH_DOCS,
    CURRENT_LOGIN_SURFACE_PATTERN,
    signal,
  );

  await assertProviderRegistration(root, signal);
  await assertGoogleCredentialRegression(root, signal);
  await assertMetaAdsUnchanged(root, signal);

  const receipt: CompletedRetirementScan = {
    version: 1,
    issue: "OVE-296",
    sourceDigest: await digestFiles(root, RECEIPT_SOURCE_PATHS, signal),
    runtimeReferenceCount,
    currentDocReferenceCount,
    providerRegistrationClass: "google_only_no_retired_provider_module",
    GoogleCredentialRegressionClass: "credential_and_google_preserved",
    MetaAdsUnchangedClass: "unchanged_from_ove296_baseline",
    sha,
    deploymentClass,
    evidenceSafety: "counts_digests_and_classes_only",
  };

  if (runtimeReferenceCount !== 0 || currentDocReferenceCount !== 0) {
    throw new RetirementInventoryError(receipt);
  }
  return receipt;
}

export class RetirementInventoryError extends Error {
  constructor(readonly receipt: CompletedRetirementScan) {
    super("retired login surface inventory is not empty");
    this.name = "RetirementInventoryError";
  }
}

function unverifiedReceipt({
  sha,
  deploymentClass,
  resultClass,
  failureClass,
  scanDurationMs,
}: Pick<
  FacebookSurfaceRetirementReceiptV1,
  "sha" | "deploymentClass" | "resultClass" | "failureClass" | "scanDurationMs"
>): FacebookSurfaceRetirementReceiptV1 {
  return {
    version: 1,
    issue: "OVE-296",
    resultClass,
    failureClass,
    scanDurationMs,
    sourceDigest: null,
    runtimeReferenceCount: null,
    currentDocReferenceCount: null,
    providerRegistrationClass: "unverified",
    GoogleCredentialRegressionClass: "unverified",
    MetaAdsUnchangedClass: "unverified",
    sha,
    deploymentClass,
    evidenceSafety: "counts_digests_and_classes_only",
  };
}

function boundedDuration(elapsedMs: number, deadlineMs: number) {
  return Math.min(deadlineMs, Math.max(0, Math.ceil(elapsedMs)));
}

async function assertProviderRegistration(root: string, signal: AbortSignal) {
  const authSource = await readText(root, "src/lib/auth.ts", signal);
  const retiredModulePath = path.join(root, "src/lib/auth/facebook-oauth.ts");
  const retiredModuleStillExists = await readFile(retiredModulePath, {
    signal,
    encoding: "utf8",
  }).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.name === "AbortError") throw error;
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );

  if (
    retiredModuleStillExists ||
    !authSource.includes("resolveGoogleSocialProviderConfig") ||
    /facebook/i.test(authSource)
  ) {
    throw new Error("auth provider registration is not Google-only");
  }
}

async function assertGoogleCredentialRegression(
  root: string,
  signal: AbortSignal,
) {
  const [authSource, panelSource, policySource] = await Promise.all([
    readText(root, "src/lib/auth.ts", signal),
    readText(root, "src/app/garden/garden-auth-panel.tsx", signal),
    readText(root, "src/lib/auth/social-account-policy.ts", signal),
  ]);
  if (
    !/emailAndPassword:\s*\{[\s\S]*?enabled:\s*true/.test(authSource) ||
    !panelSource.includes("google-sign-in-button") ||
    !policySource.includes("trustedProviders: [GOOGLE_PROVIDER_ID]")
  ) {
    throw new Error("credential or Google regression guard is incomplete");
  }
}

async function assertMetaAdsUnchanged(root: string, signal: AbortSignal) {
  for (const [relativePath, expectedDigest] of Object.entries({
    ...META_RUNTIME_BASELINE_DIGESTS,
    ...META_TEST_BASELINE_DIGESTS,
  })) {
    const text = await readText(root, relativePath, signal);
    if (sha256(text) !== expectedDigest) {
      throw new Error(
        `Meta Ads implementation/test drifted at ${relativePath}`,
      );
    }
  }

  const envSource = await readText(root, ".env.example", signal);
  const metaEnvContract = envSource
    .split(/\r?\n/)
    .filter((line) => /^(?:NEXT_PUBLIC_META_|META_CONVERSIONS_)/.test(line));
  if (JSON.stringify(metaEnvContract) !== JSON.stringify(META_ENV_CONTRACT)) {
    throw new Error("Meta Ads environment contract drifted");
  }
}

async function countPatternReferences(
  root: string,
  relativePaths: readonly string[],
  pattern: RegExp,
  signal: AbortSignal,
) {
  let count = 0;
  for (const relativePath of relativePaths) {
    const text = await readText(root, relativePath, signal);
    count += text.match(pattern)?.length ?? 0;
  }
  return count;
}

async function digestFiles(
  root: string,
  relativePaths: readonly string[],
  signal: AbortSignal,
) {
  const digest = createHash("sha256");
  for (const relativePath of [...new Set(relativePaths)].sort()) {
    digest.update(relativePath);
    digest.update("\0");
    digest.update(await readText(root, relativePath, signal));
    digest.update("\0");
  }
  return digest.digest("hex");
}

async function readText(
  root: string,
  relativePath: string,
  signal: AbortSignal,
) {
  return readFile(path.resolve(root, relativePath), {
    encoding: "utf8",
    signal,
  });
}

async function listSourceFiles(directory: string, signal: AbortSignal) {
  const output: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (signal.aborted) throw signal.reason;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory())
      output.push(...(await listSourceFiles(absolutePath, signal)));
    else output.push(absolutePath);
  }
  return output;
}

function isRuntimeSource(relativePath: string) {
  return (
    /\.(?:ts|tsx)$/.test(relativePath) &&
    !/\.(?:test|spec)\.(?:ts|tsx)$/.test(relativePath) &&
    !relativePath.includes("/__")
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const receipt = await verifyFacebookLoginRetirement({
    sha: readFlag("--expected-sha") ?? process.env.OVE296_IMPLEMENTATION_SHA,
    deploymentClass: readFlag("--deployment-class") ?? "local_verification",
  });
  const output = `${JSON.stringify(receipt, null, 2)}\n`;
  if (receipt.resultClass === "removed") {
    process.stdout.write(output);
    return;
  }
  process.stderr.write(output);
  process.exitCode = 1;
}

function readFlag(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        issue: "OVE-296",
        error: error instanceof Error ? error.message : "unknown_error",
        evidenceSafety: "counts_digests_and_classes_only",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
