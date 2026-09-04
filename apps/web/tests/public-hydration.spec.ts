import { expect, test } from "playwright/test";

/**
 * Does a public page hydrate below the shell on a hard load?
 *
 * Written to settle OVE-380. On 2026-09-04 an in-app preview browser reported
 * that `document.body`'s first child carried React fibers and nothing beneath it
 * did — not `main`, not the site shell, not the language control — with
 * unresolved postponed templates left in the document. Read literally that would
 * mean every client control on every public page was inert.
 *
 * It did not reproduce. Against both a local production build and production
 * itself, a real Chromium hydrates `main`, the like control and the language
 * control, and leaves no postponed template unresolved. The original reading was
 * an artefact of that preview browser, not a property of the site.
 *
 * The spec stays because the question is worth keeping answered: a real
 * hydration regression on a public page would be invisible in unit tests and
 * expensive to find by hand. It runs against a **production build** on purpose —
 * the postpone/resume path does not exist under `next dev`, so a dev-server run
 * would report a false pass.
 *
 * Run it against a server you started yourself:
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/public-hydration.spec.ts
 */

interface HydrationProbe {
  bodyFirstChild: boolean;
  main: boolean;
  deepestHydrated: string | null;
  postponedTemplates: number;
  scriptCount: number;
}

const PUBLIC_PATHS = ["/journals", "/objects", "/knowledge"];

test.describe("public pages hydrate below the shell", () => {
  for (const path of PUBLIC_PATHS) {
    test(`${path} hydrates its main region`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      // Hydration is not tied to `load`; give React a real chance before
      // concluding anything, so a slow pass is not read as a failure.
      await page.waitForTimeout(3_000);

      const probe = await page.evaluate<HydrationProbe>(() => {
        const hydrated = (element: Element | null) =>
          element
            ? Object.keys(element).some((key) => key.startsWith("__react"))
            : false;

        // The deepest element carrying a fiber names where hydration stopped.
        let deepest: Element | null = null;
        let depth = -1;
        for (const element of document.querySelectorAll("*")) {
          if (!hydrated(element)) continue;
          let current: Element | null = element;
          let elementDepth = 0;
          while ((current = current.parentElement)) elementDepth += 1;
          if (elementDepth > depth) {
            depth = elementDepth;
            deepest = element;
          }
        }

        return {
          bodyFirstChild: hydrated(document.body.firstElementChild),
          main: hydrated(document.querySelector("main")),
          deepestHydrated: deepest
            ? `${deepest.tagName.toLowerCase()}${deepest.id ? `#${deepest.id}` : ""}`
            : null,
          postponedTemplates:
            document.querySelectorAll("template[id]").length,
          scriptCount: document.querySelectorAll("script[src]").length,
        };
      });

      // Reported whatever the outcome, so a failing run carries its evidence.
      test.info().annotations.push({
        type: "hydration probe",
        description: JSON.stringify(probe),
      });

      expect(
        probe.scriptCount,
        "the page must actually load its client bundle",
      ).toBeGreaterThan(0);
      expect(
        probe.main,
        `main carried no React fiber; deepest hydrated node was ${probe.deepestHydrated}`,
      ).toBe(true);
    });
  }

  test("a public control acts on a hard load", async ({ page }) => {
    await page.goto("/journals", { waitUntil: "load" });
    const entry = page.locator('a[href*="/journal/"]').first();
    await entry.waitFor({ state: "attached", timeout: 10_000 });
    await entry.click();

    const like = page.locator("button[aria-pressed]").first();
    await like.waitFor({ state: "visible", timeout: 10_000 });

    // Whatever hydration does, the control must reach the server: since OVE-377
    // it is a Server Action form with a real endpoint, so a browser that never
    // ran the client bundle still posts it.
    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.request().method() === "POST" && candidate.status() < 500,
        { timeout: 10_000 },
      ),
      like.click(),
    ]);

    expect(response.status()).toBeLessThan(400);
  });
});
