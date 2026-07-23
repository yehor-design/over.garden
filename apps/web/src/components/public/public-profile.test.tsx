import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PublicProfileEvidencePage } from "@/server/public-profile-repository";

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
}));

vi.mock("@/app/[locale]/[profileHandle]/actions", () => ({
  followProfileAction: vi.fn(),
  unfollowProfileAction: vi.fn(),
  reportProfileAction: vi.fn(),
  blockProfileAction: vi.fn(),
}));

const PROFILE: PublicProfileEvidencePage = {
  handle: "demo_olena",
  mention: "@demo_olena",
  displayName: "Олена · міський сад",
  avatarUrl: "https://cdn.example/avatar.webp",
  avatarAlt: "Олена у саду",
  bio: "Вирощую їстівний балкон і записую чесні результати.",
  languages: ["uk", "bg"],
  coarseRegionCode: "UA-30",
  summary: {
    publicEntryCount: 18,
    publicObjectCount: 7,
    objectKinds: { plant: 5, animal: 1, beeColony: 1 },
    confirmedLineageEdgeCount: 4,
    relationships: { followers: 21, following: 9 },
  },
  objects: Array.from({ length: 7 }, (_, index) => ({
    objectId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    displayName: index === 0 ? "Томат Чорний принц" : `Об’єкт ${index + 1}`,
    objectKind: index === 5 ? "animal" : index === 6 ? "bee_colony" : "plant",
    identityLabel: index === 0 ? "Solanum lycopersicum" : null,
    identityState: index === 0 ? "confirmed" : "unknown",
    latestEntryDate: "2026-07-10",
    publicEntryCount: index + 1,
    publicPath: `/lineage/objects/00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    coverImageUrl: index === 0 ? "https://cdn.example/tomato.webp" : null,
    coverImageAlt: "Томат на балконі",
    coverFocalX: index === 0 ? 0.5 : null,
    coverFocalY: index === 0 ? 0.5 : null,
    coverIntrinsicWidth: index === 0 ? 800 : null,
    coverIntrinsicHeight: index === 0 ? 600 : null,
  })),
  journals: Array.from({ length: 9 }, (_, index) => ({
    entryId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: index === 0 ? "Перший урожай після спеки" : `Запис ${index + 1}`,
    bodyPreview: "Що спрацювало, що ні, і що зміню наступного тижня.",
    entryDate: "2026-07-09",
    publishedAt: "2026-07-09T12:00:00.000Z",
    publicPath: `/journal/demo-entry-${index + 1}`,
    context: {
      kind: "object",
      label: "Томат Чорний принц",
      publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000000",
      objectKind: "plant",
    },
    coverImageUrl: null,
    coverImageAlt: "Томат Чорний принц",
    coverFocalX: null,
    coverFocalY: null,
    coverIntrinsicWidth: null,
    coverIntrinsicHeight: null,
  })),
  hasMoreObjects: false,
  hasMoreJournals: false,
};

describe("PublicProfileView", () => {
  it("renders object evidence before journals and identity details", async () => {
    const { PublicProfileView } = await import("./public-profile");
    const html = renderToStaticMarkup(
      <PublicProfileView
        profile={PROFILE}
        locale="uk"
        viewer={{ kind: "guest" }}
      />,
    );

    expect(html).toContain('data-public-profile="v2"');
    expect(html).toMatch(/<h1[^>]*>Олена · міський сад<\/h1>/);
    expect(html).toContain(
      'data-profile-content-order="objects-journals-about"',
    );
    expect(html.indexOf("Живі об’єкти")).toBeLessThan(
      html.indexOf("Журнал догляду"),
    );
    expect(html.indexOf("Журнал догляду")).toBeLessThan(
      html.indexOf("Про садівника"),
    );
    expect(html).toContain("Томат Чорний принц");
    expect(html).toContain("Перший урожай після спеки");
    expect(html).toContain('aria-label="Перший урожай після спеки"');
    expect(html).toContain("Показати ще 1");
    expect(html).toContain('data-auth-intent-control="follow"');
    expect(html).toContain('data-auth-intent-control="report"');
    expect(html).toContain('data-auth-intent-control="block"');
    expect(html).toContain('action="/auth/intent/start"');
    expect(html).toContain('name="targetKind" value="profile"');
    expect(html).toContain('name="targetRef" value="demo_olena"');
    expect(html).not.toContain('name="control"');
    expect(html).toContain('id="lineage-follow"');
    expect(html).toContain('id="profile-block"');
    expect(html).toContain("Ukraine");
    expect(html).not.toContain("Kyiv City");
    expect(html).not.toMatch(
      /userId|email|session|quarantine|derivative_key|owner_user_id|precise|latitude|longitude/i,
    );
  });

  it("opens and exposes the exact authenticated action after an auth-intent resume", async () => {
    const { PublicProfileView } = await import("./public-profile");
    const html = renderToStaticMarkup(
      <PublicProfileView
        profile={PROFILE}
        locale="uk"
        viewer={{ kind: "not_following" }}
        resumeAction="report"
      />,
    );

    expect(html).toContain(
      '<details class="group w-full sm:relative sm:w-auto" id="profile-report" open="">',
    );
    expect(html).toContain(
      'class="absolute inset-x-0 top-11 z-20 grid w-auto gap-3 rounded-md border border-border bg-background p-3 shadow-lg sm:right-0 sm:left-auto sm:w-64"',
    );
    expect(html).toContain('data-auth-intent-control="report"');
    expect(html).toContain('data-auth-intent-control="block"');
  });

  it("renders a useful owner empty state without inventing public evidence", async () => {
    const { PublicProfileView } = await import("./public-profile");
    const html = renderToStaticMarkup(
      <PublicProfileView
        profile={{
          ...PROFILE,
          objects: [],
          journals: [],
          hasMoreObjects: false,
          hasMoreJournals: false,
          summary: {
            ...PROFILE.summary,
            publicEntryCount: 0,
            publicObjectCount: 0,
          },
        }}
        locale="uk"
        viewer={{ kind: "owner" }}
      />,
    );

    expect(html).toContain("Додати перший об’єкт");
    expect(html).toContain("Редагувати профіль");
    expect(html).not.toContain('data-auth-intent-control="follow"');
  });
});
