import { describe, expect, it } from "vitest";

import { metadata as adminMetadata } from "./admin/layout";
import { metadata as authMetadata } from "./auth/layout";
import { metadata as gardenMetadata } from "./garden/layout";

describe("non-discovery route metadata", () => {
  it("keeps workspace, auth, and operator route groups noindex/nofollow", () => {
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
