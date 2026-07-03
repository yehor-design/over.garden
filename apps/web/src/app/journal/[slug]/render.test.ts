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
});

function buildPage({
  publicNoindex,
}: {
  publicNoindex: boolean;
}): PublicJournalEntryPage {
  return {
    entry: {
      id: "entry-1",
      title: "First ripe cluster",
      body: "A public, first-hand growing note with safe content.",
      entryDate: "2026-06-20",
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
