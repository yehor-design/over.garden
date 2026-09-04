import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  type AuthSecretConfiguration,
  resolveAuthSecretConfiguration,
  selectVersionedAuthSecret,
} from "@/lib/auth-secret";

/**
 * One signed visitor id for the whole site, so a signed-out reader's like can
 * be permanent and still be theirs to remove.
 *
 * What this replaces: a separate signed capability per target, minted on every
 * like, carrying `target_ref` inside its payload. That design gave a reader one
 * cookie per entry they liked, tied every like to a 24-hour expiry, and — because
 * the payload grew with the slug — produced tokens that overflowed their own
 * length check on any Cyrillic entry (fixed in OVE-376, deleted here).
 *
 * What it is instead: a v4 UUID with an HMAC over it, set once, read on every
 * later like. It identifies a browser and nothing else. It carries no target, no
 * timestamp beyond the cookie's own expiry, and no derivation from anything the
 * reader typed or visited, so it cannot be used to reconstruct what they read.
 *
 * Honest limits, stated so nobody has to rediscover them:
 *
 *   * A reader who clears cookies can like the same entry again. Every anonymous
 *     counter on the web has this property; the answer is that the anonymous
 *     half must never drive ranking, not a per-target budget table.
 *   * The id is not a login. Two browsers are two visitors, which is why signing
 *     up claims the rows rather than merging identities.
 */
const TOKEN_VERSION = "v1";

export const ENGAGEMENT_VISITOR_COOKIE_NAME = "og_visitor";

/**
 * One year. The cookie exists so a like a reader cast last season is still
 * theirs to take back; a short life would silently orphan their own rows.
 */
export const ENGAGEMENT_VISITOR_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** `v1.<secret version>.<uuid>.<signature>` — bounded well under any cookie limit. */
const MAX_VISITOR_TOKEN_LENGTH = 256;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface EngagementVisitorIdentity {
  visitorId: string;
  token: string;
}

/** Mints a new visitor. Called only when someone actually likes something. */
export function issueEngagementVisitorIdentity(
  options: { authSecrets?: AuthSecretConfiguration; visitorId?: string } = {},
): EngagementVisitorIdentity {
  const configuration = options.authSecrets ?? resolveAuthSecretConfiguration();
  const visitorId = options.visitorId ?? randomUUID();
  const signed = `${TOKEN_VERSION}.${configuration.active.version}.${visitorId}`;
  return {
    visitorId,
    token: `${signed}.${sign(signed, configuration.active.value)}`,
  };
}

/**
 * Reads a visitor id back out of a cookie value, or `null` if the value was not
 * minted by this server under a secret it still holds. A rotated-out secret
 * therefore retires a visitor rather than trusting an unverifiable id.
 */
export function verifyEngagementVisitorIdentity(
  token: string | undefined,
  options: { authSecrets?: AuthSecretConfiguration } = {},
): EngagementVisitorIdentity | null {
  if (!token || token.length > MAX_VISITOR_TOKEN_LENGTH) return null;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;

  const version = parseVersion(parts[1]);
  const [visitorId, signature] = [parts[2], parts[3]];
  if (
    version === null ||
    !visitorId ||
    !signature ||
    !UUID_PATTERN.test(visitorId)
  ) {
    return null;
  }

  const configuration = options.authSecrets ?? resolveAuthSecretConfiguration();
  const secret = selectVersionedAuthSecret(version, configuration)?.value;
  if (
    !secret ||
    !safeEqual(
      signature,
      sign(`${TOKEN_VERSION}.${version}.${visitorId}`, secret),
    )
  ) {
    return null;
  }

  return { visitorId, token };
}

function parseVersion(value: string | undefined) {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
