import { describe, expect, it } from "vitest";

import { normalizeJournalMentionSelections } from "@/lib/garden/journal-mentions";
import {
  PUBLIC_HANDLE_MENTION_TOKEN_MAX_LENGTH,
  sealPublicHandleMentionTarget,
  unsealPublicHandleMentionTarget,
} from "@/server/public-handle-mention-token";

const SECRET = "ove-203-public-handle-token-test-secret-with-adequate-length";
const TARGET_USER_ID = "00000000-0000-4000-8000-000000000010";
const AUDIENCE_USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_AUDIENCE_USER_ID = "00000000-0000-4000-8000-000000000002";

describe("public handle mention target token", () => {
  it("round-trips one stable target through a bounded opaque non-expiring token", () => {
    const token = sealPublicHandleMentionTarget(TARGET_USER_ID, {
      audienceUserId: AUDIENCE_USER_ID,
      secret: SECRET,
    });

    expect(token).toMatch(
      /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(token).not.toContain(TARGET_USER_ID);
    expect(token).not.toContain(AUDIENCE_USER_ID);
    expect(token.length).toBeLessThanOrEqual(
      PUBLIC_HANDLE_MENTION_TOKEN_MAX_LENGTH,
    );
    expect(
      normalizeJournalMentionSelections([
        { kind: "public_handle", id: token, label: "@former_handle" },
      ]),
    ).toEqual([{ kind: "public_handle", id: token, label: "@former_handle" }]);

    expect(
      unsealPublicHandleMentionTarget(token, {
        audienceUserId: AUDIENCE_USER_ID,
        secret: SECRET,
      }),
    ).toBe(TARGET_USER_ID);
  });

  it("uses randomized authenticated encryption without changing target identity", () => {
    const first = sealPublicHandleMentionTarget(TARGET_USER_ID, {
      audienceUserId: AUDIENCE_USER_ID,
      secret: SECRET,
    });
    const second = sealPublicHandleMentionTarget(TARGET_USER_ID, {
      audienceUserId: AUDIENCE_USER_ID,
      secret: SECRET,
    });

    expect(first).not.toBe(second);
    for (const token of [first, second]) {
      expect(
        unsealPublicHandleMentionTarget(token, {
          audienceUserId: AUDIENCE_USER_ID,
          secret: SECRET,
        }),
      ).toBe(TARGET_USER_ID);
    }
  });

  it("fails closed for tampering, transfer to another audience, and a wrong secret", () => {
    const token = sealPublicHandleMentionTarget(TARGET_USER_ID, {
      audienceUserId: AUDIENCE_USER_ID,
      secret: SECRET,
    });
    const segments = token.split(".");
    const tag = segments[3] ?? "";
    const tampered = [
      segments[0],
      segments[1],
      segments[2],
      `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`,
    ].join(".");

    expect(
      unsealPublicHandleMentionTarget(tampered, {
        audienceUserId: AUDIENCE_USER_ID,
        secret: SECRET,
      }),
    ).toBeNull();
    expect(
      unsealPublicHandleMentionTarget(token, {
        audienceUserId: OTHER_AUDIENCE_USER_ID,
        secret: SECRET,
      }),
    ).toBeNull();
    expect(
      unsealPublicHandleMentionTarget(token, {
        audienceUserId: AUDIENCE_USER_ID,
        secret: `${SECRET}-different`,
      }),
    ).toBeNull();
  });

  it("returns the same generic null result for raw UUIDs and malformed tokens", () => {
    for (const candidate of [
      TARGET_USER_ID,
      "v2.invalid.payload.tag",
      "v1.invalid.payload.tag.extra",
      "x".repeat(PUBLIC_HANDLE_MENTION_TOKEN_MAX_LENGTH + 1),
      "",
      null,
      undefined,
    ]) {
      expect(
        unsealPublicHandleMentionTarget(candidate, {
          audienceUserId: AUDIENCE_USER_ID,
          secret: SECRET,
        }),
      ).toBeNull();
    }
  });

  it("rejects invalid seal inputs without echoing either identifier", () => {
    for (const attempt of [
      () =>
        sealPublicHandleMentionTarget("not-a-user-id", {
          audienceUserId: AUDIENCE_USER_ID,
          secret: SECRET,
        }),
      () =>
        sealPublicHandleMentionTarget(TARGET_USER_ID, {
          audienceUserId: "not-an-audience-id",
          secret: SECRET,
        }),
      () =>
        sealPublicHandleMentionTarget(TARGET_USER_ID, {
          audienceUserId: AUDIENCE_USER_ID,
          secret: "too-short",
        }),
    ]) {
      expect(attempt).toThrow("Public handle mention target is invalid.");
    }
  });
});
