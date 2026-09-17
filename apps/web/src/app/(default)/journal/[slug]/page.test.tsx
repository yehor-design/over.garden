import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLookup: vi.fn(),
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  getEngagementSummary: vi.fn(),
  getOwnerControl: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/server/journal-repository", () => ({
  getPublicJournalEntryLookup: mocks.getLookup,
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/engagement-repository", () => ({
  getEngagementSummary: mocks.getEngagementSummary,
}));

vi.mock("@/server/owner-journal-entry-control", () => ({
  getOwnerJournalEntryControl: mocks.getOwnerControl,
}));

vi.mock("@/components/public/public-journal-entry", () => ({
  PublicJournalEntryView: ({
    locale,
    directoryReturnTo,
    ownerControl,
    children,
  }: {
    locale: string;
    directoryReturnTo: string;
    ownerControl: { managePath: string } | null;
    children: React.ReactNode;
  }) => (
    <main
      data-testid="journal-view"
      data-locale={locale}
      data-return-to={directoryReturnTo}
      data-owner-control={ownerControl?.managePath}
    >
      {children}
    </main>
  ),
}));

vi.mock("@/app/engagement/public-engagement-panel", () => ({
  PublicEngagementPanel: ({
    isAuthenticated,
    returnTo,
  }: {
    isAuthenticated: boolean;
    returnTo: string;
  }) => (
    <section
      data-testid="engagement"
      data-authenticated={isAuthenticated}
      data-return-to={returnTo}
    />
  ),
}));

const page = {
  entry: {
    id: "entry-1",
    title: "First public chapter",
    body: "A safe public chapter with enough context for metadata.",
    entryDate: "2026-07-10",
    createdAt: "2026-07-10T09:00:00.000Z",
    entryScope: "object",
    publicSlug: "first-public-chapter",
    publicPath: "/@yehor/first-public-chapter",
    publicNoindex: true,
    publishedAt: "2026-07-10T10:00:00.000Z",
  },
};

describe("/journal/[slug] V2", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getLookup.mockResolvedValue({ status: "active", page });
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.getSessionId.mockReturnValue(null);
    mocks.getEngagementSummary.mockResolvedValue({
      target: { kind: "journal_entry", ref: page.entry.publicSlug },
      activeLikeCount: 0,
      comments: [],
    });
    mocks.getOwnerControl.mockResolvedValue(null);
  });

  it("renders localized guest-open readback and engagement without owner lookup", async () => {
    const { default: Route } =
      await import("@/app/[locale]/journal/[slug]/page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({
          locale: "bg",
          slug: page.entry.publicSlug,
        }),
        searchParams: Promise.resolve({ from: "/bg/journals?kind=plant" }),
      }),
    );

    // The legacy route carries no author handle (the name is per author
    // since `0073`); the author-scoped route passes one.
    expect(mocks.getLookup).toHaveBeenCalledWith(
      page.entry.publicSlug,
      undefined,
      "bg",
      null,
    );
    expect(html).toContain('data-locale="bg"');
    expect(html).toContain('data-return-to="/bg/journals?kind=plant"');
    expect(html).toContain('data-testid="engagement"');
    expect(html).toContain('data-authenticated="false"');
    expect(mocks.getOwnerControl).not.toHaveBeenCalled();
  });

  it("adds a separately scoped owner control for the signed-in author", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "owner-1" },
      session: { id: "session-1" },
    });
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getOwnerControl.mockResolvedValue({
      entryId: "entry-1",
      managePath: "/garden/objects/object-1#passport-entry-entry-1",
    });
    const { default: Route } =
      await import("@/app/[locale]/journal/[slug]/page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({
          locale: "uk",
          slug: page.entry.publicSlug,
        }),
        searchParams: Promise.resolve({ authIntent: "comment" }),
      }),
    );

    expect(mocks.getOwnerControl).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner-1", sessionId: "session-1" }),
      page.entry.publicSlug,
    );
    expect(html).toContain(
      'data-owner-control="/garden/entries/entry-1/edit?returnTo=%2F%40yehor%2Ffirst-public-chapter"',
    );
    expect(html).toContain('data-authenticated="true"');
  });

  it("indexes the one address an entry has, in whichever language it renders", async () => {
    const { generateMetadata } =
      await import("@/app/[locale]/journal/[slug]/page");

    // A gardener's entry is never translated, so it has one address
    // (ADR-0029 D10) — and since OVE-460 the locale subtree it renders from is
    // the *reader's language*, not a second spelling: `/bg/@yehor/…` still
    // answers 308 to the one address. Read as a duplicate, every entry went
    // `noindex, nofollow` for a reader whose language was not the default.
    for (const locale of ["uk", "bg", "ru"] as const) {
      const rendered = await generateMetadata({
        params: Promise.resolve({ locale, slug: page.entry.publicSlug }),
      });
      expect(rendered, locale).toMatchObject({
        robots: { index: true, follow: true },
      });
      expect(rendered.alternates, locale).toEqual({
        canonical: `https://over.garden${page.entry.publicPath}`,
      });
    }

    // The one address is under its author (ADR-0029 D9), not in the flat
    // namespace that forced a random suffix into every entry URL.
    expect(page.entry.publicPath).toBe(`/@yehor/${page.entry.publicSlug}`);

    const bulgarianTitle = await generateMetadata({
      params: Promise.resolve({ locale: "bg", slug: page.entry.publicSlug }),
    });
    expect(bulgarianTitle.title).toBe(
      "First public chapter · Запис в дневник | OverGarden",
    );
  });

  it("fails closed for private, removed RSC, missing and invalid locale reads", async () => {
    mocks.getLookup.mockResolvedValueOnce({ status: "not_found" });
    const { default: Route } =
      await import("@/app/[locale]/journal/[slug]/page");

    await expect(
      Route({
        params: Promise.resolve({ locale: "bg", slug: "private-entry" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      Route({
        params: Promise.resolve({ locale: "de", slug: "missing-entry" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
