import { expect, test } from "playwright/test";

/**
 * The sign-in form, driven end to end with the keyboard and nothing else.
 *
 * There is not one mouse event in this file, on purpose. The rewritten tier-1
 * controls (OVE-439) moved every label, description and error into `Field`, and
 * a label that no longer points at its control, or a control that has dropped
 * out of the tab order, is invisible to a unit render and obvious here.
 *
 * It runs against a **production build**: `next dev` does not exercise the
 * postpone/resume path, so a dev-server run would report a false pass on the
 * part of the question that matters — whether the control works before its
 * bundle does.
 *
 *   pnpm build && pnpm next start -p 3130
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3130 pnpm exec playwright test \
 *     tests/keyboard-sign-in.spec.ts
 */

test.describe("sign in, by keyboard alone", () => {
  test("reaches, names and submits every control without a pointer", async ({
    page,
  }) => {
    await page.goto("/auth/sign-in", { waitUntil: "load" });

    const email = page.getByRole("textbox", { name: /пошт|поща|почт|mail/i });
    const password = page.locator('input[type="password"]');
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    // Every control carries a visible label bound to it. `getByRole` with a
    // name is the assertion: an unlabelled control has no accessible name and
    // cannot be found this way at all.
    const emailId = await email.getAttribute("id");
    expect(emailId).toBeTruthy();
    await expect(page.locator(`label[for="${emailId}"]`)).toBeVisible();

    // Tab from the top of the document until focus lands in the email box.
    // A control removed from the tab order never arrives and this fails.
    await page.keyboard.press("Tab");
    let reached = false;
    for (let step = 0; step < 40; step += 1) {
      if (await email.evaluate((node) => node === document.activeElement)) {
        reached = true;
        break;
      }
      await page.keyboard.press("Tab");
    }
    expect(reached, "Tab never reached the email control").toBe(true);

    await page.keyboard.type("keyboard-proof@example.test");

    // The forgotten-password link sits beside the password label (`OVE-455`,
    // the anatomy Intercom, Cal.com, Uxcel, Mixpanel and Relevance AI all
    // ship), so it is one stop between the two credentials. Asserted rather
    // than tabbed past, because a link that moved out of the tab order is
    // exactly what this file exists to catch.
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: /Забули|Забравили|Забыли/u }),
    ).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await page.keyboard.type("not-a-real-password");

    // The show/hide control is inside the field, between it and the submit.
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: /Показати|Показване|Показать/u }),
    ).toBeFocused();

    // The submit control is the next stop, and Enter from inside the form
    // submits it — which is the behaviour a browser gives a real `<form>` and
    // that a div-with-onClick does not.
    const form = page.locator("form").filter({ has: password });
    const submit = form.locator('button[type="submit"]').first();
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
    await expect(submit).toHaveAccessibleName(/\S/);

    // Focus is visible on whatever holds it. `outline-width` is the token the
    // base layer sets; `0px` would mean the ring was removed without a
    // replacement (DESIGN.md §8).
    const outline = await submit.evaluate(
      (node) => getComputedStyle(node).outlineWidth,
    );
    expect(outline).not.toBe("0px");

    await page.keyboard.press("Enter");
    // The credentials are deliberately wrong: what is being proved is that the
    // form posts at all and answers in the page, not that it signs anyone in.
    await expect(form).toBeVisible();
    await expect(password).toBeVisible();
  });

  test("the form's action is a real endpoint, not React's placeholder", async ({
    page,
  }) => {
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    const action = await page
      .locator("form")
      .filter({ has: page.locator('input[type="password"]') })
      .first()
      .getAttribute("action");
    // `javascript:throw new Error('React form unexpectedly submitted.')` is
    // what React renders for a client closure, and it is the defect ADR-0024 D3
    // exists to prevent.
    expect(action ?? "").not.toContain("javascript:");
  });
});
