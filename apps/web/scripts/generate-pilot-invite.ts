/**
 * Founder CLI: generate a closed-pilot invitation URL for OVE-42.
 *
 * Usage:
 *   pnpm pilot:invite
 *   pnpm pilot:invite -- --ttl-days 14 --base-url https://over.garden
 *
 * Requires PILOT_INVITE_SIGNING_SECRET in the environment (or .env.local via
 * --env-file). Production MUST use a real secret; the dev fallback is blocked
 * on deploy by pilot-smoke readiness.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import {
  isUsingDevPilotInviteSecret,
  PILOT_INVITE_SIGNING_SECRET_ENV,
  signPilotInviteToken,
} from "../src/lib/garden/pilot-invite";
import { pilotInviteJoinUrl } from "../src/lib/garden/public-paths";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false });

interface CliOptions {
  baseUrl: string;
  ttlDays: number;
}

function parseCliOptions(argv: string[]): CliOptions {
  let baseUrl =
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "http://localhost:3000";
  let ttlDays = 14;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      baseUrl = argv[index + 1]?.trim() ?? baseUrl;
      index += 1;
      continue;
    }
    if (arg === "--ttl-days") {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) ttlDays = parsed;
      index += 1;
    }
  }

  return { baseUrl, ttlDays };
}

function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const secretConfigured = Boolean(
    process.env[PILOT_INVITE_SIGNING_SECRET_ENV]?.trim(),
  );

  if (isUsingDevPilotInviteSecret()) {
    console.warn(
      `Warning: ${PILOT_INVITE_SIGNING_SECRET_ENV} is unset; using the local dev fallback secret.`,
    );
    console.warn(
      "Set a real secret in production before sharing invites on a deployed URL.",
    );
  }

  const token = signPilotInviteToken({
    ttlSeconds: Math.floor(options.ttlDays * 24 * 60 * 60),
  });
  const inviteUrl = pilotInviteJoinUrl(token, options.baseUrl);

  console.log("Closed-pilot invite URL (share privately; do not commit):");
  console.log(inviteUrl);
  console.log("");
  console.log(`Link TTL: ${options.ttlDays} day(s)`);
  console.log(`Signing secret: ${secretConfigured ? "from env" : "dev fallback"}`);
  console.log(
    "Attribution stays enum-only (invited_cohort). No recipient identity is stored in the link.",
  );
}

main();
