/**
 * Founder CLI: generate a one-time password reset URL for a closed-pilot gardener (OVE-48).
 *
 * Usage:
 *   pnpm pilot:reset-password -- --email gardener@example.com
 *   pnpm pilot:reset-password -- --email gardener@example.com --base-url https://over.garden
 *
 * Requires DATABASE_URL and BETTER_AUTH_SECRET in the environment (or .env.local).
 * Prints the reset URL privately for operator handoff. Never commit printed links.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

import {
  consumeCapturedPasswordResetLinks,
  PILOT_OPERATOR_PASSWORD_RESET_ENV,
} from "../src/lib/auth/pilot-password-reset-delivery";
import { pilotPasswordResetRedirectUrl } from "../src/lib/auth/pilot-auth-recovery";
import type { Database } from "../src/db/types";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false });

process.env[PILOT_OPERATOR_PASSWORD_RESET_ENV] = "1";

interface CliOptions {
  baseUrl: string;
  email: string;
}

function parseCliOptions(argv: string[]): CliOptions {
  let baseUrl =
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "http://localhost:3000";
  let email = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      baseUrl = argv[index + 1]?.trim() ?? baseUrl;
      index += 1;
      continue;
    }
    if (arg === "--email") {
      email = argv[index + 1]?.trim() ?? "";
      index += 1;
    }
  }

  return { baseUrl, email };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  if (!options.email) {
    throw new Error("Pass --email <address> for the gardener account to reset.");
  }

  const connectionString = requiredEnv("DATABASE_URL");
  const pool = new Pool({ connectionString, max: 1 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  const authOptions = {
    appName: "OverGarden",
    baseURL: process.env.BETTER_AUTH_URL ?? options.baseUrl,
    basePath: "/api/auth",
    secret: requiredEnv("BETTER_AUTH_SECRET"),
    database: {
      db,
      type: "postgres",
      casing: "snake",
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const { capturePilotPasswordResetLink } = await import(
          "../src/lib/auth/pilot-password-reset-delivery"
        );
        void capturePilotPasswordResetLink({ email: user.email, url });
      },
    },
    advanced: {
      cookiePrefix: "overgarden",
      database: {
        generateId: "uuid",
      },
    },
  } satisfies BetterAuthOptions;

  const auth = betterAuth(authOptions);
  const migrations = await getMigrations(authOptions);
  await migrations.runMigrations();
  const redirectTo = pilotPasswordResetRedirectUrl(options.baseUrl);

  await auth.api.requestPasswordReset({
    body: {
      email: options.email,
      redirectTo,
    },
  });

  const captured = consumeCapturedPasswordResetLinks();
  await pool.end();

  if (captured.length === 0) {
    console.log(
      "No reset link was generated. If the email is not registered, no link is created.",
    );
    console.log(
      "Confirm the gardener already created an account with this email before sharing help.",
    );
    return;
  }

  console.log("One-time password reset URL (share privately; do not commit):");
  console.log(captured[0]?.url ?? "");
  console.log("");
  console.log(`Redirect target: ${redirectTo}`);
  console.log(
    "After the gardener sets a new password they return to the same account and garden.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
