import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  environment: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/visual-fixtures/environment", () => ({
  tryResolveVisualFixtureEnvironment: mocks.environment,
}));
vi.mock(
  "@/app/%5F%5Fvisual-fixtures/account-sign-out/account-sign-out-visual-fixture",
  () => ({
    AccountSignOutVisualFixture: ({ locale }: { locale: string }) => (
      <main data-account-sign-out-fixture={locale} />
    ),
  }),
);

describe("account sign-out visual fixture route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.environment.mockReturnValue({ target: "local" });
  });

  it("renders the requested supported locale only in the fixture environment", async () => {
    const { default: Page } = await import("./page");
    const element = await Page({
      searchParams: Promise.resolve({ locale: "ru" }),
    });

    expect(renderToStaticMarkup(element)).toContain(
      'data-account-sign-out-fixture="ru"',
    );
  });

  it("hard-fails closed when visual fixtures are unavailable", async () => {
    mocks.environment.mockReturnValue(null);
    const { default: Page } = await import("./page");

    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
