/**
 * OVE-113 sealed owner bootstrap.
 *
 * Usage:
 *   pnpm admin:bootstrap-owner -- --user-id "$OVERGARDEN_OWNER_USER_ID"
 *   pnpm admin:bootstrap-owner -- --env-file .env.production.local --user-id "$OVERGARDEN_OWNER_USER_ID"
 *
 * The script validates that the Better Auth user already exists and writes only
 * a durable owner role row for the configured credential-only account. Any
 * stale non-owner admin role rows are removed before the owner-only schema
 * constraint is applied. Output is
 * intentionally redacted: no user IDs, emails, tokens, cookies, connection
 * strings, or env values are printed.
 */

import { readFileSync } from "node:fs";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  buildVerifiedOwnerAccountEvidence,
  redactOwnerBootstrapFailure,
} from "../src/lib/admin/owner-account-contract";
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
const SEALED_OWNER_USER_ID_ENV = "OVERGARDEN_ADMIN_OWNER_USER_ID";

async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  loadEnv({ path: options.envFile, override: false });
  if (options.caFile) {
    process.env.DATABASE_SSL_CA = readFileSync(options.caFile, "utf8");
  }
  const userId = resolveBootstrapUserId(options.userId);
  assertMatchesSealedOwnerEnv(userId);

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
    const [user, accounts] = await Promise.all([
      db
        .selectFrom("user")
        .select("emailVerified")
        .where("id", "=", userId)
        .executeTakeFirst(),
      db
        .selectFrom("account")
        .select(["providerId", "password"])
        .where("userId", "=", userId)
        .execute(),
    ]);

    if (!user) {
      throw new Error("Admin bootstrap user was not found.");
    }

    const ownerAccountEvidence = buildVerifiedOwnerAccountEvidence(
      {
        emailVerified: user.emailVerified,
        accounts,
      },
      "Admin bootstrap user must have one verified email/password credential.",
    );

    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("admin_user_roles")
        .where("user_id", "!=", userId)
        .execute();

      await trx
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
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          issue: "OVE-113",
          role: "owner",
          ...ownerAccountEvidence,
          staleAdminRowsRemoved: true,
          sealedOwnerUpserted: true,
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

function assertMatchesSealedOwnerEnv(userId: string) {
  const configuredOwnerUserId = process.env[SEALED_OWNER_USER_ID_ENV]?.trim();

  if (!configuredOwnerUserId) {
    throw new Error("Missing sealed owner env for admin bootstrap.");
  }

  if (configuredOwnerUserId !== userId) {
    throw new Error("Admin bootstrap user must match the sealed owner env.");
  }
}

function requiredArg(argv: string[], index: number, name: string) {
  const value = argv[index + 1]?.trim();
  if (!value) throw new Error(`Missing value for ${name}.`);
  return value;
}

main().catch(() => {
  console.error(redactOwnerBootstrapFailure());
  process.exitCode = 1;
});
