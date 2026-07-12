import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OwnerProfileWorkspace } from "@/server/owner-profile-repository";

vi.mock("./actions", () => ({
  updatePublicProfileAction: vi.fn(),
}));

vi.mock("@/app/[locale]/[profileHandle]/actions", () => ({
  followProfileAction: vi.fn(),
  unfollowProfileAction: vi.fn(),
  reportProfileAction: vi.fn(),
  blockProfileAction: vi.fn(),
}));

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
}));

const WORKSPACE: OwnerProfileWorkspace = {
  editor: {
    handle: "demo_olena",
    avatarMediaAssetId: "00000000-0000-4000-8000-000000000111",
    displayName: "Олена",
    bio: "Балконний город і чесні нотатки.",
    languages: ["uk", "bg"],
    locationVisibility: "region",
    coarseRegionCode: "UA-30",
    profileVisibility: "public",
    relationshipVisibility: "counts",
  },
  preview: {
    handle: "demo_olena",
    mention: "@demo_olena",
    displayName: "Олена",
    avatarUrl: "https://cdn.example/avatar.webp",
    avatarAlt: "Олена",
    bio: "Балконний город і чесні нотатки.",
    languages: ["uk", "bg"],
    coarseRegionCode: "UA-30",
    summary: {
      publicEntryCount: 0,
      publicObjectCount: 0,
      objectKinds: { plant: 0, animal: 0, beeColony: 0 },
      confirmedLineageEdgeCount: 0,
      relationships: { followers: 0, following: 0 },
    },
    objects: [],
    journals: [],
    hasMoreObjects: false,
    hasMoreJournals: false,
  },
  avatarOptions: [
    {
      mediaAssetId: "00000000-0000-4000-8000-000000000111",
      publicUrl: "https://cdn.example/avatar.webp",
      alt: "Олена",
    },
  ],
  relationshipCounts: { followers: 3, following: 2 },
  blockedProfiles: [],
};

describe("OwnerProfileEditor", () => {
  it("renders every bounded setting and the exact public preview component", async () => {
    const { OwnerProfileEditor } = await import("./owner-profile-editor");
    const html = renderToStaticMarkup(
      <OwnerProfileEditor workspace={WORKSPACE} locale="uk" status={null} />,
    );

    expect(html).toContain('data-owner-profile-editor="v2"');
    expect(html).toContain('name="avatarMediaAssetId"');
    expect(html).toContain('name="handle"');
    expect(html).toContain('name="displayName"');
    expect(html).toContain('name="bio"');
    expect(html).toContain('name="languages"');
    expect(html).toContain('name="locationVisibility"');
    expect(html).toContain('name="coarseRegionCode"');
    expect(html).toContain('name="profileVisibility"');
    expect(html).toContain('name="relationshipVisibility"');
    expect(html).toContain('data-public-profile="v2"');
    expect(html).toContain('data-public-preview-audience="visitor"');
    expect(html).toContain('data-auth-intent-control="follow"');
    expect(html).toContain('data-auth-intent-control="report"');
    expect(html).toContain('data-auth-intent-control="block"');
    expect(html).not.toContain("Редагувати профіль");
    expect(html).toContain("Додайте живий об’єкт");
    expect(html).not.toMatch(
      /email|provider|session|quarantine|derivative_key|owner_user_id|latitude|longitude/i,
    );
  });
});
