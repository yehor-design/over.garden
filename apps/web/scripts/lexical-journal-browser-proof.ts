import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

import {
  chromium,
  devices,
  firefox,
  webkit,
  type BrowserContext,
  type BrowserType,
  type Page,
} from "playwright";

import { getStructuredJournalComposerLabels } from "../src/lib/structured-journal-composer-copy";
import type { InterfaceLocale } from "../src/lib/interface-localization";
import type { LexicalJournalFixtureSnapshot } from "../src/lib/garden/lexical-journal-browser-fixture-contract";
import { readAndValidateDeviceEquivalentAuthorization } from "./lexical-journal-device-equivalent-authorization";

type BrowserName = "chromium" | "firefox" | "webkit";
type Profile = "structured" | "reorder" | "responsiveness" | "media" | "matrix";

const BROWSERS: Record<BrowserName, BrowserType> = {
  chromium,
  firefox,
  webkit,
};

const CYRILLIC: Record<InterfaceLocale, string> = {
  uk: " Щоденник",
  bg: " Градина",
  ru: " Сад",
};

export async function runLexicalJournalBrowserProof(
  profile: Profile,
): Promise<void> {
  await withFixtureServer(async (baseUrl) => {
    switch (profile) {
      case "structured":
        await structuredProof(baseUrl);
        break;
      case "reorder":
        await reorderProof(baseUrl);
        break;
      case "responsiveness":
        await responsivenessProof(baseUrl);
        break;
      case "media":
        await mediaProof(baseUrl);
        break;
      case "matrix":
        await browserMatrixProof(baseUrl);
        break;
    }
  });
}

