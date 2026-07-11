import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { resolveBetterAuthSecret } from "@/lib/auth-secret";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const CONTEXT = "overgarden.lineage-claim-cookie.v1";
const MAX_TOKEN_LENGTH = 4096;

export function sealLineageClaimToken(
  token: string,
  options: { secret?: string } = {},
) {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new Error("Lineage claim token is invalid.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(options.secret), iv);
  cipher.setAAD(Buffer.from(CONTEXT, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv, encrypted, tag]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url"),
    )
    .join(".");
}

export function unsealLineageClaimToken(
  sealed: string | null | undefined,
  options: { secret?: string } = {},
) {
  if (!sealed || sealed.length > 6144) return null;
  const [version, ivPart, encryptedPart, tagPart, extra] = sealed.split(".");
  if (
    version !== VERSION ||
    !ivPart ||
    !encryptedPart ||
    !tagPart ||
    extra !== undefined
  ) {
    return null;
  }

  try {
    const iv = Buffer.from(ivPart, "base64url");
    const encrypted = Buffer.from(encryptedPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;

    const decipher = createDecipheriv(ALGORITHM, deriveKey(options.secret), iv);
    decipher.setAAD(Buffer.from(CONTEXT, "utf8"));
    decipher.setAuthTag(tag);
    const token = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");

    return token.length > 0 && token.length <= MAX_TOKEN_LENGTH ? token : null;
  } catch {
    return null;
  }
}

function deriveKey(secret?: string) {
  return createHash("sha256")
    .update(CONTEXT, "utf8")
    .update("\0", "utf8")
    .update(secret ?? resolveBetterAuthSecret(), "utf8")
    .digest();
}
