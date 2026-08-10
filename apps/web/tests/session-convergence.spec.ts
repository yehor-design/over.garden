import { expect, test } from "playwright/test";

const FIXTURE_PATH = "/__visual-fixtures/session-recheck";
const MARKER_KEY = "overgarden:session-invalidation:v1";

test.describe("OVE-286 session convergence", () => {
  for (const locale of ["uk", "bg", "ru"] as const) {
    test(`keeps the ${locale} editor interactive through twenty coalesced ordinary signals`, async ({
      page,
    }) => {
      await openFixture(page, { locale });

      await page.evaluate(() => {
        const fixture = window.__ove286SessionConvergenceFixture!;
        fixture.stallNextRead();
        for (let index = 0; index < 10; index += 1) {
          window.dispatchEvent(new Event("focus"));
          document.dispatchEvent(new Event("visibilitychange"));
        }
      });

      await expect(privateSurface(page)).toBeVisible();
      await page.getByTestId("session-recheck-private-action").click();
      await page.getByTestId("session-recheck-locale-control").click();
      await expect(page.getByTestId("session-recheck-action-count")).toHaveText(
        "1",
      );
      await expect(page.getByTestId("session-recheck-locale-count")).toHaveText(
        "1",
      );

      const stalledSnapshot = await page.evaluate(() =>
        window.__ove286SessionConvergenceFixture!.snapshot(),
      );
      expect(stalledSnapshot.readCount).toBe(2);
      expect(stalledSnapshot.markerStatus).toBe("absent");

      await page.evaluate(() =>
        window.__ove286SessionConvergenceFixture!.releaseStalledRead("exact"),
      );
      await expect(privateSurface(page)).toBeVisible();
      await expect(page.locator("[data-session-convergence-gate]")).toHaveCount(
        0,
      );
    });
  }

  test("keeps malformed, rejected, and timed-out background reads nonterminal", async ({
    page,
  }) => {
    await openFixture(page, { locale: "uk" });

    await page.evaluate(() => {
      const fixture = window.__ove286SessionConvergenceFixture!;
      fixture.setNextReadOutcome("unknown");
      window.dispatchEvent(new Event("focus"));
    });
    await expect(privateSurface(page)).toBeVisible();

    await page.evaluate(() => {
      const fixture = window.__ove286SessionConvergenceFixture!;
      fixture.setNextReadOutcome("rejected");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(privateSurface(page)).toBeVisible();

    await page.evaluate(() => {
      const fixture = window.__ove286SessionConvergenceFixture!;
      fixture.stallNextRead();
      window.dispatchEvent(new Event("focus"));
    });
    await page.getByTestId("session-recheck-private-action").click();
    await page.getByTestId("session-recheck-locale-control").click();
    await expect(privateSurface(page)).toBeVisible();
    await page.waitForTimeout(3_100);
    await expect(privateSurface(page)).toBeVisible();
    await expect(page.getByTestId("session-recheck-action-count")).toHaveText(
      "1",
    );
    await expect(page.getByTestId("session-recheck-locale-count")).toHaveText(
      "1",
    );
  });

  test("retains the eager compatibility fence on an unpromoted route mode", async ({
    page,
  }) => {
    await openFixture(page, { locale: "bg", mode: "compatibility" });
    await page.evaluate(() => {
      const fixture = window.__ove286SessionConvergenceFixture!;
      fixture.stallNextRead();
      window.dispatchEvent(new Event("focus"));
    });

    await expect(privateSurface(page)).toHaveCount(0);
    await expect(
      page.locator('[data-session-convergence-gate="checking"]'),
    ).toBeVisible();
    await page.evaluate(() =>
      window.__ove286SessionConvergenceFixture!.releaseStalledRead("exact"),
    );
    await expect(privateSurface(page)).toBeVisible();
  });

  test("removes a terminal peer document within 100 ms and rejects every late exact completion", async ({
    page,
  }) => {
    await openFixture(page, { locale: "ru" });
    await page.evaluate(() => {
      const fixture = window.__ove286SessionConvergenceFixture!;
      fixture.stallNextRead();
      window.dispatchEvent(new Event("focus"));
    });
    await expect(privateSurface(page)).toBeVisible();

    const removalDuration = await page.evaluate(() =>
      window.__ove286SessionConvergenceFixture!.emitPeerCommittedInvalidation(),
    );
    expect(removalDuration).toBeLessThanOrEqual(100);
    await expect(privateSurface(page)).toHaveCount(0);
    await expect(
      page.locator('[data-session-convergence-gate="blocked"]'),
    ).toBeVisible();

    await page.evaluate(() =>
      window.__ove286SessionConvergenceFixture!.releaseStalledRead("exact"),
    );
    await page.waitForTimeout(50);
    await expect(privateSurface(page)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => window.__ove286SessionConvergenceFixture!.snapshot().markerStatus,
      ),
    ).toBe("present");
  });

  test("compare-clears only the captured bootstrap marker and lets a newer marker win", async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, initialMarker]) => {
        const seededKey = "overgarden:fixture:ove286:marker-seeded";
        if (window.sessionStorage.getItem(seededKey) !== "true") {
          window.localStorage.setItem(key, initialMarker);
          window.sessionStorage.setItem(seededKey, "true");
        }
      },
      [MARKER_KEY, marker("A")] as const,
    );
    await openFixture(page, { locale: "uk", initial: "stall" });

    await page.evaluate(
      ([key, newerMarker]) => window.localStorage.setItem(key, newerMarker),
      [MARKER_KEY, marker("B")] as const,
    );
    await page.evaluate(() =>
      window.__ove286SessionConvergenceFixture!.releaseStalledRead("exact"),
    );
    await expect(
      page.locator('[data-session-convergence-gate="blocked"]'),
    ).toBeVisible();
    await expect(privateSurface(page)).toHaveCount(0);

    await page.goto(fixtureUrl({ locale: "uk" }));
    await expect(privateSurface(page)).toBeVisible();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), MARKER_KEY),
    ).toBe(null);
  });

  test("refreshes one same-owner new session without pre-hide or a marker", async ({
    page,
  }) => {
    await openFixture(page, { locale: "bg" });
    const initialLoadCount = await page.evaluate(
      () => window.__ove286SessionConvergenceFixture!.snapshot().loadCount,
    );

    await page.evaluate(() =>
      window.__ove286SessionConvergenceFixture!.switchToSameOwnerSession(),
    );
    await expect(privateSurface(page)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__ove286SessionConvergenceFixture!.snapshot().loadCount,
        ),
      )
      .toBe(initialLoadCount + 1);
    expect(
      await page.evaluate(
        () => window.__ove286SessionConvergenceFixture!.snapshot().markerStatus,
      ),
    ).toBe("absent");
    expect(
      await page.evaluate(
        () =>
          window.__ove286SessionConvergenceFixture!.snapshot()
            .sameOwnerPreHideObserved,
      ),
    ).toBe(false);
  });

  test("uses the persistent marker to invalidate a restored BFCache document", async ({
    page,
  }) => {
    await openFixture(page, { locale: "uk" });
    const initialLoadCount = await page.evaluate(
      () => window.__ove286SessionConvergenceFixture!.snapshot().loadCount,
    );

    const reloaded = page.waitForEvent(
      "framenavigated",
      (frame) => frame === page.mainFrame(),
    );
    await page.evaluate(() =>
      window.__ove286SessionConvergenceFixture!.simulateMarkedBfCacheRestore(),
    );
    await reloaded;
    await page.waitForFunction(() =>
      Boolean(window.__ove286SessionConvergenceFixture),
    );
    expect(
      await page.evaluate(
        () => window.__ove286SessionConvergenceFixture!.snapshot().loadCount,
      ),
    ).toBe(initialLoadCount + 1);
    await expect(privateSurface(page)).toBeVisible();
    expect(
      await page.evaluate(
        () => window.__ove286SessionConvergenceFixture!.snapshot().markerStatus,
      ),
    ).toBe("absent");
  });
});

function fixtureUrl({
  locale,
  mode = "non_fencing",
  initial = "exact",
}: {
  locale: "uk" | "bg" | "ru";
  mode?: "non_fencing" | "compatibility";
  initial?: "exact" | "stall";
}) {
  const query = new URLSearchParams({
    visualSessionConvergence: "true",
    locale,
    mode,
    initial,
  });
  return `${FIXTURE_PATH}?${query}`;
}

async function openFixture(
  page: import("playwright/test").Page,
  options: Parameters<typeof fixtureUrl>[0],
) {
  const response = await page.goto(fixtureUrl(options));
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() =>
    Boolean(window.__ove286SessionConvergenceFixture),
  );
  if (options.initial === "stall") {
    await expect(
      page.locator('[data-session-convergence-gate="checking"]'),
    ).toBeVisible();
  } else {
    await expect(privateSurface(page)).toBeVisible();
    await expect(page.getByTestId("session-recheck-fixture")).toHaveAttribute(
      "lang",
      options.locale,
    );
  }
}

function privateSurface(page: import("playwright/test").Page) {
  return page.locator('[data-session-recheck-private-fixture="true"]');
}

function marker(character: string) {
  return `{"v":1,"g":"${character.repeat(22)}"}`;
}
