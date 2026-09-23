import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  PublicProfileEntry,
  PublicProfileEvidencePage,
  PublicProfileObjectEvidence,
} from "@/server/public-profile-repository";

// The tabs are a real client component and `Tabs` is rendered for real here —
// only the router underneath it is stubbed, because an address change is a
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

const AUTHOR = {
  handle: "demo_olena",
  displayName: "Олена · міський сад",
  avatarUrl: "https://cdn.example/avatar.webp",
  profilePath: "/@demo_olena",
};

function entry(index: number): PublicProfileEntry {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: index === 0 ? "Перший урожай після спеки" : `Запис ${index + 1}`,
    excerpt: "Що спрацювало, що ні, і що зміню наступного тижня.",
    excerptTruncated: false,
    sourceLanguage: "uk",
    entryDate: "2026-07-09",
    publishedAt: "2026-07-09T12:00:00.000Z",
    publicPath: `/@demo_olena/post/${index + 1}`,
    object:
      index === 1
        ? null
        : {
            id: "00000000-0000-4000-8000-000000000000",
            displayName: "Томат Чорний принц",
            kind: "plant",
            publicPath: "/@demo_olena/objects/tomat-chornyi-prynts",
            safeRegionCode: index === 0 ? "UA-30" : null,
          },
    space: index === 1 ? { displayName: "Балкон" } : null,
    author: AUTHOR,
    media:
      index === 0
        ? [
            {
              id: "20000000-0000-4000-8000-000000000001",
              publicUrl: "https://cdn.example/harvest.webp",
              focalX: 0.5,
              focalY: 0.5,
              intrinsicWidth: 800,
              intrinsicHeight: 600,
              placeholderDataUri: null,
              variantLongEdges: [],
              caption: "Перші помідори",
            },
          ]
        : [],
    topics: [],
  };
}

function object(index: number): PublicProfileObjectEvidence {
  return {
    objectId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    displayName: index === 0 ? "Томат Чорний принц" : `Об’єкт ${index + 1}`,
    objectKind: index >= 5 ? "animal" : "plant",
    identityLabel: index === 0 ? "Solanum lycopersicum" : null,
    identityState: index === 0 ? "confirmed" : "unknown",
    latestEntryDate: "2026-07-10",
    publicEntryCount: index + 1,
    publicPath: `/@demo_olena/objects/object-${index + 1}`,
    coverImageUrl: index === 0 ? "https://cdn.example/tomato.webp" : null,
    coverImageAlt: "Томат на балконі",
    coverFocalX: index === 0 ? 0.5 : null,
    coverFocalY: index === 0 ? 0.5 : null,
    coverIntrinsicWidth: index === 0 ? 800 : null,
    coverIntrinsicHeight: index === 0 ? 600 : null,
    coverPlaceholderDataUri: null,
    coverVariantLongEdges: [],
  };
}

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
    relationships: { followers: 21, following: 9 },
  },
  entries: {
    items: Array.from({ length: 10 }, (_, index) => entry(index)),
    page: 1,
    pageCount: 2,
  },
  objects: {
    items: Array.from({ length: 7 }, (_, index) => object(index)),
    page: 1,
    pageCount: 1,
  },
};

const EMPTY: PublicProfileEvidencePage = {
  ...PROFILE,
  summary: {
    ...PROFILE.summary,
    publicEntryCount: 0,
    publicObjectCount: 0,
    relationships: { followers: 0, following: 0 },
  },
  entries: { items: [], page: 1, pageCount: 1 },
  objects: { items: [], page: 1, pageCount: 1 },
};

async function render(
  props: Partial<
    React.ComponentProps<typeof import("./public-profile").PublicProfileView>
  > = {},
) {
  const { PublicProfileView } = await import("./public-profile");
  return renderToStaticMarkup(
    <PublicProfileView
      profile={PROFILE}
      locale="uk"
      viewer={{ kind: "guest" }}
      {...props}
    />,
  );
}

