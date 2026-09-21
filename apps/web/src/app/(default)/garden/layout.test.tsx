import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

describe("garden locale metadata", () => {
  it("uses the selected interface locale without changing workspace robots", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    const { generateMetadata } = await import("./layout");

    await expect(generateMetadata()).resolves.toMatchObject({
      title: "Градинско пространство | OverGarden",
      description:
        "Управлявайте своите пространства и обекти и публикувайте наблюдения за всички.",
      robots: {
        index: false,
        follow: false,
      },
    });
  });
});
