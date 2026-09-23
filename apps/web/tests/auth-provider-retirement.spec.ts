import { expect, test } from "playwright/test";

const INTERFACE_LOCALE_COOKIE = "overgarden_interface_locale";
const INTERFACE_MARKET_COOKIE = "overgarden_interface_market";

/**
 * Facebook Login is retired (`OVE-296`) and credentials plus Google are what
 * remain.
 *
 * **This file asserted a surface that no longer exists.** It looked for
 * `garden-auth-panel` on `/garden` — the panel fourteen pages embedded until
 * `OVE-378` replaced it with one sign-in screen on 2026-09-04. The panel has
 * been deleted since, `single-sign-in-surface.test.ts` asserts it stays
 * deleted, and this spec is in no CI list and no `package.json` script, so
 * nobody ran it and it failed silently for a fortnight. Rewritten against the
 * screen that exists (`OVE-455`); the retirement it guards is unchanged.
 */
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

      const response = await page.goto("/auth/sign-in");
      expect(response?.status()).toBe(200);
      const surface = page.locator('[data-auth-frame="sign-in"]');
      await expect(surface).toBeVisible();
      await expect(surface).toHaveAttribute("lang", locale);
      await expect(surface.locator('input[type="email"]')).toBeVisible();
      await expect(surface.locator('input[type="password"]')).toBeVisible();
      await expect(page.getByTestId("google-sign-in-button")).toBeVisible();
      await expect(surface).not.toContainText(/facebook/i);
      await expect(surface.locator('[data-testid*="facebook"]')).toHaveCount(0);
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
