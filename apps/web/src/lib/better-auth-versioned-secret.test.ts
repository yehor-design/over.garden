import { describe, expect, it } from "vitest";

import {
  symmetricDecodeJWT,
  symmetricDecrypt,
  symmetricEncodeJWT,
  symmetricEncrypt,
  parseEnvelope,
  type SecretConfig,
} from "better-auth/crypto";

const legacySecret = "legacy-fixture-secret-for-versioned-better-auth-coverage";
const currentSecret = Buffer.alloc(32, 11).toString("base64url");
const secretConfig: SecretConfig = {
  currentVersion: 2,
  keys: new Map([[2, currentSecret]]),
  legacySecret,
};

describe("Better Auth 1.6.25 versioned secret compatibility", () => {
  it("reads a legacy session envelope and writes a current versioned envelope", async () => {
    const legacy = await symmetricEncodeJWT(
      { subject: "fixture" },
      legacySecret,
      "better-auth-session",
      300,
    );
    const current = await symmetricEncodeJWT(
      { subject: "fixture" },
      secretConfig,
      "better-auth-session",
      300,
    );

    expect(
      await symmetricDecodeJWT(legacy, secretConfig, "better-auth-session"),
    ).toMatchObject({
      subject: "fixture",
    });
    expect(
      await symmetricDecodeJWT(current, secretConfig, "better-auth-session"),
    ).toMatchObject({
      subject: "fixture",
    });
  });

  it("reads a legacy OAuth state cipher and labels new state with the active version", async () => {
    const legacy = await symmetricEncrypt({
      key: legacySecret,
      data: "fixture-oauth-state",
    });
    const current = await symmetricEncrypt({
      key: secretConfig,
      data: "fixture-oauth-state",
    });

    expect(await symmetricDecrypt({ key: secretConfig, data: legacy })).toBe(
      "fixture-oauth-state",
    );
    expect(await symmetricDecrypt({ key: secretConfig, data: current })).toBe(
      "fixture-oauth-state",
    );
    expect(parseEnvelope(current)?.version).toBe(2);
  });
});
