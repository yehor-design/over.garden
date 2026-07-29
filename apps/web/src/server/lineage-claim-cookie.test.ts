import { describe, expect, it } from "vitest";

import type { AuthSecretConfiguration } from "@/lib/auth-secret";
import {
  sealLineageClaimToken,
  unsealLineageClaimToken,
} from "./lineage-claim-cookie";

const SECRET = "test-only-secret-with-enough-entropy";
const TOKEN = "v1.private-payload.private-signature";
const CURRENT_SECRET = Buffer.alloc(32, 8).toString("base64url");
const LEGACY_SECRET =
  "lineage-claim-legacy-test-secret-with-at-least-thirty-two";
const TWO_KEY_CONFIGURATION: AuthSecretConfiguration = {
  health: { class: "versioned_current", activeVersion: 2 },
  active: { version: 2, value: CURRENT_SECRET },
  versionedSecrets: [{ version: 2, value: CURRENT_SECRET }],
  legacySecret: LEGACY_SECRET,
};

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

  it("labels current claim state and rejects an unknown key without scanning", () => {
    const current = sealLineageClaimToken(TOKEN, {
      authSecrets: TWO_KEY_CONFIGURATION,
    });
    const legacy = sealLineageClaimToken(TOKEN, { secret: LEGACY_SECRET });

    expect(current).toMatch(/^v2\.2\./);
    expect(
      unsealLineageClaimToken(current, {
        authSecrets: TWO_KEY_CONFIGURATION,
      }),
    ).toBe(TOKEN);
    expect(
      unsealLineageClaimToken(legacy, {
        authSecrets: TWO_KEY_CONFIGURATION,
      }),
    ).toBe(TOKEN);
    expect(
      unsealLineageClaimToken(current.replace(/^v2\.2\./, "v2.9."), {
        authSecrets: TWO_KEY_CONFIGURATION,
      }),
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