async function structuredProof(baseUrl: string) {
  const browser = await chromium.launch({ headless: true });
  const receipts: Array<Record<string, unknown>> = [];
  try {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const page = await browser.newPage();
      const errors = collectPageErrors(page);
      const forbiddenRequests: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("evil.invalid")) {
          forbiddenRequests.push(request.url());
        }
      });
      await openFixture(page, baseUrl, locale);
      const labels = getStructuredJournalComposerLabels(locale);
      const editor = page.locator("[contenteditable='true']");
      const before = await snapshot(page);
      await editor.click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.type(CYRILLIC[locale]);
      await waitForGeneration(page, before.generation);

      await page.getByLabel(labels.tools.heading2).click();
      await waitForType(page, "heading");
      const transformed = await snapshot(page);
      assert(
        sameStringSet(before.blockIds, transformed.blockIds),
        `${locale}: type transform changed stable block IDs.`,
      );
      await page.getByLabel(labels.tools.undo).click();
      await page.getByLabel(labels.tools.redo).click();

      const beforeLists = await snapshot(page);
      await selectTextBlock(page, 2);
      await page.getByLabel(labels.tools.unorderedList).click();
      await page.waitForFunction(
        () =>
          window.__ove317LexicalJournalFixture?.snapshot().types[2] === "list",
      );
      // The next textual DOM block now corresponds to canonical position 3.
      // Two same-style lists must remain separate domain blocks and IDs.
      await selectTextBlock(page, 2);
      await page.getByLabel(labels.tools.unorderedList).click();
      await page.waitForFunction(() => {
        const current = window.__ove317LexicalJournalFixture?.snapshot();
        return current?.types[2] === "list" && current.types[3] === "list";
      });
      const afterLists = await snapshot(page);
      assert(
        sameStringSet(beforeLists.blockIds, afterLists.blockIds) &&
          (await page.locator("[contenteditable='true'] > ul").count()) === 2,
        `${locale}: adjacent lists coalesced or changed domain IDs.`,
      );

      await selectFirstTextBlock(page);
      await page.getByRole("button", { name: labels.tools.link }).click();
      await page
        .getByRole("textbox", { name: labels.tools.link })
        .fill("https://example.com/garden");
      await page.getByRole("button", { name: labels.tools.applyLink }).click();
      await page.waitForSelector("[contenteditable='true'] a");
      assert(
        (await page
          .locator("[contenteditable='true'] a")
          .first()
          .getAttribute("href")) === "https://example.com/garden",
        `${locale}: safe link was not normalized.`,
      );
      await selectFirstTextBlock(page);
      await page.getByRole("button", { name: labels.tools.link }).click();
      await page
        .getByRole("textbox", { name: labels.tools.link })
        .fill("javascript:alert(1)");
      await page.getByRole("button", { name: labels.tools.applyLink }).click();
      assert(
        (await page
          .locator("[contenteditable='true'] a[href^='javascript:']")
          .count()) === 0,
        `${locale}: unsafe link crossed the editor boundary.`,
      );

      const beforeQuote = await snapshot(page);
      await selectTextBlock(page, 1);
      await page.getByRole("button", { name: labels.tools.quote }).click();
      await page.waitForSelector("[contenteditable='true'] blockquote");
      await page
        .getByRole("button", { name: labels.tools.quoteAttribution })
        .click();
      const attribution = page.locator(
        "[contenteditable='true'] blockquote cite",
      );
      await attribution.click();
      await page.keyboard.type(CYRILLIC[locale].trim());
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        ({ priorCount }) =>
          window.__ove317LexicalJournalFixture?.snapshot().blockCount ===
          priorCount + 1,
        { priorCount: beforeQuote.blockCount },
      );
      const afterQuote = await snapshot(page);
      assert(
        beforeQuote.blockIds.every((id) => afterQuote.blockIds.includes(id)) &&
          afterQuote.blockIds.length === beforeQuote.blockIds.length + 1,
        `${locale}: quote attribution exit changed an existing block ID.`,
      );
      assert(
        (await attribution.textContent()) === CYRILLIC[locale].trim(),
        `${locale}: quote attribution was not retained in the native tree.`,
      );

      const paragraphCount = await editor.locator("p").count();
      assert(
        paragraphCount > 0,
        `${locale}: no paragraph for delimiter insertion.`,
      );
      await editor.locator("p").last().click();
      await page.getByLabel(labels.tools.delimiter).click();
      await page.waitForFunction(() =>
        window.__ove317LexicalJournalFixture
          ?.snapshot()
          .types.includes("delimiter"),
      );
      const withDelimiter = await snapshot(page);
      const delimiterIndex = withDelimiter.types.indexOf("delimiter");
      const delimiterId = withDelimiter.blockIds[delimiterIndex];
      assert(delimiterId, `${locale}: delimiter ID missing.`);
      const delimiterControls = page.locator(
        `[data-lexical-reorder-block="${delimiterId}"]`,
      );
      await delimiterControls
        .locator("[data-lexical-reorder-action='handle']")
        .focus();
      await delimiterControls
        .locator("[data-lexical-reorder-action='delete']")
        .click();
      await page.waitForFunction(
        ({ removedId }) =>
          !window.__ove317LexicalJournalFixture
            ?.snapshot()
            .blockIds.includes(removedId),
        { removedId: delimiterId },
      );
      await page.waitForFunction(() =>
        Boolean(
          document
            .querySelector("[data-lexical-reorder-live-region='true']")
            ?.textContent?.trim(),
        ),
      );
      assert(
        Boolean(
          (
            await page
              .locator("[data-lexical-reorder-live-region='true']")
              .textContent()
          )?.trim(),
        ),
        `${locale}: semantic block deletion was not announced.`,
      );

      await editor.click();
      await page.keyboard.press("ControlOrMeta+End");
      await pastePayload(page, {
        html: '<p><strong>Safe bold</strong> <em>safe italic</em> <a href="https://example.com/paste">safe link</a></p>',
        plain: "",
      });
      assert(
        (await page.locator("[contenteditable='true'] strong").count()) > 0 &&
          (await page.locator("[contenteditable='true'] em").count()) > 0 &&
          (await page
            .locator(
              "[contenteditable='true'] a[href='https://example.com/paste']",
            )
            .count()) > 0,
        `${locale}: safe HTML paste did not preserve the closed mark grammar.`,
      );

      await editor.click();
      await pastePayload(page, {
        html: '<img src="https://evil.invalid/remote.png" onerror="fetch(1)"><script>fetch("https://evil.invalid/script")</script><p>safe</p>',
        plain: CYRILLIC[locale],
      });
      await page.evaluate(
        async (text) => window.__ove317LexicalJournalFixture?.insertVoice(text),
        CYRILLIC[locale],
      );
      const finalSnapshot = await page.evaluate(async () => {
        return window.__ove317LexicalJournalFixture?.flush();
      });
      assert(finalSnapshot, `${locale}: fixture controller unavailable.`);
      assert(
        finalSnapshot.generation > 0,
        `${locale}: no semantic generation.`,
      );
      assert(
        forbiddenRequests.length === 0,
        `${locale}: hostile paste attempted external I/O.`,
      );
      assert(errors.length === 0, `${locale}: ${errors.join(" | ")}`);
      receipts.push({
        locale,
        generationClass: "advanced",
        hostilePasteNetworkEffects: 0,
        idClass: "preserved",
        adjacentListClass: "separate_ids_preserved",
        semanticDeleteClass: "native_tree_announced",
        quoteAttributionClass: "native_tree_preserved",
        semanticHashClass: finalSnapshot.semanticHash ? "present" : "missing",
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  printReceipt("structured", { locales: receipts });
}

async function reorderProof(baseUrl: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = collectPageErrors(page);
    await openFixture(page, baseUrl, "uk");
    const labels = getStructuredJournalComposerLabels("uk");
    const before = await snapshot(page);
    const firstHandle = page
      .locator("[data-lexical-reorder-action='handle']")
      .first();
    const box = await firstHandle.boundingBox();
    assert(
      box && box.width >= 44 && box.height >= 44,
      "Reorder target is below 44px.",
    );
    await firstHandle.focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      ({ id }) =>
        window.__ove317LexicalJournalFixture?.snapshot().blockIds[1] === id,
      { id: before.blockIds[0] },
    );
    assert(
      (await page.evaluate(() =>
        document.activeElement?.getAttribute("data-lexical-reorder-action"),
      )) === "handle",
      "Keyboard reorder did not restore visible handle focus.",
    );
    await page.getByLabel(labels.tools.undo).click();
    await page.waitForFunction(
      ({ id }) =>
        window.__ove317LexicalJournalFixture?.snapshot().blockIds[0] === id,
      { id: before.blockIds[0] },
    );
    await page.getByLabel(labels.tools.redo).click();

    const activeHandle = page
      .locator("[data-lexical-reorder-action='handle']")
      .first();
    const activeBox = await activeHandle.boundingBox();
    assert(activeBox, "Pointer handle has no geometry.");
    await activeHandle.focus();
    await page.mouse.move(activeBox.x + activeBox.width / 2, activeBox.y + 12);
    await page.mouse.down();
    await page.waitForFunction(
      () =>
        window.__ove317LexicalJournalFixture?.snapshot()
          .localeMutationInFlight === true,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        window.__ove317LexicalJournalFixture?.snapshot()
          .localeMutationInFlight === false,
    );

    const handles = page.locator("[data-lexical-reorder-action='handle']");
    const sourceBox = await handles.nth(0).boundingBox();
    const targetBox = await handles.nth(2).boundingBox();
    assert(sourceBox && targetBox, "Pointer reorder geometry unavailable.");
    await page.mouse.move(sourceBox.x + 20, sourceBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + 20, targetBox.y + targetBox.height, {
      steps: 5,
    });
    await page.mouse.up();
    await page.waitForTimeout(50);
    const announcement = await page
      .locator("[data-lexical-reorder-live-region='true']")
      .textContent();
    assert(Boolean(announcement?.trim()), "Pointer reorder was not announced.");
    assert(errors.length === 0, errors.join(" | "));
    await page.close();

    const dense = await browser.newPage();
    await openFixture(dense, baseUrl, "uk", true);
    const denseBefore = await snapshot(dense);
    assert(
      denseBefore.blockCount === 100,
      "Dense fixture must contain 100 blocks.",
    );
    assert(
      denseBefore.imageCount === 10,
      "Dense fixture must contain 10 images.",
    );
    await dense.evaluate(
      async ({ id }) => window.__ove317LexicalJournalFixture?.move(id, 1),
      { id: denseBefore.blockIds[0] },
    );
    const denseAfter = await snapshot(dense);
    assert(
      denseAfter.blockIds[1] === denseBefore.blockIds[0],
      "Dense move failed.",
    );
    assert(
      sameStringSet(denseBefore.blockIds, denseAfter.blockIds),
      "Dense move changed identity set.",
    );
    await dense.close();
    printReceipt("reorder", {
      blockCount: 100,
      imageCount: 10,
      historyClass: "single_transaction_restored",
      localeFenceClass: "blocked_then_released",
      pointerTargetClass: "44px_or_larger",
    });
  } finally {
    await browser.close();
  }
}

