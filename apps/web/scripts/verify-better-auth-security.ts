import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const MIN_PATCHED_BETTER_AUTH_VERSION = "1.6.22";
const GUARD_MAX_DURATION_MS = 5_000;

type PackageJson = {
  dependencies?: Record<string, unknown>;
};

export type BetterAuthSecurityGuardInput = {
  packageJson: PackageJson;
  lockfile: string;
  authSource: string;
};

export type BetterAuthSecurityGuardReport = {
  patchedVersion: string;
  passwordlessPlugins: "absent";
  authBoundary: "present";
  versionedSecretPolicy: "present";
};

export type BetterAuthSecurityGuardFailureCode =
  | "missing_dependency"
  | "non_stable_version"
  | "vulnerable_version"
  | "lockfile_mismatch"
  | "lockfile_resolution_mismatch"
  | "forbidden_passwordless_plugin"
  | "missing_auth_boundary"
  | "missing_versioned_secret_policy"
  | "guard_timeout";

export class BetterAuthSecurityGuardError extends Error {
  constructor(readonly code: BetterAuthSecurityGuardFailureCode) {
    super(`Better Auth security guard failed: ${code}`);
    this.name = "BetterAuthSecurityGuardError";
  }
}

export function verifyBetterAuthSecurity(
  input: BetterAuthSecurityGuardInput,
): BetterAuthSecurityGuardReport {
  const configuredVersion = input.packageJson.dependencies?.["better-auth"];
  if (typeof configuredVersion !== "string") {
    throw new BetterAuthSecurityGuardError("missing_dependency");
  }

  const parsedVersion = parseStableVersion(configuredVersion);
  if (!parsedVersion) {
    throw new BetterAuthSecurityGuardError("non_stable_version");
  }

  if (
    compareVersions(
      parsedVersion,
      parseStableVersion(MIN_PATCHED_BETTER_AUTH_VERSION)!,
    ) < 0
  ) {
    throw new BetterAuthSecurityGuardError("vulnerable_version");
  }

  assertLockfileResolution(input.lockfile, configuredVersion);
  assertAuthBoundary(input.authSource);

  return {
    patchedVersion: configuredVersion,
    passwordlessPlugins: "absent",
    authBoundary: "present",
    versionedSecretPolicy: "present",
  };
}

function parseStableVersion(
  version: string,
): [number, number, number] | undefined {
  const match = version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!match) return undefined;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(
  left: [number, number, number],
  right: [number, number, number],
) {
  for (const index of [0, 1, 2] as const) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function assertLockfileResolution(lockfile: string, configuredVersion: string) {
  const importer = lockfile.match(
    /^ {6}better-auth:\n {8}specifier:\s*([^\n]+)\n {8}version:\s*([^\n]+)$/m,
  );
  if (!importer) {
    throw new BetterAuthSecurityGuardError("lockfile_mismatch");
  }

  const [, specifier, resolution] = importer;
  if (
    specifier?.trim() !== configuredVersion ||
    !resolution?.trim().startsWith(`${configuredVersion}(`)
  ) {
    throw new BetterAuthSecurityGuardError("lockfile_mismatch");
  }

  const packageSection = lockfile
    .split("\npackages:\n", 2)[1]
    ?.split("\nsnapshots:\n", 1)[0];
  const resolvedVersions = packageSection
    ? [...packageSection.matchAll(/^ {2}better-auth@([^:\n]+):$/gm)].map(
        (match) => match[1],
      )
    : [];
  if (
    resolvedVersions.length !== 1 ||
    resolvedVersions[0] !== configuredVersion
  ) {
    throw new BetterAuthSecurityGuardError("lockfile_resolution_mismatch");
  }
}

function assertAuthBoundary(authSource: string) {
  if (/\b(?:magicLink|emailOTP)\s*\(/u.test(authSource)) {
    throw new BetterAuthSecurityGuardError("forbidden_passwordless_plugin");
  }

  const requiredMarkers = [
    "emailAndPassword:",
    "enabled: true",
    "requireEmailVerification:",
    "sendResetPassword:",
    "emailVerification:",
    "sendVerificationEmail:",
    "socialProviders:",
    "socialAccountPolicy()",
    "hardenCurrentSessionSignOut",
    "createRetiredSharedIdentityDatabaseHooks",
    "plugins: [nextCookies()]",
  ];

  if (requiredMarkers.some((marker) => !authSource.includes(marker))) {
    throw new BetterAuthSecurityGuardError("missing_auth_boundary");
  }

  if (!authSource.includes("resolveBetterAuthSecretOptions()")) {
    throw new BetterAuthSecurityGuardError("missing_versioned_secret_policy");
  }
}

function readGuardInput(): BetterAuthSecurityGuardInput {
  const appRoot = process.cwd();
  return {
    packageJson: JSON.parse(
      readFileSync(path.join(appRoot, "package.json"), "utf8"),
    ) as PackageJson,
    lockfile: readFileSync(path.join(appRoot, "pnpm-lock.yaml"), "utf8"),
    authSource: readFileSync(path.join(appRoot, "src/lib/auth.ts"), "utf8"),
  };
}

function runCli() {
  const startedAt = performance.now();
  const report = verifyBetterAuthSecurity(readGuardInput());
  const durationMs = Math.ceil(performance.now() - startedAt);

  if (durationMs > GUARD_MAX_DURATION_MS) {
    throw new BetterAuthSecurityGuardError("guard_timeout");
  }

  console.log(
    [
      "better_auth_security_guard=passed",
      `patched_version=${report.patchedVersion}`,
      `duration_ms=${durationMs}`,
      `passwordless_plugins=${report.passwordlessPlugins}`,
      `auth_boundary=${report.authBoundary}`,
      `versioned_secret_policy=${report.versionedSecretPolicy}`,
    ].join(" "),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runCli();
  } catch (error) {
    if (error instanceof BetterAuthSecurityGuardError) {
      console.error(`better_auth_security_guard=failed code=${error.code}`);
      process.exitCode = 1;
    } else {
      console.error("better_auth_security_guard=failed code=unexpected");
      process.exitCode = 1;
    }
  }
}
