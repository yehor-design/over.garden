/**
 * OVE-391: write the sealed owner the browser proof signs in as.
 *
 * The owner surfaces are gated on two facts that exist before the server does:
 * an `admin_user_roles` row with `role = 'owner'`, and the user id the process
 * was started with (`OVERGARDEN_ADMIN_OWNER_USER_ID`). A spec cannot create
 * that account, because the server has already read its environment by the
 * time the spec runs. So this script writes the account, its credential and
 * its role row with the fixed id from `tests/helpers/owner-fixture.ts`, and
 * the caller starts the server with the same id:
 *
 *   pnpm owner:seed-browser-fixture
 *   OVERGARDEN_ADMIN_OWNER_USER_ID=<printed id> pnpm exec next start -p 3179
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3179 \
 *     pnpm exec playwright test tests/owner-catalog-curation.spec.ts
 *
 * It refuses anything but a loopback database, is idempotent, and prints no
 * secret: the password is a constant in the test helper, not a credential.
 */
import { config as loadEnv } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";

import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { OWNER_BROWSER_FIXTURE } from "../tests/helpers/owner-fixture";

async function main() {
  // In CI the database env is already in `process.env`; locally it is in
  // `.env.local`. `override: false` means the file never shadows a real value.
  loadEnv({ path: readEnvFileArgument(process.argv.slice(2)), override: false });
  assertLoopbackDatabaseEnvironment(process.env);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const password = await hashPassword(OWNER_BROWSER_FIXTURE.password);
    await pool.query("begin");
    await pool.query(
      `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
       values ($1::uuid, $2::text, true, $3::text, now(), now())
       on conflict (id) do update
         set email = excluded.email, "emailVerified" = true, "updatedAt" = now()`,
      [
        OWNER_BROWSER_FIXTURE.userId,
        OWNER_BROWSER_FIXTURE.email,
        PRIVATE_AUTH_COMPATIBILITY_NAME,
      ],
    );
    await pool.query(
      `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1::uuid, $2::text, 'credential', $1::uuid, $3::text, now(), now())
       on conflict (id) do update
         set password = excluded.password, "updatedAt" = now()`,
      [
        OWNER_BROWSER_FIXTURE.userId,
        OWNER_BROWSER_FIXTURE.userId,
        password,
      ],
    );
    // The schema allows one owner. The fixture takes the seat on a local
    // database; production is never reachable from here (loopback guard).
    await pool.query("delete from admin_user_roles where user_id <> $1::uuid", [
      OWNER_BROWSER_FIXTURE.userId,
    ]);
    await pool.query(
      `insert into admin_user_roles (user_id, role, grant_reason, granted_at, updated_at)
       values ($1::uuid, 'owner', 'ove391_browser_proof', now(), now())
       on conflict (user_id) do update set role = 'owner', updated_at = now()`,
      [OWNER_BROWSER_FIXTURE.userId],
    );
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await pool.end().catch(() => undefined);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        ownerUserId: OWNER_BROWSER_FIXTURE.userId,
        email: OWNER_BROWSER_FIXTURE.email,
        startServerWith: `OVERGARDEN_ADMIN_OWNER_USER_ID=${OWNER_BROWSER_FIXTURE.userId}`,
      },
      null,
      2,
    ),
  );
}

function readEnvFileArgument(argv: readonly string[]) {
  const index = argv.indexOf("--env-file");
  if (index < 0) return ".env.local";
  const value = argv[index + 1];
  if (!value) throw new Error("--env-file needs a path.");
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