async function responsivenessProof(baseUrl: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = collectPageErrors(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFixture(page, baseUrl, "uk", true);
    const editor = page.locator("[contenteditable='true']");
    await editor.locator("p").last().click();
    const latencies: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const before = await snapshot(page);
      const latency = await page.evaluate(async (text) => {
        const startedAt = performance.now();
        document.execCommand("insertText", false, text);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        return performance.now() - startedAt;
      }, String(index));
      await waitForGeneration(page, before.generation);
      latencies.push(latency);
    }
    const maxLatency = Math.max(...latencies);
    assert(
      maxLatency <= 34,
      `journal_composer_mutation_latency ${maxLatency.toFixed(2)}ms exceeds 34ms.`,
    );

    const beforeWait = await snapshot(page);
    const waitSafe = await page.evaluate(() => {
      window.__ove317LexicalJournalFixture?.startLostComposition();
      const startedAt = performance.now();
      document
        .querySelector<HTMLButtonElement>("[data-lexical-fixture-save='true']")
        ?.click();
      document
        .querySelector<HTMLButtonElement>(
          "[data-lexical-fixture-cancel='true']",
        )
        ?.click();
      return performance.now() - startedAt;
    });
    await page.waitForFunction(
      ({ count }) =>
        window.__ove317LexicalJournalFixture?.snapshot().cancelCount ===
        count + 1,
      { count: beforeWait.cancelCount },
    );
    assert(
      waitSafe <= 34,
      "Wait-safe controls were not immediately responsive.",
    );
    await page.waitForFunction(
      () => window.__ove317LexicalJournalFixture?.snapshot().savedHash !== null,
      undefined,
      { timeout: 3_000 },
    );
    await page.evaluate(() =>
      window.__ove317LexicalJournalFixture?.endComposition(),
    );

    const beforeUnmount = await snapshot(page);
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array([1])], "slow-local.png", {
          type: "image/png",
        }),
      );
      document
        .querySelector<HTMLElement>("[contenteditable='true']")
        ?.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
          }),
        );
      window.__ove317LexicalJournalFixture?.unmountComposer();
    });
    await page.waitForTimeout(200);
    const afterUnmount = await snapshot(page);
    assert(
      afterUnmount.generation === beforeUnmount.generation &&
        afterUnmount.imageCount === beforeUnmount.imageCount,
      "Unmount allowed a late canonical media generation.",
    );
    assert(errors.length === 0, errors.join(" | "));
    printReceipt("responsiveness", {
      journal_composer_mutation_latency: Number(maxLatency.toFixed(2)),
      thresholdMilliseconds: 34,
      waitDeadlineMilliseconds: 1500,
      waitReceipt: "recovery",
      waitSafeControlLatency: Number(waitSafe.toFixed(2)),
      teardownClass: "zero_late_canonical_write",
    });
  } finally {
    await browser.close();
  }
}

