import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

const mocks = vi.hoisted(() => ({
  requestSignOut: vi.fn(),
  beforeRequest: vi.fn(),
  phase: "idle" as "idle" | "awaiting-confirmation" | "committed",
}));

vi.mock("./sign-out-provider", () => ({
  useSignOut: () => ({
    copy: getTrustSurfaceCopy("uk").signOut,
    phase: mocks.phase,
    requestSignOut: mocks.requestSignOut,
  }),
}));

describe("shared sign-out control", () => {
  beforeEach(() => {
    mocks.phase = "idle";
    vi.clearAllMocks();
  });

  it("renders a localized full-width profile action without identity data", async () => {
    const { SignOutControl } = await import("./sign-out-control");
    const html = renderToStaticMarkup(
      <SignOutControl presentation="profile" />,
    );

    expect(html).toContain('data-sign-out-control="profile"');
    expect(html).toContain('data-sign-out-phase="idle"');
    expect(html).toContain("Вийти з облікового запису");
    expect(html).toContain("w-full");
    expect(html).not.toMatch(/user[-_ ]?id|session[-_ ]?id|email|token/i);
  });

  it("never renders post-confirm progress or recovery state", async () => {
    mocks.phase = "committed";
    const { SignOutControl } = await import("./sign-out-control");
    const html = renderToStaticMarkup(<SignOutControl />);

    expect(html).toContain("Вийти з облікового запису");
    expect(html).not.toContain('aria-busy="true"');
    expect(html).not.toContain(" disabled=");
    expect(html).not.toMatch(/Перевіряємо|Завершуємо|помилка|повтор/i);
  });

  it("keeps the initiating control available while the confirmation owns the decision", async () => {
    mocks.phase = "awaiting-confirmation";
    const { SignOutControl } = await import("./sign-out-control");
    const html = renderToStaticMarkup(<SignOutControl />);

    expect(html).toContain('data-sign-out-phase="awaiting-confirmation"');
    expect(html).not.toContain('aria-busy="true"');
    expect(html).not.toContain(" disabled=");
  });

  it("commits the retain-only local exit synchronously before navigation and background reconciliation", async () => {
    const source = await readSource("sign-out-provider.tsx");
    const marker = source.indexOf(
      "const committed = commitLocalExitInvalidationMarker();",
    );
    const seal = source.indexOf("sealActiveOwnerVaultsForLocalExit();", marker);
    const publish = source.indexOf("publishLocalExitCommitted(", seal);
    const flush = source.indexOf("flushSync(() => setPhase", publish);
    const replace = source.indexOf("window.location.replace(", flush);
    const reconcile = source.indexOf(
      "dispatchLocalExitReconciliation(",
      replace,
    );

    expect(marker).toBeGreaterThan(-1);
    expect(marker).toBeLessThan(seal);
    expect(seal).toBeLessThan(publish);
    expect(publish).toBeLessThan(flush);
    expect(flush).toBeLessThan(replace);
    expect(replace).toBeLessThan(reconcile);
    expect(source).not.toContain("pauseOwnerOfflineActivity");
    expect(source).not.toContain("waitForSyncDrain");
    expect(source).not.toContain("awaitRemotePreparation");
    expect(source).not.toContain("await inspectOwnerWork");
    expect(source).not.toContain("summarizeUnsyncedOwnerData");
    expect(source).not.toContain("purgeUnsyncedOwnerData");
    expect(source).not.toMatch(
      /copy\.(staySignedIn|syncFirst|discardAndSignOut|dialogTitle)/,
    );
    expect(source).not.toMatch(
      /localStorage\.clear|indexedDB\.deleteDatabase|caches\.delete/,
    );
  });

  it("closes a parent account surface before requesting the shared dialog", async () => {
    const source = await readSource("sign-out-control.tsx");

    expect(source.indexOf("onBeforeRequest?.();")).toBeLessThan(
      source.indexOf("requestSignOut();"),
    );
  });
});

async function readSource(filename: string) {
  return readFile(
    fileURLToPath(new URL(`./${filename}`, import.meta.url)),
    "utf8",
  );
}
