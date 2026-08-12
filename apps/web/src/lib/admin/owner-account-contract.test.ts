import { describe, expect, it } from "vitest";

import {
  buildVerifiedOwnerAccountEvidence,
  isSealedOwnerUserId,
  isVerifiedCredentialOnlyOwnerAccount,
  redactOwnerBootstrapFailure,
  REDACTED_OWNER_BOOTSTRAP_FAILURE_MESSAGE,
  SEALED_OWNER_USER_ID_ENV,
  type OwnerIdentityProjection,
} from "@/lib/admin/owner-account-contract";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

const VALID_OWNER_IDENTITY = {
  emailVerified: true,
  accounts: [{ providerId: "credential", password: "password-hash" }],
} as const satisfies OwnerIdentityProjection;

describe("sealed owner account contract", () => {
  it("classifies only the exact configured sealed-owner user id", () => {
    expect(
      isSealedOwnerUserId(OWNER_ID, {
        [SEALED_OWNER_USER_ID_ENV]: `  ${OWNER_ID}  `,
      }),
    ).toBe(true);
    expect(
      isSealedOwnerUserId(OTHER_ID, {
        [SEALED_OWNER_USER_ID_ENV]: OWNER_ID,
      }),
    ).toBe(false);
    expect(isSealedOwnerUserId(OWNER_ID, {})).toBe(false);
    expect(
      isSealedOwnerUserId(OWNER_ID, {
        [SEALED_OWNER_USER_ID_ENV]: "not-a-user-id",
      }),
    ).toBe(false);
  });

  it("accepts only one verified password credential and builds truthful evidence", () => {
    expect(isVerifiedCredentialOnlyOwnerAccount(VALID_OWNER_IDENTITY)).toBe(
      true,
    );
    const evidence = buildVerifiedOwnerAccountEvidence(VALID_OWNER_IDENTITY);

    expect(evidence).toEqual({
      emailVerified: true,
      credentialOnlyVerified: true,
    });
    expect(Object.keys(evidence).sort()).toEqual([
      "credentialOnlyVerified",
      "emailVerified",
    ]);
    expect(JSON.stringify(evidence)).not.toContain("userVerified");
  });

  it.each([
    {
      label: "unverified email",
      identity: { ...VALID_OWNER_IDENTITY, emailVerified: false },
    },
    {
      label: "missing password hash",
      identity: {
        ...VALID_OWNER_IDENTITY,
        accounts: [{ providerId: "credential", password: null }],
      },
    },
    {
      label: "empty password hash",
      identity: {
        ...VALID_OWNER_IDENTITY,
        accounts: [{ providerId: "credential", password: "   " }],
      },
    },
    {
      label: "duplicate credentials",
      identity: {
        ...VALID_OWNER_IDENTITY,
        accounts: [
          { providerId: "credential", password: "password-hash" },
          { providerId: "credential", password: "second-password-hash" },
        ],
      },
    },
    {
      label: "linked social account",
      identity: {
        ...VALID_OWNER_IDENTITY,
        accounts: [
          { providerId: "credential", password: "password-hash" },
          { providerId: "google", password: null },
        ],
      },
    },
  ])("fails closed for $label", ({ identity }) => {
    expect(isVerifiedCredentialOnlyOwnerAccount(identity)).toBe(false);
    expect(() => buildVerifiedOwnerAccountEvidence(identity)).toThrow(
      "Owner account must use one verified email/password credential.",
    );
  });

  it("returns bounded CLI failure copy without database or identity details", () => {
    const output = redactOwnerBootstrapFailure();

    expect(output).toBe(REDACTED_OWNER_BOOTSTRAP_FAILURE_MESSAGE);
    expect(output).not.toMatch(
      /postgres|secret|10\.0\.0\.1|user@example\.com|00000000-0000/i,
    );
  });
});
