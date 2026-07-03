import { describe, expect, it } from "vitest";

import {
  gardenFirstEntryHomepagePath,
  gardenFirstEntryInvitePath,
  gardenFirstEntryPreselectionPath,
  lineageInvitationClaimPath,
  pilotInviteJoinPath,
  pilotInviteJoinUrl,
  publicLineageObjectPath,
} from "./public-paths";

describe("garden public paths", () => {
  it("builds a homepage start path with enum-only source attribution", () => {
    expect(gardenFirstEntryHomepagePath()).toBe("/garden?source=homepage");
  });

  it("builds an invite start path carrying only the enum cohort source", () => {
    const path = gardenFirstEntryInvitePath();

    expect(path).toBe("/garden?source=invited-cohort");
    expect(path).not.toContain("invite=");
    expect(path).not.toContain("email");
    expect(path).not.toContain("token");
    expect(path).not.toContain("referrer");
  });

  it("builds public variety preselection without raw referrer or display text", () => {
    const path = gardenFirstEntryPreselectionPath("pomidor-cheri-0000000101");

    expect(path).toBe(
      "/garden?catalog=pomidor-cheri-0000000101&source=public-variety",
    );
    expect(path).not.toContain("referrer");
    expect(path).not.toContain("display");
    expect(path).not.toContain("title");
  });

  it("builds a join invite path with only the signed token query param", () => {
    const token = "v1.payload.signature";
    const path = pilotInviteJoinPath(token);

    expect(path).toBe(`/join?invite=${encodeURIComponent(token)}`);
    expect(path).not.toContain("email");
    expect(path).not.toContain("referrer");
  });

  it("builds a lineage invitation claim path with only the scoped token", () => {
    const token = "v1.payload.signature";
    const path = lineageInvitationClaimPath(token);

    expect(path).toBe(
      `/garden/lineage/invitations/claim?token=${encodeURIComponent(token)}`,
    );
    expect(path).not.toContain("email");
    expect(path).not.toContain("phone");
    expect(path).not.toContain("referrer");
    expect(path).not.toContain("display");
  });

  it("builds a noindex public lineage object path without contact or token params", () => {
    const objectId = "00000000-0000-4000-8000-000000000101";
    const path = publicLineageObjectPath(objectId);

    expect(path).toBe(`/lineage/objects/${objectId}`);
    expect(path).not.toContain("token");
    expect(path).not.toContain("email");
    expect(path).not.toContain("phone");
    expect(path).not.toContain("referrer");
  });

  it("builds a full invite URL from a base origin and token", () => {
    const url = pilotInviteJoinUrl(
      "v1.payload.signature",
      "https://over.garden",
    );

    expect(url).toBe("https://over.garden/join?invite=v1.payload.signature");
  });
});
