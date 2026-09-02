import { describe, expect, it, vi } from "vitest";

import { metadata as accountMetadata } from "./(default)/account/layout";
import { metadata as authMetadata } from "./(default)/auth/layout";
import { generateMetadata as generateGardenMetadata } from "./(default)/garden/layout";

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: vi.fn(async () => "uk"),
}));

describe("non-discovery route metadata", () => {
  it("keeps workspace, auth, and account-operator route groups noindex/nofollow", async () => {
    const gardenMetadata = await generateGardenMetadata();

    expect(gardenMetadata.robots).toEqual({
      index: false,
      follow: false,
    });
    expect(authMetadata.robots).toEqual({
      index: false,
      follow: false,
    });
    expect(accountMetadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
