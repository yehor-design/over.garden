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
    publicPath: "/bg/journal/first-public-chapter",
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
      await import("../../[locale]/journal/[slug]/page");
    const html = renderToStaticMarkup(
      await Route({
        params: Promise.resolve({
          locale: "bg",
          slug: page.entry.publicSlug,
        }),
        searchParams: Promise.resolve({ from: "/bg/journals?kind=plant" }),
      }),
    );

    expect(mocks.getLookup).toHaveBeenCalledWith(
      page.entry.publicSlug,
      undefined,
      "bg",
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
      await import("../../[locale]/journal/[slug]/page");
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
      'data-owner-control="/garden/entries/entry-1/edit?returnTo=%2Fbg%2Fjournal%2Ffirst-public-chapter"',
    );
    expect(html).toContain('data-authenticated="true"');
  });

  it("publishes noindex metadata without fabricated language alternates", async () => {
    const { generateMetadata } =
      await import("../../[locale]/journal/[slug]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "bg",
        slug: page.entry.publicSlug,
      }),
    });

    expect(metadata).toMatchObject({
      title: "First public chapter · Запис в дневник | OverGarden",
      robots: { index: false, follow: false },
    });
    expect(metadata.alternates).toBeUndefined();
  });

  it("times out metadata source reads without blocking or admitting a late page", async () => {
    const { generateMetadata } =
      await import("../../[locale]/journal/[slug]/page");
    vi.useFakeTimers();
    mocks.getLookup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ status: "active", page }), 500);
        }),
    );

    try {
      const pending = generateMetadata({
        params: Promise.resolve({
          locale: "bg",
          slug: page.entry.publicSlug,
        }),
      });
      await vi.advanceTimersByTimeAsync(150);
      const metadata = await pending;
      await vi.advanceTimersByTimeAsync(500);

      expect(metadata).toMatchObject({
        robots: { index: false, follow: false },
      });
      expect(metadata.alternates).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed for private, removed RSC, missing and invalid locale reads", async () => {
    mocks.getLookup.mockResolvedValueOnce({ status: "not_found" });
    const { default: Route } =
      await import("../../[locale]/journal/[slug]/page");

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
