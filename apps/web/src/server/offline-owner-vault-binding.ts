import "server-only";

import { createHash } from "node:crypto";

export const OFFLINE_OWNER_VAULT_PROTOCOL = "ove288.owner-vault-binding.v1";

const OWNER_BINDING_DOMAIN = `${OFFLINE_OWNER_VAULT_PROTOCOL}\0`;
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OfflineOwnerVaultBindingReceipt {
  protocol: typeof OFFLINE_OWNER_VAULT_PROTOCOL;
  binding: string;
  sessionGeneration: string;
}

/**
 * Derives a stable, opaque physical-store namespace from Better Auth's
 * high-entropy UUID. This is a pseudonymous namespace, never authorization.
 * It intentionally has no rotating secret dependency, so auth-secret rotation
 * cannot strand an owner's device-local work.
 */
export function deriveOfflineOwnerVaultBinding(ownerUserId: string): string {
  const owner = normalizeOwnerUuid(ownerUserId);
  return createHash("sha256")
    .update(OWNER_BINDING_DOMAIN)
    .update(owner)
    .digest("base64url");
}

export function createOfflineOwnerVaultBindingReceipt(input: {
  ownerUserId: string;
  sessionId: string;
}): OfflineOwnerVaultBindingReceipt {
  const sessionId = requireBoundedSessionId(input.sessionId);
  return {
    protocol: OFFLINE_OWNER_VAULT_PROTOCOL,
    binding: deriveOfflineOwnerVaultBinding(input.ownerUserId),
    sessionGeneration: createHash("sha256")
      .update(sessionId)
      .digest("base64url"),
  };
}

function normalizeOwnerUuid(value: string): string {
  if (typeof value !== "string" || !CANONICAL_UUID.test(value)) {
    throw new TypeError("A canonical Better Auth owner UUID is required.");
  }
  return value.toLowerCase();
}

function requireBoundedSessionId(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    value.trim() !== value
  ) {
    throw new TypeError("A bounded current session id is required.");
  }
  return value;
}
