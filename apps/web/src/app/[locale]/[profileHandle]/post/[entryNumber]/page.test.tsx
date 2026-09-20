import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  unstable_rethrow: () => undefined,
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
    ownerControl: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <main
      data-testid="journal-view"
      data-locale={locale}
      data-return-to={directoryReturnTo}
    >
      <div data-testid="owner-slot">{ownerControl}</div>
      {children}
    </main>
  ),
  OwnerEntryControlLink: ({ managePath }: { managePath: string }) => (
    <a data-owner-control={managePath} href={managePath} />
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
    entryNumber: 12,
    publicPath: "/@yehor/post/12",
    publicNoindex: true,
    publishedAt: "2026-07-10T10:00:00.000Z",
  },
};

/**
 * The segments as the URL carries them. `@` reaches a route either as itself
 * or as `%40`, depending on who built the link, and both must name the same
 * gardener.
 */
const SPELLINGS = [
  ["plain", { profileHandle: "@yehor", entryNumber: "12" }],
  ["percent-encoded", { profileHandle: "%40yehor", entryNumber: "12" }],
] as const;

const ADDRESS = { profileHandle: "@yehor", entryNumber: "12" };

const ROUTE = "@/app/[locale]/[profileHandle]/post/[entryNumber]/page";
const REGIONS =
  "@/app/[locale]/[profileHandle]/post/[entryNumber]/entry-regions";

