import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { Pool, type PoolClient } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";
const TEST_PASSWORD = "OVE295-local-password-1!";
const LOCALES = {
  uk: {
    connected: "Підключено",
    connect: "Підключити Google",
    retry: "Спробувати ще раз",
  },
  bg: {
    connected: "Свързан",
    connect: "Свързване с Google",
    retry: "Опитайте отново",
  },
  ru: {
    connected: "Подключено",
    connect: "Подключить Google",
    retry: "Попробовать снова",
  },
} as const;

test.use({ trace: "off" });

test.describe("OVE-295 explicit Google account linking", () => {
  test("uses the native start, authoritative read-back, localized recovery, and a non-wedging deadline", async ({
    baseURL,
    context,
    page,
  }) => {
    test.setTimeout(60_000);
    if (!baseURL) throw new Error("Playwright baseURL is required.");

    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    const email = `ove295-browser-${randomUUID()}@example.test`;
    const verificationIdsBefore = await readVerificationIds(pool);
    let userId: string | null = null;
    let accountLock: PoolClient | null = null;
    let providerReturnUrl = `${baseURL}/garden/profile`;

    await page.route("https://accounts.google.com/**", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        status: 200,
        body: `<!doctype html><html><body><a id="return-to-profile" href="${providerReturnUrl}">Return to profile</a></body></html>`,
      });
    });

    try {
      userId = await createVerifiedCredentialSession({
        baseURL,
        context,
        email,
        pool,
      });
      const initialIdentity = await readIdentityInvariant(pool, userId);

      for (const locale of Object.keys(LOCALES) as Array<
        keyof typeof LOCALES
      >) {
        await selectLocale(context, baseURL, locale);
        await openProfile(page);

        const linkButton = page.getByTestId("google-link-button");
        await expect(linkButton).toHaveText(LOCALES[locale].connect);
        await linkButton.focus();
        await expect(linkButton).toBeFocused();

        providerReturnUrl = `${baseURL}/garden/profile?error=oauth_error&error_description=cancelled&source=${locale}#account-security`;
        await page.keyboard.press("Enter");
        await page.waitForFunction(
          () => window.location.hostname === "accounts.google.com",
        );
        await expect(page.locator("#return-to-profile")).toBeVisible();

        if (locale === "ru") {
          await insertSyntheticGoogleAccount(pool, userId);
        }
        await page.locator("#return-to-profile").click();
        await page.waitForURL(/\/garden\/profile/u);
        await expect
          .poll(() => callbackMarkers(page))
          .toEqual({
            error: false,
            errorDescription: false,
            hash: "#account-security",
            source: locale,
          });

        const googleMethod = googleMethodRow(page);
        if (locale === "ru") {
          await expect(googleMethod).toContainText(LOCALES[locale].connected);
          await expect(page.getByTestId("google-unlink-button")).toBeVisible();
        } else {
          await expect(page.getByTestId("google-link-button")).toHaveText(
            LOCALES[locale].connect,
          );
        }
      }

      await expect(readMethodCounts(pool, userId)).resolves.toEqual({
        credential: 1,
        google: 1,
      });
      expect(
        (await readIdentityInvariant(pool, userId)) === initialIdentity,
      ).toBe(true);

      await selectLocale(context, baseURL, "ru");
      accountLock = await lockAccountReads(pool);
      const initialTimeoutStartedAt = performance.now();
      const timeoutNavigation = page.goto("/garden/profile");
      await page.waitForTimeout(100);
      await expect(page.getByTestId("profile-return-navigation")).toBeVisible();
      await expect(
        page.locator('[data-sign-out-control="profile"]'),
      ).toBeEnabled();
      await page.locator('[data-sign-out-control="profile"]').click();
      await expect(
        page.locator('[data-sign-out-confirmation="true"]'),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      const response = await timeoutNavigation;
      const initialTimeoutDurationMs = Math.round(
        performance.now() - initialTimeoutStartedAt,
      );
      expect(response?.status()).toBe(200);
      expect(initialTimeoutDurationMs).toBeGreaterThanOrEqual(2_900);
      expect(initialTimeoutDurationMs).toBeLessThan(5_000);
      await expect(page.getByTestId("account-method-retry")).toBeVisible();
      await expect(page.getByTestId("account-method-retry-button")).toHaveText(
        LOCALES.ru.retry,
      );

      const retryStartedAt = performance.now();
      await page.getByTestId("account-method-retry-button").click();
      await expect(page.getByTestId("profile-return-navigation")).toBeVisible();
      await expect(
        page.locator('[data-sign-out-control="profile"]'),
      ).toBeEnabled();
      await page.locator('[data-sign-out-control="profile"]').click();
      await expect(
        page.locator('[data-sign-out-confirmation="true"]'),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.locator('[data-sign-out-confirmation="true"]'),
      ).toHaveCount(0);
      await page.waitForTimeout(3_250);
      const retryDurationMs = Math.round(performance.now() - retryStartedAt);
      expect(retryDurationMs).toBeGreaterThanOrEqual(3_000);
      expect(retryDurationMs).toBeLessThan(5_000);
      await expect(page.getByTestId("account-method-retry")).toBeVisible();

      await releaseAccountLock(accountLock);
      accountLock = null;
      await page.getByTestId("account-method-retry-button").click();
      await expect(googleMethodRow(page)).toContainText(LOCALES.ru.connected);

      console.info(
        JSON.stringify({
          callbackMarkersCleaned: true,
          credentialPreserved: true,
          locales: 3,
          nativeAuthorizationHost: "accounts.google.com",
          readbackDeadlineMs: 3_000,
          retryControlsResponsive: true,
        }),
      );
    } finally {
      if (accountLock) await releaseAccountLock(accountLock);
      if (userId) await cleanupSyntheticUser(pool, userId);
      await cleanupNewVerificationRows(pool, verificationIdsBefore);
      if (userId) {
        await expect(countSyntheticUserRows(pool, userId)).resolves.toBe(0);
      }
      await pool.end();
    }
  });
});

