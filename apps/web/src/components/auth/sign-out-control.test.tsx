import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

const mocks = vi.hoisted(() => ({
  requestSignOut: vi.fn(async () => undefined),
  beforeRequest: vi.fn(),
  phase: "idle" as
    | "idle"
    | "awaiting-confirmation"
    | "checking"
    | "waiting-for-choice"
    | "signing-out"
    | "error",
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

  it("exposes truthful pending labels and disables duplicate activation", async () => {
    mocks.phase = "checking";
    const { SignOutControl } = await import("./sign-out-control");
    const html = renderToStaticMarkup(<SignOutControl />);

    expect(html).toContain("Перевіряємо локальні зміни…");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  it("keeps the initiating control available while the confirmation owns the decision", async () => {
    mocks.phase = "awaiting-confirmation";
    const { SignOutControl } = await import("./sign-out-control");
    const html = renderToStaticMarkup(<SignOutControl />);

    expect(html).toContain('data-sign-out-phase="awaiting-confirmation"');
    expect(html).not.toContain('aria-busy="true"');
    expect(html).not.toContain(" disabled=");
  });

  it("keeps the offline guard ordered and the unsynced dialog bounded", async () => {
    const source = await readSource("sign-out-provider.tsx");
    const pause = source.indexOf(
      "const pauseHandle = await pauseOwnerOfflineActivity(ownerUserId",
    );
    const preparation = source.indexOf(
      "await awaitRemotePreparation(operationId, tabId)",
    );
    const drain = source.indexOf("await pauseHandle.waitForSyncDrain()");
    const summary = source.indexOf(
      "const summary = await summarizeUnsyncedOwnerData",
    );
    const purge = source.indexOf("await purgeUnsyncedOwnerData");
    const canonical = source.lastIndexOf("performCanonicalSignOut(true)");

    expect(pause).toBeGreaterThan(-1);
    expect(pause).toBeLessThan(drain);
    expect(drain).toBeLessThan(preparation);
    expect(preparation).toBeLessThan(summary);
    expect(summary).toBeLessThan(purge);
    expect(purge).toBeLessThan(canonical);
    expect(source.match(/copy\.staySignedIn/g)).toHaveLength(1);
    expect(source.match(/copy\.syncFirst/g)).toHaveLength(1);
    expect(source.match(/copy\.discardAndSignOut/g)).toHaveLength(1);
    expect(source.match(/copy\.reloadAndStaySignedIn/g)).toHaveLength(1);
    expect(source).toContain('window.location.assign("/garden#drafts")');
    expect(source).toContain("pauseHandle.finalizeForSignedOut()");
    expect(source).toContain("window.location.replace(window.location.href)");
    expect(source).not.toMatch(
      /localStorage\.clear|indexedDB\.deleteDatabase|caches\.delete/,
    );
  });

  it("closes a parent account surface before requesting the shared dialog", async () => {
    const source = await readSource("sign-out-control.tsx");

    expect(source.indexOf("onBeforeRequest?.();")).toBeLessThan(
      source.indexOf("void requestSignOut();"),
    );
  });
});

async function readSource(filename: string) {
  return readFile(
    fileURLToPath(new URL(`./${filename}`, import.meta.url)),
    "utf8",
  );
}
