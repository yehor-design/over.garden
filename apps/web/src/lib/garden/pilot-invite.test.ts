import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

import {
  DEFAULT_PILOT_INVITE_COHORT,
  DEV_PILOT_INVITE_SECRET,
  isPilotInviteCohort,
  isUsingDevPilotInviteSecret,
  signPilotInviteToken,
  verifyPilotInviteToken,
} from "./pilot-invite";

const SECRET = "test-pilot-invite-secret-aaaaaaaaaaaaaaaaaaaaaaaa";
const NOW = Date.UTC(2026, 5, 29, 12, 0, 0);

describe("pilot invite token contract", () => {
  it("signs and verifies a bounded enum-only cohort token", () => {
    const token = signPilotInviteToken({
      now: NOW,
      secret: SECRET,
      segment: "casual_practical_beginner",
    });
    const verified = verifyPilotInviteToken(token, {
      now: NOW,
      secret: SECRET,
    });

    expect(verified).not.toBeNull();
    expect(verified?.cohort).toBe(DEFAULT_PILOT_INVITE_COHORT);
    expect(verified?.segment).toBe("casual_practical_beginner");
    expect(verified?.expiresAt).toBeGreaterThan(Math.floor(NOW / 1000));
  });

  it("carries no PII, referrer, URL, or query data inside the token body", () => {
    const token = signPilotInviteToken({ now: NOW, secret: SECRET });
    const [, body] = token.split(".");
    const decoded = Buffer.from(body, "base64url").toString("utf8");

    // Only the enum cohort plus issued/expiry seconds are encoded.
    expect(JSON.parse(decoded)).toEqual({
      c: "closed_pilot",
      s: "unknown_segment",
      iat: Math.floor(NOW / 1000),
      exp: Math.floor(NOW / 1000) + 14 * 24 * 60 * 60,
    });
    expect(decoded).not.toMatch(
      /email|phone|name|ip|referrer|url|http|@|token/i,
    );
  });

  it("rejects a token signed with a different secret", () => {
    const token = signPilotInviteToken({ now: NOW, secret: SECRET });
    expect(
      verifyPilotInviteToken(token, { now: NOW, secret: "another-secret" }),
    ).toBeNull();
  });

  it("rejects a tampered token body", () => {
    const token = signPilotInviteToken({ now: NOW, secret: SECRET });
    const [version, , signature] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({
        c: "closed_pilot",
        s: "unknown_segment",
        iat: Math.floor(NOW / 1000),
        exp: Math.floor(NOW / 1000) + 999999,
      }),
      "utf8",
    ).toString("base64url");

    expect(
      verifyPilotInviteToken(`${version}.${forgedBody}.${signature}`, {
        now: NOW,
        secret: SECRET,
      }),
    ).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signPilotInviteToken({
      now: NOW,
      ttlSeconds: 60,
      secret: SECRET,
    });

    expect(
      verifyPilotInviteToken(token, {
        now: NOW + 61_000,
        secret: SECRET,
      }),
    ).toBeNull();
  });

  it("rejects malformed, empty, or wrong-version tokens", () => {
    expect(verifyPilotInviteToken(null, { secret: SECRET })).toBeNull();
    expect(verifyPilotInviteToken("", { secret: SECRET })).toBeNull();
    expect(
      verifyPilotInviteToken("not-a-token", { secret: SECRET }),
    ).toBeNull();
    expect(
      verifyPilotInviteToken("v2.body.signature", { secret: SECRET }),
    ).toBeNull();
  });

  it("rejects forged free-form segment metadata", () => {
    const version = "v1";
    const forgedBody = Buffer.from(
      JSON.stringify({
        c: "closed_pilot",
        s: "email@example.com",
        iat: Math.floor(NOW / 1000),
        exp: Math.floor(NOW / 1000) + 999999,
      }),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", SECRET)
      .update(`${version}.${forgedBody}`)
      .digest()
      .toString("base64url");

    expect(
      verifyPilotInviteToken(`${version}.${forgedBody}.${signature}`, {
        now: NOW,
        secret: SECRET,
      }),
    ).toBeNull();
  });

  it("recognizes the closed_pilot cohort and rejects unknown cohorts", () => {
    expect(isPilotInviteCohort("closed_pilot")).toBe(true);
    expect(isPilotInviteCohort("open_pilot")).toBe(false);
    expect(isPilotInviteCohort(undefined)).toBe(false);
  });

  it("flags when the insecure development fallback secret would be used", () => {
    expect(isUsingDevPilotInviteSecret(SECRET)).toBe(false);
    expect(isUsingDevPilotInviteSecret(DEV_PILOT_INVITE_SECRET)).toBe(true);
  });
});
