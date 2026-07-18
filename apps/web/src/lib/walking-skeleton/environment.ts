import {
  resolveVisualFixtureEnvironment,
  type VisualFixtureEnvironment,
} from "@/lib/visual-fixtures/environment";

type EnvLike = Record<string, string | undefined>;

export interface WalkingSkeletonEnvironment {
  databaseHostClass: "loopback";
  databaseName: string;
  objectStoreHostClass: "loopback";
  target: "local";
}

export function resolveWalkingSkeletonEnvironment(
  env: EnvLike,
): WalkingSkeletonEnvironment {
  if (normalized(env.WALKING_SKELETON_ENABLED) !== "true") {
    throw new Error("Walking skeleton is disabled.");
  }

  rejectProductionLikeRuntime(env);

  const environment = resolveVisualFixtureEnvironment(env);
  if (!isLocalVisualFixtureEnvironment(environment)) {
    throw new Error("Walking skeleton requires the local fixture target.");
  }

  assertStrictLoopbackUrl(env.DATABASE_URL, "DATABASE_URL", [
    "postgres:",
    "postgresql:",
  ]);
  assertStrictLoopbackUrl(env.R2_ENDPOINT, "R2_ENDPOINT", ["http:", "https:"]);
  assertStrictLoopbackUrl(env.R2_PUBLIC_BASE_URL, "R2_PUBLIC_BASE_URL", [
    "http:",
    "https:",
  ]);
  assertLoopbackOrigin(env.PUBLIC_SITE_URL, "PUBLIC_SITE_URL");
  assertLoopbackOrigin(env.BETTER_AUTH_URL, "BETTER_AUTH_URL");

  return environment;
}

export function tryResolveWalkingSkeletonEnvironment(
  env: EnvLike,
): WalkingSkeletonEnvironment | null {
  try {
    return resolveWalkingSkeletonEnvironment(env);
  } catch {
    return null;
  }
}

export function isWalkingSkeletonRequestHostAllowed(
  hostOrUrl: string | null | undefined,
): boolean {
  const value = hostOrUrl?.trim();
  if (!value) return false;

  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

function rejectProductionLikeRuntime(env: EnvLike) {
  const nodeEnvironment = normalized(env.NODE_ENV);
  if (nodeEnvironment !== "development" && nodeEnvironment !== "test") {
    throw new Error(
      "Walking skeleton requires a development or test Node runtime.",
    );
  }

  const vercelEnvironment = normalized(env.VERCEL_ENV);
  if (
    normalized(env.VERCEL) === "1" ||
    (vercelEnvironment && vercelEnvironment !== "development")
  ) {
    throw new Error(
      "Walking skeleton is forbidden in deployed Vercel runtimes.",
    );
  }
}

function isLocalVisualFixtureEnvironment(
  environment: VisualFixtureEnvironment,
): environment is WalkingSkeletonEnvironment {
  return (
    environment.target === "local" &&
    environment.databaseHostClass === "loopback" &&
    environment.objectStoreHostClass === "loopback"
  );
}

function assertLoopbackOrigin(value: string | undefined, name: string) {
  assertStrictLoopbackUrl(value, name, ["http:", "https:"]);
}

function assertStrictLoopbackUrl(
  value: string | undefined,
  name: string,
  allowedProtocols: readonly string[],
) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    throw new Error(`${name} is required for the walking skeleton.`);
  }

  let url: URL;
  try {
    url = new URL(normalizedValue);
  } catch {
    throw new Error(`${name} must be a valid HTTP URL.`);
  }

  if (
    !allowedProtocols.includes(url.protocol) ||
    !isLoopbackHostname(url.hostname)
  ) {
    throw new Error(`${name} must use a loopback origin.`);
  }
}

function isLoopbackHostname(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
    hostname.toLowerCase(),
  );
}

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}