async function createVerifiedCredentialSession(input: {
  baseURL: string;
  context: BrowserContext;
  email: string;
  pool: Pool;
}) {
  const signUp = await input.context.request.post(
    `${input.baseURL}/api/auth/sign-up/email`,
    {
      headers: { origin: input.baseURL },
      data: {
        email: input.email,
        password: TEST_PASSWORD,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      },
    },
  );
  expect(signUp.ok()).toBe(true);

  const user = await input.pool.query<{ id: string }>(
    'select id::text as id from public."user" where email = $1::text',
    [input.email],
  );
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error("Synthetic auth user was not persisted.");
  await input.pool.query(
    'update public."user" set "emailVerified" = true where id = $1::uuid',
    [userId],
  );

  const signIn = await input.context.request.post(
    `${input.baseURL}/api/auth/sign-in/email`,
    {
      headers: { origin: input.baseURL },
      data: { email: input.email, password: TEST_PASSWORD },
    },
  );
  expect(signIn.ok()).toBe(true);
  return userId;
}

async function selectLocale(
  context: BrowserContext,
  baseURL: string,
  locale: keyof typeof LOCALES,
) {
  await context.addCookies([
    { name: INTERFACE_LOCALE_COOKIE, value: locale, url: baseURL },
    {
      name: INTERFACE_MARKET_COOKIE,
      value: locale === "uk" ? "ukraine" : "bulgaria",
      url: baseURL,
    },
  ]);
}

async function openProfile(page: Page) {
  const response = await page.goto("/garden/profile");
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("account-methods-panel")).toBeVisible();
}

function googleMethodRow(page: Page) {
  return page
    .getByRole("heading", { name: "Google", exact: true })
    .locator("xpath=ancestor::li");
}

async function callbackMarkers(page: Page) {
  return page.evaluate(() => {
    const url = new URL(window.location.href);
    return {
      error: url.searchParams.has("error"),
      errorDescription: url.searchParams.has("error_description"),
      hash: url.hash,
      source: url.searchParams.get("source"),
    };
  });
}

async function insertSyntheticGoogleAccount(pool: Pool, userId: string) {
  await pool.query(
    `
      insert into public.account (
        id,
        "userId",
        "providerId",
        "accountId",
        "updatedAt"
      ) values ($1::uuid, $2::uuid, 'google', $3::text, now())
    `,
    [randomUUID(), userId, `ove295-browser-subject-${randomUUID()}`],
  );
}

async function readMethodCounts(pool: Pool, userId: string) {
  const result = await pool.query<{
    credential: number;
    google: number;
  }>(
    `
      select
        count(*) filter (where "providerId" = 'credential')::int as credential,
        count(*) filter (where "providerId" = 'google')::int as google
      from public.account
      where "userId" = $1::uuid
    `,
    [userId],
  );
  return result.rows[0] ?? { credential: -1, google: -1 };
}

async function readIdentityInvariant(pool: Pool, userId: string) {
  const result = await pool.query<{
    email: string;
    email_verified: boolean;
    name: string;
  }>(
    `
      select
        email,
        "emailVerified" as email_verified,
        name
      from public."user"
      where id = $1::uuid
    `,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Synthetic auth user is unavailable.");
  return JSON.stringify(row);
}

async function lockAccountReads(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("lock table public.account in access exclusive mode");
    return client;
  } catch (error) {
    client.release();
    throw error;
  }
}

async function releaseAccountLock(client: PoolClient) {
  await client.query("rollback").catch(() => undefined);
  client.release();
}

async function readVerificationIds(pool: Pool) {
  const result = await pool.query<{ id: string }>(
    "select id::text as id from public.verification",
  );
  return new Set(result.rows.map((row) => row.id));
}

async function cleanupNewVerificationRows(
  pool: Pool,
  verificationIdsBefore: ReadonlySet<string>,
) {
  const currentIds = await readVerificationIds(pool);
  const createdIds = [...currentIds].filter(
    (id) => !verificationIdsBefore.has(id),
  );
  if (createdIds.length === 0) return;
  await pool.query(
    "delete from public.verification where id = any($1::uuid[])",
    [createdIds],
  );
}

async function cleanupSyntheticUser(pool: Pool, userId: string) {
  await pool.query('delete from public."user" where id = $1::uuid', [userId]);
}

async function countSyntheticUserRows(pool: Pool, userId: string) {
  const result = await pool.query<{ count: number }>(
    `
      select (
        (select count(*) from public."user" where id = $1::uuid)
        + (select count(*) from public.account where "userId" = $1::uuid)
        + (select count(*) from public.session where "userId" = $1::uuid)
        + (select count(*) from public.user_public_profiles where user_id = $1::uuid)
        + (select count(*) from public.user_handle_registry where user_id = $1::uuid)
      )::int as count
    `,
    [userId],
  );
  return result.rows[0]?.count ?? -1;
}

function requiredLocalDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value)
    throw new Error("DATABASE_URL is required for OVE-295 browser proof.");
  const url = new URL(value);
  if (
    process.env.VERCEL_ENV?.trim().toLowerCase() === "production" ||
    !["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(
      url.hostname.toLowerCase(),
    ) ||
    url.pathname !== "/overgarden"
  ) {
    throw new Error("OVE-295 browser proof requires the local OverGarden DB.");
  }
  return value;
}
