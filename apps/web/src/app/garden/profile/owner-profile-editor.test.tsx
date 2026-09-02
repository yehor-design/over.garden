import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OwnerProfileWorkspace } from "@/server/owner-profile-repository";

const reactMocks = vi.hoisted(() => ({ handlePending: false }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useActionState: vi.fn(
      (_action: unknown, initialState: unknown) =>
        [initialState, vi.fn(), reactMocks.handlePending] as const,
    ),
  };
});

vi.mock("./actions", () => ({
  updatePublicHandleAction: vi.fn(),
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
    relationshipVisibility: "counts",
  },
  handleRename: {
    currentHandle: "demo_olena",
    nextEligibleAt: "2026-07-18T00:00:00.000Z",
    canRename: true,
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
      objectKinds: { plant: 0, animal: 0 },
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
  beforeEach(() => {
    reactMocks.handlePending = false;
  });

  it("renders every bounded setting and the exact public preview component", async () => {
    const { OwnerProfileEditor } = await import("./owner-profile-editor");
    const html = renderToStaticMarkup(
      <OwnerProfileEditor workspace={WORKSPACE} locale="uk" status={null} />,
    );

    expect(html).toContain('data-owner-profile-editor="v3"');
    expect(html).toContain('name="avatarMediaAssetId"');
    expect(html).toContain('name="handle"');
    expect(html).toContain('noValidate=""');
    expect(html.match(/name="handle"/g)).toHaveLength(1);
    expect(html.indexOf('name="handle"')).toBeLessThan(
      html.indexOf('name="displayName"'),
    );
    expect(html).toContain('name="displayName"');
    expect(html).toContain('name="bio"');
    expect(html).toContain('name="languages"');
    expect(html).toContain('name="locationVisibility"');
    expect(html).toContain('name="coarseRegionCode"');
    expect(html).toContain('name="relationshipVisibility"');
    expect(html).toContain('data-public-profile="v2"');
    expect(html).toContain('data-public-preview-audience="visitor"');
    expect(html).not.toContain("<h1");
    expect(html).toMatch(/<h3[^>]*>Олена<\/h3>/);
    expect(html).toContain('data-auth-intent-control="follow"');
    expect(html).toContain('data-auth-intent-control="report"');
    expect(html).toContain('data-auth-intent-control="block"');
    expect(html).not.toContain("Редагувати профіль");
    expect(html).toContain("Додайте живий об’єкт");
    expect(html).not.toMatch(
      /email|provider|session|quarantine|derivative_key|owner_user_id|latitude|longitude/i,
    );
  });

  it.each([
    ["uk", "Нік можна буде змінити після"],
    ["bg", "Ще можете да промените потребителското име след"],
    ["ru", "Ник можно будет изменить после"],
  ] as const)(
    "renders the authoritative cooldown and safe 320px wrapping in %s",
    async (locale, cooldownCopy) => {
      const { OwnerProfileEditor } = await import("./owner-profile-editor");
      const longHandle = "a".repeat(30);
      const html = renderToStaticMarkup(
        <OwnerProfileEditor
          workspace={{
            ...WORKSPACE,
            editor: { ...WORKSPACE.editor, handle: longHandle },
            handleRename: {
              currentHandle: longHandle,
              nextEligibleAt: "2026-08-17T10:00:00.000Z",
              canRename: false,
            },
            preview: {
              ...WORKSPACE.preview,
              handle: longHandle,
              mention: `@${longHandle}`,
            },
          }}
          locale={locale}
          status={null}
        />,
      );

      expect(html).toContain(cooldownCopy);
      expect(html).toContain("2026");
      expect(html).toContain("break-all");
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/);
    },
  );

  it.each(["uk", "bg", "ru"] as const)(
    "associates a moderated display-name rejection with its input in %s",
    async (locale) => {
      const { OwnerProfileEditor } = await import("./owner-profile-editor");
      const html = renderToStaticMarkup(
        <OwnerProfileEditor
          workspace={WORKSPACE}
          locale={locale}
          status="display_name_unavailable"
        />,
      );

      expect(html).toMatch(
        /<input(?=[^>]*name="displayName")(?=[^>]*aria-invalid="true")(?=[^>]*aria-describedby="public-profile-status")[^>]*>/,
      );
      expect(html).toContain('id="public-profile-status"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
    },
  );

  it("keeps the submitted handle visible but read-only while its action is pending", async () => {
    reactMocks.handlePending = true;
    const { OwnerProfileEditor } = await import("./owner-profile-editor");
    const html = renderToStaticMarkup(
      <OwnerProfileEditor workspace={WORKSPACE} locale="uk" status={null} />,
    );
    const handleInput = html.match(
      /<input(?=[^>]*name="handle")(?=[^>]*value="demo_olena")(?=[^>]*readonly="")(?=[^>]*aria-busy="true")[^>]*>/i,
    )?.[0];

    expect(handleInput).toBeDefined();
    expect(handleInput).not.toContain("disabled");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg/);
  });
});