// A database is configured. Without one a static page defers its render to
// the request (ADR-0032 D4) and these tests would be reading the fallback;
// `static-public-page.test.tsx` holds that branch.
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://unit.test/overgarden");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("an entry at its address, /@{handle}/post/{n}", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getLookup.mockResolvedValue({ status: "active", page });
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.getSessionId.mockReturnValue(null);
    mocks.getEngagementSummary.mockResolvedValue({
      target: { kind: "journal_entry", ref: page.entry.id },
      activeLikeCount: 0,
      comments: [],
    });
    mocks.getOwnerControl.mockResolvedValue(null);
  });

  it.each(SPELLINGS)(
    "renders the entry as a static document when the segments arrive %s",
    async (_name, segments) => {
      const { default: Route } = await import(ROUTE);
      const html = renderToStaticMarkup(
        await Route({
          params: Promise.resolve({ locale: "bg", ...segments }),
          // A static document never reads this (ADR-0032 D2): were the page
          // to await it, a promise that never settles would hang this test.
          searchParams: new Promise(() => undefined),
        }),
      );

      // The handle and the number are the key (ADR-0029 D9), and the number
      // reaches the read as a number: the route received the string `"12"`.
      expect(mocks.getLookup).toHaveBeenCalledWith("yehor", 12, undefined, "bg");
      expect(html).toContain('data-locale="bg"');
      // The plain directory: the exact view a reader came from is restored
      // after hydration, by `DirectoryReturnLink`.
      expect(html).toContain('data-return-to="/bg/journals"');
      // What the document carries is the guest's panel. The two regions
      // beside it do start — and in a prerender their session read never
      // settles — but the page did not wait for either to draw itself.
      expect(html).toContain('data-testid="engagement"');
      expect(html).toContain('data-authenticated="false"');
      expect(html).not.toContain("data-owner-control");
      expect(mocks.getOwnerControl).not.toHaveBeenCalled();
    },
  );

  it("renders nothing for the build's placeholder sample, and reads nothing", async () => {
    const { default: Route, generateStaticParams } = await import(ROUTE);
    const [sample] = generateStaticParams();

    expect(
      await Route({ params: Promise.resolve({ locale: "uk", ...sample }) }),
    ).toBeNull();
    expect(mocks.getLookup).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("answers the reader's own panel from the region, with their session and their cursor", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "owner-1" },
      session: { id: "session-1" },
    });
    mocks.getSessionId.mockReturnValue("session-1");
    const { ViewerEngagementPanel } = await import(REGIONS);
    const html = renderToStaticMarkup(
      await ViewerEngagementPanel({
        locale: "uk",
        target: { kind: "journal_entry", ref: page.entry.id },
        returnTo: page.entry.publicPath,
        searchParams: Promise.resolve({ authIntent: "comment", cursor: "c-2" }),
      }),
    );

    expect(html).toContain('data-authenticated="true"');
    expect(mocks.getEngagementSummary).toHaveBeenCalledWith(
      { kind: "journal_entry", ref: page.entry.id },
      expect.objectContaining({ userId: "owner-1", sessionId: "session-1" }),
      { commentCursor: "c-2" },
    );
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
    const { OwnerEntryControl } = await import(REGIONS);
    const html = renderToStaticMarkup(
      await OwnerEntryControl({
        locale: "uk",
        publicSlug: page.entry.publicSlug,
        publicPath: page.entry.publicPath,
      }),
    );

    expect(mocks.getOwnerControl).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner-1", sessionId: "session-1" }),
      page.entry.publicSlug,
    );
    // The edit screen returns to the entry's address, which is its number.
    expect(html).toContain(
      'data-owner-control="/garden/entries/entry-1/edit?returnTo=%2F%40yehor%2Fpost%2F12"',
    );
  });

  it("offers a guest and another gardener no owner control", async () => {
    const { OwnerEntryControl } = await import(REGIONS);
    const props = {
      locale: "uk" as const,
      publicSlug: page.entry.publicSlug,
      publicPath: page.entry.publicPath,
    };

    expect(await OwnerEntryControl(props)).toBeNull();
    expect(mocks.getOwnerControl).not.toHaveBeenCalled();

    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "someone-else" },
      session: { id: "session-2" },
    });
    expect(await OwnerEntryControl(props)).toBeNull();
  });

  it("indexes the one address an entry has, in whichever language it renders", async () => {
    const { generateMetadata } = await import(ROUTE);

    // A gardener's entry is never translated, so it has one address
    // (ADR-0029 D10) — and since OVE-460 the locale subtree it renders from is
    // the *reader's language*, not a second spelling: `/bg/@yehor/post/12`
    // still answers 308 to the one address. Read as a duplicate, every entry
    // went `noindex, nofollow` for a reader whose language was not the default.
    for (const locale of ["uk", "bg", "ru"] as const) {
      const rendered = await generateMetadata({
        params: Promise.resolve({ locale, ...ADDRESS }),
      });
      expect(rendered, locale).toMatchObject({
        robots: { index: true, follow: true },
      });
      expect(rendered.alternates, locale).toEqual({
        canonical: `https://over.garden${page.entry.publicPath}`,
      });
    }

    // The one address is the author's handle and the entry's number, and it
    // is ASCII: nothing in it percent-encodes on its way to a clipboard.
    expect(page.entry.publicPath).toBe("/@yehor/post/12");
    expect(encodeURI(page.entry.publicPath)).toBe(page.entry.publicPath);

    const bulgarianTitle = await generateMetadata({
      params: Promise.resolve({ locale: "bg", ...ADDRESS }),
    });
    expect(bulgarianTitle.title).toBe(
      "First public chapter · Запис в дневник | OverGarden",
    );
  });

  it("fails closed for private, removed RSC, missing and invalid locale reads", async () => {
    mocks.getLookup.mockResolvedValueOnce({ status: "not_found" });
    const { default: Route } = await import(ROUTE);

    await expect(
      Route({ params: Promise.resolve({ locale: "bg", ...ADDRESS }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      Route({ params: Promise.resolve({ locale: "de", ...ADDRESS }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  /**
   * A route receives whatever the URL carried. The proxy refuses these on a
   * document request, but a client-side transition reaches the route without
   * passing that check, and none of them is an address: nothing ever issued a
   * leading zero, and folding `012` into `12` would give one entry two.
   */
  it.each(["0", "012", "-1", "1a", "1.0", "9999999999", "%31"])(
    "refuses /post/%s without asking the database",
    async (entryNumber) => {
      const { default: Route, generateMetadata } = await import(ROUTE);

      await expect(
        Route({
          params: Promise.resolve({
            locale: "uk",
            profileHandle: "@yehor",
            entryNumber,
          }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
      await generateMetadata({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "@yehor",
          entryNumber,
        }),
      });
      expect(mocks.getLookup).not.toHaveBeenCalled();
    },
  );
});
