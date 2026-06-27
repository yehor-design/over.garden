import "server-only";

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { numberServerEnv } from "@/lib/env";
import { resolveDatabaseConnection, resolveDatabaseSsl } from "./connection";
import type { Database } from "./types";

type GlobalWithDb = typeof globalThis & {
  overGardenPgPool?: Pool;
  overGardenDb?: Kysely<Database>;
};

const globalForDb = globalThis as GlobalWithDb;

function createPool() {
  const resolution = resolveDatabaseConnection();
  const connectionString = resolution.connectionString;

  if (!connectionString) {
    console.warn(
      "[db] No supported Postgres connection env is set; database access will fail until Postgres is wired.",
    );
  }

  return new Pool({
    connectionString,
    max: numberServerEnv("DATABASE_POOL_MAX", 10),
    ssl: resolveDatabaseSsl(process.env, resolution)
      ? { rejectUnauthorized: true }
      : undefined,
  });
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
