import "./neutralise-server-only";

import { readFileSync } from "node:fs";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { loadVersionedApplicationSql } from "./application-sql";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

/**
 * Applies every versioned migration N times over and reports which ones fail.
 *
 * `bootstrap-db.ts` re-applies the whole set from 0001 on every run, with no
 * ledger of what has already been applied. So idempotence is the property the
 * bootstrap rests on, and nothing was checking it: four statements across 0001,
 * 0005, 0013 and 0036 read columns that `0038` drops, and the second pass died
 * on the first of them. Every migration behind it — including any new one —
 * became unreachable, which is why `0045` had to be applied by hand.
 *
 * A static test cannot see this. `0038` retires a dozen columns, one guard
 * legitimately covers a constraint naming eight of them, and `0014` needs no
 * guard at all. Only running the thing twice tells the truth.
 *
 * **This mutates the database it points at.** It is a harness for a disposable
 * one — a container, or CI's service — and it refuses to start against a
 * database that already holds application tables, because the interesting run
 * begins from empty.
 */
const AUTH_STUBS = `
create table if not exists "user" (
  id uuid primary key, name text, email text,
  "emailVerified" boolean default false,
  "createdAt" timestamptz default now(), "updatedAt" timestamptz default now()
);
create table if not exists account (
  id uuid primary key, "userId" uuid references "user"(id),
  "providerId" text, "accountId" text,
  "createdAt" timestamptz default now(), "updatedAt" timestamptz default now()
);
create table if not exists verification (
  id uuid primary key, identifier text, value text, "expiresAt" timestamptz,
  "createdAt" timestamptz default now(), "updatedAt" timestamptz default now()
);
`;

export interface PassReceipt {
  pass: number;
  failures: { migration: string; message: string }[];
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function summarize(receipts: readonly PassReceipt[]) {
  return {
    passes: receipts.length,
    // Pass 1 proves the set builds; every pass after it proves re-application.
    // Both have to be clean, and they are reported separately because a
    // failure in the first is a different defect from a failure in the rest.
    firstPassFailures: receipts[0]?.failures.length ?? 0,
    reapplyFailures: receipts
      .slice(1)
      .reduce((total, receipt) => total + receipt.failures.length, 0),
    receipts,
  };
}

async function main() {
  const envFile = arg("--env-file");
  if (envFile) loadEnv({ path: envFile });
  const caFile = arg("--ca-file");
  if (caFile) {
    process.env.DATABASE_SSL_CA = readFileSync(caFile, "utf8");
    process.env.DATABASE_SSL = "true";
  }

  const passes = Number(arg("--passes") ?? "3");
  if (!Number.isSafeInteger(passes) || passes < 2 || passes > 10) {
    throw new Error("reapply_passes_invalid");
  }

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("reapply_database_url_missing");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });

  try {
    const existing = await pool.query(
      `select count(*)::int as n from information_schema.tables
        where table_schema = 'public' and table_name = 'media_assets'`,
    );
    if (existing.rows[0].n > 0) throw new Error("reapply_database_not_empty");

    await pool.query(AUTH_STUBS);
    const migrations = await loadVersionedApplicationSql(
      new URL("../sql", import.meta.url).pathname,
    );

    const receipts: PassReceipt[] = [];
    for (let pass = 1; pass <= passes; pass += 1) {
      const failures: PassReceipt["failures"] = [];
      for (const migration of migrations) {
        try {
          await pool.query(migration.sql);
        } catch (error: unknown) {
          failures.push({
            migration: migration.name,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      receipts.push({ pass, failures });
    }

    const receipt = summarize(receipts);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    if (receipt.firstPassFailures > 0 || receipt.reapplyFailures > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.includes("prove-migration-reapply")) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
