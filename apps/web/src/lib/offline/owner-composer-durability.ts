"use client";

export const OWNER_COMPOSER_DURABILITY_PROTOCOL =
  "ove293.owner-composer-durability.v1" as const;
export const OFFLINE_VAULT_GENERATION = "ove293-shared-v6" as const;
export const MAX_OWNER_COMPOSER_FINGERPRINT_NODES = 10_000;

export type OwnerComposerDurabilityDisposition = "stored" | "deleted";

export interface OwnerComposerDurabilityExpectation {
  ownerUserId: string;
  draftId: string;
  participantNonce: string;
  generation: number;
}

export interface OwnerComposerDurabilityReceipt {
  status: "confirmed";
  protocol: typeof OWNER_COMPOSER_DURABILITY_PROTOCOL;
  participantNonce: string;
  generation: number;
  disposition: OwnerComposerDurabilityDisposition;
  storedByteLength: number;
  storedDigest: string;
  vaultGeneration: typeof OFFLINE_VAULT_GENERATION;
}

export interface OwnerComposerPayloadFingerprint {
  storedByteLength: number;
  storedDigest: string;
}

export type OwnerComposerDurabilityFailureReason =
  | "storage_unavailable"
  | "inventory_bounded"
  | "corrupt_record"
  | "blob_unavailable"
  | "flush_unconfirmed";

export class OwnerComposerDurabilityUnconfirmedError extends Error {
  constructor(
    readonly reason: OwnerComposerDurabilityFailureReason = "flush_unconfirmed",
  ) {
    super("Composer durability could not be confirmed.");
    this.name = "OwnerComposerDurabilityUnconfirmedError";
  }
}

export function requireOwnerComposerDurabilityExpectation(
  expectation: OwnerComposerDurabilityExpectation,
): OwnerComposerDurabilityExpectation {
  const ownerUserId = expectation.ownerUserId.trim();
  const draftId = expectation.draftId.trim();
  const participantNonce = expectation.participantNonce.trim();
  if (!ownerUserId || !draftId || draftId.length > 256) {
    throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
  }
  if (
    participantNonce.length < 16 ||
    participantNonce.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(participantNonce)
  ) {
    throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
  }
  if (
    !Number.isSafeInteger(expectation.generation) ||
    expectation.generation < 1
  ) {
    throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
  }
  return {
    ownerUserId,
    draftId,
    participantNonce,
    generation: expectation.generation,
  };
}

export function isExactOwnerComposerDurabilityReceipt(
  value: unknown,
  expected: OwnerComposerDurabilityExpectation,
): value is OwnerComposerDurabilityReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<OwnerComposerDurabilityReceipt>;
  return (
    receipt.status === "confirmed" &&
    receipt.protocol === OWNER_COMPOSER_DURABILITY_PROTOCOL &&
    receipt.participantNonce === expected.participantNonce &&
    receipt.generation === expected.generation &&
    (receipt.disposition === "stored" || receipt.disposition === "deleted") &&
    Number.isSafeInteger(receipt.storedByteLength) &&
    (receipt.storedByteLength ?? -1) >= 0 &&
    typeof receipt.storedDigest === "string" &&
    /^[a-f0-9]{64}$/.test(receipt.storedDigest) &&
    receipt.vaultGeneration === OFFLINE_VAULT_GENERATION
  );
}

export function createOwnerComposerParticipantNonce(): string {
  if (typeof crypto === "undefined" || !crypto.randomUUID) {
    throw new OwnerComposerDurabilityUnconfirmedError("storage_unavailable");
  }
  return crypto.randomUUID();
}

/**
 * Fingerprint the exact structured-clone payload without ever returning its
 * bytes. Type and length framing prevents ambiguous concatenation, while
 * reference ids make shared references and cycles deterministic.
 */
export async function fingerprintOwnerComposerPayload(
  value: unknown,
): Promise<OwnerComposerPayloadFingerprint> {
  const parts: BlobPart[] = [];
  const references = new WeakMap<object, number>();
  let referenceCount = 0;

  const appendText = (text: string) => {
    const bytes = new TextEncoder().encode(text);
    parts.push(bytes);
  };
  const appendString = (valueToAppend: string) => {
    const bytes = new TextEncoder().encode(valueToAppend);
    appendText(`s${bytes.byteLength}:`);
    parts.push(bytes);
  };

  const visit = (current: unknown): void => {
    if (current === null) {
      appendText("null;");
      return;
    }
    if (typeof current === "string") {
      appendString(current);
      return;
    }
    if (typeof current === "boolean") {
      appendText(current ? "true;" : "false;");
      return;
    }
    if (typeof current === "undefined") {
      appendText("undefined;");
      return;
    }
    if (typeof current === "number") {
      const normalized = Object.is(current, -0)
        ? "-0"
        : Number.isNaN(current)
          ? "NaN"
          : current === Number.POSITIVE_INFINITY
            ? "+Infinity"
            : current === Number.NEGATIVE_INFINITY
              ? "-Infinity"
              : String(current);
      appendText(`number:${normalized};`);
      return;
    }
    if (typeof current === "bigint") {
      appendText(`bigint:${current.toString()};`);
      return;
    }
    if (
      typeof current === "symbol" ||
      typeof current === "function" ||
      typeof current !== "object"
    ) {
      throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
    }

    const existingReference = references.get(current);
    if (existingReference !== undefined) {
      appendText(`reference:${existingReference};`);
      return;
    }
    referenceCount += 1;
    if (referenceCount >= MAX_OWNER_COMPOSER_FINGERPRINT_NODES) {
      throw new OwnerComposerDurabilityUnconfirmedError("inventory_bounded");
    }
    references.set(current, referenceCount);
    appendText(`id:${referenceCount};`);

    if (typeof Blob !== "undefined" && current instanceof Blob) {
      appendText("blob:");
      appendString(current.type);
      appendText(`bytes:${current.size};`);
      parts.push(current);
      return;
    }
    if (current instanceof Date) {
      if (Number.isNaN(current.getTime())) {
        throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
      }
      appendText(`date:${current.toISOString()};`);
      return;
    }
    if (current instanceof ArrayBuffer) {
      appendText(`array-buffer:${current.byteLength};`);
      parts.push(new Uint8Array(current));
      return;
    }
    if (ArrayBuffer.isView(current)) {
      const bytes = new Uint8Array(
        current.buffer,
        current.byteOffset,
        current.byteLength,
      );
      appendString(current.constructor.name);
      appendText(`view:${bytes.byteLength};`);
      parts.push(Uint8Array.from(bytes).buffer);
      return;
    }
    if (Array.isArray(current)) {
      appendText(`array:${current.length};`);
      for (const item of current) visit(item);
      return;
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
    }
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Object.keys(descriptors).sort();
    appendText(`object:${keys.length};`);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor)) {
        throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
      }
      appendString(key);
      visit(descriptor.value);
    }
  };

  try {
    visit(value);
    const bytes = await new Blob(parts).arrayBuffer();
    return {
      storedByteLength: bytes.byteLength,
      storedDigest: await sha256Hex(bytes),
    };
  } catch (error) {
    if (error instanceof OwnerComposerDurabilityUnconfirmedError) throw error;
    throw new OwnerComposerDurabilityUnconfirmedError("blob_unavailable");
  }
}

export async function deletedOwnerComposerFingerprint(): Promise<OwnerComposerPayloadFingerprint> {
  return {
    storedByteLength: 0,
    storedDigest: await sha256Hex(new ArrayBuffer(0)),
  };
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new OwnerComposerDurabilityUnconfirmedError("storage_unavailable");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
