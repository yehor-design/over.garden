import { describe, expect, it } from "vitest";

import type { AuthSecretConfiguration } from "@/lib/auth-secret";
import { hashAnonymousEngagementToken } from "@/server/engagement-repository";
import {
  ANONYMOUS_LIKE_CAPABILITY_TTL_SECONDS,
  MAX_ANONYMOUS_LIKE_CAPABILITY_TOKEN_LENGTH,
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

/**
 * The defect that produced the production 500s, kept falsifiable.
 *
 * `issueAnonymousLikeCapability` puts `target_ref` into the signed payload
 * verbatim. `hashAnonymousEngagementToken` then bounded the token it was handed.
 * The two bounds disagreed: the column admits 160 characters of any script, a
 * Cyrillic letter is two UTF-8 bytes, and base64url adds a third on top — so a
 * token this server minted itself routinely passed 256 characters and the like
 * became an empty `500`. Measured 2026-09-04 on 7 of the 8 public journal
 * entries.
 */
describe("a minted capability is always hashable", () => {
  /** The eight public journal slugs on production, read on 2026-09-04. */
  const productionSlugs = [
    "томат-sep-1-f66321980b32",
    "що-записувати-після-огляду-вулика-791f2f2fce",
    "полезна-бележка-за-домат-без-снимка-48ed6cce69",
    "обкладинка-як-сталии-орієнтир-сезону-bffe4e6cf9",
    "избрана-корица-която-не-зависи-от-реда-9aed1a6e58",
    "наблюдение-деи-ствие-и-следваща-проверка-9348e15136",
    "поливане-според-почвата-не-според-календара-967e48cbe2",
    "кратък-и-отговорен-запис-след-преглед-на-кошер-29a9b986d1",
  ];

  it.each(productionSlugs)("hashes the capability minted for %s", (ref) => {
    const capability = issueAnonymousLikeCapability(
      { kind: "journal_entry", ref },
      { now: createdAt, authSecrets: secrets },
    );
    expect(() => hashAnonymousEngagementToken(capability.token)).not.toThrow();
  });

  it("hashes the longest capability the column can produce", () => {
    // `engagement_likes.target_ref` admits 160 characters. The worst case is
    // 160 two-byte letters against the longest target kind.
    const ref = "б".repeat(160);
    const capability = issueAnonymousLikeCapability(
      { kind: "lineage_object", ref },
      { now: createdAt, authSecrets: secrets },
    );

    expect(capability.token.length).toBeGreaterThan(256);
    expect(capability.token.length).toBeLessThanOrEqual(
      MAX_ANONYMOUS_LIKE_CAPABILITY_TOKEN_LENGTH,
    );
    expect(() => hashAnonymousEngagementToken(capability.token)).not.toThrow();
  });

  it("still refuses a token no minting path can produce", () => {
    expect(() => hashAnonymousEngagementToken("short")).toThrow();
    expect(() =>
      hashAnonymousEngagementToken(
        "x".repeat(MAX_ANONYMOUS_LIKE_CAPABILITY_TOKEN_LENGTH + 1),
      ),
    ).toThrow();
  });

  it("keeps the verifier and the hasher on one bound", () => {
    const overLength = "v1.1.".padEnd(
      MAX_ANONYMOUS_LIKE_CAPABILITY_TOKEN_LENGTH + 1,
      "a",
    );
    // Neither reader may accept a token the other one rejects on length alone.
    expect(
      verifyAnonymousLikeCapability(overLength, target, {
        now: createdAt,
        authSecrets: secrets,
      }),
    ).toBeNull();
    expect(() => hashAnonymousEngagementToken(overLength)).toThrow();
  });
});
