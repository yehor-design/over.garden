type EnvLike = Record<string, string | undefined>;

export interface VisualFixtureEnvironment {
  databaseHostClass: "loopback" | "remote-preview";
  databaseName: string;
  objectStoreHostClass: "loopback" | "remote-preview";
  target: "local" | "preview";
}

export function resolveVisualFixtureEnvironment(
  env: EnvLike,
): VisualFixtureEnvironment {
  rejectProduction(env);

  if (env.VISUAL_FIXTURES_ENABLED?.trim().toLowerCase() !== "true") {
    throw new Error("Visual fixtures are disabled.");
  }

  const target = env.VISUAL_FIXTURES_TARGET?.trim();
  if (target !== "local" && target !== "preview") {
    throw new Error("VISUAL_FIXTURES_TARGET must be exactly local or preview.");
  }

  const expectedDatabase = requiredValue(env, "VISUAL_FIXTURES_DATABASE");
  const databaseUrl = requiredValue(env, "DATABASE_URL");
  const parsedDatabase = parseDatabaseUrl(databaseUrl);
  const objectStoreEndpoint = parseHttpUrl(
    requiredValue(env, "R2_ENDPOINT"),
    "R2_ENDPOINT",
  );
  const publicMediaBaseUrl = parseHttpUrl(
    requiredValue(env, "R2_PUBLIC_BASE_URL"),
    "R2_PUBLIC_BASE_URL",
  );

  if (parsedDatabase.name !== expectedDatabase) {
    throw new Error(
      "The resolved database name does not match VISUAL_FIXTURES_DATABASE.",
    );
  }

  if (target === "local") {
    if (!isLoopbackHost(parsedDatabase.hostname)) {
      throw new Error(
        "Local visual fixtures require a loopback Postgres connection.",
      );
    }
    if (
      !isLoopbackHost(objectStoreEndpoint.hostname) ||
      !isLoopbackHost(publicMediaBaseUrl.hostname)
    ) {
      throw new Error(
        "Local visual fixtures require loopback object storage and media origins.",
      );
    }

    return {
      databaseHostClass: "loopback",
      databaseName: parsedDatabase.name,
      objectStoreHostClass: "loopback",
      target,
    };
  }

  if (env.VERCEL_ENV !== "preview") {
    throw new Error("Preview visual fixtures require VERCEL_ENV=preview.");
  }
  if (env.VISUAL_FIXTURES_ALLOW_PREVIEW?.trim().toLowerCase() !== "true") {
    throw new Error(
      "Preview writes require VISUAL_FIXTURES_ALLOW_PREVIEW=true.",
    );
  }
  if (
    isLoopbackHost(objectStoreEndpoint.hostname) ||
    isLoopbackHost(publicMediaBaseUrl.hostname)
  ) {
    throw new Error(
      "Preview visual fixtures require isolated remote object storage.",
    );
  }

  return {
    databaseHostClass: "remote-preview",
    databaseName: parsedDatabase.name,
    objectStoreHostClass: "remote-preview",
    target,
  };
}

export function tryResolveVisualFixtureEnvironment(
  env: EnvLike,
): VisualFixtureEnvironment | null {
  try {
    return resolveVisualFixtureEnvironment(env);
  } catch {
    return null;
  }
}

function rejectProduction(env: EnvLike) {
  if (env.VERCEL_ENV?.trim().toLowerCase() === "production") {
    throw new Error("Visual fixtures are forbidden in Vercel Production.");
  }

  for (const value of [env.PUBLIC_SITE_URL, env.BETTER_AUTH_URL]) {
    if (isCanonicalProductionOrigin(value)) {
      throw new Error(
        "Visual fixtures are forbidden on the canonical production origin.",
      );
    }
  }

  if (isCanonicalProductionMediaOrigin(env.R2_PUBLIC_BASE_URL)) {
    throw new Error(
      "Visual fixtures are forbidden on the canonical production media origin.",
    );
  }
}

function isCanonicalProductionOrigin(value: string | undefined) {
  if (!value?.trim()) return false;

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "over.garden" || hostname === "www.over.garden";
  } catch {
    return false;
  }
}

function isCanonicalProductionMediaOrigin(value: string | undefined) {
  if (!value?.trim()) return false;

  try {
    return new URL(value).hostname.toLowerCase() === "media.over.garden";
  } catch {
    return false;
  }
}

function requiredValue(env: EnvLike, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for visual fixtures.`);
  return value;
}

function parseDatabaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid Postgres URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres protocol.");
  }

  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!name || name.includes("/")) {
    throw new Error("DATABASE_URL must name exactly one database.");
  }

  return { hostname: url.hostname.toLowerCase(), name };
}

function parseHttpUrl(value: string, name: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }

  return { hostname: url.hostname.toLowerCase() };
}

function isLoopbackHost(hostname: string) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(
    hostname,
  );
}
