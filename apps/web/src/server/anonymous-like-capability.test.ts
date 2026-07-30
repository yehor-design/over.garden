import { describe, expect, it } from "vitest";

import type { AuthSecretConfiguration } from "@/lib/auth-secret";
import {
  ANONYMOUS_LIKE_CAPABILITY_TTL_SECONDS,
  capabilityCookieName,
  issueAnonymousLikeCapability,
  verifyAnonymousLikeCapability,
} from "./anonymous-like-capability";

const createdAt = new Date("2026-07-30T03:00:00.000Z");
const target = { kind: "journal_entry" as const, ref: "first-public-harvest" };
const otherTarget = { kind: "topic" as const, ref: "harvest" };
const secret = Buffer.alloc(32, 10).toString("base64url");
const secrets: AuthSecretConfiguration = {
  health: { class: "versioned_current", activeVersion: 7 },
  active: { version: 7, value: secret },
  versionedSecrets: [{ version: 7, value: secret }],
};

describe("anonymous like capabilities", () => {
  it("issues a target-bound, versioned 24-hour capability without tracking metadata", () => {
    const capability = issueAnonymousLikeCapability(target, {
      now: createdAt,
      authSecrets: secrets,
    });
    const body = capability.token.split(".")[2]!;
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(capability.token).toMatch(/^v1\.7\./);
    expect(capability.expiresAt).toEqual(
      new Date(
        createdAt.getTime() + ANONYMOUS_LIKE_CAPABILITY_TTL_SECONDS * 1000,
      ),
    );
    expect(payload).toMatchObject({
      k: "journal_entry",
      r: "first-public-harvest",
      iat: Math.floor(createdAt.getTime() / 1000),
      exp:
        Math.floor(createdAt.getTime() / 1000) +
        ANONYMOUS_LIKE_CAPABILITY_TTL_SECONDS,
    });
    // The random opaque nonce has no textual contract. Scan the semantic
    // payload fields instead: a random byte sequence can coincidentally
    // contain a forbidden word fragment such as "ip".
    const semanticPayload = Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== "n"),
    );
    expect(JSON.stringify(semanticPayload)).not.toMatch(
      /ip|user.?agent|email|phone|contact|coordinate|latitude|longitude/i,
    );
  });

  it("rejects a tampered, expired, or cross-target capability", () => {
    const capability = issueAnonymousLikeCapability(target, {
      now: createdAt,
      authSecrets: secrets,
    });

    expect(
      verifyAnonymousLikeCapability(capability.token, target, {
        now: createdAt,
        authSecrets: secrets,
      }),
    ).toEqual(capability);
    expect(
      verifyAnonymousLikeCapability(`${capability.token}x`, target, {
        now: createdAt,
        authSecrets: secrets,
      }),
    ).toBeNull();
    expect(
      verifyAnonymousLikeCapability(capability.token, otherTarget, {
        now: createdAt,
        authSecrets: secrets,
      }),
    ).toBeNull();
    expect(
      verifyAnonymousLikeCapability(capability.token, target, {
        now: new Date(capability.expiresAt.getTime() + 1000),
        authSecrets: secrets,
      }),
    ).toBeNull();
  });

  it("uses opaque, target-scoped cookie names instead of one durable device id", () => {
    const journalCookie = capabilityCookieName(target);
    const topicCookie = capabilityCookieName(otherTarget);
    expect(journalCookie).toMatch(/^og_like_[A-Za-z0-9_-]{20}$/);
    expect(journalCookie).not.toBe(topicCookie);
    expect(journalCookie).not.toContain(target.ref);
  });
});