describe("PublicProfileView (OVE-494)", () => {
  it("is who the gardener is, then two tabs of what they published", async () => {
    const html = await render();

    expect(html).toContain('data-public-profile="v3"');
    expect(html).toContain('data-slot="profile-header"');
    // The name is the page's one `h1`, with nothing above it.
    expect(html).toMatch(/<h1[^>]*>Олена · міський сад<\/h1>/u);
    expect(html).not.toContain("Профіль садівника");
    expect(html).toContain("@demo_olena");
    expect(html).toContain(
      "Вирощую їстівний балкон і записую чесні результати.",
    );
    // Where and in which languages, in the reader's language — a city is
    // narrowed to its country.
    const header = html.slice(
      html.indexOf('data-slot="profile-header"'),
      html.indexOf('role="tablist"'),
    );
    expect(header).toMatch(/data-profile-region="true"[^>]*>[\s\S]*?Україна/u);
    expect(header).not.toContain("Ukraine");
    expect(header).not.toContain("Київ");
    expect(header).toContain("Українська · Български");
    // Counts as words, not as a dashboard.
    expect(html).toContain("21 підписник");
    expect(html).toContain("9 підписок");

    // Real tabs, entries first, each with how many things are behind it.
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Розділи профілю"');
    const tabs = [
      ...html.matchAll(/role="tab"[^>]*>([\s\S]*?)<\/button>/gu),
    ].map((match) =>
      match[1]
        ?.replace(/<[^>]+>/gu, " ")
        .replace(/\s+/gu, " ")
        .trim(),
    );
    expect(tabs).toEqual(["Записи 18", "Об’єкти 7"]);

    // Roving tabindex: one tab in the tab order, the selected one.
    const tabIndexes = [
      ...html.matchAll(/role="tab"[^>]*tabindex="(-?\d)"/gu),
    ].map((match) => match[1]);
    expect(tabIndexes).toEqual(["0", "-1"]);

    // Every panel is in the HTML whichever tab is open, so the entries and
    // the objects stay indexable — the unselected one is `hidden`.
    expect([...html.matchAll(/role="tabpanel"/gu)]).toHaveLength(2);
    expect([...html.matchAll(/role="tabpanel"[^>]*hidden=""/gu)]).toHaveLength(
      1,
    );

    // No about tab, no lineage count, no claim queue, no context rail.
    expect(html).not.toContain("Про садівника");
    expect(html).not.toMatch(/походжен/iu);
    expect(html).not.toContain("Лічильники");
    expect(html).not.toMatch(
      /userId|email|session|quarantine|derivative_key|owner_user_id|precise|latitude|longitude/iu,
    );
  });

  it("draws each entry with the feed's own card, author first", async () => {
    const html = await render();
    const entries = html.slice(
      html.indexOf('data-profile-entries="true"'),
      html.indexOf('id="profile-objects"'),
    );

    expect([...entries.matchAll(/data-slot="entry-card"/gu)]).toHaveLength(10);
    // The card's byline and its way into the discussion, as on the feed.
    expect(entries).toContain("Автор");
    expect(entries).toContain("Обговорення");
    expect(entries).toContain('href="/@demo_olena/post/1#comments"');
    // An entry about a whole space says so, and links nowhere for it.
    expect(entries).toContain("Простір");
    expect(entries).toContain("Балкон");
    // The object's region in the reader's language, never its code.
    expect(entries).not.toContain("UA-30");
    // The object's region in the reader's language, as its owner shows it.
    expect(entries).toContain("Україна — місто Київ");
    // Only the open panel's first photograph is asked for at once.
    expect([...html.matchAll(/<img[^>]*fetchPriority="high"/giu)]).toHaveLength(
      1,
    );
  });

  it("tells a journal from an entry on the object's own card", async () => {
    const html = await render({ activeTab: "objects" });
    const card = html.slice(
      html.indexOf(
        'data-profile-object="00000000-0000-4000-8000-000000000002"',
      ),
    );

    expect(card).toContain("Журнал:");
    expect(card).toContain("3 записи");
    expect(card).toMatch(/Останній запис <time dateTime="2026-07-10"/u);
    // No photograph: words and a small mark of the kind, not a grey box
    // standing in for a picture.
    expect(card.slice(0, card.indexOf("</article>"))).not.toContain(
      'data-slot="media-figure"',
    );
  });

  it("opens the tab the URL names, and no other", async () => {
    const html = await render({ activeTab: "objects" });

    expect(html).toContain('data-profile-tab="objects"');
    const panels = [...html.matchAll(/role="tabpanel"([^>]*)>/gu)].map(
      (match) => match[1],
    );
    expect(panels).toHaveLength(2);
    expect(panels[0]).toContain("hidden");
    expect(panels[1]).not.toContain("hidden");
  });

  it("pages through every entry with real links and says where the reader is", async () => {
    const first = await render();
    expect(first).toContain('aria-label="Сторінки записів"');
    expect(first).toContain('href="/@demo_olena?page=2"');
    expect(first).toContain("Сторінка 1 з 2");
    // Objects fit on one page: no navigation for them at all.
    expect(first).not.toContain('aria-label="Сторінки об’єктів"');

    const second = await render({
      profile: {
        ...PROFILE,
        entries: { ...PROFILE.entries, page: 2 },
        objects: { ...PROFILE.objects, pageCount: 3, page: 1 },
      },
    });
    // Back to the first page is the bare address: absent means unset.
    expect(second).toContain('href="/@demo_olena"');
    expect(second).toContain("Сторінка 2 з 2");
    expect(second).toContain('href="/@demo_olena?tab=objects&amp;page=2"');
  });

  it("says a page past the end is empty instead of drawing an empty list", async () => {
    const html = await render({
      profile: {
        ...PROFILE,
        entries: { items: [], page: 7, pageCount: 2 },
      },
    });

    expect(html).toContain("На цій сторінці нічого немає.");
    expect(html).toContain("До першої сторінки");
    expect(html).not.toContain('data-screen-state="empty-no-results"');
  });

  it("names the follow control with the state it will produce", async () => {
    const following = await render({ viewer: { kind: "following" } });
    const stranger = await render({ viewer: { kind: "not_following" } });

    // DESIGN.md §5.6. "Стежити" alone does not say whose profile, and in a
    // list of controls a screen reader reads them one after another.
    expect(stranger).toContain('aria-label="Стежити, Олена · міський сад"');
    expect(following).toContain('aria-label="Не стежити, Олена · міський сад"');
  });

  it("omits relationship counts that are zero or hidden, silently", async () => {
    const hidden = await render({
      profile: {
        ...PROFILE,
        summary: { ...PROFILE.summary, relationships: null },
      },
    });
    const zero = await render({
      profile: {
        ...PROFILE,
        summary: {
          ...PROFILE.summary,
          relationships: { followers: 0, following: 4 },
        },
      },
    });

    expect(hidden).not.toContain("data-profile-counts");
    expect(hidden).not.toContain("підписник");
    expect(zero).not.toContain("підписник");
    expect(zero).toContain("4 підписки");
  });

  it("still exposes the exact authenticated action after an auth-intent resume", async () => {
    const html = await render({ resumeAction: "report" });

    expect(html).toContain('id="profile-report"');
    expect(html).toContain('open=""');
    expect(html).toContain('data-auth-intent-control="report"');
    expect(html).toContain('data-auth-intent-control="block"');
    expect(html).toContain('action="/auth/intent/start"');
    expect(html).toContain('name="targetKind" value="profile"');
    expect(html).toContain('name="targetRef" value="demo_olena"');
    expect(html).toContain('id="lineage-follow"');
    expect(html).toContain('id="profile-block"');
  });

  it("gives the owner a way to edit, and the owner's own first steps", async () => {
    const html = await render({ profile: EMPTY, viewer: { kind: "owner" } });

    expect(html).toContain('data-screen-state="empty-first-run"');
    expect(html).toContain("/illustrations/empty-journal");
    expect(html).toContain("Редагувати профіль");
    expect(html).toContain('href="/garden/profile#public-profile-editor"');
    expect(html).not.toContain('data-auth-intent-control="follow"');
  });

  it("sends the owner to the workspace's one address in every language", async () => {
    const { getPublicProfileCopy } = await import("@/lib/public-profile-copy");

    for (const locale of ["uk", "bg", "ru"] as const) {
      const html = await render({
        profile: EMPTY,
        locale,
        viewer: { kind: "owner" },
        activeTab: "objects",
      });
      const copy = getPublicProfileCopy(locale);
      const anchors = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gu)].map(
        ([markup]) => markup,
      );

      // `/bg/garden/...` is a 404: the workspace has no twin in the
      // `[locale]` tree, and renders in the reader's language as it is.
      expect(
        anchors.find((markup) => markup.includes(copy.newEntry)),
        locale,
      ).toContain('href="/garden/new"');
      expect(
        anchors.find((markup) => markup.includes(copy.addObject)),
        locale,
      ).toContain('href="/garden/objects/new"');
    }
  });

  it("shows a stranger nothing-yet without a picture, an invitation or a zero", async () => {
    const html = await render({ profile: EMPTY });

    // A visitor cannot write this gardener's first entry, so the state is
    // "no results", which DESIGN.md §5.4 says carries no picture.
    expect(html).toContain('data-screen-state="empty-no-results"');
    expect(html).toContain("Опублікованих записів ще немає.");
    expect(html).not.toContain("/illustrations/");
    expect(html).not.toContain("Новий запис");
    // Nothing implies activity that is not there: no counts, no zeros.
    expect(html).not.toContain("data-profile-counts");
    const tabs = [...html.matchAll(/role="tab"[^>]*>([\s\S]*?)<\/button>/gu)]
      .map((match) => match[1] ?? "")
      .join(" ");
    expect(tabs).not.toMatch(/\d/u);
  });
});
