import { describe, expect, it } from "vitest";

import {
  signLineageInviteToken,
  verifyLineageInviteToken,
} from "./lineage-invite-token";

const pendingIdentityId = "00000000-0000-4000-8000-000000000301";
const edgeId = "00000000-0000-4000-8000-000000000201";
const createdAt = new Date("2026-07-03T18:00:00.000Z");
const secret = "lineage-invite-test-secret";

describe("lineage invitation tokens", () => {
  it("signs and verifies only edge-scoped pending identity metadata", () => {
    const token = signLineageInviteToken({
      pendingIdentityId,
      edgeId,
      createdAt,
      secret,
    });

    const verified = verifyLineageInviteToken(token, {
      now: createdAt.getTime(),
      secret,
    });

    expect(verified).toEqual({
      pendingIdentityId,
      edgeId,
      expiresAt: Math.floor(createdAt.getTime() / 1000) + 30 * 24 * 60 * 60,
    });

    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    expect(payload).toEqual({
      p: pendingIdentityId,
      e: edgeId,
      iat: Math.floor(createdAt.getTime() / 1000),
      exp: Math.floor(createdAt.getTime() / 1000) + 30 * 24 * 60 * 60,
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /email|phone|contact|url|referrer|ip|user_agent|coordinate|latitude|longitude/i,
    );
  });

  it("rejects tampered or expired tokens", () => {
    const token = signLineageInviteToken({
      pendingIdentityId,
      edgeId,
      createdAt,
      ttlSeconds: 60,
      secret,
    });

    expect(
      verifyLineageInviteToken(`${token.slice(0, -2)}xx`, {
        now: createdAt.getTime(),
        secret,
      }),
    ).toBeNull();
    expect(
      verifyLineageInviteToken(token, {
        now: createdAt.getTime() + 61_000,
        secret,
      }),
    ).toBeNull();
  });
});
