import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicJournalEntryLookup: vi.fn(),
  getEngagementSummary: vi.fn(),
}));

vi.mock("@/server/journal-repository", () => ({
  getPublicJournalEntryLookup: mocks.getPublicJournalEntryLookup,
}));

vi.mock("@/server/engagement-repository", () => ({
  getEngagementSummary: mocks.getEngagementSummary,
}));

import type { PublicJournalEntryPage } from "@/server/journal-repository";
import { GET } from "./route";

describe("public journal route", () => {
  beforeEach(() => {
    mocks.getPublicJournalEntryLookup.mockReset();
    mocks.getEngagementSummary.mockReset();
    mocks.getEngagementSummary.mockResolvedValue({
      target: {
        kind: "journal_entry",
        ref: "first-ripe-cluster",
      },
      activeLikeCount: 0,
      comments: [],
    });
  });

  it("returns a safe 404 HTML response for an unknown public slug", async () => {
    mocks.getPublicJournalEntryLookup.mockResolvedValue({
      status: "not_found",
    });

    const response = await GET(
      new Request("https://over.garden/journal/missing"),
      {
        params: Promise.resolve({ slug: "missing" }),
      },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(await response.text()).toContain("Entry not found");
    expect(mocks.getPublicJournalEntryLookup).toHaveBeenCalledWith("missing");
  });

  it("returns a safe 410 response for archived public entry tombstones", async () => {
    mocks.getPublicJournalEntryLookup.mockResolvedValue({
      status: "gone",
      entry: {
        publicSlug: "first-ripe-cluster",
        publicGoneAt: "2026-07-04T08:00:00.000Z",
        publicNoindex: true,
      },
    });

    const response = await GET(
      new Request("https://over.garden/journal/first-ripe-cluster"),
      {
        params: Promise.resolve({ slug: "first-ripe-cluster" }),
      },
    );

    const html = await response.text();

    expect(response.status).toBe(410);
    expect(html).toContain("Entry removed");
    expect(html).toContain('meta name="robots" content="noindex, nofollow"');
    expect(html).not.toMatch(
      /owner_user_id|journal text|quarantine|coordinates|latitude|longitude/i,
    );
    expect(mocks.getEngagementSummary).not.toHaveBeenCalled();
  });

  it("returns active public logbook HTML with engagement state", async () => {
    mocks.getPublicJournalEntryLookup.mockResolvedValue({
      status: "active",
      page: buildPage(),
    });
    mocks.getEngagementSummary.mockResolvedValue({
      target: {
        kind: "journal_entry",
        ref: "first-ripe-cluster",
      },
      activeLikeCount: 2,
      comments: [],
    });

    const response = await GET(
      new Request(
        "https://over.garden/journal/first-ripe-cluster?engagement=bookmarked",
      ),
      {
        params: Promise.resolve({ slug: "first-ripe-cluster" }),
      },
    );

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Living-object logbook entry");
    expect(html).toContain("Saved to bookmarks.");
    expect(html).toContain("Open living-object passport");
    expect(mocks.getEngagementSummary).toHaveBeenCalledWith({
      kind: "journal_entry",
      ref: "first-ripe-cluster",
    });
  });
});

function buildPage(): PublicJournalEntryPage {
  return {
    entry: {
      id: "entry-1",
      title: "First ripe cluster",
      body: "A public, first-hand growing note with safe content.",
      entryDate: "2026-06-20",
      entryScope: "object",
      publicSlug: "first-ripe-cluster",
      publicNoindex: true,
      publishedAt: "2026-06-20T12:00:00.000Z",
    },
    space: {
      displayName: "Balcony",
      locationVisibility: "hidden",
      coarseRegionCode: null,
    },
    plantObject: {
      plantObjectId: "object-1",
      displayName: "Balcony tomato",
      objectKind: "plant",
      catalogCanonicalName: "Pomidor Cheri",
      catalogPublicSlug: "pomidor-cheri-0000000101",
      publicPath: "/lineage/objects/object-1",
      varietyText: "Pomidor Cheri",
      varietyState: "selected",
      locationVisibility: "hidden",
      coarseRegionCode: null,
    },
    author: null,
    relatedEntries: [],
    media: null,
  };
}
