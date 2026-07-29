import { describe, expect, it } from "vitest";

import { signJWT, verifyJWT } from "better-auth/crypto";

import type { AuthSecretConfiguration } from "@/lib/auth-secret";

import { bridgeLegacyEmailVerificationRequest } from "./legacy-email-verification-bridge";

const legacySecret = "legacy-fixture-secret-used-only-for-auth-bridge-tests";
const currentSecret = Buffer.alloc(32, 9).toString("base64url");
const configuration: AuthSecretConfiguration = {
  health: { class: "versioned_current", activeVersion: 2 },
  active: { version: 2, value: currentSecret },
  versionedSecrets: [{ version: 2, value: currentSecret }],
  legacySecret,
};

describe("legacy email-verification bridge", () => {
  it("re-signs a valid legacy verification token under the active key without extending expiry", async () => {
    const oldToken = await signJWT(
      {
        email: "gardener@example.test",
        requestType: "change-email-verification",
      },
      legacySecret,
      120,
    );
    const request = new Request(
      `https://over.garden/api/auth/verify-email?token=${encodeURIComponent(oldToken)}`,
    );

    const bridged = await bridgeLegacyEmailVerificationRequest(
      request,
      configuration,
    );
    const newToken = new URL(bridged.url).searchParams.get("token");
    const verified = await verifyJWT(newToken!, currentSecret);

    expect(newToken).not.toBe(oldToken);
    expect(verified).toMatchObject({
      email: "gardener@example.test",
      requestType: "change-email-verification",
    });
    expect(Number(verified?.exp)).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000) + 120,
    );
    expect(await verifyJWT(newToken!, legacySecret)).toBeNull();
  });

  it("does not transform unknown, expired, malformed, or non-verification input", async () => {
    const invalid = new Request(
      "https://over.garden/api/auth/verify-email?token=not-a-token",
    );
    const unrelated = new Request(
      "https://over.garden/api/auth/sign-in/email?token=not-a-token",
    );

    expect(
      (await bridgeLegacyEmailVerificationRequest(invalid, configuration)).url,
    ).toBe(invalid.url);
    expect(
      (await bridgeLegacyEmailVerificationRequest(unrelated, configuration))
        .url,
    ).toBe(unrelated.url);
  });
});
