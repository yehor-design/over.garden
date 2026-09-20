import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRootLocaleRedirectPath,
  selectPublicLocaleFromAcceptLanguage,
  selectPublicLocaleFromRequestContext,
} from "@/lib/public-localization";
import type { PublicFeedPage } from "@/server/public-feed-repository";
import HomeRoute, { generateMetadata } from "@/app/[locale]/page";
import FilteredHomeRoute from "@/app/[locale]/q/page";

const mocks = vi.hoisted(() => ({
  getSiteShellSessionState: vi.fn(),
  listPublicFeedPage: vi.fn(),
  listTrustedPublicFeedTopics: vi.fn(),
}));

vi.mock("@/server/site-shell-session", () => ({
  getSiteShellSessionState: mocks.getSiteShellSessionState,
}));

vi.mock("@/server/public-feed-repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/public-feed-repository")>();

  return {
    ...actual,
    listPublicFeedPage: mocks.listPublicFeedPage,
    listTrustedPublicFeedTopics: mocks.listTrustedPublicFeedTopics,
  };
});

const feedPage: PublicFeedPage = {
  entries: [
    {
      id: "entry-1",
      title: "Ранкове спостереження",
      excerpt: "Новий приріст рівний, листя без плям.",
      sourceLanguage: "uk",
      entryDate: "2026-07-10",
      publishedAt: "2026-07-10T12:00:00.000Z",
      publicPath: "/@demo_olena/morning-check",
      object: {
        id: "object-1",
        displayName: "Томат Черрі",
        kind: "plant",
        publicPath: "/@demo_olena/objects/tomato",
        safeRegionCode: null,
      },
      author: {
        handle: "demo_olena",
        displayName: "Олена",
        avatarUrl: null,
        profilePath: "/@demo_olena",
      },
      media: [],
      topics: [],
    },
  ],
  nextCursor: null,
};

// A database is configured. Without one a static page defers its render to
// the request (ADR-0032 D4) and these tests would be reading the fallback;
// `static-public-page.test.tsx` holds that branch.
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://unit.test/overgarden");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/", () => {
  beforeEach(() => {
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: false,
    });
    mocks.listPublicFeedPage.mockResolvedValue(feedPage);
    mocks.listTrustedPublicFeedTopics.mockResolvedValue([
      { slug: "winter-care", label: "Зимовий догляд", entryCount: 1 },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps Accept-Language advisory and requires a market signal for root routing", () => {
    expect(
      selectPublicLocaleFromAcceptLanguage("bg-BG,bg;q=0.9,uk;q=0.4"),
    ).toBe("bg");
    expect(selectPublicLocaleFromAcceptLanguage("ru;q=0.9,uk;q=0.8")).toBe(
      "ru",
    );
    expect(selectPublicLocaleFromAcceptLanguage("en-US,en;q=0.9")).toBe("uk");
    expect(getRootLocaleRedirectPath("bg-BG,bg;q=0.9")).toBe("/");
    expect(getRootLocaleRedirectPath("ru;q=0.9,uk;q=0.8", "UA")).toBe("/");
    expect(getRootLocaleRedirectPath("ru;q=0.9,uk;q=0.8", "BG")).toBe("/bg");
    expect(
      selectPublicLocaleFromRequestContext({
        acceptLanguage: "ru;q=0.9",
        countryCode: "UA",
      }),
    ).toBe("uk");
  });

  it("renders the Ukrainian read-first feed as an indexable listing of cards", async () => {
    const html = renderToStaticMarkup(
      await HomeRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "uk" }),
    });

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.alternates).toMatchObject({
      canonical: "https://over.garden/",
    });
    expect(html).toContain('lang="uk"');
    expect(html).toContain(">Стрічка</h1>");
    expect(html).toContain("Ранкове спостереження");
    expect(html).toContain('href="/@demo_olena/morning-check"');
    // Criterion 8: the article is named by the entry it holds.
    expect(html).toContain('aria-labelledby="entry-card-entry-1-title"');
    expect(html).not.toContain("Ведіть живу історію");
    expect(html).not.toContain("Почати перший запис");
    expect(html).not.toContain('aria-label="Language switcher"');
    expect(html).not.toContain("/join?");
    expect(html).not.toContain("/admin");
  });

  it("passes explicit filters to the repository and localizes Bulgarian paths", async () => {
    const html = renderToStaticMarkup(
      await FilteredHomeRoute({
        params: Promise.resolve({ locale: "bg" }),
        searchParams: Promise.resolve({
          cursor: "invalid-cursor",
          kind: "animal",
          topic: "winter-care",
        }),
      }),
    );

    expect(mocks.listPublicFeedPage).toHaveBeenCalledWith(
      {
        cursor: null,
        kind: "animal",
        topic: "winter-care",
      },
      "bg",
    );
    expect(html).toContain('lang="bg"');
    expect(html).toContain(">Поток</h1>");
    // The active filter is in the URL, and it stays there while the other one
    // changes: it travels as a hidden field in the chip row's GET form.
    expect(html).toContain('type="hidden" name="topic" value="winter-care"');
    expect(html).toContain('type="hidden" name="kind" value="animal"');
    expect(html).toContain('action="/bg"');
    expect(html).not.toContain('href="/bg/feed"');
    expect(html).not.toContain('aria-label="Смяна на езика"');
  });

  it("never asks who is reading: the followed destination is a region of its own", async () => {
    // A signed-in gardener gets a chip to their followed feed. The page used to
    // read the session to decide, which made the whole document request-time.
    // It is `SignedInOnly` now (ADR-0032 D2): absent from the served bytes,
    // drawn once the document's session settles.
    const html = renderToStaticMarkup(
      await HomeRoute({
        params: Promise.resolve({ locale: "ru" }),
      }),
    );

    expect(html).toContain(">Лента</h1>");
    expect(html).not.toContain('href="/ru/feed"');
    expect(mocks.getSiteShellSessionState).not.toHaveBeenCalled();
  });

  it("settles a failed feed read into a class the page renders", async () => {
    mocks.listPublicFeedPage.mockRejectedValue(
      new Error("database unavailable"),
    );

    const html = renderToStaticMarkup(
      await FilteredHomeRoute({
        params: Promise.resolve({ locale: "uk" }),
        searchParams: Promise.resolve({ kind: "animal" }),
      }),
    );

    // ADR-0023: a failure is a value, not an exception the reader inherits.
    // The class travels as a data attribute and the digest is printed, so the
    // reader and the log line quote the same string.
    expect(html).toContain('data-screen-state="error"');
    expect(html).toMatch(/data-section-failure="[a-z_]+"/u);
    expect(html).toContain("Стрічку не вдалося завантажити");
    expect(html).toContain("Код звернення:");
    expect(html).toContain('href="/?kind=animal"');
    expect(html).not.toMatch(/href="[^"]*(?:sign.?up|register|join)/i);
  });
});
