const CURRENT_SESSION_BINDING_LENGTH = 43;

export async function deriveCurrentSessionBinding(sessionId: string) {
  if (!isBoundedCurrentSessionId(sessionId)) {
    throw new TypeError("A bounded current session id is required.");
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("Current session binding is unavailable.");
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sessionId),
  );
  return encodeBase64Url(new Uint8Array(digest));
}

export function hasCurrentSessionBinding(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === CURRENT_SESSION_BINDING_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export function isBoundedCurrentSessionId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value
  );
}

function encodeBase64Url(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let encoded = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const value =
      (first << 16) | ((second ?? 0) << 8) | (third === undefined ? 0 : third);

    encoded += alphabet[(value >>> 18) & 63];
    encoded += alphabet[(value >>> 12) & 63];
    if (second !== undefined) encoded += alphabet[(value >>> 6) & 63];
    if (third !== undefined) encoded += alphabet[value & 63];
  }

  return encoded;
}
