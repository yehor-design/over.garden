import { describe, expect, it } from "vitest";

import {
  sealLineageClaimToken,
  unsealLineageClaimToken,
} from "./lineage-claim-cookie";

const SECRET = "test-only-secret-with-enough-entropy";
const TOKEN = "v1.private-payload.private-signature";

describe("lineage claim cookie", () => {
  it("encrypts and authenticates the invite token", () => {
    const sealed = sealLineageClaimToken(TOKEN, { secret: SECRET });

    expect(sealed).toMatch(
      /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(sealed).not.toContain(TOKEN);
    expect(unsealLineageClaimToken(sealed, { secret: SECRET })).toBe(TOKEN);
  });

  it("rejects tampering and a different secret", () => {
    const sealed = sealLineageClaimToken(TOKEN, { secret: SECRET });
    const parts = sealed.split(".");
    const tag = parts[3] ?? "";
    parts[3] = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;
    const tampered = parts.join(".");

    expect(unsealLineageClaimToken(tampered, { secret: SECRET })).toBeNull();
    expect(
      unsealLineageClaimToken(sealed, { secret: "different-test-secret" }),
    ).toBeNull();
  });

  it("rejects empty and oversized plaintext", () => {
    expect(() => sealLineageClaimToken("", { secret: SECRET })).toThrow(
      "Lineage claim token is invalid.",
    );
    expect(() =>
      sealLineageClaimToken("x".repeat(4097), { secret: SECRET }),
    ).toThrow("Lineage claim token is invalid.");
  });
});