async function mediaProof(baseUrl: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = collectPageErrors(page);
    const remoteRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("evil.invalid"))
        remoteRequests.push(request.url());
    });
    await openFixture(page, baseUrl, "uk");
    await page.locator("[contenteditable='true']").click();
    await pasteLocalImage(page, "local.png");
    await page.waitForFunction(
      () => window.__ove317LexicalJournalFixture?.snapshot().imageCount === 1,
    );
    let receipt = await snapshot(page);
    assert(receipt.objectUrlCount === 1, "Local preview URL was not owned.");
    const previewSource = await page
      .locator("[data-lexical-journal-image-content] img")
      .getAttribute("src");
    assert(
      previewSource?.startsWith("blob:"),
      "Preview URL leaked into node state or was absent.",
    );
    await page.getByRole("button", { name: "Прибрати фото" }).click();
    await page.waitForFunction(
      () => window.__ove317LexicalJournalFixture?.snapshot().imageCount === 0,
    );
    receipt = await snapshot(page);
    assert(receipt.objectUrlCount === 0, "Removed preview URL remained owned.");

    await pasteLocalImagesConcurrently(page, 11, "slow-concurrent");
    await page.waitForFunction(
      () => window.__ove317LexicalJournalFixture?.snapshot().imageCount === 10,
    );
    const concurrent = await snapshot(page);
    assert(
      concurrent.imageCount === 10 && concurrent.objectUrlCount === 10,
      "Concurrent media admission did not produce exactly ten owned images.",
    );
    const removeButtons = page.getByRole("button", { name: "Прибрати фото" });
    while ((await removeButtons.count()) > 0) {
      await removeButtons.first().click();
    }
    await page.waitForFunction(
      () =>
        window.__ove317LexicalJournalFixture?.snapshot().objectUrlCount === 0,
    );

    await pastePayload(page, {
      html: '<img src="https://evil.invalid/remote.png"><svg onload="fetch(1)"></svg>',
      plain: "",
    });
    await page.waitForTimeout(50);
    assert(remoteRequests.length === 0, "Remote paste caused network I/O.");
    assert(errors.length === 0, errors.join(" | "));
    await page.close();

    const dense = await browser.newPage();
    await openFixture(dense, baseUrl, "uk", true);
    await dense.locator("[contenteditable='true'] p").last().click();
    const before = await snapshot(dense);
    await pasteLocalImage(dense, "eleventh.png");
    await dense.waitForTimeout(100);
    const after = await snapshot(dense);
    assert(
      after.imageCount === 10,
      `Eleventh image changed the canonical count (${before.imageCount} -> ${after.imageCount}).`,
    );
    assert(
      after.blockCount === before.blockCount,
      "Rejected image changed block count.",
    );
    printReceipt("media", {
      maxInlineMediaItems: 10,
      eleventhResult: "rejected",
      objectUrlResidueAfterRemove: 0,
      remotePasteNetworkEffects: 0,
      identityClass: "durable_media_id_only",
    });
  } finally {
    await browser.close();
  }
}

