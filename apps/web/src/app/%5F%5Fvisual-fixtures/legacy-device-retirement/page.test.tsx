import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ environment: vi.fn(), notFound: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/visual-fixtures/environment", () => ({
  tryResolveVisualFixtureEnvironment: mocks.environment,
}));
vi.mock("./legacy-device-retirement-visual-fixture", () => ({
  LegacyDeviceRetirementVisualFixture: (props: Record<string, string>) => props,
}));

import LegacyDeviceRetirementVisualFixturePage from "./page";

describe("legacy device retirement visual fixture route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.environment.mockReturnValue({ target: "local" });
  });

  it("normalizes locale and scenario inside the guarded environment", async () => {
    await expect(
      LegacyDeviceRetirementVisualFixturePage({
        searchParams: Promise.resolve({ locale: "ru", scenario: "blocked" }),
      }),
    ).resolves.toMatchObject({ props: { locale: "ru", scenario: "blocked" } });
  });

  it("hard-fails closed when visual fixtures are unavailable", async () => {
    mocks.environment.mockReturnValue(null);
    mocks.notFound.mockImplementation(() => {
      throw new Error("not-found");
    });

    await expect(LegacyDeviceRetirementVisualFixturePage({})).rejects.toThrow(
      "not-found",
    );
  });
});
