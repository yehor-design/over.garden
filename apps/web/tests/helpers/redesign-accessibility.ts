import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "playwright/test";
import type { AxeResults, RunOptions } from "axe-core";

export const REDESIGN_WIDTHS = [320, 390, 768, 1280, 1920] as const;
export const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** Browser protocol injection also works on CSP-protected pages. Never disables rules. */
export async function scanAccessibility(
  page: Page,
  testInfo: TestInfo,
  label: string,
) {
  // The page's title before the page's rules. After a client navigation the
  // next page's `<title>` streams in with its metadata, which can land after
  // its content: a register was scanned 194 ms before its title arrived, and
  // axe reported `document-title`. A page that never gets a title still
  // fails, here and by name.
  await expect
    .poll(() => page.evaluate(() => document.title.trim()), {
      message: `${label}: the document has no <title> to scan`,
    })
    .not.toBe("");
  await page.evaluate(
    readFileSync(
      path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
      "utf8",
    ),
  );
  const report = await page.evaluate(async (tags) => {
    const axe = (
      window as unknown as {
        axe: {
          version: string;
          run: (context: Document, options: RunOptions) => Promise<AxeResults>;
          getRules: (
            tags: string[],
          ) => Array<{ ruleId: string; tags: string[] }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: tags },
    });
    return {
      version: axe.version,
      tags,
      wcag22Rules: axe.getRules(["wcag22aa"]),
      violations: result.violations,
      incomplete: result.incomplete,
    };
  }, WCAG_AA_TAGS);
  const reportPath = testInfo.outputPath(`${label}-axe.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach(`${label}-axe`, {
    path: reportPath,
    contentType: "application/json",
  });
  expect(report.wcag22Rules.map((rule) => rule.ruleId)).toContain(
    "target-size",
  );
  expect(report.violations, JSON.stringify(report.violations)).toEqual([]);
}

export async function tabToControl(page: Page, control: Locator, maximum = 80) {
  await expect(control).toBeVisible();
  for (let i = 0; i < maximum; i++) {
    if (await control.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(
    `Keyboard did not reach ${await control.getAttribute("aria-label")} in ${maximum} stops`,
  );
}

export async function expectDialogReturn(page: Page, trigger: Locator) {
  await tabToControl(page, trigger);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
}

export async function expectLiveMessage(
  message: Locator,
  text: string | RegExp,
) {
  await expect(message).toBeVisible();
  await expect(message).toContainText(text);
  expect(
    await message.evaluate((el) => {
      const region = el.closest(
        '[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]',
      );
      return Boolean(region && region.getAttribute("aria-hidden") !== "true");
    }),
  ).toBe(true);
}

export async function expectPending(control: Locator) {
  await expect(control).toHaveAttribute("aria-busy", "true");
  // DESIGN.md keeps a pending button focusable; busy must retain its name.
  await expect(control).toHaveAccessibleName(/\S/);
}

export async function expectFieldError(control: Locator) {
  await expect(control).toHaveAttribute("aria-invalid", "true");
  expect(
    await control.evaluate((el) =>
      (el.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .some((id) => document.getElementById(id)?.textContent?.trim()),
    ),
  ).toBe(true);
}

export async function expectReflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    width: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
  }));
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
}
