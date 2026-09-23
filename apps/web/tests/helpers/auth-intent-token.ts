import { createCipheriv, createHash, randomBytes } from "node:crypto";

import {
  resolveAuthSecretConfiguration,
  type AuthSecretConfiguration,
} from "../../src/lib/auth-secret";

/**
 * A held action's token, issued in the past, for the one browser proof that
 * needs an expired one (`OVE-504`: the resume loop).
 *
 * The server's minting module is `server-only` and a Playwright file cannot
 * import it, and waiting out the fifteen-minute lifetime is not a test. So this
 * writes the same envelope `src/server/auth-intent-token.ts` writes — the same
 * key derivation, cipher, associated data and version prefix, from the same
 * secret configuration the server reads — and a unit test in
 * `src/server/auth-intent-token.test.ts` verifies what it mints with the real
 * verifier, so the two cannot drift apart silently.
 */
const LIFETIME_MS = 15 * 60_000;
const AAD = Buffer.from("overgarden.auth-intent.v1", "utf8");

export function mintAuthIntentToken(
  intent: {
    action: string;
    returnTo: string;
    target?: { kind: string; ref: string };
    control?: string;
  },
  options: {
    issuedAt: number;
    configuration?: AuthSecretConfiguration;
  },
): string {
  const configuration =
    options.configuration ?? resolveAuthSecretConfiguration();
  const legacy = configuration.health.class === "legacy_transition";
  const secret = configuration.active.value;
  const payload = {
    version: 1,
    ...intent,
    issuedAt: options.issuedAt,
    expiresAt: options.issuedAt + LIFETIME_MS,
  };
  const key = createHash("sha256")
    .update("overgarden.auth-intent.v1\0", "utf8")
    .update(secret, "utf8")
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [
    legacy ? "v1" : "v2",
    ...(legacy ? [] : [String(configuration.active.version)]),
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}
