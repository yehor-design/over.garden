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
