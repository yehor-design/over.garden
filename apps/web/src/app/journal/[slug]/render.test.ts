import { describe, expect, it } from "vitest";

import type { PublicJournalEntryPage } from "@/server/journal-repository";
import {
  renderGoneJournalEntryHtml,
  renderNotFoundJournalEntryHtml,
  renderPublicJournalEntryHtml,
} from "./render";

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

    expect(html).toContain("Запис простору");
    expect(html).toContain("Журнал простору");
    expect(html).toContain("Balcony");
    expect(html).not.toContain("/variety/");
    expect(html).not.toContain("/lineage/objects/");
  });

  it("renders a durable object logbook readback with safe related context", () => {
    const html = renderPublicJournalEntryHtml(
      buildPage({
        publicNoindex: true,
        author: {
          handle: "green_thumb",
          mention: "@green_thumb",
          displayName: "Green Thumb",
          avatarUrl: "https://media.over.garden/avatars/green-thumb.webp",
          profilePath: "/@green_thumb",
        },
        relatedEntries: [
          {
            id: "entry-2",
            title: "Second ripe cluster",
            bodyPreview: "The next cluster colored up after a warmer week.",
            entryDate: "2026-06-25",
            publicSlug: "second-ripe-cluster",
            publicPath: "/journal/second-ripe-cluster",
          },
        ],
      }),
    );

    expect(html).toContain("Запис у журналі живого об&#39;єкта");
    expect(html).toContain('data-site-shell="raw"');
    expect(html).toContain('data-site-shell-region="header"');
    expect(html).toContain('data-site-shell-region="sidebar"');
    expect(html).toContain('data-site-shell-region="content"');
    expect(html).toContain('data-site-shell-region="context"');
    expect(html).toContain('data-site-shell-region="mobile-navigation"');
    expect(html).not.toContain("min-width: 20rem");
    const mobileMenuStart = html.indexOf(
      '<div class="site-shell-mobile-menu-panel">',
    );
    const mobileMenuEnd = html.indexOf("</div>", mobileMenuStart);
    expect(html.slice(mobileMenuStart, mobileMenuEnd)).toContain(
      'href="/privacy"',
    );
    expect(html).toContain('href="/objects"');
    expect(html).toContain('href="/journals"');
    expect(html).toContain('href="/knowledge"');
    expect(html).not.toContain(">Моє<");
    expect(html).toContain("Відкрити паспорт живого об&#39;єкта");
    expect(html).toContain("/lineage/objects/object-1");
    expect(html).toContain("Почати подібний журнал");
    expect(html).toContain("/garden?source=public-journal");
    expect(html).toContain("Контекст журналу");
    expect(html).toContain("Green Thumb");
    expect(html).toContain("/@green_thumb");
    expect(html).toContain("Пов&#39;язаний публічний контекст");
    expect(html).toContain("Переглянути історію об&#39;єкта");
    expect(html).toContain("Second ripe cluster");
    expect(html).toContain("/journal/second-ripe-cluster");
    expect(html).not.toMatch(
      /owner_user_id|author_user_id|quarantine|ip_address|user_agent|email|phone|coordinates|latitude|longitude/i,
    );
  });

  it("renders only the public derivative media URL", () => {
    const html = renderPublicJournalEntryHtml(
      buildPage({
        publicNoindex: true,
        media: {
          id: "media-1",
          derivativeKey: "journal/public/entry-1.webp",
          publicUrl: "https://media.over.garden/journal/public/entry-1.webp",
        },
      }),
    );

    expect(html).toContain(
      'src="https://media.over.garden/journal/public/entry-1.webp"',
    );
    expect(html).not.toMatch(/derivative_key|derivativeKey/);
    expect(html).not.toMatch(/quarantine|original/i);
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
    expect(html).toContain("Коментар опубліковано.");
    expect(html).not.toMatch(
      /author_user_id|owner_user_id|quarantine|derivative_key|ip_address|user_agent|email|phone|coordinates|latitude|longitude/i,
    );
  });

  it("localizes journal chrome and failure states without translating UGC", () => {
    const page = buildPage({ publicNoindex: true });
    const html = renderPublicJournalEntryHtml(page, undefined, null, "bg");
    const goneHtml = renderGoneJournalEntryHtml("first-ripe-cluster", "ru");
    const missingHtml = renderNotFoundJournalEntryHtml("bg");

    expect(html).toContain('<html lang="bg">');
    expect(html).toContain("Запис в дневника на жив обект");
    expect(html).toContain("First ripe cluster");
    expect(html).toContain(
      "A public, first-hand growing note with safe content.",
    );
    expect(goneHtml).toContain("Запись удалена");
    expect(missingHtml).toContain("Записът не е намерен");
    expect(goneHtml).toContain('data-site-shell="raw"');
    expect(missingHtml).toContain('data-site-shell-region="mobile-navigation"');
  });

  it("adds the localized My navigation for an authenticated journal reader", () => {
    const html = renderPublicJournalEntryHtml(
      buildPage({ publicNoindex: true }),
      undefined,
      null,
      "bg",
      true,
    );

    expect(html).toContain(">Моето<");
    expect(html).toContain("Моята градина");
    expect(html).toContain("Добавяне на обект");
    expect(html).toContain("Известия");
    expect(html).toContain('href="/bg/notifications"');
    expect(html).not.toMatch(/private-user|private-session|email/i);
  });
});

function buildPage({
  publicNoindex,
  entryScope = "object",
  author = null,
  media = null,
  relatedEntries = [],
}: {
  publicNoindex: boolean;
  entryScope?: "object" | "space";
  author?: PublicJournalEntryPage["author"];
  media?: PublicJournalEntryPage["media"];
  relatedEntries?: PublicJournalEntryPage["relatedEntries"];
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
      plantObjectId: entryScope === "object" ? "object-1" : null,
      displayName:
        entryScope === "object" ? "Balcony tomato" : "Balcony space entry",
      objectKind: entryScope === "object" ? "plant" : null,
      catalogCanonicalName: entryScope === "object" ? "Pomidor Cheri" : null,
      catalogPublicSlug:
        entryScope === "object" ? "pomidor-cheri-0000000101" : null,
      publicPath: entryScope === "object" ? "/lineage/objects/object-1" : null,
      varietyText: entryScope === "object" ? "Pomidor Cheri" : null,
      varietyState: entryScope === "object" ? "selected" : "unknown",
      locationVisibility: "hidden",
      coarseRegionCode: null,
    },
    author,
    relatedEntries,
    media,
  };
}
