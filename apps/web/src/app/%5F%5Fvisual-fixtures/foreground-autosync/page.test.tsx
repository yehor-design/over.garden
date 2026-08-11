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
  "@/app/%5F%5Fvisual-fixtures/foreground-autosync/foreground-autosync-visual-fixture",
  () => ({
    ForegroundAutosyncVisualFixture: (props: { locale: string }) => (
      <main
        data-foreground-autosync-fixture="true"
        data-locale={props.locale}
      />
    ),
  }),
);

describe("foreground autosync visual fixture route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.environment.mockReturnValue({ target: "local" });
  });

  it("renders synthetic locale state only inside the visual-fixture gate", async () => {
    const { default: Page } = await import("./page");

    const element = await Page({
      searchParams: Promise.resolve({ locale: "bg" }),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-foreground-autosync-fixture="true"');
    expect(html).toContain('data-locale="bg"');
  });

  it("hard-fails closed when visual fixtures are unavailable", async () => {
    mocks.environment.mockReturnValue(null);
    const { default: Page } = await import("./page");

    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
