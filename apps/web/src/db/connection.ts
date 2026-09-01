type EnvLike = Record<string, string | undefined>;

interface DatabaseConnectionResolution {
  connectionString?: string;
  source:
    | "DATABASE_URL"
    | "DIRECT_URL"
    | "POSTGRES_URL"
    | "POSTGRES_PRISMA_URL"
    | "POSTGRES_COMPONENTS"
    | "missing";
}

interface DatabaseSslConfig {
  ca?: string;
  rejectUnauthorized: boolean;
}

/**
 * True when the application's own connection goes through a pooler.
 *
 * The signal is that `DIRECT_URL` exists *and differs* from the connection in
 * use. Nobody configures a separate direct URL except to sit a pooler in front
 * of the other one — that is exactly the split the infrastructure registry
 * records, and the composed self-hosted stack has the same shape.
 *
 * Deliberately not a port or database-name check: those are DigitalOcean's
 * spelling of the idea, and PgBouncer in the composed stack spells it
 * differently.
 */
export function isPooledDatabaseConnection(env: EnvLike = process.env): boolean {
  const direct = configured(env.DIRECT_URL);
  if (!direct) return false;
  const resolution = resolveDatabaseConnection(env);
  if (!resolution.connectionString) return false;
  return resolution.connectionString !== direct;
}

/**
 * How many connections the application pool may open.
 *
 * One per instance is right against a bare Postgres: a serverless deployment
 * multiplies instances, each instance's pool is private, and a managed
 * database's connection slots are few — this one has 22. But one connection
 * also means the concurrency the code already asks for cannot happen. The
 * garden workspace loads four sections through `Promise.allSettled` and the
 * inventory read fans out to four round trips through `Promise.all`; on a pool
 * of one they queue instead, which is the contention OVE-360 measured.
 *
 * Behind a transaction pooler the arithmetic inverts. A client connection no
 * longer owns a backend — the pooler hands one out per transaction and takes it
 * back at commit — so client connections are cheap and the backend count is
 * governed by the pool's own size, not by ours.
 *
 * Five, not more: four is the widest concurrent fan-out any single request
 * makes, and the fifth is headroom. Raising this further would buy nothing that
 * the measured shape of the code can use.
 *
 * `DATABASE_POOL_MAX` still overrides everything, so an operator keeps the last
 * word without a deployment.
 */
export const POOLED_DATABASE_POOL_MAX = 5;
export const DIRECT_SERVERLESS_DATABASE_POOL_MAX = 1;
export const LOCAL_DATABASE_POOL_MAX = 10;

export function defaultDatabasePoolMax(env: EnvLike = process.env): number {
  const serverless =
    env.VERCEL === "1" || env.VERCEL === "true" || env.NODE_ENV === "production";
  if (!serverless) return LOCAL_DATABASE_POOL_MAX;
  return isPooledDatabaseConnection(env)
    ? POOLED_DATABASE_POOL_MAX
    : DIRECT_SERVERLESS_DATABASE_POOL_MAX;
}

/**
 * Resolves the connection for work that needs a real session rather than a
 * transaction.
 *
 * A transaction pooler hands out a different backend per transaction, so
 * anything whose meaning spans transactions — `LISTEN`/`NOTIFY`, a
 * session-level advisory lock — cannot use the pooled connection. The failure
 * is silent rather than loud: a session advisory lock is acquired on one
 * backend and released on another, so it is never released, and the next run
 * waits on it forever.
 *
 * `DIRECT_URL` is the recorded name for that connection, and this is the first
 * runtime reader of it. When it is unset the pooled resolution is returned
 * unchanged, which is the correct answer everywhere no pooler exists — local
 * development, and production until the pooler is wired.
 */
export function resolveDirectDatabaseConnection(
  env: EnvLike = process.env,
): DatabaseConnectionResolution {
  const directUrl = configured(env.DIRECT_URL);
  if (directUrl) return { connectionString: directUrl, source: "DIRECT_URL" };
  return resolveDatabaseConnection(env);
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

export function resolveDatabaseSslConfig(
  env: EnvLike = process.env,
  resolution = resolveDatabaseConnection(env),
): DatabaseSslConfig | undefined {
  if (!resolveDatabaseSsl(env, resolution)) return undefined;

  const ca = configuredMultiline(env.DATABASE_SSL_CA);
  if (ca) return { ca, rejectUnauthorized: true };

  return { rejectUnauthorized: true };
}

export function resolvePgConnectionString(
  env: EnvLike = process.env,
  resolution = resolveDatabaseConnection(env),
) {
  if (!resolution.connectionString) return undefined;
  if (!configured(env.DATABASE_SSL_CA)) return resolution.connectionString;

  return stripSslMode(resolution.connectionString);
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

function configuredMultiline(value: string | undefined): string | undefined {
  return configured(value)?.replaceAll("\\n", "\n");
}

function isLocalConnectionString(value: string) {
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes("0.0.0.0")
  );
}

function stripSslMode(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");

    return url.toString();
  } catch {
    return connectionString;
  }
}
