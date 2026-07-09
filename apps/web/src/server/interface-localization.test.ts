import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  headers: mocks.headers,
}));

describe("request interface locale", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
    mocks.headers.mockResolvedValue(new Headers());
  });

  it("trusts the proxy-validated request locale before persisted and request fallbacks", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        "x-overgarden-interface-locale": "ru",
        "accept-language": "uk;q=1",
        "x-vercel-ip-country": "UA",
      }),
    );
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "bg" })),
    });
    const { resolveRequestInterfaceLocale } =
      await import("./interface-localization");

    await expect(resolveRequestInterfaceLocale()).resolves.toBe("ru");
  });

  it("falls back through a validated cookie and request language", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({ "accept-language": "ru;q=1" }),
    );
    mocks.cookies.mockResolvedValueOnce({
      get: vi.fn(() => ({ value: "bg" })),
    });
    const firstModule = await import("./interface-localization");

    await expect(firstModule.resolveRequestInterfaceLocale()).resolves.toBe(
      "bg",
    );

    vi.resetModules();
    mocks.cookies.mockResolvedValueOnce({
      get: vi.fn(() => ({ value: "en" })),
    });
    const secondModule = await import("./interface-localization");

    await expect(secondModule.resolveRequestInterfaceLocale()).resolves.toBe(
      "ru",
    );
  });
});
