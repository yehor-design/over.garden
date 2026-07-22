import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ headers: vi.fn() }));

vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { INTERFACE_SERVER_ACTION_PENDING_VISUAL_FIXTURE_DELAY_MS } from "@/lib/localization/localization-visual-fixture";
import { holdInterfaceServerActionPendingVisualFixtureAction } from "./interface-server-action-pending-fixture-action";

const EXACT_FIXTURE_URL =
  "http://localhost:3000/garden?visualLocaleState=server-action-pending";

describe("Server Action pending localization fixture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubLocalVisualFixtureEnvironment();
    mocks.headers.mockResolvedValue(validRequestHeaders());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("holds a genuine loopback Next-Action for the bounded interval", async () => {
    vi.useFakeTimers();
    let settled = false;

    const action = holdInterfaceServerActionPendingVisualFixtureAction().then(
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(
      INTERFACE_SERVER_ACTION_PENDING_VISUAL_FIXTURE_DELAY_MS - 1,
    );
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await action;
    expect(settled).toBe(true);
    expect(mocks.headers).toHaveBeenCalledOnce();
  });

  it("rejects non-local or production fixture environments before reading request headers", async () => {
    vi.stubEnv("VISUAL_FIXTURES_TARGET", "preview");
    await expect(
      holdInterfaceServerActionPendingVisualFixtureAction(),
    ).rejects.toThrow("unavailable");
    expect(mocks.headers).not.toHaveBeenCalled();

    stubLocalVisualFixtureEnvironment();
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(
      holdInterfaceServerActionPendingVisualFixtureAction(),
    ).rejects.toThrow("unavailable");
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it.each([
    ["missing Next-Action", { "next-action": null }],
    ["additional query state", { referer: `${EXACT_FIXTURE_URL}&page=1` }],
    [
      "cross-origin referer",
      {
        referer:
          "http://127.0.0.1:3000/garden?visualLocaleState=server-action-pending",
      },
    ],
    ["non-loopback origin", { origin: "https://example.com" }],
  ])("rejects %s", async (_label, overrides) => {
    mocks.headers.mockResolvedValueOnce(validRequestHeaders(overrides));

    await expect(
      holdInterfaceServerActionPendingVisualFixtureAction(),
    ).rejects.toThrow("request was rejected");
  });
});

function stubLocalVisualFixtureEnvironment() {
  vi.stubEnv("VISUAL_FIXTURES_ENABLED", "true");
  vi.stubEnv("VISUAL_FIXTURES_TARGET", "local");
  vi.stubEnv("VISUAL_FIXTURES_DATABASE", "overgarden_visual");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:5432/overgarden_visual",
  );
  vi.stubEnv("R2_ENDPOINT", "http://127.0.0.1:9000");
  vi.stubEnv("R2_PUBLIC_BASE_URL", "http://127.0.0.1:9000/overgarden");
  vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("VERCEL_ENV", "development");
}

function validRequestHeaders(overrides: Record<string, string | null> = {}) {
  const values = new Headers({
    origin: "http://localhost:3000",
    referer: EXACT_FIXTURE_URL,
    "next-action": "opaque-action-reference",
  });
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) values.delete(name);
    else values.set(name, value);
  }
  return values;
}
