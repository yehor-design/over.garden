export interface LocalRuntimeSafetySummary {
  appOriginClass: "loopback";
  authOriginClass: "loopback";
  databaseHostClass: "loopback";
  objectStoreHostClass: "loopback";
  publicMediaHostClass: "loopback";
  searchHostClass: "loopback";
}

type EnvLike = Record<string, string | undefined>;

export function assertLoopbackLocalRuntimeEnvironment(
  env: EnvLike,
): LocalRuntimeSafetySummary {
  if (env.VERCEL_ENV?.trim().toLowerCase() === "production") {
    throw new Error(
      "Local runtime commands are forbidden in Vercel Production.",
    );
  }

  assertLoopbackUrl(env.DATABASE_URL, "DATABASE_URL", [
    "postgres:",
    "postgresql:",
  ]);
  assertLoopbackUrl(env.R2_ENDPOINT, "R2_ENDPOINT", ["http:", "https:"]);
  assertLoopbackUrl(env.R2_PUBLIC_BASE_URL, "R2_PUBLIC_BASE_URL", [
    "http:",
    "https:",
  ]);
  assertLoopbackUrl(env.PUBLIC_SITE_URL, "PUBLIC_SITE_URL", [
    "http:",
    "https:",
  ]);
  assertLoopbackUrl(env.BETTER_AUTH_URL, "BETTER_AUTH_URL", [
    "http:",
    "https:",
  ]);
  assertLoopbackUrl(env.MEILISEARCH_HOST, "MEILISEARCH_HOST", [
    "http:",
    "https:",
  ]);

  return {
    appOriginClass: "loopback",
    authOriginClass: "loopback",
    databaseHostClass: "loopback",
    objectStoreHostClass: "loopback",
    publicMediaHostClass: "loopback",
    searchHostClass: "loopback",
  };
}

/**
 * The database half of the same guard, for a command that touches Postgres and
 * nothing else.
 *
 * `assertLoopbackLocalRuntimeEnvironment` also requires the app, auth, object
 * store, media and search origins, which a database-only proof neither reads
 * nor can be endangered by — and requiring them made the job queue contract
 * proof fail in CI on a missing `PUBLIC_SITE_URL`. The property that actually
 * protects production is this one: the DSN must be loopback.
 */
export function assertLoopbackDatabaseEnvironment(env: EnvLike): {
  databaseHostClass: "loopback";
} {
  if (env.VERCEL_ENV?.trim().toLowerCase() === "production") {
    throw new Error(
      "Local runtime commands are forbidden in Vercel Production.",
    );
  }
  assertLoopbackUrl(env.DATABASE_URL, "DATABASE_URL", [
    "postgres:",
    "postgresql:",
  ]);
  return { databaseHostClass: "loopback" };
}

function assertLoopbackUrl(
  rawValue: string | undefined,
  name: string,
  protocols: readonly string[],
) {
  const value = rawValue?.trim();
  if (!value)
    throw new Error(`${name} is required for local runtime commands.`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid local URL.`);
  }

  if (!protocols.includes(url.protocol)) {
    throw new Error(`${name} uses an unsupported protocol.`);
  }

  if (!isLoopbackHost(url.hostname)) {
    throw new Error(`${name} must resolve to a loopback host.`);
  }
}

function isLoopbackHost(hostname: string) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(
    hostname.toLowerCase(),
  );
}
