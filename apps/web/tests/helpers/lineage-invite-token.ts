import { createHmac } from "node:crypto";

import {
  resolveAuthSecretConfiguration,
  type AuthSecretConfiguration,
} from "../../src/lib/auth-secret";

/**
 * An invitation link's token, signed as of a chosen day, for the browser
 * proof that needs an expired one (`OVE-495`).
 *
 * The server's signer is `server-only` and a Playwright file cannot import it,
 * and waiting out thirty days is not a test. So this writes what
 * `src/server/lineage-invite-token.ts` writes — the same payload, the same
 * HMAC, the same version prefix, from the same secret configuration the server
 * reads — and a unit test in `src/server/lineage-invite-token.test.ts`
 * verifies what it mints with the real verifier, so the two cannot drift.
 */
const TTL_SECONDS = 30 * 24 * 60 * 60;

export function mintLineageInviteToken(
  invite: { pendingIdentityId: string; edgeId: string },
  options: { createdAt: Date; configuration?: AuthSecretConfiguration },
): string {
  const dedicated = process.env.LINEAGE_INVITE_SIGNING_SECRET;
  const configuration =
    options.configuration ?? resolveAuthSecretConfiguration();
  const legacy =
    Boolean(dedicated) || configuration.health.class === "legacy_transition";
  const secret = dedicated || configuration.active.value;
  const issuedAt = Math.floor(options.createdAt.getTime() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      p: invite.pendingIdentityId,
      e: invite.edgeId,
      iat: issuedAt,
      exp: issuedAt + TTL_SECONDS,
    }),
    "utf8",
  ).toString("base64url");
  const signed = [
    legacy ? "v1" : "v2",
    ...(legacy ? [] : [String(configuration.active.version)]),
    body,
  ].join(".");
  const signature = createHmac("sha256", secret)
    .update(signed)
    .digest()
    .toString("base64url");
  return `${signed}.${signature}`;
}
