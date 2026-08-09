import { expect, test } from "playwright/test";

const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";

test.describe("OVE-296 retired provider surface", () => {
  for (const locale of ["uk", "bg", "ru"] as const) {
    test(`keeps credential and Google entry points without retired copy in ${locale}`, async ({
      baseURL,
      context,
      page,
    }) => {
      if (!baseURL) throw new Error("Playwright baseURL is required");
      await context.addCookies([
        {
          name: INTERFACE_LOCALE_COOKIE,
          value: locale,
          url: baseURL,
        },
        {
          name: INTERFACE_MARKET_COOKIE,
          value: locale === "uk" ? "ukraine" : "bulgaria",
          url: baseURL,
        },
      ]);

      const response = await page.goto("/garden");
      expect(response?.status()).toBe(200);
      const panel = page.getByTestId("garden-auth-panel");
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("lang", locale);
      await expect(panel.locator('input[type="email"]')).toBeVisible();
      await expect(panel.locator('input[type="password"]')).toBeVisible();
      await expect(page.getByTestId("google-sign-in-button")).toBeVisible();
      await expect(panel).not.toContainText(/facebook/i);
      await expect(panel.locator('[data-testid*="facebook"]')).toHaveCount(0);
    });
  }

  test("denies stale callback and initiation traffic without cookies or redirects", async ({
    baseURL,
    request,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const responses = [
      await request.get("/api/auth/callback/facebook?code=stale"),
      await request.post("/api/auth/sign-in/social", {
        headers: { origin: baseURL },
        data: {
          provider: "facebook",
          callbackURL: "/garden",
          idToken: { token: "stale-provider-token" },
        },
      }),
      await request.post("/api/auth/link-social", {
        headers: {
          cookie: "overgarden.session_token=stale-session",
          origin: baseURL,
        },
        data: {
          provider: "facebook",
          callbackURL: "/garden/profile",
        },
      }),
    ];

    for (const response of responses) {
      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toContain(
        "private, no-store",
      );
      expect(response.headers()["set-cookie"]).toBeUndefined();
      expect(response.headers().location).toBeUndefined();
      expect(await response.text()).toBe("");
    }
  });
});
