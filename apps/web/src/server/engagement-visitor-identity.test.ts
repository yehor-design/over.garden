import { describe, expect, it } from "vitest";

import type { AuthSecretConfiguration } from "@/lib/auth-secret";
import {
  ENGAGEMENT_VISITOR_COOKIE_MAX_AGE_SECONDS,
  ENGAGEMENT_VISITOR_COOKIE_NAME,
  issueEngagementVisitorIdentity,
  verifyEngagementVisitorIdentity,
} from "./engagement-visitor-identity";

const secret = Buffer.alloc(32, 11).toString("base64url");
const secrets: AuthSecretConfiguration = {
  health: { class: "versioned_current", activeVersion: 3 },
  active: { version: 3, value: secret },
  versionedSecrets: [{ version: 3, value: secret }],
};

const rotatedSecret = Buffer.alloc(32, 12).toString("base64url");
const rotatedSecrets: AuthSecretConfiguration = {
  health: { class: "versioned_current", activeVersion: 9 },
  active: { version: 9, value: rotatedSecret },
  versionedSecrets: [{ version: 9, value: rotatedSecret }],
};

describe("engagement visitor identity", () => {
  it("is one signed id for the whole site, not one per target", () => {
    const identity = issueEngagementVisitorIdentity({ authSecrets: secrets });

    expect(ENGAGEMENT_VISITOR_COOKIE_NAME).toBe("og_visitor");
    expect(identity.token.split(".")).toHaveLength(4);
    expect(identity.token.startsWith("v1.3.")).toBe(true);
    // The retired capability carried the target inside its payload, which is
    // what made its length grow with the slug and overflow its own check.
    expect(identity.token).not.toContain("journal_entry");
    expect(identity.token.length).toBeLessThan(160);
  });

  it("outlives a season, so a reader can still take back what they liked", () => {
    // One year. A short cookie would silently orphan somebody's own rows.
    expect(ENGAGEMENT_VISITOR_COOKIE_MAX_AGE_SECONDS).toBe(365 * 24 * 60 * 60);
  });

  it("reads its own id back", () => {
    const identity = issueEngagementVisitorIdentity({ authSecrets: secrets });

    expect(
      verifyEngagementVisitorIdentity(identity.token, {
        authSecrets: secrets,
      }),
    ).toEqual(identity);
  });

  it("mints a different id every time", () => {
    const first = issueEngagementVisitorIdentity({ authSecrets: secrets });
    const second = issueEngagementVisitorIdentity({ authSecrets: secrets });

    expect(first.visitorId).not.toBe(second.visitorId);
  });

  it("refuses a token it did not sign", () => {
    const identity = issueEngagementVisitorIdentity({ authSecrets: secrets });
    const [version, secretVersion, visitorId] = identity.token.split(".");

    for (const forged of [
      `${version}.${secretVersion}.${visitorId}.not-a-signature`,
      `${version}.${secretVersion}.00000000-0000-4000-8000-000000000000.${identity.token.split(".")[3]}`,
      "not-a-token",
      "",
      "v1.3.not-a-uuid.sig",
      `v1.3.${visitorId}`,
    ]) {
      expect(
        verifyEngagementVisitorIdentity(forged, { authSecrets: secrets }),
      ).toBeNull();
    }
  });

  it("retires a visitor whose signing secret is gone rather than trusting it", () => {
    const identity = issueEngagementVisitorIdentity({ authSecrets: secrets });

    expect(
      verifyEngagementVisitorIdentity(identity.token, {
        authSecrets: rotatedSecrets,
      }),
    ).toBeNull();
  });

  it("refuses an oversized value before doing any work", () => {
    expect(
      verifyEngagementVisitorIdentity("v1.3." + "a".repeat(400), {
        authSecrets: secrets,
      }),
    ).toBeNull();
  });
});
