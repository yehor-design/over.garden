import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createOfflineOwnerVaultBindingReceipt,
  deriveOfflineOwnerVaultBinding,
  OFFLINE_OWNER_VAULT_PROTOCOL,
} from "./offline-owner-vault-binding";

const OWNER_A = "00000000-0000-4000-8000-0000000000a1";
const OWNER_B = "00000000-0000-4000-8000-0000000000b2";

describe("offline owner-vault binding", () => {
  it("derives a stable opaque namespace from the canonical Better Auth owner", () => {
    const first = deriveOfflineOwnerVaultBinding(OWNER_A);
    const second = deriveOfflineOwnerVaultBinding(OWNER_A.toUpperCase());

    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toContain(OWNER_A);
    expect(deriveOfflineOwnerVaultBinding(OWNER_B)).not.toBe(first);
  });

  it.each([
    "",
    "owner-a",
    " 00000000-0000-4000-8000-0000000000a1",
    "00000000-0000-4000-8000-0000000000zz",
  ])("rejects a non-canonical owner id: %s", (ownerUserId) => {
    expect(() => deriveOfflineOwnerVaultBinding(ownerUserId)).toThrow(
      TypeError,
    );
  });

  it("returns only the protocol, stable binding, and same-session generation", () => {
    const sessionId = "better-auth-session-token-a";
    const receipt = createOfflineOwnerVaultBindingReceipt({
      ownerUserId: OWNER_A,
      sessionId,
    });

    expect(receipt).toEqual({
      protocol: OFFLINE_OWNER_VAULT_PROTOCOL,
      binding: deriveOfflineOwnerVaultBinding(OWNER_A),
      sessionGeneration: createHash("sha256")
        .update(sessionId)
        .digest("base64url"),
    });
    expect(JSON.stringify(receipt)).not.toContain(OWNER_A);
    expect(JSON.stringify(receipt)).not.toContain(sessionId);
  });

  it("keeps the owner namespace stable while rotating the session generation", () => {
    const first = createOfflineOwnerVaultBindingReceipt({
      ownerUserId: OWNER_A,
      sessionId: "better-auth-session-a",
    });
    const rotated = createOfflineOwnerVaultBindingReceipt({
      ownerUserId: OWNER_A,
      sessionId: "better-auth-session-b",
    });

    expect(rotated.binding).toBe(first.binding);
    expect(rotated.sessionGeneration).not.toBe(first.sessionGeneration);
  });
});
