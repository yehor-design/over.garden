import { randomBytes } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { collectNormalizedSchemaManifestDigest } from "../src/server/restore-readiness";

const execFile = promisify(execFileCallback);

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error("Local reference database URL unavailable.");

  const databaseName = `ove230_reference_${randomBytes(8).toString("hex")}`;
  const targetUrl = new URL(sourceUrl);
  targetUrl.pathname = `/${databaseName}`;
  const adminPool = new Pool({ connectionString: sourceUrl, max: 1 });

  try {
    await adminPool.query(`create database "${databaseName}"`);
    await execFile("pnpm", ["db:bootstrap"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: targetUrl.toString(),
        DIRECT_URL: targetUrl.toString(),
        DATABASE_SSL: "false",
      },
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    try {
      const digest = await collectNormalizedSchemaManifestDigest(db);
      console.log(
        JSON.stringify({ issue: "OVE-230", schemaManifestDigest: digest }),
      );
    } finally {
      await db.destroy();
    }
  } finally {
    await adminPool.query(
      `drop database if exists "${databaseName}" with (force)`,
    );
    await adminPool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "fresh schema manifest failed",
  );
  process.exitCode = 1;
});
