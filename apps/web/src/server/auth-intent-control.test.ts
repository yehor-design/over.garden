import { describe, expect, it } from "vitest";

import { createAuthIntentControlRef } from "./auth-intent-control";

const SECRET = "ove-174-control-test-secret-with-thirty-two-characters";

describe("auth intent control reference", () => {
  it("creates a stable opaque locator without serializing the private id", () => {
    const first = createAuthIntentControlRef(
      "publish",
      "00000000-0000-4000-8000-000000000901",
      { secret: SECRET },
    );
    const second = createAuthIntentControlRef(
      "publish",
      "00000000-0000-4000-8000-000000000901",
      { secret: SECRET },
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^publish-[a-z0-9-]{16}$/);
    expect(first).not.toContain("00000000");
    expect(
      createAuthIntentControlRef("reply", "same-private-id", {
        secret: SECRET,
      }),
    ).not.toBe(
      createAuthIntentControlRef("follow", "same-private-id", {
        secret: SECRET,
      }),
    );
  });

  it.each(["", " ", "x".repeat(257)])(
    "rejects invalid source value %s",
    (value) => {
      expect(() =>
        createAuthIntentControlRef("reply", value, { secret: SECRET }),
      ).toThrow("Auth intent control source is invalid");
    },
  );
});