async function browserMatrixProof(baseUrl: string) {
  const receipts: Array<Record<string, unknown>> = [];
  for (const browserName of Object.keys(BROWSERS) as BrowserName[]) {
    const browser = await BROWSERS[browserName].launch({ headless: true });
    try {
      for (const locale of ["uk", "bg", "ru"] as const) {
        const context = await browser.newContext({
          hasTouch: true,
          viewport: { width: 390, height: 844 },
        });
        const page = await context.newPage();
        receipts.push(
          await runMatrixScenario({
            page,
            baseUrl,
            locale,
            evidenceClass: `${browserName}_engine_mobile_viewport`,
            extended: false,
          }),
        );
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }

  for (const mobileProfile of [
    {
      evidenceClass: "playwright_webkit_iphone_profile",
      browserType: webkit,
      descriptor: devices["iPhone 17 Pro"],
    },
    {
      evidenceClass: "playwright_chromium_pixel_profile",
      browserType: chromium,
      descriptor: devices["Pixel 10"],
    },
  ] as const) {
    const browser = await mobileProfile.browserType.launch({ headless: true });
    try {
      for (const locale of ["uk", "bg", "ru"] as const) {
        const context = await browser.newContext({
          ...mobileProfile.descriptor,
        });
        const page = await context.newPage();
        receipts.push(
          await runMatrixScenario({
            page,
            baseUrl,
            locale,
            evidenceClass: mobileProfile.evidenceClass,
            extended: true,
          }),
        );
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }

  const automatedOnly = process.argv.includes("--automated-only");
  const authorizationPath =
    argValue("--device-equivalent-authorization") ??
    process.env.OVE317_DEVICE_EQUIVALENT_AUTHORIZATION?.trim();
  if (!authorizationPath && !automatedOnly) {
    throw new Error(
      "Maintainer device-equivalent authorization is required. Supply --device-equivalent-authorization or OVE317_DEVICE_EQUIVALENT_AUTHORIZATION; use --automated-only only for non-acceptance iteration.",
    );
  }
  const authorization = authorizationPath
    ? readAndValidateDeviceEquivalentAuthorization(authorizationPath)
    : null;
  let androidEmulatorEvidence: Record<string, unknown> | null = null;
  if (!automatedOnly) {
    const androidCdpUrl =
      argValue("--android-cdp-url") ??
      process.env.OVE317_ANDROID_CDP_URL?.trim();
    const adbPath =
      argValue("--adb-path") ?? process.env.OVE317_ADB_PATH?.trim();
    if (!androidCdpUrl || !adbPath) {
      throw new Error(
        "Acceptance evidence requires --android-cdp-url and --adb-path for the TalkBack-enabled Android Emulator.",
      );
    }
    const android = await runAndroidEmulatorMatrix({
      baseUrl,
      cdpUrl: androidCdpUrl,
      adbPath,
    });
    receipts.push(...android.receipts);
    androidEmulatorEvidence = android.runtime;
  }
  printReceipt("matrix", {
    browserLocalePairs: receipts.length,
    deviceEquivalentEvidence: authorization
      ? {
          class: "maintainer_authorized_device_equivalent",
          authorizationSha256: authorization.sha256,
          authorizedDate: authorization.authorizedDate,
          evidenceClasses: authorization.evidenceClasses,
          acceptedResidualRisks: authorization.acceptedResidualRisks,
          iosRuntimeClass: "playwright_webkit_iphone_profile_no_voiceover",
          androidRuntime: androidEmulatorEvidence,
        }
      : "outstanding_automated_only",
    receipts,
  });
}

interface MatrixScenarioOptions {
  page: Page;
  baseUrl: string;
  locale: InterfaceLocale;
  evidenceClass: string;
  extended: boolean;
  verifyAccessibility?: () => Promise<Record<string, unknown>>;
  dispatchTouch?: (x: number, y: number) => Promise<void>;
  pasteClipboard?: (text: string) => Promise<void>;
  clipboard?: boolean;
  clipboardEvidenceClass?: string;
}

async function runMatrixScenario(
  options: MatrixScenarioOptions,
): Promise<Record<string, unknown>> {
  try {
    return await runMatrixScenarioUnchecked(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown failure";
    throw new Error(`${options.evidenceClass}/${options.locale}: ${message}`, {
      cause: error,
    });
  }
}

async function runMatrixScenarioUnchecked({
  page,
  baseUrl,
  locale,
  evidenceClass,
  extended,
  verifyAccessibility,
  dispatchTouch,
  pasteClipboard,
  clipboard = extended,
  clipboardEvidenceClass = "browser_clipboard_shortcut_preserved",
}: MatrixScenarioOptions): Promise<Record<string, unknown>> {
  const errors = collectPageErrors(page);
  await page.emulateMedia({
    forcedColors: "active",
    reducedMotion: "reduce",
  });
  await openFixture(page, baseUrl, locale);
  await page.bringToFront();
  const labels = getStructuredJournalComposerLabels(locale);
  const toolbar = page.getByRole("toolbar", {
    name: labels.tools.toolbar,
  });
  assert(
    (await toolbar.count()) === 1,
    `${evidenceClass}/${locale}: toolbar label missing.`,
  );
  const editor = page.getByRole("textbox", { name: labels.tools.editor });
  await editor.click();
  const editorBox = await editor.boundingBox();
  assert(editorBox, `${evidenceClass}/${locale}: editor geometry missing.`);
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      "[contenteditable='true']",
    );
    if (!target) throw new Error("Editor missing for touch proof.");
    target.dataset.ove317TouchObserved = "false";
    target.addEventListener(
      "touchstart",
      () => {
        target.dataset.ove317TouchObserved = "true";
      },
      { once: true },
    );
  });
  const touchX = editorBox.x + Math.min(24, editorBox.width / 2);
  const touchY = editorBox.y + Math.min(24, editorBox.height / 2);
  if (dispatchTouch) {
    await dispatchTouch(touchX, touchY);
  } else {
    await page.touchscreen.tap(touchX, touchY);
  }
  assert(
    (await editor.getAttribute("data-ove317-touch-observed")) === "true",
    `${evidenceClass}/${locale}: touch event did not reach the editor.`,
  );

  if (extended && clipboard) {
    await editor.locator("p").last().click();
    if (
      evidenceClass.includes("chromium") ||
      evidenceClass.includes("android_emulator")
    ) {
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"], {
          origin: new URL(baseUrl).origin,
        });
    }
    const beforePaste = await snapshot(page);
    if (pasteClipboard) {
      await pasteClipboard(CYRILLIC[locale]);
    } else {
      await pasteTextThroughBrowserClipboard(
        page,
        CYRILLIC[locale],
        "ControlOrMeta+V",
      );
    }
    await evidenceStep("clipboard generation", () =>
      waitForGeneration(page, beforePaste.generation),
    );
  }

  const beforeIme = await snapshot(page);
  await page.evaluate(() =>
    document
      .querySelector<HTMLElement>("[contenteditable='true']")
      ?.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      ),
  );
  await page.keyboard.type(CYRILLIC[locale]);
  await page.evaluate(() =>
    document
      .querySelector<HTMLElement>("[contenteditable='true']")
      ?.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true }),
      ),
  );
  await evidenceStep("IME generation", () =>
    waitForGeneration(page, beforeIme.generation),
  );

  if (extended) {
    await selectFirstTextBlock(page);
    await page.getByLabel(labels.tools.heading2).click();
    await evidenceStep("toolbar type transform", () =>
      waitForType(page, "heading"),
    );
    await page.getByLabel(labels.tools.undo).click();
    await page.getByLabel(labels.tools.redo).click();
  }

  await editor.press("Tab");
  const escaped = await page.evaluate(
    () => document.activeElement?.getAttribute("contenteditable") !== "true",
  );
  assert(
    escaped,
    `${evidenceClass}/${locale}: Tab remained trapped in editor.`,
  );
  const handle = page.locator("[data-lexical-reorder-action='handle']").first();
  const handleBox = await handle.boundingBox();
  assert(
    handleBox && handleBox.width >= 44 && handleBox.height >= 44,
    `${evidenceClass}/${locale}: touch target below 44px.`,
  );
  const beforeReorder = await snapshot(page);
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await evidenceStep("keyboard reorder", () =>
    page.waitForFunction(
      ({ id }) =>
        window.__ove317LexicalJournalFixture?.snapshot().blockIds[1] === id,
      { id: beforeReorder.blockIds[0] },
    ),
  );
  await page.keyboard.press("Escape");
  assert(
    (await page
      .locator("[data-lexical-reorder-action='handle']")
      .first()
      .getAttribute("aria-grabbed")) !== "true",
    `${evidenceClass}/${locale}: Escape left reorder active.`,
  );

  let extendedEvidence: Record<string, unknown> = {};
  if (extended) {
    await editor.focus();
    await selectFirstTextBlock(page);
    const selectedLength = await page.evaluate(
      () => window.getSelection()?.toString().length ?? 0,
    );
    assert(
      selectedLength > 0,
      `${evidenceClass}/${locale}: selection was not retained.`,
    );

    const beforeVoice = await snapshot(page);
    await page.evaluate(
      async (text) => window.__ove317LexicalJournalFixture?.insertVoice(text),
      CYRILLIC[locale].trim(),
    );
    await evidenceStep("voice transcript generation", () =>
      waitForGeneration(page, beforeVoice.generation),
    );

    const accessibilityEvidence = verifyAccessibility
      ? await verifyAccessibility()
      : {
          accessibilityClass: "localized_dom_roles_and_names",
        };
    await openFixture(page, baseUrl, locale, true);
    const dense = await snapshot(page);
    assert(
      dense.blockCount === 100 && dense.imageCount === 10,
      `${evidenceClass}/${locale}: dense 100/10 fixture failed.`,
    );
    await page.evaluate(() =>
      window.__ove317LexicalJournalFixture?.unmountComposer(),
    );
    await page.waitForSelector("[data-lexical-fixture-unmounted='true']");
    await page.waitForTimeout(100);
    extendedEvidence = {
      selectionClass: "retained",
      clipboardClass: clipboard
        ? clipboardEvidenceClass
        : "covered_by_android_uk_and_profile_matrix",
      voiceInputClass: "transcript_pipeline_injected",
      historyClass: "undo_redo_preserved",
      denseClass: "100_blocks_10_images",
      teardownClass: "composer_unmounted_without_error",
      ...accessibilityEvidence,
    };
  }

  assert(
    errors.length === 0,
    `${evidenceClass}/${locale}: ${errors.join(" | ")}`,
  );
  return {
    evidenceClass,
    locale,
    imeClass: "composition_preserved",
    focusClass: "tab_and_escape_escapable",
    forcedColors: "active",
    reducedMotion: "reduce",
    touchClass: "event_observed",
    touchTargetClass: "44px_or_larger",
    ...extendedEvidence,
  };
}

