import { describe, expect, it } from "vitest";

import {
  EPPO_DATA_PORTAL_API_KEY_ENV,
  EppoCredentialError,
  assertValidEppoCredential,
  eppoCredentialFingerprintPrefix,
  redactEppoCredentialForReceipt,
  resolveEppoCredential,
} from "./eppo-credentials";

const FIXTURE_CREDENTIAL = "eppo_fixture_credential_4fd9d606a6b74d9a";

describe("EPPO credential owner", () => {
  it("admits one opaque, single-line API-key fixture", () => {
    expect(assertValidEppoCredential(FIXTURE_CREDENTIAL)).toBe(
      FIXTURE_CREDENTIAL,
    );
    expect(
      resolveEppoCredential({
        [EPPO_DATA_PORTAL_API_KEY_ENV]: FIXTURE_CREDENTIAL,
      }),
    ).toBe(FIXTURE_CREDENTIAL);
  });

  it.each([
    undefined,
    "",
    " fixture",
    "fixture ",
    "fixture\nsecond-line",
    "password=not-an-api-key",
    "EPPO_DATA_PORTAL_API_KEY=not-an-api-key",
    "--key=not-an-api-key",
  ])("rejects unsafe operator input %#", (candidate) => {
    expect(() => assertValidEppoCredential(candidate)).toThrow(
      EppoCredentialError,
    );
  });

  it("fails closed when a retired alias is configured", () => {
    try {
      resolveEppoCredential({
        [EPPO_DATA_PORTAL_API_KEY_ENV]: FIXTURE_CREDENTIAL,
        EPPO_API_KEY: "different-fixture",
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "legacy_alias_configured" });
      return;
    }

    throw new Error("Expected a retired alias to fail closed.");
  });

  it("creates a stable receipt-safe fingerprint without returning the key", () => {
    const fingerprint = eppoCredentialFingerprintPrefix(FIXTURE_CREDENTIAL);

    expect(fingerprint).toMatch(/^[a-f0-9]{12}$/u);
    expect(redactEppoCredentialForReceipt(FIXTURE_CREDENTIAL)).toBe(
      `redacted:${fingerprint}`,
    );
    expect(fingerprint).not.toContain(FIXTURE_CREDENTIAL);
  });
});
