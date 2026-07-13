import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import { resolveVisualSocialMutationActor } from "./social-actor";

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

describe("visual social mutation actor", () => {
  it("resolves the manifest actor from a bounded return path", () => {
    const scenario = VISUAL_FIXTURE_MANIFEST.socialEvidence.scenarios.find(
      (candidate) => candidate.id === "comments-dense",
    )!;
    const formData = new FormData();
    formData.set("returnTo", scenario.path);

    expect(
      resolveVisualSocialMutationActor(formData, ["journal"], LOCAL_ENV),
    ).toEqual({ actorId: scenario.actorId, scenario });
  });

  it("accepts an explicit scenario only on its matching surface", () => {
    const formData = new FormData();
    formData.set("visualSocial", "notifications-dense");

    expect(
      resolveVisualSocialMutationActor(formData, ["notifications"], LOCAL_ENV)
        ?.actorId,
    ).toBe(
      VISUAL_FIXTURE_MANIFEST.socialEvidence.actorRoles.denseCollectionActorId,
    );
    expect(
      resolveVisualSocialMutationActor(formData, ["bookmarks"], LOCAL_ENV),
    ).toBeNull();
  });

  it("fails closed for conflicting fields, guest scenarios and Production", () => {
    const conflicting = new FormData();
    conflicting.set("visualSocial", "notifications-dense");
    conflicting.set(
      "returnTo",
      "/notifications?visualSocial=notifications-empty",
    );
    expect(
      resolveVisualSocialMutationActor(
        conflicting,
        ["notifications"],
        LOCAL_ENV,
      ),
    ).toBeNull();

    const guest = new FormData();
    guest.set("visualSocial", "comments-one");
    expect(
      resolveVisualSocialMutationActor(guest, ["journal"], LOCAL_ENV),
    ).toBeNull();

    const production = new FormData();
    production.set("visualSocial", "notifications-dense");
    expect(
      resolveVisualSocialMutationActor(production, ["notifications"], {
        ...LOCAL_ENV,
        VERCEL_ENV: "production",
      }),
    ).toBeNull();
  });
});
