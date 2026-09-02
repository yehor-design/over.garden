import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () =>
      new Headers({
        "accept-language": "uk;q=1",
        "x-vercel-ip-country": "UA",
      }),
  ),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: mocks.redirect,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

describe("root locale route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("honors a persisted locale resolved by the shared request contract", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    const { default: RootLocalePage } = await import("./page");

    await RootLocalePage();

    expect(mocks.redirect).toHaveBeenCalledWith("/ru");
  });
});
