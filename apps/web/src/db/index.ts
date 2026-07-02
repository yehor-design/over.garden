import "server-only";

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { numberServerEnv } from "@/lib/env";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "./connection";
import type { Database } from "./types";

type GlobalWithDb = typeof globalThis & {
  overGardenPgPool?: Pool;
  overGardenDb?: Kysely<Database>;
};

const globalForDb = globalThis as GlobalWithDb;

function createPool() {
  const resolution = resolveDatabaseConnection();
  const connectionString = resolvePgConnectionString(process.env, resolution);

  if (!connectionString) {
    console.warn(
      "[db] No supported Postgres connection env is set; database access will fail until Postgres is wired.",
    );
  }

  return new Pool({
    connectionString,
    max: numberServerEnv("DATABASE_POOL_MAX", defaultDatabasePoolMax()),
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
}

function defaultDatabasePoolMax() {
  return process.env.VERCEL === "1" ||
    process.env.VERCEL === "true" ||
    process.env.NODE_ENV === "production"
    ? 1
    : 10;
}

const pool = globalForDb.overGardenPgPool ?? createPool();

export const db =
  globalForDb.overGardenDb ??
  new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.overGardenPgPool = pool;
  globalForDb.overGardenDb = db;
}