async function runAndroidEmulatorMatrix({
  baseUrl,
  cdpUrl,
  adbPath,
}: {
  baseUrl: string;
  cdpUrl: string;
  adbPath: string;
}): Promise<{
  receipts: Array<Record<string, unknown>>;
  runtime: Record<string, unknown>;
}> {
  const talkBackComponent =
    "com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService";
  assert(
    runAdb(adbPath, ["get-state"]) === "device",
    "Android Emulator is not connected.",
  );
  assert(
    runAdb(adbPath, ["shell", "getprop", "ro.kernel.qemu"]) === "1",
    "Android acceptance evidence must run on an emulator.",
  );
  runAdb(adbPath, [
    "shell",
    "pm",
    "grant",
    "com.google.android.marvin.talkback",
    "android.permission.POST_NOTIFICATIONS",
  ]);
  runAdb(adbPath, [
    "shell",
    "settings",
    "put",
    "secure",
    "enabled_accessibility_services",
    talkBackComponent,
  ]);
  runAdb(adbPath, [
    "shell",
    "settings",
    "put",
    "secure",
    "accessibility_enabled",
    "1",
  ]);
  const enabledServices = runAdb(adbPath, [
    "shell",
    "settings",
    "get",
    "secure",
    "enabled_accessibility_services",
  ]);
  const accessibilityDump = runAdb(adbPath, [
    "shell",
    "dumpsys",
    "accessibility",
  ]);
  assert(
    enabledServices.includes(talkBackComponent) &&
      accessibilityDump.includes("Service[label=TalkBack") &&
      accessibilityDump.includes("Bound services"),
    "TalkBack is not enabled and bound on the Android Emulator.",
  );

  const fixtureUrl = new URL(baseUrl);
  fixtureUrl.hostname = "127.0.0.1";
  const fixturePort = fixtureUrl.port || "80";
  const cdp = new URL(cdpUrl);
  assert(cdp.port, "Android CDP URL must include an explicit host port.");
  runAdb(adbPath, ["reverse", `tcp:${fixturePort}`, `tcp:${fixturePort}`]);
  runAdb(adbPath, [
    "forward",
    `tcp:${cdp.port}`,
    "localabstract:chrome_devtools_remote",
  ]);
  const initialUrl = new URL(
    "/__visual-fixtures/lexical-journal?locale=uk",
    fixtureUrl,
  );
  runAdb(adbPath, [
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    initialUrl.toString(),
    "com.android.chrome",
  ]);
  await new Promise((resolve) => setTimeout(resolve, 1_500));

  const browser = await chromium.connectOverCDP(cdp.toString());
  const context = browser.contexts()[0];
  assert(context, "Android Chrome CDP context is unavailable.");
  const page =
    context
      .pages()
      .filter((candidate) => candidate.url().includes(`:${fixturePort}/`))
      .at(-1) ?? context.pages().at(-1);
  assert(page, "Android Chrome fixture page is unavailable.");
  await page.waitForSelector(
    "[data-editor-engine='lexical'][data-status='ready']",
    {
      timeout: 20_000,
    },
  );
  await page.bringToFront();
  const uiAutomatorEvidence = verifyAndroidUiAutomatorBridge({
    adbPath,
    locale: "uk",
  });
  const receipts: Array<Record<string, unknown>> = [];
  try {
    for (const locale of ["uk", "bg", "ru"] as const) {
      receipts.push(
        await runMatrixScenario({
          page,
          baseUrl: fixtureUrl.toString(),
          locale,
          evidenceClass: "android_emulator_chrome_talkback_ax_tree",
          extended: true,
          clipboard: locale === "uk",
          clipboardEvidenceClass: "android_system_keycode_paste_preserved",
          dispatchTouch: (x, y) =>
            dispatchAndroidChromeTouch({ context, page, x, y }),
          pasteClipboard: async (text) => {
            await page.bringToFront();
            await page.locator("[contenteditable='true']").focus();
            const clipboardRoundTrip = await page.evaluate(
              async (clipboardText) => {
                await navigator.clipboard.writeText(clipboardText);
                return navigator.clipboard.readText();
              },
              text,
            );
            assert(
              clipboardRoundTrip === text,
              "Android Chrome clipboard round-trip did not preserve Cyrillic text.",
            );
            runAdb(adbPath, ["shell", "input", "keyevent", "279"]);
          },
          verifyAccessibility: () =>
            verifyAndroidCdpAccessibilityTree({
              context,
              page,
              locale,
            }),
        }),
      );
    }
  } finally {
    await browser.close();
  }

  const packageDump = runAdb(adbPath, [
    "shell",
    "dumpsys",
    "package",
    "com.android.chrome",
  ]);
  const chromeVersion = packageDump.match(/versionName=([^\s]+)/)?.[1];
  assert(chromeVersion, "Android Chrome version is unavailable.");
  return {
    receipts,
    runtime: {
      physical: false,
      emulator: true,
      osVersion: runAdb(adbPath, [
        "shell",
        "getprop",
        "ro.build.version.release",
      ]),
      apiLevel: Number(
        runAdb(adbPath, ["shell", "getprop", "ro.build.version.sdk"]),
      ),
      browser: "chrome",
      browserVersion: chromeVersion,
      screenReader: "talkback_bound",
      accessibilityBridge: "cdp_ax_tree_plus_uiautomator",
      ...uiAutomatorEvidence,
    },
  };
}

