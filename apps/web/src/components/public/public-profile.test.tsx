import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PublicProfileEvidencePage } from "@/server/public-profile-repository";

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
}));

// The tabs are a real client component and `Tabs` is rendered for real here —
// only the router underneath it is stubbed, because a `router.replace` is a
// browser fact and `tests/public-profile.spec.ts` is where it is proven.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/uk/@demo_olena",
  useSearchParams: () => new URLSearchParams(),
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
    objectKinds: { plant: 5, animal: 2 },
    confirmedLineageEdgeCount: 4,
    relationships: { followers: 21, following: 9 },
  },
  objects: Array.from({ length: 7 }, (_, index) => ({
    objectId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    displayName: index === 0 ? "Томат Чорний принц" : `Об’єкт ${index + 1}`,
    objectKind: index >= 5 ? "animal" : "plant",
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
    coverPlaceholderDataUri: null,
    coverVariantLongEdges: [],
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
    coverPlaceholderDataUri: null,
    coverVariantLongEdges: [],
  })),
  hasMoreObjects: false,
  hasMoreJournals: false,
};

describe("PublicProfileView", () => {
  it("is a header, three tabs and the gardener's own work — in that order", async () => {
    const { PublicProfileView } = await import("./public-profile");
    const html = renderToStaticMarkup(
      <PublicProfileView
        profile={PROFILE}
        locale="uk"
        viewer={{ kind: "guest" }}
      />,
    );

    expect(html).toContain('data-public-profile="v2"');
    expect(html).toContain('data-slot="profile-header"');
    // The name is the page's one `h1`; the handle and the bio sit under it.
    expect(html).toMatch(/<h1[^>]*>Олена · міський сад<\/h1>/);
    expect(html).toContain("@demo_olena");
    expect(html).toContain(
      "Вирощую їстівний балкон і записую чесні результати.",
    );

    // Real tabs, in the order the profile reads: objects, entries, about.
    expect(html).toContain('role="tablist"');
    const tabLabels = [...html.matchAll(/role="tab"[^>]*>([^<]*)</gu)].map(
      (match) => match[1],
    );
    expect(tabLabels).toEqual([
      "Живі об’єкти",
      "Журнал догляду",
      "Про садівника",
    ]);

    // Roving tabindex: exactly one tab is reachable with Tab, and it is the
    // selected one. The rest are reached with the arrow keys.
    const tabIndexes = [...html.matchAll(/role="tab"[^>]*tabindex="(-?\d)"/gu)]
      .map((match) => match[1]);
    expect(tabIndexes).toEqual(["0", "-1", "-1"]);
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"/u);

    // Every panel is in the HTML whichever tab is open, so the entries stay
    // indexable — the unselected ones are `hidden`, not dropped.
    expect([...html.matchAll(/role="tabpanel"/gu)]).toHaveLength(3);
    expect([...html.matchAll(/role="tabpanel"[^>]*hidden=""/gu)]).toHaveLength(
      2,
    );

    expect(html).toContain("Томат Чорний принц");
    expect(html).toContain("Перший урожай після спеки");
    expect(html).toContain('data-slot="entry-card"');
    expect(html).toContain("Показати ще 1");
    expect(html).toContain("Ukraine");
    expect(html).not.toContain("Kyiv City");
    expect(html).not.toMatch(
      /userId|email|session|quarantine|derivative_key|owner_user_id|precise|latitude|longitude/i,
    );

    // The profile no longer reaches for the pre-redesign palette. This is the
    // cheapest way to catch a half-migrated surface: those names still resolve
    // to colours, so a leftover renders fine and looks wrong (DESIGN.md §2.1).
    expect(html).not.toContain("text-muted-foreground");
    expect(html).not.toContain("text-foreground");
    expect(html).not.toContain("bg-muted");
    expect(html).not.toContain("hover:text-primary");
  });

  it("opens the tab the URL names, and no other", async () => {
    const { PublicProfileView } = await import("./public-profile");
    const html = renderToStaticMarkup(
      <PublicProfileView
        profile={PROFILE}
        locale="uk"
        viewer={{ kind: "guest" }}
        activeTab="entries"
      />,
    );

    // The server decides the open panel, so a shared `?tab=entries` link
    // paints the entries without waiting for hydration.
    expect(html).toContain('data-profile-tab="entries"');
    const panels = [...html.matchAll(/role="tabpanel"([^>]*)>/gu)].map(
      (match) => match[1],
    );
    expect(panels).toHaveLength(3);
    expect(panels.filter((panel) => !panel.includes("hidden"))).toHaveLength(1);
    expect(panels[1]).not.toContain("hidden");
  });

  it("names the follow control with the state it will produce", async () => {
    const { PublicProfileView } = await import("./public-profile");
    const following = renderToStaticMarkup(
      <PublicProfileView
        profile={PROFILE}
        locale="uk"
        viewer={{ kind: "following" }}
      />,
    );
    const stranger = renderToStaticMarkup(
      <PublicProfileView
        profile={PROFILE}
        locale="uk"
        viewer={{ kind: "not_following" }}
      />,
    );

    // DESIGN.md §5.6. "Стежити" alone does not say whose profile, and in a
    // list of controls a screen reader reads them one after another.
    expect(stranger).toContain(
      'aria-label="Стежити, Олена · міський сад"',
    );
    expect(following).toContain(
      'aria-label="Не стежити, Олена · міський сад"',
    );
  });

  it("omits a count that is zero and says so when one is hidden", async () => {
    const { PublicProfileView } = await import("./public-profile");
    const html = renderToStaticMarkup(
      <PublicProfileView
        profile={{
          ...PROFILE,
          summary: {
            ...PROFILE.summary,
            publicObjectCount: 0,
            relationships: null,
          },
        }}
        locale="uk"
        viewer={{ kind: "guest" }}
      />,
    );

    // A row of zeros tells a visitor only that nothing is happening; the
    // empty state below already says it in words.
    const header = html.slice(
      html.indexOf('data-slot="profile-header"'),
      html.indexOf('role="tablist"'),
    );
    expect(header).not.toContain("Об’єкти");
    expect(header).toContain("Записи");
    expect(header).not.toContain("Стежать");
    // Hidden is not the same as zero, and the page says which one this is.
    expect(html).toContain("Лічильники підписок приховані.");
  });

  it("still exposes the exact authenticated action after an auth-intent resume", async () => {
    const { PublicProfileView } = await import("./public-profile");
    const html = renderToStaticMarkup(
      <PublicProfileView
        profile={PROFILE}
        locale="uk"
        viewer={{ kind: "guest" }}
        resumeAction="report"
      />,
    );

    expect(html).toContain('id="profile-report"');
    expect(html).toContain("open=\"\"");
    expect(html).toContain('data-auth-intent-control="report"');
    expect(html).toContain('data-auth-intent-control="block"');
    expect(html).toContain('action="/auth/intent/start"');
    expect(html).toContain('name="targetKind" value="profile"');
    expect(html).toContain('name="targetRef" value="demo_olena"');
    expect(html).toContain('id="lineage-follow"');
    expect(html).toContain('id="profile-block"');
  });

  it("shows the first-run empty state, with its illustration, to the owner", async () => {
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

    expect(html).toContain('data-screen-state="empty-first-run"');
    expect(html).toContain("/illustrations/empty-garden");
    expect(html).toContain("Додати перший об’єкт");
    expect(html).toContain("Редагувати профіль");
    expect(html).not.toContain('data-auth-intent-control="follow"');
  });

  it("shows a stranger nothing-yet without an illustration or an invitation", async () => {
    const { PublicProfileView } = await import("./public-profile");
    const html = renderToStaticMarkup(
      <PublicProfileView
        profile={{ ...PROFILE, objects: [], journals: [] }}
        locale="uk"
        viewer={{ kind: "guest" }}
      />,
    );

    // A visitor cannot add this gardener's first object, so the state is
    // "no results", which DESIGN.md §5.4 says carries no picture.
    expect(html).toContain('data-screen-state="empty-no-results"');
    expect(html).not.toContain("/illustrations/");
    expect(html).not.toContain("Додати перший об’єкт");
  });
});
