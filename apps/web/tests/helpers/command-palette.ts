import { expect, type Page } from "playwright/test";

/**
 * Open the command palette by keyboard, and mean it.
 *
 * `⌘K` is a listener React attaches on hydration, and `page.goto(…, "load")`
 * resolves before that. A single press therefore races the bundle: it works on
 * a quiet machine and vanishes on a busy one, which is how
 * `accessibility.spec.ts` failed one gate run in CI while passing every local
 * one. Pressing again is what a reader does when a keystroke does nothing, and
 * it is what this does — the proof is still keyboard-only, and it no longer
 * depends on how loaded the runner is.
 *
 * Since ADR-0032 the window is wider, not narrower: a static document's chrome
 * is in the first bytes, so "the header is visible" is true long before the
 * bundle has run and says nothing about whether a listener exists.
 */
export async function openCommandPalette(
  page: Page,
  /** `/` is the other keyboard entry point; it has the same race. */
  shortcut: "ControlOrMeta+k" | "/" = "ControlOrMeta+k",
) {
  const palette = page.locator('[data-command-palette="true"]');
  await expect
    .poll(
      async () => {
        if (await palette.isVisible()) return true;
        await page.keyboard.press(shortcut);
        return palette.isVisible();
      },
      { timeout: 15_000, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true);
  return palette;
}
