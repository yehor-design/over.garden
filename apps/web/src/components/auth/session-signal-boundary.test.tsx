import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionSignal } from "@/lib/auth/owner-scope-contract";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  announce: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as ((signal: SessionSignal) => void) | null,
  replace: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession: mocks.getSession },
}));
vi.mock("@/lib/auth/session-signal", () => ({
  announceSessionSignal: mocks.announce,
  subscribeSessionSignals: (listener: (signal: SessionSignal) => void) => {
    mocks.listener = listener;
    return mocks.unsubscribe;
  },
}));

import { SessionSignalBoundary } from "./session-signal-boundary";

function stubBrowser(options: { previousOwner?: string | null } = {}) {
  const storage = new Map<string, string>();
  if (options.previousOwner !== undefined) {
    storage.set("overgarden-session-owner", options.previousOwner ?? "");
  }
  const visibility: { handler: (() => void) | null; state: string } = {
    handler: null,
    state: "hidden",
  };
  vi.stubGlobal("window", {
    location: { replace: mocks.replace },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  vi.stubGlobal("document", {
    get visibilityState() {
      return visibility.state;
    },
    addEventListener: (type: string, handler: () => void) => {
      if (type === "visibilitychange") visibility.handler = handler;
    },
    removeEventListener: (type: string) => {
      if (type === "visibilitychange") visibility.handler = null;
    },
  });
  return { storage, visibility };
}

async function mount(locale: "uk" | "bg", ownerUserId: string | null) {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <SessionSignalBoundary locale={locale} ownerUserId={ownerUserId} />,
    );
  });
  return renderer!;
}

describe("session signal boundary (ADR-0022, D6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listener = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reloads to the localized home page when another tab announces a different account", async () => {
    stubBrowser();
    const renderer = await mount("bg", "owner-a");

    mocks.listener?.({
      type: "signed_in",
      ownerUserId: "owner-a",
      sourceTabId: "other",
    });
    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.listener?.({
      type: "signed_out",
      ownerUserId: null,
      sourceTabId: "other",
    });
    expect(mocks.replace).toHaveBeenCalledWith("/bg");

    await act(async () => renderer.unmount());
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("rechecks the live session when the tab becomes visible", async () => {
    const browser = stubBrowser();
    mocks.getSession.mockResolvedValueOnce({
      data: { user: { id: "owner-a" } },
    });
    const renderer = await mount("uk", "owner-a");

    browser.visibility.state = "visible";
    await act(async () => {
      browser.visibility.handler?.();
      await Promise.resolve();
    });
    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValueOnce({ data: null });
    await act(async () => {
      browser.visibility.handler?.();
      await Promise.resolve();
    });
    expect(mocks.replace).toHaveBeenCalledWith("/");

    await act(async () => renderer.unmount());
    expect(browser.visibility.handler).toBeNull();
  });

  it("announces an owner change it discovers on load, but not a first visit", async () => {
    stubBrowser({ previousOwner: null });
    const first = await mount("uk", "owner-a");
    expect(mocks.announce).toHaveBeenCalledWith({
      type: "signed_in",
      ownerUserId: "owner-a",
    });
    await act(async () => first.unmount());

    mocks.announce.mockClear();
    vi.unstubAllGlobals();
    stubBrowser();
    const fresh = await mount("uk", "owner-a");
    expect(mocks.announce).not.toHaveBeenCalled();
    await act(async () => fresh.unmount());
  });
});
