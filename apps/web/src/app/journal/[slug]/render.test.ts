import { describe, expect, it } from "vitest";

import type { PublicJournalEntryPage } from "@/server/journal-repository";
import { renderPublicJournalEntryHtml } from "./render";

describe("public journal HTML renderer", () => {
  it("keeps published UGC noindex while public_noindex remains true", () => {
    const html = renderPublicJournalEntryHtml(
      buildPage({ publicNoindex: true }),
    );

    expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
    expect(html).not.toContain("index, follow");
  });

  it("uses the shared policy when a journal entry is explicitly promoted", () => {
    const html = renderPublicJournalEntryHtml(
      buildPage({ publicNoindex: false }),
    );

    expect(html).toContain('<meta name="robots" content="index, follow"');
  });

  it("labels space-level public entries without requiring a direct object", () => {
    const html = renderPublicJournalEntryHtml(
      buildPage({ publicNoindex: true, entryScope: "space" }),
    );

    expect(html).toContain("Space entry");
    expect(html).toContain("Balcony");
    expect(html).not.toContain("/variety/");
  });

  it("renders engagement forms and comment readback without private identifiers", () => {
    const html = renderPublicJournalEntryHtml(
      buildPage({ publicNoindex: true }),
      {
        target: {
          kind: "journal_entry",
          ref: "first-ripe-cluster",
        },
        activeLikeCount: 1,
        comments: [
          {
            key: "comment:public",
            replyToken: "00000000-0000-4000-8000-000000000201",
            body: "Looks sturdy after rain.",
            authorLabel: "@green_thumb",
            authorHandle: "green_thumb",
            parentReplyToken: null,
            createdAt: "2026-07-04T08:00:00.000Z",
          },
        ],
      },
      "commented",
    );

    expect(html).toContain("/api/engagement/likes");
    expect(html).toContain("/api/engagement/bookmarks");
    expect(html).toContain("/api/engagement/comments");
    expect(html).toContain("Looks sturdy after rain.");
    expect(html).toContain("Comment posted.");
    expect(html).not.toMatch(
      /author_user_id|owner_user_id|quarantine|derivative_key|ip_address|user_agent|email|phone|coordinates|latitude|longitude/i,
    );
  });
});

function buildPage({
  publicNoindex,
  entryScope = "object",
}: {
  publicNoindex: boolean;
  entryScope?: "object" | "space";
}): PublicJournalEntryPage {
  return {
    entry: {
      id: "entry-1",
      title: "First ripe cluster",
      body: "A public, first-hand growing note with safe content.",
      entryDate: "2026-06-20",
      entryScope,
      publicSlug: "first-ripe-cluster",
      publicNoindex,
      publishedAt: "2026-06-20T12:00:00.000Z",
    },
    space: {
      displayName: "Balcony",
      locationVisibility: "hidden",
      coarseRegionCode: null,
    },
    plantObject: {
      displayName: "Balcony tomato",
      catalogCanonicalName: "Pomidor Cheri",
      catalogPublicSlug: "pomidor-cheri-0000000101",
      varietyText: "Pomidor Cheri",
      varietyState: "selected",
      locationVisibility: "hidden",
      coarseRegionCode: null,
    },
    media: null,
  };
}
