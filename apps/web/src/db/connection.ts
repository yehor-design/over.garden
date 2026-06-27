type EnvLike = Record<string, string | undefined>;

interface DatabaseConnectionResolution {
  connectionString?: string;
  source:
    | "DATABASE_URL"
    | "POSTGRES_URL"
    | "POSTGRES_PRISMA_URL"
    | "POSTGRES_COMPONENTS"
    | "missing";
}

export function resolveDatabaseConnection(
  env: EnvLike = process.env,
): DatabaseConnectionResolution {
  const databaseUrl = configured(env.DATABASE_URL);
  if (databaseUrl) {
    return { connectionString: databaseUrl, source: "DATABASE_URL" };
  }

  const postgresUrl = configured(env.POSTGRES_URL);
  if (postgresUrl) {
    return { connectionString: postgresUrl, source: "POSTGRES_URL" };
  }

  const prismaUrl = configured(env.POSTGRES_PRISMA_URL);
  if (prismaUrl) {
    return { connectionString: prismaUrl, source: "POSTGRES_PRISMA_URL" };
  }

  const constructed = constructPostgresUrl(env);
  if (constructed) {
    return { connectionString: constructed, source: "POSTGRES_COMPONENTS" };
  }

  return { source: "missing" };
}

export function resolveDatabaseSsl(
  env: EnvLike = process.env,
  resolution = resolveDatabaseConnection(env),
) {
  const explicit = configured(env.DATABASE_SSL);
  if (explicit) return explicit === "true" || explicit === "1";
  if (!resolution.connectionString) return false;
  if (isLocalConnectionString(resolution.connectionString)) return false;

  return resolution.source !== "DATABASE_URL";
}

function constructPostgresUrl(env: EnvLike): string | undefined {
  const host = configured(env.POSTGRES_HOST);
  const user = configured(env.POSTGRES_USER);
  const password = configured(env.POSTGRES_PASSWORD);
  const database = configured(env.POSTGRES_DATABASE);

  if (!host || !user || !password || !database) return undefined;

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${host}/${encodeURIComponent(database)}`;
}

function configured(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return undefined;

  return trimmed;
}

function isLocalConnectionString(value: string) {
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes("0.0.0.0")
  );
}
