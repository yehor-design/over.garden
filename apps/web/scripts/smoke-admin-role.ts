import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";

loadEnv({ path: ".env.local", override: false });

const DEFAULT_BASE_URL = "http://localhost:3000";
const TEST_PASSWORD = "overgarden-ove109-smoke-password";
const ADMIN_SURFACE_EXPECTATIONS = [
  {
    path: "/garden/pilot-smoke",
    ownerMarker: "Production pilot smoke",
    normalForbiddenMarker: "Readiness status",
  },
  {
    path: "/garden/pilot-health",
    ownerMarker: "Pilot health",
    normalForbiddenMarker: "provisional pilot signals",
  },
  {
    path: "/garden/pilot-learning/decision",
    ownerMarker: "Pilot cohort decision",
    normalForbiddenMarker: "provisional decision support",
  },
  {
    path: "/garden/pilot-learning/interviews",
    ownerMarker: "Founder interview capture",
    normalForbiddenMarker: "Capture structured learning",
  },
  {
    path: "/garden/catalog/curation",
    ownerMarker: "Catalog curation",
    normalForbiddenMarker: "Source candidates",
  },
  {
    path: "/garden/privacy/erasure-requests",
    ownerMarker: "Erasure requests",
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
const FORBIDDEN_SURFACE_SECRET_MARKERS = [
  "auth-secret-that-must-not-leak",
  "database-secret",
  "r2-secret",
  "meili-secret",
  "matching-token",
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

  const ownerEmail = `ove109-owner-${Date.now()}-${randomUUID()}@example.test`;
  const normalEmail = `ove109-normal-${Date.now()}-${randomUUID()}@example.test`;

  try {
    const ownerJar = new CookieJar();
    const normalJar = new CookieJar();

    await signUpAndSignIn(baseUrl, ownerJar, ownerEmail, "OVE-109 Owner Smoke");
    await signUpAndSignIn(
      baseUrl,
      normalJar,
      normalEmail,
      "OVE-109 User Smoke",
    );

    const ownerUserId = await readUserIdByEmail(db, ownerEmail);
    await db
      .insertInto("admin_user_roles")
      .values({
        user_id: ownerUserId,
        role: "owner",
        grant_reason: "ove109_smoke",
      })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({
          role: "owner",
          grant_reason: "ove109_smoke",
        }),
      )
      .execute();

    const signedOutHtml = await textRequest(baseUrl, new CookieJar(), "/admin");
    const normalHtml = await textRequest(baseUrl, normalJar, "/admin");
    const ownerHtml = await textRequest(baseUrl, ownerJar, "/admin");
    const signedOutText = visiblePageText(signedOutHtml);
    const normalText = visiblePageText(normalHtml);
    const ownerText = visiblePageText(ownerHtml);

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
    assertIncludes(ownerText, "Role: Owner", "Owner did not see owner role.");
    assertIncludes(
      ownerText,
      "Pilot smoke",
      "Owner did not see admin dashboard links.",
    );
    assertIncludes(
      ownerText,
      "Catalog curation",
      "Owner dashboard missing catalog curation link.",
    );
    assertIncludes(
      ownerText,
      "Review: owner/admin/moderator",
      "Owner dashboard missing role-required curation hint.",
    );
    assertIncludes(
      ownerText,
      "execute: owner/admin",
      "Owner dashboard missing erasure execution role hint.",
    );
    assertNoForbiddenAdminEvidence(ownerText);

    for (const surface of ADMIN_SURFACE_EXPECTATIONS) {
      const normalSurfaceHtml = await textRequest(
        baseUrl,
        normalJar,
        surface.path,
      );
      const ownerSurfaceHtml = await textRequest(
        baseUrl,
        ownerJar,
        surface.path,
      );
      const normalSurfaceText = visiblePageText(normalSurfaceHtml);
      const ownerSurfaceText = visiblePageText(ownerSurfaceHtml);

      assertIncludes(
        normalSurfaceText,
        "Access denied.",
        `Normal signed-in user was not denied from ${surface.path}.`,
      );
      assertNotIncludes(
        normalSurfaceText,
        surface.normalForbiddenMarker,
        `Normal signed-in user saw operator data marker on ${surface.path}.`,
      );
      assertIncludes(
        ownerSurfaceText,
        surface.ownerMarker,
        `Owner could not open ${surface.path}.`,
      );
      assertNoForbiddenSurfaceSecrets(ownerSurfaceText, surface.path);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          issue: "OVE-109",
          signedOutDeniedToDashboard: true,
          normalUserDenied: true,
          ownerDashboardRendered: true,
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
    await cleanupSmokeUser(db, ownerEmail);
    await cleanupSmokeUser(db, normalEmail);
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

async function cleanupSmokeUser(db: Kysely<Database>, email: string) {
  const user = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (user) {
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
      throw new Error(`Owner dashboard leaked forbidden marker: ${marker}.`);
    }
  }
}

function assertNoForbiddenSurfaceSecrets(value: string, path: string) {
  for (const marker of FORBIDDEN_SURFACE_SECRET_MARKERS) {
    if (value.toLowerCase().includes(marker.toLowerCase())) {
      throw new Error(`${path} leaked forbidden marker: ${marker}.`);
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
