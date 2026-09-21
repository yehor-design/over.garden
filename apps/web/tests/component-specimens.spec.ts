import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => {
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/render-component-specimens.ts"],
    { cwd: process.cwd(), stdio: "pipe" },
  );
});
for (const locale of ["uk", "bg", "ru"])
  for (const width of [320, 1440]) {
    test(`${locale} component states and keyboard at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        pathToFileURL(
          path.join(
            process.cwd(),
            `test-results/component-specimens/${locale}.html`,
          ),
        ).href,
      );
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page
          .locator("html")
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).toContain("Google Sans");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator('button[aria-busy="true"]')).toHaveCount(5);
      await expect(page.locator("button:disabled")).toHaveCount(5);
      await expect(page.locator('input[aria-invalid="true"]')).toHaveAttribute(
        "aria-describedby",
        /error/,
      );
      for (const size of [16, 20, 24]) {
        const box = await page
          .locator(`[data-icon-size="${size}"] svg`)
          .boundingBox();
        expect(box?.width).toBeCloseTo(size, 0);
        expect(box?.height).toBeCloseTo(size, 0);
      }
      const primary = page.locator('[data-variant="primary"] button').first();
      expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await primary.focus();
      expect(
        await primary.evaluate((el) => getComputedStyle(el).outlineStyle),
      ).not.toBe("none");
      await primary.hover();
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`${locale}-${width}-states.png`),
        fullPage: true,
      });
      await page.getByRole("tab").first().focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tab").nth(1)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      const dialogTrigger = page.getByTestId("dialog-trigger");
      await dialogTrigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          dialog.evaluate((el) => el.contains(document.activeElement)),
        )
        .toBe(true);
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`${locale}-${width}-dialog.png`),
      });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(dialogTrigger).toBeFocused();
      const sheetTrigger = page.getByTestId("sheet-trigger");
      await sheetTrigger.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheetTrigger).toBeFocused();
      await page.getByTestId("menu-trigger").focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("menu")).toBeVisible();
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`${locale}-${width}-menu.png`),
      });
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("menu-trigger")).toBeFocused();
      await expect(page.getByRole("menu")).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await page
          .locator('[data-slot="spinner"]')
          .first()
          .evaluate((el) =>
            Number.parseFloat(getComputedStyle(el).animationDuration),
          ),
      ).toBeLessThan(0.001);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      // A size change can load another font face; measure only the settled text.
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () =>
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(primary).toBeVisible();
      const zoomImage = await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`${locale}-${width}-text-zoom.png`),
        fullPage: true,
      });
      const geometry = await page.evaluate(() => ({
        viewport: innerWidth,
        width: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
        overflow: [...document.querySelectorAll("main *")]
          .filter((el) => el.getBoundingClientRect().right > innerWidth)
          .map((el) => ({
            tag: el.tagName,
            slot: el.getAttribute("data-slot"),
            cls: el.className,
            right: el.getBoundingClientRect().right,
          }))
          .slice(0, 20),
      }));
      expect(geometry.width, JSON.stringify(geometry)).toBeLessThanOrEqual(
        width,
      );
      expect(
        await page.evaluate(
          () =>
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) <= window.innerWidth,
        ),
      ).toBe(true);
      expect(
        zoomImage.readUInt32BE(16),
        "full-page PNG must not grow wider than the viewport",
      ).toBe(width);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await page.emulateMedia({ forcedColors: "active" });
      await primary.focus();
      expect(
        await primary.evaluate((el) => getComputedStyle(el).outlineStyle),
      ).not.toBe("none");
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`${locale}-${width}-forced-colors.png`),
        fullPage: true,
      });
    });
  }
