import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { chromium } from "playwright";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import { buildVerifiedOwnerAccountEvidence } from "../src/lib/admin/owner-account-contract";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

loadEnv({ path: ".env.local", override: false });

const DEFAULT_BASE_URL = "http://localhost:3000";
const TEST_PASSWORD = `ove-113-${randomUUID()}-${Date.now()}`;
const SEALED_OWNER_USER_ID_ENV = "OVERGARDEN_ADMIN_OWNER_USER_ID";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_SURFACE_EXPECTATIONS = [
  {
    path: "/admin/communities",
    normalForbiddenMarker: "Open reports",
    normalAccessState: "unavailable",
  },
  {
    path: "/admin/moderation/comments",
    normalForbiddenMarker: "Comment moderation",
    normalAccessState: "denied",
  },
  {
    path: "/garden/catalog/curation",
    normalForbiddenMarker: "Source candidates",
    normalAccessState: "denied",
  },
  {
    path: "/garden/privacy/erasure-requests",
    normalForbiddenMarker: "Requests:",
    normalAccessState: "denied",
  },
] as const;
const RETIRED_UI_ROUTES = [
  "/admin",
  "/admin/users",
  "/garden/pilot-health",
  "/garden/pilot-smoke",
  "/garden/pilot-learning/interviews",
  "/garden/pilot-learning/decision",
  "/join",
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

  browserCookies(baseUrl: string) {
    return [...this.cookies.entries()].map(([name, value]) => ({
      name,
      value,
      url: baseUrl,
    }));
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

    await signUpAndSignIn(baseUrl, normalJar, normalEmail);
    await waitForAuthRateLimitWindow();
    await signUpAndSignIn(baseUrl, socialLinkedJar, socialLinkedEmail);

    const socialLinkedUserId = await readUserIdByEmail(db, socialLinkedEmail);
    await linkFakeSocialAccount(db, socialLinkedUserId);
    await assertSecondOwnerInsertRejected(db, socialLinkedUserId);

    const normalBrowserEvidence = await readHydratedUserEvidence(
      baseUrl,
      normalJar,
    );
    const socialLinkedBrowserEvidence = await readHydratedUserEvidence(
      baseUrl,
      socialLinkedJar,
    );
    for (const surface of ADMIN_SURFACE_EXPECTATIONS) {
      assertNotIncludes(
        normalBrowserEvidence.accountMenuHtml,
        `href="${surface.path}"`,
        `Normal signed-in user saw owner menu link ${surface.path}.`,
      );
      assertNotIncludes(
        socialLinkedBrowserEvidence.accountMenuHtml,
        `href="${surface.path}"`,
        `Social-linked signed-in user saw owner menu link ${surface.path}.`,
      );
    }
    assertNoForbiddenAdminEvidence(
      visiblePageText(normalBrowserEvidence.accountMenuHtml),
    );
    assertNoForbiddenAdminEvidence(
      visiblePageText(socialLinkedBrowserEvidence.accountMenuHtml),
    );

    for (const path of RETIRED_UI_ROUTES) {
      if ((await pageStatus(baseUrl, normalJar, path)) !== 404) {
        throw new Error(`Retired UI route still resolves at ${path}.`);
      }
    }

    for (const surface of ADMIN_SURFACE_EXPECTATIONS) {
      const normalSurfaceText =
        normalBrowserEvidence.surfaceText.get(surface.path) ?? "";
      const socialLinkedSurfaceText =
        socialLinkedBrowserEvidence.surfaceText.get(surface.path) ?? "";
      assertEqual(
        normalBrowserEvidence.surfaceAccessState.get(surface.path),
        surface.normalAccessState,
        `Normal signed-in user reached an unexpected access state at ${surface.path}.`,
      );
      assertEqual(
        socialLinkedBrowserEvidence.surfaceAccessState.get(surface.path),
        surface.normalAccessState,
        `Social-linked signed-in user reached an unexpected access state at ${surface.path}.`,
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
          retiredUiRoutesAbsent: RETIRED_UI_ROUTES.length,
          normalUserDenied: true,
          socialLinkedUserDenied: true,
          sessionConvergenceProof: "browser_hydrated",
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

async function readHydratedUserEvidence(baseUrl: string, jar: CookieJar) {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    await context.addCookies(jar.browserCookies(baseUrl));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);

    await navigatePastSessionConvergence(page, baseUrl, "/garden");
    await page
      .locator('[data-site-shell-account-menu-trigger="true"]')
      .click();
    const accountMenu = page.locator('[data-slot="sheet-content"]');
    await accountMenu.waitFor({ state: "visible" });
    const accountMenuHtml = await accountMenu.innerHTML();

    const surfaceText = new Map<string, string>();
    const surfaceAccessState = new Map<string, string | null>();
    for (const surface of ADMIN_SURFACE_EXPECTATIONS) {
      await navigatePastSessionConvergence(page, baseUrl, surface.path);
      surfaceText.set(surface.path, await page.locator("body").innerText());
      surfaceAccessState.set(
        surface.path,
        await page
          .locator("[data-operator-access-state]")
          .getAttribute("data-operator-access-state"),
      );
    }

    await context.close();
    return { accountMenuHtml, surfaceAccessState, surfaceText };
  } finally {
    await browser.close();
  }
}

async function navigatePastSessionConvergence(
  page: import("playwright").Page,
  baseUrl: string,
  path: string,
) {
  const response = await page.goto(`${baseUrl}${path}`, {
    waitUntil: "domcontentloaded",
  });
  if (!response?.ok()) {
    throw new Error(`Browser page request failed at ${path}.`);
  }

  const gate = page.locator("[data-session-convergence-gate]");
  if ((await gate.count()) > 0) {
    await gate.waitFor({ state: "detached", timeout: 15_000 });
  }
  await page.locator("main").waitFor({ state: "visible" });
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

async function signUpAndSignIn(baseUrl: string, jar: CookieJar, email: string) {
  await authRequest(baseUrl, jar, "/api/auth/sign-up/email", {
    email,
    password: TEST_PASSWORD,
    name: PRIVATE_AUTH_COMPATIBILITY_NAME,
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

async function pageStatus(baseUrl: string, jar: CookieJar, path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "text/html",
      Cookie: jar.header(),
    },
    redirect: "manual",
  });
  jar.addFromResponse(response);
  return response.status;
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

function assertEqual(
  value: string | null | undefined,
  expected: string,
  message: string,
) {
  if (value !== expected) {
    throw new Error(`${message} State: ${value ?? "missing"}.`);
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
