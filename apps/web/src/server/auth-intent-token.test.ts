import { describe, expect, it } from "vitest";

import {
  AuthIntentTokenError,
  createAuthIntentToken,
  verifyAuthIntentToken,
} from "./auth-intent-token";

const SECRET = "ove-174-test-secret-with-at-least-thirty-two-characters";
const NOW = Date.parse("2026-07-11T08:00:00.000Z");

describe("auth intent token", () => {
  it("round-trips a normalized short-lived payload through opaque authenticated encryption", () => {
    const token = createAuthIntentToken(
      {
        action: "comment",
        returnTo: "/journal/balcony-tomato-check?tab=history#comments",
        target: { kind: "journal", ref: "balcony-tomato-check" },
        control: "reply-a7d8f9c012345678",
      },
      { secret: SECRET, now: NOW },
    );

    expect(token).toMatch(
      /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(token).not.toContain("balcony-tomato-check");
    expect(token).not.toContain("journal");
    expect(token.length).toBeLessThan(1024);

    expect(
      verifyAuthIntentToken(token, {
        secret: SECRET,
        now: NOW + 60_000,
      }),
    ).toEqual({
      version: 1,
      action: "comment",
      returnTo: "/journal/balcony-tomato-check?tab=history#comments",
      target: { kind: "journal", ref: "balcony-tomato-check" },
      control: "reply-a7d8f9c012345678",
      issuedAt: NOW,
      expiresAt: NOW + 15 * 60_000,
    });
  });

  it("never serializes extra draft, identity, invite, or location fields", () => {
    const token = createAuthIntentToken(
      {
        action: "save",
        returnTo: "/garden",
        body: "private body",
        email: "person@example.com",
        invite: "v1.private.invite",
        preciseLocation: "42.0,23.0",
      },
      { secret: SECRET, now: NOW },
    );

    const payload = verifyAuthIntentToken(token, { secret: SECRET, now: NOW });

    expect(payload).toEqual({
      version: 1,
      action: "save",
      returnTo: "/garden",
      issuedAt: NOW,
      expiresAt: NOW + 15 * 60_000,
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /private body|person@example|private\.invite|42\.0/i,
    );
  });

  it("rejects modified ciphertext, tag, wrong secrets, and malformed versions", () => {
    const token = createAuthIntentToken(
      { action: "create_entry", returnTo: "/garden" },
      { secret: SECRET, now: NOW },
    );
    const segments = token.split(".");
    const tamperedTag = [
      segments[0],
      segments[1],
      segments[2],
      `${segments[3]?.startsWith("A") ? "B" : "A"}${segments[3]?.slice(1)}`,
    ].join(".");

    for (const candidate of [
      tamperedTag,
      token.replace(/^v1\./, "v2."),
      "v1.not-base64.payload.tag.extra",
      "",
    ]) {
      expect(() =>
        verifyAuthIntentToken(candidate, { secret: SECRET, now: NOW }),
      ).toThrow(AuthIntentTokenError);
    }

    expect(() =>
      verifyAuthIntentToken(token, {
        secret: `${SECRET}-different`,
        now: NOW,
      }),
    ).toThrow(AuthIntentTokenError);
  });

  it("rejects a non-canonical base64url spelling of the same tag bytes", () => {
    const token = createAuthIntentToken(
      { action: "save", returnTo: "/garden" },
      { secret: SECRET, now: NOW },
    );
    const segments = token.split(".");
    const tag = segments[3]!;
    const tagBytes = Buffer.from(tag, "base64url");
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const equivalentCharacter = [...alphabet].find((character) => {
      const candidate = `${tag.slice(0, -1)}${character}`;
      return (
        candidate !== tag &&
        Buffer.from(candidate, "base64url").equals(tagBytes)
      );
    });

    expect(equivalentCharacter).toBeDefined();
    const nonCanonicalToken = [
      segments[0],
      segments[1],
      segments[2],
      `${tag.slice(0, -1)}${equivalentCharacter}`,
    ].join(".");

    expect(() =>
      verifyAuthIntentToken(nonCanonicalToken, {
        secret: SECRET,
        now: NOW,
      }),
    ).toThrow(AuthIntentTokenError);
  });

  it("expires with only the safe recovery intent and refuses unreasonable clock values", () => {
    const token = createAuthIntentToken(
      { action: "create_object", returnTo: "/garden" },
      { secret: SECRET, now: NOW },
    );

    let expiredError: unknown;
    try {
      verifyAuthIntentToken(token, {
        secret: SECRET,
        now: NOW + 15 * 60_000 + 1,
      });
    } catch (error) {
      expiredError = error;
    }
    expect(expiredError).toMatchObject({ code: "expired" });

    expect(() =>
      createAuthIntentToken(
        { action: "save", returnTo: "/garden" },
        { secret: SECRET, now: Number.NaN },
      ),
    ).toThrow(AuthIntentTokenError);
  });
});
