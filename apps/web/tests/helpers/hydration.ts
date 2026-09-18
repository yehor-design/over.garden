import { expect, type Locator } from "playwright/test";

/**
 * Wait until React has adopted this element.
 *
 * `page.goto(…, "load")` resolves before hydration, and the shell streams on
 * top of that, so a control is in the document and inert for a window whose
 * length depends on how busy the machine is. Every interaction proof in this
 * repository that drives a control rather than a link has the same race, and
 * it fails the same way every time: the press or the `selectOption` lands, the
 * handler is not attached yet, and the assertion that waits for the navigation
 * times out — on CI, once, with everything passing locally.
 *
 * React 19 writes `__reactFiber$…` onto every host node it hydrates, which is
 * the one signal available from outside that the listeners are live.
 */
export async function waitForHydration(locator: Locator, timeout = 20_000) {
  await expect
    .poll(
      () =>
        locator
          .first()
          .evaluate((element) =>
            Object.keys(element).some((key) => key.startsWith("__react")),
          ),
      { timeout, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true);
}
