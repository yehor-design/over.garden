import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import { buildVerifiedOwnerAccountEvidence } from "../src/lib/admin/owner-account-contract";

loadEnv({ path: ".env.local", override: false });

const DEFAULT_BASE_URL = "http://localhost:3000";
const TEST_PASSWORD = `ove-113-${randomUUID()}-${Date.now()}`;
const SEALED_OWNER_USER_ID_ENV = "OVERGARDEN_ADMIN_OWNER_USER_ID";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_SURFACE_EXPECTATIONS = [
  {
    path: "/garden/pilot-smoke",
    normalForbiddenMarker: "Readiness status",
  },
  {
    path: "/garden/pilot-health",
    normalForbiddenMarker: "provisional pilot signals",
  },
  {
    path: "/garden/pilot-learning/decision",
    normalForbiddenMarker: "provisional decision support",
  },
  {
    path: "/garden/pilot-learning/interviews",
    normalForbiddenMarker: "Capture structured learning",
  },
  {
    path: "/garden/catalog/curation",
    normalForbiddenMarker: "Source candidates",
  },
  {
    path: "/garden/privacy/erasure-requests",
    normalForbiddenMarker: "Requests:",
  },
] as const;
const FORBIDDEN_ADMIN_MARKERS = [
  "ownerUserId",
  "owner_user_id",
  "journalBody",
  "journalTitle",
  "quarantineKey",
  "derivativeKey",
  "cookie",
  "token",
  "ip address",
  "user agent",
  "DATABASE_URL",
  "POSTGRES",
  "R2_SECRET",
  "BETTER_AUTH_SECRET",
];

class CookieJar {
  private readonly cookies = new Map<string, string>();