async function dispatchAndroidChromeTouch({
  context,
  page,
  x,
  y,
}: {
  context: BrowserContext;
  page: Page;
  x: number;
  y: number;
}): Promise<void> {
  const session = await context.newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

async function verifyAndroidCdpAccessibilityTree({
  context,
  page,
  locale,
}: {
  context: BrowserContext;
  page: Page;
  locale: InterfaceLocale;
}): Promise<Record<string, unknown>> {
  const labels = getStructuredJournalComposerLabels(locale);
  const session = await context.newCDPSession(page);
  const tree = (await session.send("Accessibility.getFullAXTree")) as {
    nodes: Array<{
      role?: { value?: string };
      name?: { value?: string };
    }>;
  };
  await session.detach();
  const hasRoleAndName = (role: string, name: string) =>
    tree.nodes.some(
      (node) => node.role?.value === role && node.name?.value === name,
    );
  assert(
    hasRoleAndName("toolbar", labels.tools.toolbar) &&
      hasRoleAndName("textbox", labels.tools.editor) &&
      hasRoleAndName("button", labels.tools.heading2),
    `android_emulator_chrome_talkback_ax_tree/${locale}: localized CDP accessibility roles missing.`,
  );
  return {
    accessibilityClass: "talkback_bound_localized_cdp_ax_tree",
    cdpAxNodeCountClass: tree.nodes.length > 0 ? "non_empty" : "empty",
  };
}

function verifyAndroidUiAutomatorBridge({
  adbPath,
  locale,
}: {
  adbPath: string;
  locale: InterfaceLocale;
}): Record<string, unknown> {
  const labels = getStructuredJournalComposerLabels(locale);
  const dumpPath = "/sdcard/ove317-lexical-accessibility.xml";
  runAdb(adbPath, ["shell", "uiautomator", "dump", dumpPath]);
  let uiTree = "";
  try {
    uiTree = runAdb(adbPath, ["shell", "cat", dumpPath]);
  } finally {
    runAdb(adbPath, ["shell", "rm", dumpPath]);
  }
  assert(
    uiTree.includes(`text="${labels.tools.toolbar}"`) &&
      uiTree.includes(`text="${labels.tools.heading2}"`),
    "Android UIAutomator accessibility bridge omitted localized controls.",
  );
  return {
    uiAutomatorLocale: locale,
    uiAutomatorLocalizedControls: 2,
  };
}

function runAdb(adbPath: string, args: string[]): string {
  return execFileSync(adbPath, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function evidenceStep<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown failure";
    throw new Error(`${label}: ${message}`, { cause: error });
  }
}

async function openFixture(
  page: Page,
  baseUrl: string,
  locale: InterfaceLocale,
  dense = false,
) {
  const url = new URL("/__visual-fixtures/lexical-journal", baseUrl);
  url.searchParams.set("locale", locale);
  if (dense) url.searchParams.set("density", "100");
  const response = await page.goto(url.toString(), {
    waitUntil: "domcontentloaded",
  });
  assert(
    response?.ok(),
    `Fixture returned ${response?.status() ?? "no response"}.`,
  );
  await page.waitForSelector(
    "[data-editor-engine='lexical'][data-status='ready']",
    {
      timeout: 20_000,
    },
  );
  await page.waitForFunction(() =>
    Boolean(window.__ove317LexicalJournalFixture),
  );
}

async function snapshot(page: Page): Promise<LexicalJournalFixtureSnapshot> {
  const value = await page.evaluate(() =>
    window.__ove317LexicalJournalFixture?.snapshot(),
  );
  assert(value, "Lexical journal fixture snapshot is unavailable.");
  return value;
}

async function waitForGeneration(page: Page, previous: number) {
  await page.waitForFunction(
    ({ previousGeneration }) =>
      (window.__ove317LexicalJournalFixture?.snapshot().generation ?? 0) >
      previousGeneration,
    { previousGeneration: previous },
  );
}

async function waitForType(page: Page, type: string) {
  await page.waitForFunction(
    ({ expected }) =>
      window.__ove317LexicalJournalFixture?.snapshot().types.includes(expected),
    { expected: type },
  );
}

async function pastePayload(
  page: Page,
  payload: { html: string; plain: string },
) {
  await page.evaluate(({ html, plain }) => {
    const transfer = new DataTransfer();
    if (html) transfer.setData("text/html", html);
    if (plain) transfer.setData("text/plain", plain);
    document
      .querySelector<HTMLElement>("[contenteditable='true']")
      ?.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }),
      );
  }, payload);
}

