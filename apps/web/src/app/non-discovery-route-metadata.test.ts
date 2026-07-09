import { describe, expect, it, vi } from "vitest";

import { metadata as adminMetadata } from "./admin/layout";
import { metadata as authMetadata } from "./auth/layout";
import { generateMetadata as generateGardenMetadata } from "./garden/layout";

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: vi.fn(async () => "uk"),
}));

describe("non-discovery route metadata", () => {
  it("keeps workspace, auth, and operator route groups noindex/nofollow", async () => {
    const gardenMetadata = await generateGardenMetadata();

    expect(gardenMetadata.robots).toEqual({
      index: false,
      follow: false,
    });
    expect(authMetadata.robots).toEqual({
      index: false,
      follow: false,
    });
    expect(adminMetadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
