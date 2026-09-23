import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "playwright/test";

/**
 * The six states of DESIGN.md §5.4, in a real engine, with the real stylesheet.
 *
 * Why not jsdom: axe's `color-contrast` rule needs something that actually
 * computes a colour, and the whole point of the token work is that the numbers
 * are real. Why not a route: a surface nobody asked for must not reach the
 * product (ADR-0031, and the two removals that taught it).
 *
 * The documents are rendered by `scripts/render-screen-states.tsx` rather than
 * here, and that is not tidiness. Playwright transforms every `.tsx` it loads
 * with its own JSX runtime, which yields `{__pw_type}` objects React refuses to
 * render — so a spec cannot import this product's components at all. The script
 * renders them under React's own runtime; this file only reads the output.
 *
 * `degraded` on a **hard load** of a real workspace page is deliberately not
 * proved here, because a rendered fragment cannot prove it. That is what
 * `pnpm prove:workspace-resilience` does, against a `next start` whose
 * `DATABASE_URL` points at a closed port.
 *
 *   pnpm build && pnpm exec next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/screen-states.spec.ts
 */

const STATES = [
  "empty-first-run",
  "empty-no-results",
  "loading",
  "degraded",
  "error",
  "signed-out",
] as const;

const OUTPUT = path.join(process.cwd(), "test-results", "screen-states");

function screenStateDocument(name: string): string {
  const file = path.join(OUTPUT, `${name}.html`);
  if (!existsSync(file)) {
    execFileSync("pnpm", ["exec", "tsx", "scripts/render-screen-states.tsx"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  }
  return readFileSync(file, "utf8");
}

async function axeViolations(page: Page, selector: string) {
  const axeSource = readFileSync(
    path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8",
  );
  await page.evaluate(`(() => { ${axeSource} })()`);
  return page.evaluate(async (root) => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Element,
            options: unknown,
          ) => Promise<{
            violations: Array<{
              id: string;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const element = document.querySelector(root);
    if (!element) throw new Error(`No ${root} to scan.`);
    const result = await axe.run(element, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  }, selector);
}

test.describe("the six states DESIGN.md §5.4 names", () => {
  for (const state of STATES) {
    test(`${state} passes axe with the production stylesheet`, async ({
      page,
    }) => {
      await page.setContent(screenStateDocument(state));
      const violations = await axeViolations(page, "body");
      expect(violations, `${state} has axe violations`).toEqual([]);
    });
  }

  test("a deliberate violation is seen, so a clean run means something", async ({
    page,
  }) => {
    // A check that has never been observed red is indistinguishable from one
    // that cannot go red. The same scan, over markup wrong on purpose: an image
    // with no alt, and a control with no name.
    await page.setContent(screenStateDocument("falsification"));
    const violations = await axeViolations(page, "body");
    expect(violations.map((violation) => violation.id).sort()).toEqual([
      "button-name",
      "image-alt",
    ]);
  });

  test("the two empties are told apart, and only one carries an illustration slot", async ({
    page,
  }) => {
    await page.setContent(screenStateDocument("empty-no-results"));
    // §5.4: no illustration on a filtered miss — the active filters instead.
    await expect(
      page.locator('[data-screen-state="empty-no-results"]'),
    ).toHaveCount(1);
    await expect(page.locator("main img")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Прибрати фільтр/ }),
    ).toHaveCount(2);
  });

  test("a degraded section carries its class and its digest, and no machine code", async ({
    page,
  }) => {
    await page.setContent(screenStateDocument("degraded"));
    const section = page.locator(
      '[data-section-failure="connection_unavailable"]',
    );
    await expect(section).toHaveCount(1);
    await expect(section).toContainText("16JQ1ET");
    await expect(section).not.toContainText("connection_unavailable");
  });
});

test.describe("an overlay keeps focus, and gives it back", () => {
  test("the shell's sheet traps Tab, closes on Esc and returns focus", async ({
    page,
  }) => {
    // A real overlay on a real page. `Dialog` and `Sheet` are the same
    // `base-ui` `Dialog` primitive with different geometry, so this exercises
    // the machinery both rely on — in the engine where `inert` and the focus
    // guards actually exist. jsdom implements neither, which is why this proof
    // is not a unit test.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/garden", { waitUntil: "load" });

    const trigger = page.getByRole("button", { name: "Відкрити навігацію" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // The sheet by name of its slot, so no other overlay can answer for it:
    // the consent notice was a dialog on every page, first in the document
    // ahead of the sheet's portal (`OVE-473`), until it became a named region
    // (`OVE-505`).
    const SHEET = '[role="dialog"][data-slot="sheet-content"]';
    const sheet = page.locator(SHEET);
    await expect(sheet).toBeVisible();

    for (let step = 0; step < 15; step += 1) {
      await page.keyboard.press("Tab");
      // The wrap is asynchronous. `base-ui` puts a focus guard after the popup
      // and redirects out of it on the next frame; a `press("Tab")` loop with
      // no settle reads the guard mid-flight, taps Tab again before the
      // redirect lands, and walks out of the overlay into the page behind it.
      // That is a defect in the test, not in the sheet — the first draft of
      // this spec reported exactly that, and a 120 ms settle showed focus
      // wrapping cleanly from the last link back to the close control.
      await page
        .waitForFunction(
          (selector) => {
            const active = document.activeElement;
            const dialog = document.querySelector(selector);
            return Boolean(active && dialog && dialog.contains(active));
          },
          SHEET,
          { timeout: 2_000 },
        )
        .catch(() => undefined);

      const inside = await page.evaluate((selector) => {
        const active = document.activeElement;
        const dialog = document.querySelector(selector);
        return Boolean(active && dialog && dialog.contains(active));
      }, SHEET);
      expect(inside, `focus escaped the sheet on Tab ${step + 1}`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
