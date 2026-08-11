import { expect, test } from "playwright/test";

const FIXTURE_PATH = "/__visual-fixtures/foreground-autosync";
const EXACT_TRIGGERS = [
  "initial_scan",
  "queue_changed",
  "online",
  "window_focus",
  "document_visible",
  "manual",
];

test.describe("OVE-289 foreground autosync", () => {
  for (const locale of ["uk", "bg", "ru"] as const) {
    test(`keeps the ${locale} garden usable through the bounded admission deadline`, async ({
      page,
    }) => {
      await openFixture(page, locale);
      await page.evaluate(() =>
        window.__ove289ForegroundAutosyncFixture!.prepare("stall_once"),
      );
      await page.evaluate(() =>
        window.__ove289ForegroundAutosyncFixture!.beginAutomaticSignals(),
      );
      await expect
        .poll(() => snapshot(page).then((value) => value.admissionCount))
        .toBe(1);

      for (const testId of [
        "foreground-autosync-navigation-control",
        "foreground-autosync-editor-control",
        "foreground-autosync-locale-control",
        "foreground-autosync-manual-control",
        "foreground-autosync-sign-out-control",
      ]) {
        await expect(page.getByTestId(testId)).toBeEnabled();
        await page.getByTestId(testId).click();
      }
      await page.evaluate(() =>
        window.__ove289ForegroundAutosyncFixture!.waitForIdle(),
      );

      const result = await snapshot(page);
      expect(result.controlCounts).toEqual({
        editor: 1,
        locale: 1,
        manual: 1,
        navigation: 1,
        signOut: 1,
      });
      expect(result.admissionCount).toBe(2);
      expect(result.networkCount).toBe(1);
      expect(result.row?.status).toBe("synced");
      expect(result.receipts[0]).toMatchObject({
        admissionDurationMs: 3_000,
        state: "manual_recovery",
      });
      expect(result.receipts[1]).toMatchObject({ state: "synced" });
    });
  }

  test("returns an empty six-trigger batch before admission, lease, claim, or network", async ({
    page,
  }) => {
    await openFixture(page, "uk");
    const manual = await page.evaluate(() =>
      window.__ove289ForegroundAutosyncFixture!.coalesceAllSix(),
    );
    expect(manual).toBe("rejected");
    const empty = await snapshot(page);
    expect(empty.admissionCount).toBe(0);
    expect(empty.leaseCount).toBe(0);
    expect(empty.automaticClaimCount).toBe(0);
    expect(empty.manualClaimCount).toBe(0);
    expect(empty.networkCount).toBe(0);
    expect(empty.receipts.at(-1)).toMatchObject({
      eligibleCount: 0,
      state: "empty_without_admission",
      triggers: EXACT_TRIGGERS,
    });
  });

  test("coalesces all six foreground triggers into one owner/document drain", async ({
    page,
  }) => {
    await openFixture(page, "bg");
    await page.evaluate(() =>
      window.__ove289ForegroundAutosyncFixture!.prepare("match"),
    );
    await expect(
      page.evaluate(() =>
        window.__ove289ForegroundAutosyncFixture!.coalesceAllSix(),
      ),
    ).resolves.toBe("synced");

    const result = await snapshot(page);
    expect(result.leaseCount).toBe(1);
    expect(result.admissionCount).toBe(1);
    expect(result.automaticClaimCount).toBe(0);
    expect(result.manualClaimCount).toBe(1);
    expect(result.networkCount).toBe(1);
    expect(result.receipts).toEqual([
      expect.objectContaining({
        attemptedCount: 1,
        state: "synced",
        syncedCount: 1,
        triggers: EXACT_TRIGGERS,
      }),
    ]);
  });

  test("does not repeat a failed revision and reopens only manual or a new revision", async ({
    page,
  }) => {
    await openFixture(page, "ru");
    await page.evaluate(async () => {
      const fixture = window.__ove289ForegroundAutosyncFixture!;
      await fixture.prepare("retry_after");
      fixture.beginAutomaticSignals();
      await fixture.waitForIdle();
    });
    const failed = await snapshot(page);
    expect(failed.admissionCount).toBe(1);
    expect(failed.networkCount).toBe(1);
    expect(failed.row).toMatchObject({
      automaticAttemptConsumedRevision: 1,
      revision: 1,
      status: "failed",
    });

    await page.evaluate(async () => {
      const fixture = window.__ove289ForegroundAutosyncFixture!;
      fixture.beginAutomaticSignals();
      await fixture.waitForIdle();
    });
    expect((await snapshot(page)).networkCount).toBe(1);

    await page.evaluate(() =>
      window.__ove289ForegroundAutosyncFixture!.newRevision("match"),
    );
    const revised = await snapshot(page);
    expect(revised.admissionCount).toBe(2);
    expect(revised.networkCount).toBe(2);
    expect(revised.row).toMatchObject({
      automaticAttemptConsumedRevision: 2,
      revision: 2,
      status: "synced",
    });

    await page.reload();
    await waitForFixture(page);
    await page.evaluate(async () => {
      const fixture = window.__ove289ForegroundAutosyncFixture!;
      await fixture.prepare("retry_after");
      fixture.beginAutomaticSignals();
      await fixture.waitForIdle();
    });
    await expect(
      page.evaluate(() =>
        window.__ove289ForegroundAutosyncFixture!.runManual(),
      ),
    ).resolves.toBe("rejected");
    const manual = await snapshot(page);
    expect(manual.admissionCount).toBe(2);
    expect(manual.networkCount).toBe(2);
    expect(manual.manualClaimCount).toBe(1);
  });

  test("rejects a late exact completion after the owner/document context changes", async ({
    page,
  }) => {
    await openFixture(page, "uk");
    await page.evaluate(async () => {
      const fixture = window.__ove289ForegroundAutosyncFixture!;
      await fixture.prepare("controlled_match");
      fixture.beginAutomaticSignals();
    });
    await expect
      .poll(() => snapshot(page).then((value) => value.admissionCount))
      .toBe(1);
    await page.evaluate(() =>
      window.__ove289ForegroundAutosyncFixture!.completeAdmissionAfterContextChange(),
    );

    const result = await snapshot(page);
    expect(result.automaticClaimCount).toBe(0);
    expect(result.manualClaimCount).toBe(0);
    expect(result.networkCount).toBe(0);
    expect(result.row).toMatchObject({
      automaticAttemptConsumedRevision: null,
      status: "queued",
    });
    expect(result.receipts.at(-1)).toMatchObject({ state: "stale_context" });
  });
});

async function openFixture(
  page: import("playwright/test").Page,
  locale: "uk" | "bg" | "ru",
) {
  const response = await page.goto(`${FIXTURE_PATH}?locale=${locale}`);
  expect(response?.status()).toBe(200);
  await waitForFixture(page);
  await expect(page.getByTestId("foreground-autosync-fixture")).toHaveAttribute(
    "lang",
    locale,
  );
}

async function waitForFixture(page: import("playwright/test").Page) {
  await page.waitForFunction(() =>
    Boolean(window.__ove289ForegroundAutosyncFixture),
  );
  await page.evaluate(() =>
    window.__ove289ForegroundAutosyncFixture!.waitForIdle(),
  );
}

function snapshot(page: import("playwright/test").Page) {
  return page.evaluate(() =>
    window.__ove289ForegroundAutosyncFixture!.snapshot(),
  );
}
