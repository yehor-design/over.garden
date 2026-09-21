import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "playwright/test";
import { scanAccessibility } from "./helpers/redesign-accessibility";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  execFileSync("pnpm", ["exec", "tsx", "scripts/render-illustrations.tsx"], {
    stdio: "pipe",
  });
});

for (const locale of ["uk", "bg", "ru"]) {
  test(`${locale}: decorative art decodes, reserves space and leaves text usable without images`, async ({
    page,
  }, testInfo) => {
    const html = readFileSync(
      path.join(
        process.cwd(),
        "test-results",
        "illustrations",
        `${locale}.html`,
      ),
      "utf8",
    );
    for (const width of [320, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(html);
      await expect(page.locator('img[data-slot="illustration"]')).toHaveCount(
        6,
      );
      await page.locator("img").evaluateAll(async (images) => {
        await Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        );
      });
      expect(
        await page.locator("img").evaluateAll((images) =>
          images.every((image) => {
            const img = image as HTMLImageElement;
            return (
              img.naturalWidth === 360 &&
              img.naturalHeight === 360 &&
              img.alt === "" &&
              img.width === 144 &&
              img.height === 144
            );
          }),
        ),
      ).toBe(true);
      await expect(page.getByRole("img")).toHaveCount(0);
      await scanAccessibility(page, testInfo, `${locale}-${width}`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 320 || width === 1280)
        await page.screenshot({
          path: testInfo.outputPath(`${locale}-${width}.png`),
          fullPage: true,
        });
      const before = await page
        .locator("h2")
        .evaluateAll((headings) =>
          headings.map((heading) => heading.getBoundingClientRect().top),
        );
      await page
        .locator("img")
        .evaluateAll((images) =>
          images.forEach((image) =>
            image.setAttribute("src", "data:image/webp;base64,invalid"),
          ),
        );
      await expect(page.getByRole("heading", { level: 2 })).toHaveCount(6);
      const after = await page
        .locator("h2")
        .evaluateAll((headings) =>
          headings.map((heading) => heading.getBoundingClientRect().top),
        );
      expect(after).toEqual(before);
    }
  });
}
