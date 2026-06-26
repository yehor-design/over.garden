import "server-only";

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { booleanServerEnv, numberServerEnv, optionalServerEnv } from "@/lib/env";
import type { Database } from "./types";

type GlobalWithDb = typeof globalThis & {
  overGardenPgPool?: Pool;
  overGardenDb?: Kysely<Database>;
};

const globalForDb = globalThis as GlobalWithDb;

function createPool() {
  const connectionString = optionalServerEnv("DATABASE_URL");

  if (!connectionString) {
    console.warn(
      "[db] DATABASE_URL is not set; database access will fail until Postgres is wired.",
    );
  }

  return new Pool({
    connectionString,
    max: numberServerEnv("DATABASE_POOL_MAX", 10),
    ssl: booleanServerEnv("DATABASE_SSL")
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
