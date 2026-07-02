/**
 * OVE-108 owner bootstrap.
 *
 * Usage:
 *   pnpm admin:bootstrap-owner -- --user-id "$OVERGARDEN_OWNER_USER_ID"
 *   pnpm admin:bootstrap-owner -- --env-file .env.production.local --user-id "$OVERGARDEN_OWNER_USER_ID"
 *
 * The script validates that the Better Auth user already exists and writes only
 * a durable owner role row for a credential-only account. Output is
 * intentionally redacted: no user IDs, emails, tokens, cookies, connection
 * strings, or env values are printed.
 */

import { readFileSync } from "node:fs";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";

interface CliOptions {
  envFile: string;
  caFile?: string;
  userId?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREDENTIAL_PROVIDER_ID = "credential";

async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  loadEnv({ path: options.envFile, override: false });
  if (options.caFile) {
    process.env.DATABASE_SSL_CA = readFileSync(options.caFile, "utf8");
  }
  const userId = resolveBootstrapUserId(options.userId);

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) {
    throw new Error("Missing supported database connection env.");
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  try {
    const user = await db
      .selectFrom("user")
      .select("id")
      .where("id", "=", userId)
      .executeTakeFirst();

    if (!user) {
      throw new Error("Admin bootstrap user was not found.");
    }

    await assertCredentialOnlyAccount(db, userId);

    await db
      .insertInto("admin_user_roles")
      .values({
        user_id: userId,
        role: "owner",
        grant_reason: "manual_owner_bootstrap",
      })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({
          role: "owner",
          grant_reason: "manual_owner_bootstrap",
          updated_at: sql`now()`,
        }),
      )
      .execute();

    console.log(
      JSON.stringify(
        {
          ok: true,
          issue: "OVE-108",
          role: "owner",
          userVerified: true,
          credentialOnlyVerified: true,
          roleUpserted: true,
          evidenceSafety: "redacted_no_user_ids_emails_tokens_or_env",
        },
        null,
        2,
      ),
    );
  } finally {
    await db.destroy();
  }
}

async function assertCredentialOnlyAccount(
  db: Kysely<Database>,
  userId: string,
) {
  const accounts = await db
    .selectFrom("account")
    .select("providerId")
    .where("userId", "=", userId)
    .execute();

  const hasCredentialAccount = accounts.some(
    (account) => account.providerId === CREDENTIAL_PROVIDER_ID,
  );
  const hasLinkedSocialAccount = accounts.some(
    (account) => account.providerId !== CREDENTIAL_PROVIDER_ID,
  );

  if (!hasCredentialAccount || hasLinkedSocialAccount) {
    throw new Error("Admin bootstrap user must use email and password only.");
  }
}

function parseCliOptions(argv: string[]): CliOptions {
  let envFile = ".env.local";
  let caFile: string | undefined;
  let userId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env-file") {
      envFile = requiredArg(argv, index, "--env-file");
      index += 1;
      continue;
    }
    if (arg === "--ca-file") {
      caFile = requiredArg(argv, index, "--ca-file");
      index += 1;
      continue;
    }
    if (arg === "--user-id") {
      userId = requiredArg(argv, index, "--user-id");
      index += 1;
      continue;
    }
  }

  return { envFile, caFile, userId };
}

function resolveBootstrapUserId(cliUserId: string | undefined) {
  const userId =
    cliUserId?.trim() ??
    process.env.OVERGARDEN_ADMIN_BOOTSTRAP_USER_ID?.trim() ??
    "";

  if (!UUID_PATTERN.test(userId)) {
    throw new Error(
      "Missing or invalid admin bootstrap user id. Pass --user-id or OVERGARDEN_ADMIN_BOOTSTRAP_USER_ID.",
    );
  }

  return userId;
}

function requiredArg(argv: string[], index: number, name: string) {
  const value = argv[index + 1]?.trim();
  if (!value) throw new Error(`Missing value for ${name}.`);
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
