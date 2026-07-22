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

  it("trusts proxy-validated market and locale context", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        "x-overgarden-interface-market": "bulgaria",
        "x-overgarden-interface-locale": "ru",
        "accept-language": "uk;q=1",
        "x-vercel-ip-country": "UA",
      }),
    );
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "bg" })),
    });
    const {
      resolveRequestInterfaceLocale,
      resolveRequestInterfaceLocalization,
    } = await import("./interface-localization");

    await expect(resolveRequestInterfaceLocale()).resolves.toBe("ru");
    await expect(resolveRequestInterfaceLocalization()).resolves.toMatchObject({
      market: "bulgaria",
      locale: "ru",
      marketSource: "explicit",
      localeSource: "explicit",
    });
  });

  it("uses a bounded market cookie only without a supported country", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "accept-language": "uk" }));
    mocks.cookies.mockResolvedValueOnce({
      get: vi.fn((name: string) =>
        name === "overgarden_interface_market"
          ? { value: "bulgaria" }
          : { value: "ru" },
      ),
    });
    const firstModule = await import("./interface-localization");

    await expect(firstModule.resolveRequestInterfaceLocale()).resolves.toBe(
      "ru",
    );
  });

  it("lets a supported country override stale persisted market and locale", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        "accept-language": "ru;q=1",
        "x-vercel-ip-country": "UA",
      }),
    );
    mocks.cookies.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === "overgarden_interface_market"
          ? { value: "bulgaria" }
          : { value: "ru" },
      ),
    });
    const { resolveRequestInterfaceLocalization } =
      await import("./interface-localization");

    await expect(resolveRequestInterfaceLocalization()).resolves.toMatchObject({
      market: "ukraine",
      locale: "uk",
      marketSource: "country",
      localeSource: "market-default",
    });
  });
});
