import { describe, expect, it } from "vitest";

import type { AuthSecretConfiguration } from "@/lib/auth-secret";
import {
  signLineageInviteToken,
  verifyLineageInviteToken,
} from "./lineage-invite-token";

const pendingIdentityId = "00000000-0000-4000-8000-000000000301";
const edgeId = "00000000-0000-4000-8000-000000000201";
const createdAt = new Date("2026-07-03T18:00:00.000Z");
const secret = "lineage-invite-test-secret";
const currentSecret = Buffer.alloc(32, 10).toString("base64url");
const legacySecret = "lineage-invite-legacy-secret-with-at-least-thirty-two";
const twoKeyConfiguration: AuthSecretConfiguration = {
  health: { class: "versioned_current", activeVersion: 2 },
  active: { version: 2, value: currentSecret },
  versionedSecrets: [{ version: 2, value: currentSecret }],
  legacySecret,
};
const legacyTransitionConfiguration: AuthSecretConfiguration = {
  health: { class: "legacy_transition" },
  active: { version: 0, value: legacySecret },
  versionedSecrets: [],
  legacySecret,
};
const localFallbackConfiguration: AuthSecretConfiguration = {
  health: { class: "local_fallback", activeVersion: 0 },
  active: { version: 0, value: currentSecret },
  versionedSecrets: [],
};

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

  it("uses a current key label for Better Auth fallback material and one legacy reader", () => {
    const current = signLineageInviteToken({
      pendingIdentityId,
      edgeId,
      createdAt,
      authSecrets: twoKeyConfiguration,
    });
    const legacy = signLineageInviteToken({
      pendingIdentityId,
      edgeId,
      createdAt,
      secret: legacySecret,
    });

    expect(current).toMatch(/^v2\.2\./);
    expect(
      verifyLineageInviteToken(current, {
        now: createdAt.getTime(),
        authSecrets: twoKeyConfiguration,
      }),
    ).not.toBeNull();
    expect(
      verifyLineageInviteToken(legacy, {
        now: createdAt.getTime(),
        authSecrets: twoKeyConfiguration,
      }),
    ).not.toBeNull();
    expect(
      verifyLineageInviteToken(current.replace(/^v2\.2\./, "v2.7."), {
        now: createdAt.getTime(),
        authSecrets: twoKeyConfiguration,
      }),
    ).toBeNull();
  });

  it("uses v1 only for legacy transition and retains isolated local fallback reads", () => {
    const legacyToken = signLineageInviteToken({
      pendingIdentityId,
      edgeId,
      createdAt,
      authSecrets: legacyTransitionConfiguration,
    });
    const localToken = signLineageInviteToken({
      pendingIdentityId,
      edgeId,
      createdAt,
      authSecrets: localFallbackConfiguration,
    });

    expect(legacyToken).toMatch(/^v1\./);
    expect(
      verifyLineageInviteToken(legacyToken, {
        now: createdAt.getTime(),
        authSecrets: legacyTransitionConfiguration,
      }),
    ).not.toBeNull();
    expect(localToken).toMatch(/^v2\.0\./);
    expect(
      verifyLineageInviteToken(localToken, {
        now: createdAt.getTime(),
        authSecrets: localFallbackConfiguration,
      }),
    ).not.toBeNull();
  });
});
