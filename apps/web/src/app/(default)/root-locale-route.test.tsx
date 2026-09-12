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

  /**
   * The unprefixed route renders. The geography redirect that used to sit here
   * could not work — by the time it ran the shell had streamed, so the status
   * was already `200` and the location header had sailed — and ADR-0029 D10
   * settles it anyway: a canonical URL answers `200` to everyone.
   */
  it("renders the home page in the default locale whatever the reader's is", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    const { default: RootLocalePage } = await import("./page");

    const rendered = await RootLocalePage();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(rendered).toBeTruthy();
  });
});
