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
    SessionRecheckVisualFixture: () => (
      <main data-session-recheck-private-fixture="true" />
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

    expect(renderToStaticMarkup(<Page />)).toContain(
      'data-session-recheck-private-fixture="true"',
    );
  });

  it("hard-fails closed when the visual-fixture environment is unavailable", async () => {
    mocks.environment.mockReturnValue(null);
    const { default: Page } = await import("./page");

    expect(() => renderToStaticMarkup(<Page />)).toThrow("NEXT_NOT_FOUND");
  });
});
