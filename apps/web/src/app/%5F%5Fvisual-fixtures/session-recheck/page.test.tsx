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
  "@/app/%5F%5Fvisual-fixtures/session-recheck/session-recheck-visual-fixture",
  () => ({
    SessionRecheckVisualFixture: (props: {
      initialRead: string;
      locale: string;
      recheckMode: string;
    }) => (
      <main
        data-session-recheck-private-fixture="true"
        data-initial-read={props.initialRead}
        data-locale={props.locale}
        data-recheck-mode={props.recheckMode}
      />
    ),
  }),
);

describe("session recheck visual fixture route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.environment.mockReturnValue({ target: "local" });
  });

  it("renders only inside the existing visual-fixture environment", async () => {
    const { default: Page } = await import("./page");

    const element = await Page({
      searchParams: Promise.resolve({
        initial: "stall",
        locale: "bg",
        mode: "compatibility",
      }),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-session-recheck-private-fixture="true"');
    expect(html).toContain('data-initial-read="stall"');
    expect(html).toContain('data-locale="bg"');
    expect(html).toContain('data-recheck-mode="compatibility_fenced"');
  });

  it("hard-fails closed when the visual-fixture environment is unavailable", async () => {
    mocks.environment.mockReturnValue(null);
    const { default: Page } = await import("./page");

    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