  addFromResponse(response: Response) {
    for (const cookie of getSetCookieHeaders(response.headers)) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const db = createDatabase();

  const normalEmail = `ove113-normal-${Date.now()}-${randomUUID()}@example.test`;
  const socialLinkedEmail = `ove113-social-${Date.now()}-${randomUUID()}@example.test`;

  try {
    const sealedOwnerEvidence = await assertSealedOwnerDatabaseState(db);

    const normalJar = new CookieJar();
    const socialLinkedJar = new CookieJar();

    await signUpAndSignIn(
      baseUrl,
      normalJar,
      normalEmail,
      "OVE-113 Normal Smoke",
    );
    await waitForAuthRateLimitWindow();
    await signUpAndSignIn(
      baseUrl,
      socialLinkedJar,
      socialLinkedEmail,
      "OVE-113 Social Linked Smoke",
    );

    const socialLinkedUserId = await readUserIdByEmail(db, socialLinkedEmail);
    await linkFakeSocialAccount(db, socialLinkedUserId);
    await assertSecondOwnerInsertRejected(db, socialLinkedUserId);

    const signedOutText = visiblePageText(
      await textRequest(baseUrl, new CookieJar(), "/admin"),
    );
    const normalText = visiblePageText(
      await textRequest(baseUrl, normalJar, "/admin"),
    );
    const socialLinkedText = visiblePageText(
      await textRequest(baseUrl, socialLinkedJar, "/admin"),
    );

    assertIncludes(
      signedOutText,
      "Garden workspace",
      "Signed-out /admin did not render the auth boundary.",
    );
    assertIncludes(
      normalText,
      "Access denied.",
      "Normal signed-in user was not denied from /admin.",
    );
    assertNotIncludes(
      normalText,
      "Pilot smoke",
      "Normal signed-in user saw admin dashboard links.",
    );
    assertIncludes(
      socialLinkedText,
      "Access denied.",
      "Social-linked signed-in user was not denied from /admin.",
    );
    assertNotIncludes(
      socialLinkedText,
      "Pilot smoke",
      "Social-linked signed-in user saw admin dashboard links.",
    );
    assertNoForbiddenAdminEvidence(normalText);
    assertNoForbiddenAdminEvidence(socialLinkedText);

    const normalUsersText = visiblePageText(
      await textRequest(baseUrl, normalJar, "/admin/users"),
    );
    const socialLinkedUsersText = visiblePageText(
      await textRequest(baseUrl, socialLinkedJar, "/admin/users"),
    );

    assertIncludes(
      normalUsersText,
      "Access denied.",
      "Normal signed-in user was not denied from /admin/users.",
    );
    assertIncludes(
      socialLinkedUsersText,
      "Access denied.",
      "Social-linked signed-in user was not denied from /admin/users.",
    );

    for (const surface of ADMIN_SURFACE_EXPECTATIONS) {
      const normalSurfaceText = visiblePageText(
        await textRequest(baseUrl, normalJar, surface.path),
      );
      const socialLinkedSurfaceText = visiblePageText(
        await textRequest(baseUrl, socialLinkedJar, surface.path),
      );

      assertIncludes(
        normalSurfaceText,
        "Access denied.",
        `Normal signed-in user was not denied from ${surface.path}.`,
      );
      assertIncludes(
        socialLinkedSurfaceText,
        "Access denied.",
        `Social-linked signed-in user was not denied from ${surface.path}.`,
      );
      assertNotIncludes(
        normalSurfaceText,
        surface.normalForbiddenMarker,
        `Normal signed-in user saw operator data marker on ${surface.path}.`,
      );
      assertNotIncludes(
        socialLinkedSurfaceText,
        surface.normalForbiddenMarker,
        `Social-linked signed-in user saw operator data marker on ${surface.path}.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          issue: "OVE-113",
          sealedOwnerEnvPresent: true,
          sealedOwnerRoleOnly: true,
          ...sealedOwnerEvidence,
          secondOwnerDatabaseGuardRejected: true,
          signedOutDeniedToDashboard: true,
          normalUserDenied: true,
          socialLinkedUserDenied: true,
          ownerSessionUiProof: "manual_password_login_required",
          linkedOperatorSurfacesChecked: ADMIN_SURFACE_EXPECTATIONS.map(
            (surface) => surface.path,
          ),
          evidenceSafety: "redacted_no_user_ids_emails_cookies_tokens_or_env",
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupSmokeUser(db, normalEmail);
    await cleanupSmokeUser(db, socialLinkedEmail);
    await db.destroy();
  }
}

function createDatabase() {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);

  if (!connectionString) {
    throw new Error(
      "Missing supported database connection env for admin smoke.",
    );
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}

async function assertSealedOwnerDatabaseState(db: Kysely<Database>) {
  const sealedOwnerUserId = process.env[SEALED_OWNER_USER_ID_ENV]?.trim() ?? "";

  if (!UUID_PATTERN.test(sealedOwnerUserId)) {
    throw new Error("Missing or invalid sealed owner env for admin smoke.");
  }

  const [roleRows, owner, accountRows] = await Promise.all([
    db.selectFrom("admin_user_roles").select(["user_id", "role"]).execute(),
    db
      .selectFrom("user")
      .select("emailVerified")
      .where("id", "=", sealedOwnerUserId)
      .executeTakeFirst(),
    db
      .selectFrom("account")
      .select(["providerId", "password"])
      .where("userId", "=", sealedOwnerUserId)
      .execute(),
  ]);

  if (
    roleRows.length !== 1 ||
    roleRows[0]?.user_id !== sealedOwnerUserId ||
    roleRows[0]?.role !== "owner"
  ) {
    throw new Error("Admin smoke requires exactly one sealed owner role row.");
  }

  const evidence = buildVerifiedOwnerAccountEvidence(
    {
      emailVerified: owner?.emailVerified ?? false,
      accounts: accountRows,
    },
    "Sealed owner must have one verified email/password credential.",
  );

  return {
    sealedOwnerEmailVerified: evidence.emailVerified,
    sealedOwnerCredentialOnly: evidence.credentialOnlyVerified,
  };
}

async function assertSecondOwnerInsertRejected(
  db: Kysely<Database>,
  userId: string,
) {
  try {
    await db
      .insertInto("admin_user_roles")
      .values({
        user_id: userId,
        role: "owner",
        grant_reason: "role_cleanup",
      })
      .execute();
  } catch {
    return;
  }

  await db
    .deleteFrom("admin_user_roles")
    .where("user_id", "=", userId)
    .execute();
  throw new Error("Admin role table accepted a second owner row.");
}

async function signUpAndSignIn(
  baseUrl: string,
  jar: CookieJar,
  email: string,
  name: string,
) {
  await authRequest(baseUrl, jar, "/api/auth/sign-up/email", {
    email,
    password: TEST_PASSWORD,
    name,
  });
  await authRequest(baseUrl, jar, "/api/auth/sign-in/email", {
    email,
    password: TEST_PASSWORD,
  });
}

async function waitForAuthRateLimitWindow() {
  await new Promise((resolve) => setTimeout(resolve, 11_000));
}

async function readUserIdByEmail(db: Kysely<Database>, email: string) {
  const user = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (!user) {
    throw new Error("Admin smoke auth user was not persisted.");
  }

  return user.id;
}

async function linkFakeSocialAccount(db: Kysely<Database>, userId: string) {
  await db
    .insertInto("account")
    .values({
      userId,
      providerId: "google",
      accountId: `ove113-${randomUUID()}`,
      updatedAt: sql`now()`,
    })
    .execute();
}

async function cleanupSmokeUser(db: Kysely<Database>, email: string) {
  const user = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (user) {
    await db
      .deleteFrom("admin_role_audit_log")
      .where("actor_user_id", "=", user.id)
      .execute();
    await db
      .deleteFrom("admin_role_audit_log")
      .where("target_user_id", "=", user.id)
      .execute();
    await db
      .deleteFrom("admin_user_roles")
      .where("user_id", "=", user.id)
      .execute();
    await db.deleteFrom("session").where("userId", "=", user.id).execute();
    await db.deleteFrom("account").where("userId", "=", user.id).execute();
    await db.deleteFrom("user").where("id", "=", user.id).execute();
  }

  await db.deleteFrom("verification").where("identifier", "=", email).execute();
}

async function authRequest(
  baseUrl: string,
  jar: CookieJar,
  path: string,
  body: Record<string, string>,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: jar.header(),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  jar.addFromResponse(response);

  if (!response.ok) {
    throw new Error(`Auth request failed at ${path}: ${response.status}.`);
  }
}

async function textRequest(baseUrl: string, jar: CookieJar, path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "text/html",
      Cookie: jar.header(),
    },
    redirect: "manual",
  });
  jar.addFromResponse(response);

  if (!response.ok) {
    throw new Error(`Page request failed at ${path}: ${response.status}.`);
  }

  return response.text();
}

function parseOptions(argv: string[]) {
  let baseUrl = process.env.SMOKE_BASE_URL?.trim() || DEFAULT_BASE_URL;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      baseUrl = argv[index + 1] ?? baseUrl;
      index += 1;
    }
  }

  return { baseUrl };
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function assertIncludes(value: string, expected: string, message: string) {
  if (!value.includes(expected)) {
    throw new Error(`${message} Snippet: ${redactedSnippet(value)}`);
  }
}

function assertNotIncludes(value: string, expected: string, message: string) {
  if (value.includes(expected)) {
    throw new Error(`${message} Snippet: ${redactedSnippet(value)}`);
  }
}

function assertNoForbiddenAdminEvidence(value: string) {
  for (const marker of FORBIDDEN_ADMIN_MARKERS) {
    if (value.toLowerCase().includes(marker.toLowerCase())) {
      throw new Error(`Admin boundary leaked forbidden marker: ${marker}.`);
    }
  }
}

function visiblePageText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function redactedSnippet(html: string) {
  return visiblePageText(html)
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      "[uuid]",
    )
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .slice(0, 360);
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  const fromGetter = withGetter.getSetCookie?.();
  if (fromGetter && fromGetter.length > 0) return fromGetter;

  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,]+=)/) : [];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
