import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import { resolveVisualCommunityMutationActor } from "./community-actor";

const LOCAL_ENV = {
  VISUAL_FIXTURES_ENABLED: "true",
  VISUAL_FIXTURES_TARGET: "local",
  VISUAL_FIXTURES_DATABASE: "overgarden",
  DATABASE_URL: "postgresql://overgarden:secret@localhost:5432/overgarden",
  R2_ENDPOINT: "http://localhost:9000",
  R2_PUBLIC_BASE_URL: "http://localhost:9000/overgarden-public",
  PUBLIC_SITE_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
} as const;

describe("visual community mutation actor", () => {
  it("resolves an actor only for the scenario's exact community", () => {
    const scenario = VISUAL_FIXTURE_MANIFEST.communityEvidence.scenarios.find(
      (candidate) => candidate.id === "ove184-community-member",
    )!;
    const formData = new FormData();
    formData.set("visualCommunity", scenario.id);
    formData.set("slug", scenario.communitySlug);

    expect(resolveVisualCommunityMutationActor(formData, LOCAL_ENV)).toEqual({
      actorId: scenario.actorId,
      scenario,
    });

    formData.set("slug", "visual-care-across-every-living-object");
    expect(resolveVisualCommunityMutationActor(formData, LOCAL_ENV)).toBeNull();
  });

  it("fails closed for guests, unknown scenarios, and Production", () => {
    const guest = new FormData();
    guest.set("visualCommunity", "ove184-community-guest");
    guest.set("slug", "visual-observation-and-care");
    expect(resolveVisualCommunityMutationActor(guest, LOCAL_ENV)).toBeNull();

    guest.set("visualCommunity", "unknown");
    expect(resolveVisualCommunityMutationActor(guest, LOCAL_ENV)).toBeNull();

    const member = new FormData();
    member.set("visualCommunity", "ove184-community-member");
    member.set("slug", "visual-observation-and-care");
    expect(
      resolveVisualCommunityMutationActor(member, {
        ...LOCAL_ENV,
        VERCEL_ENV: "production",
      }),
    ).toBeNull();
  });
});