async function pasteTextThroughBrowserClipboard(
  page: Page,
  text: string,
  shortcut: string,
) {
  await page.evaluate(
    async (clipboardText) => navigator.clipboard.writeText(clipboardText),
    text,
  );
  await page.keyboard.press(shortcut);
}

async function pasteLocalImage(page: Page, fileName: string) {
  await page.evaluate((name) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" }),
    );
    document
      .querySelector<HTMLElement>("[contenteditable='true']")
      ?.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }),
      );
  }, fileName);
}

async function pasteLocalImagesConcurrently(
  page: Page,
  count: number,
  prefix: string,
) {
  await page.evaluate(
    ({ imageCount, filePrefix }) => {
      const editor = document.querySelector<HTMLElement>(
        "[contenteditable='true']",
      );
      if (!editor) throw new Error("Synthetic editor is missing.");
      for (let index = 0; index < imageCount; index += 1) {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array([1, 2, 3])], `${filePrefix}-${index}.png`, {
            type: "image/png",
          }),
        );
        editor.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
          }),
        );
      }
    },
    { imageCount: count, filePrefix: prefix },
  );
}

async function selectFirstTextBlock(page: Page) {
  await selectTextBlock(page, 0);
}

async function selectTextBlock(page: Page, index: number) {
  await page.evaluate((textBlockIndex) => {
    const nodes = document.querySelectorAll<HTMLElement>(
      "[contenteditable='true'] p, [contenteditable='true'] h2, [contenteditable='true'] h3",
    );
    const node = nodes.item(textBlockIndex);
    if (!node) throw new Error("Synthetic text block is missing.");
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  }, index);
  await page.waitForTimeout(0);
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push("console_error");
  });
  return errors;
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function printReceipt(profile: Profile, evidence: Record<string, unknown>) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        issue: "OVE-317",
        profile,
        engine: "lexical@0.49.0",
        ...evidence,
      },
      null,
      2,
    ),
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function withFixtureServer(
  operation: (baseUrl: string) => Promise<void>,
) {
  const supplied = argValue("--base-url");
  if (supplied) {
    await operation(new URL(supplied).toString());
    return;
  }

  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    "pnpm",
    ["exec", "next", "dev", "--hostname", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BETTER_AUTH_URL: baseUrl,
        DATABASE_URL:
          "postgresql://overgarden:overgarden@127.0.0.1:5432/overgarden",
        PUBLIC_SITE_URL: baseUrl,
        R2_ENDPOINT: "http://127.0.0.1:9000",
        R2_PUBLIC_BASE_URL: "http://127.0.0.1:9000",
        VISUAL_FIXTURES_DATABASE: "overgarden",
        VISUAL_FIXTURES_ENABLED: "true",
        VISUAL_FIXTURES_TARGET: "local",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout?.on("data", (chunk) => {
    log = `${log}${String(chunk)}`.slice(-8_000);
  });
  child.stderr?.on("data", (chunk) => {
    log = `${log}${String(chunk)}`.slice(-8_000);
  });
  try {
    await waitForServer(baseUrl, child, () => log);
    await operation(baseUrl);
  } finally {
    await stopChild(child);
  }
}

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function availablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(
  baseUrl: string,
  child: ChildProcess,
  readLog: () => string,
) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Fixture server exited early.\n${readLog()}`);
    }
    try {
      const response = await fetch(
        new URL("/__visual-fixtures/lexical-journal", baseUrl),
      );
      if (response.ok) return;
    } catch {
      // Bounded startup polling only.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Fixture server did not become ready.\n${readLog()}`);
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
