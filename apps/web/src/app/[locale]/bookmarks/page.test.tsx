import { postgresRejection } from "@test/postgres-rejection";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import type { EngagementBookmarkShelfItem } from "@/server/engagement-repository";
import type { FollowedFeedItem } from "@/server/social-return-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceViewer: vi.fn(),
  listEngagementBookmarks: vi.fn(),
  findPublicEngagementTarget: vi.fn(),
  listSavedEntryCards: vi.fn(),
}));

vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
}));

// Only the reads are mocked: the target normalizer is the repository's own,
// so an outcome in the address is re-checked here as it is in production.
vi.mock("@/server/engagement-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/engagement-repository")>()),
  listEngagementBookmarks: mocks.listEngagementBookmarks,
  findPublicEngagementTarget: mocks.findPublicEngagementTarget,
}));

vi.mock("@/server/social-return-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/social-return-repository")
  >()),
  listSavedEntryCards: mocks.listSavedEntryCards,
}));

vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: {
    next?: string;
    locale?: string;
    description?: string;
  }) => (
    <section
      data-sign-in-prompt="true"
      data-next={props.next ?? ""}
      data-locale={props.locale ?? ""}
    >
      Sign in prompt
      {props.description ?? ""}
    </section>
  ),
}));

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const ENTRY = "10000000-0000-4000-8000-0000000000e1";
const GONE_ENTRY = "10000000-0000-4000-8000-0000000000e2";
const VARIETY = "pomidor-cheri-0000000101";
const uk = getSocialSurfaceCopy("uk");

const SAVED_ENTRY: EngagementBookmarkShelfItem = {
  key: "bookmark:1111111111111111",
  target: {
    kind: "journal_entry",
    ref: ENTRY,
    label: "First ripe cluster",
    href: "/@olena/post/7",
  },
  available: true,
  addedAt: "2026-07-04T08:00:00.000Z",
  updatedAt: "2026-07-04T08:00:00.000Z",
};
const SAVED_VARIETY: EngagementBookmarkShelfItem = {
  key: "bookmark:2222222222222222",
  target: {
    kind: "variety",
    ref: VARIETY,
    label: "Pomidor Cheri",
    href: `/variety/${VARIETY}`,
  },
  available: true,
  addedAt: "2026-07-03T08:00:00.000Z",
  updatedAt: "2026-07-03T08:00:00.000Z",
};
/** An entry its author withdrew: still on the shelf, with no name. */
const GONE: EngagementBookmarkShelfItem = {
  key: "bookmark:3333333333333333",
  target: { kind: "journal_entry", ref: GONE_ENTRY, label: null, href: null },
  available: false,
  addedAt: "2026-07-02T08:00:00.000Z",
  updatedAt: "2026-07-02T08:00:00.000Z",
};
const CARD: FollowedFeedItem = {
  key: "feed:aaaaaaaaaaaaaaaa",
  href: "/@olena/post/7",
  title: "First ripe cluster",
  excerpt: "The first truss ripened on the balcony.",
  sourceLanguage: "uk",
  entryDate: "2026-07-03",
  publishedAt: "2026-07-04T08:00:00.000Z",
  author: { handle: "olena", label: "Олена", href: "/@olena" },
  object: {
    id: "object:bbbbbbbbbbbbbbbb",
    displayName: "Balcony tomato",
    kind: "plant",
    varietyText: "Cherry",
    catalogKind: "plant_variety",
    href: "/@olena/objects/balcony-tomato",
  },
  reasons: [],
  mediaUrl: null,
  mediaCaption: null,
};

async function renderShelf(
  query: Record<string, string> = {},
  locale: string = "uk",
) {
  const { default: LocalizedBookmarksRoute } = await import("./page");
  return renderToStaticMarkup(
    await LocalizedBookmarksRoute({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve(query),
    }),
  );
}

/** One row of the shelf, from its `<li>` to its end. */
function row(html: string, id: string) {
  const at = html.indexOf(`id="${id}"`);
  if (at === -1) return "";
  return html.slice(
    html.lastIndexOf("<li", at),
    html.indexOf("</li>", at) + "</li>".length,
  );
}

/** Everything from the toast on: the notice renders after the shelf. */
function notice(html: string) {
  const at = html.indexOf('data-shelf-notice="true"');
  return at === -1 ? "" : html.slice(at);
}

function count(html: string, fragment: string) {
  return html.split(fragment).length - 1;
}

/** The accessible names of the shelf's removal buttons, in order. */
function removeLabels(html: string) {
  return [
    ...html.matchAll(/aria-label="([^"]*)"[^>]*data-shelf-remove="true"/gu),
  ].map((match) => match[1]);
}

/** A saved date as the shelf writes it: the day, in UTC. */
function savedOn(value: Date | string, locale: string) {
  return new Date(value).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

describe("/{locale}/bookmarks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: SCOPE.userId,
      scope: SCOPE,
    });
    mocks.listEngagementBookmarks.mockResolvedValue([SAVED_VARIETY]);
    mocks.findPublicEngagementTarget.mockResolvedValue(null);
    mocks.listSavedEntryCards.mockImplementation(
      async (_scope: unknown, entryIds: readonly string[]) =>
        new Map(
          entryIds
            .filter((entryId) => entryId === ENTRY)
            .map((entryId) => [entryId, CARD]),
        ),
    );
  });

  it("keeps bookmark metadata private and localized", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "bg" }),
      }),
    ).resolves.toMatchObject({
      title: "Отметки | OverGarden",
      description: getSocialSurfaceCopy("bg").bookmarks.description,
      alternates: { canonical: "/bg/bookmarks" },
      robots: { index: false, follow: false },
    });
  });

  it("renders signed-in public-safe bookmarks for later reading", async () => {
    const html = await renderShelf();

    // No locale argument any more: a bookmark's target has one address, under
    // its author, and the reader's language does not choose between three of
    // them (ADR-0029 D10).
    expect(mocks.listEngagementBookmarks).toHaveBeenCalledWith(SCOPE);
    expect(html).toContain("Закладки");
    expect(html).toContain("Pomidor Cheri");
    expect(html).toContain(`href="/variety/${VARIETY}"`);
    expect(html).toContain(`aria-label="Відкрити: Pomidor Cheri"`);
    expect(html).toContain('aria-pressed="true"');
    // `OVE-456` AC4: a saved thing has one row and one removal affordance,
    // and the affordance names what it removes.
    expect(html).toContain('data-shelf-row="true"');
    expect(html).toContain('data-shelf-remove="true"');
    expect(html).toContain('aria-label="Прибрати із закладок: Pomidor Cheri"');
    expect(html).not.toContain(SCOPE.userId);
    expect(html).not.toContain(SCOPE.sessionId);
    expect(html).not.toMatch(
      /owner_user_id|author_user_id|quarantine|derivative_key|ip_address|user_agent|email|phone|coordinates|latitude|longitude/i,
    );
  });

  it.each([
    [
      "uk",
      {
        kind: "variety",
        page: "2",
        outcome: "removed",
        action: "remove",
        target: `variety:${VARIETY}`,
      },
      "/bookmarks?kind=variety&amp;page=2",
    ],
    ["bg", { kind: "journal_entry" }, "/bg/bookmarks?kind=journal_entry"],
    // A filter or a page the shelf does not have is not carried.
    ["ru", { kind: "user", page: "999" }, "/ru/bookmarks"],
  ] as const)(
    "asks a guest to sign in and brings them back to the same view in %s",
    async (locale, query, next) => {
      mocks.resolveWorkspaceViewer.mockResolvedValue({
        status: "sign-in-required",
      });

      const html = await renderShelf(query, locale);

      expect(html).toContain(`data-next="${next}"`);
      expect(html).toContain(getSocialSurfaceCopy(locale).bookmarks.signIn);
      expect(html).not.toContain("data-saved-shelf");
      expect(html).not.toContain("data-bookmark-filters");
      expect(mocks.listEngagementBookmarks).not.toHaveBeenCalled();
    },
  );

  it("says the session could not be read, with a retry of the same view, instead of asking to sign in", async () => {
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "unavailable",
      failure: describeWorkspaceFailure(postgresRejection("08006")),
    });

    const html = await renderShelf({ kind: "topic" });

    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).toContain(
      'href="/bookmarks?kind=topic" data-workspace-retry="section"',
    );
    expect(html).not.toContain("data-sign-in-prompt");
    expect(html).not.toContain("data-saved-shelf");
    expect(html).not.toContain(uk.bookmarks.emptyTitle);
    expect(mocks.listEngagementBookmarks).not.toHaveBeenCalled();
  });

  it.each([
    ["the shelf", mocks.listEngagementBookmarks],
    ["the entries' cards", mocks.listSavedEntryCards],
    ["the removed thing's name", mocks.findPublicEngagementTarget],
  ])(
    "renders a failed read of %s as a failure with a retry of the same view, never as an empty shelf",
    async (_read, read) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      read.mockRejectedValue(postgresRejection("57014"));

      const html = await renderShelf({
        kind: "variety",
        page: "2",
        outcome: "removed",
        action: "remove",
        target: `variety:${VARIETY}`,
      });

      expect(html).toContain('data-section-failure="query_timeout"');
      expect(html).toContain(
        'href="/bookmarks?kind=variety&amp;page=2" data-workspace-retry="section"',
      );
      expect(html).not.toContain("data-saved-shelf");
      expect(html).not.toContain("data-shelf-notice");
      expect(html).not.toContain(uk.bookmarks.emptyTitle);
      expect(html).not.toContain(uk.common.noResultsTitle);
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        event: "workspace_section_degraded",
        surface: "bookmarks",
        section: "shelf",
        failureClass: "query_timeout",
      });
      log.mockRestore();
    },
  );

  it.each([
    ["uk", "/journals"],
    ["bg", "/bg/journals"],
  ] as const)(
    "names the empty shelf, draws no filter chips, and leads one way out in %s",
    async (locale, journals) => {
      mocks.listEngagementBookmarks.mockResolvedValue([]);

      const html = await renderShelf({}, locale);

      expect(html).toContain('data-screen-state="empty-first-run"');
      expect(html).toContain(getSocialSurfaceCopy(locale).bookmarks.emptyTitle);
      // `OVE-502`: five chips that could only ever filter nothing are gone.
      expect(html).not.toContain("data-bookmark-filters");
      expect(html).not.toContain("aria-pressed");
      expect(count(html, "<a ")).toBe(1);
      expect(html).toContain(`href="${journals}"`);
      expect(mocks.findPublicEngagementTarget).not.toHaveBeenCalled();
    },
  );

  it("keeps the chips on a shelf whose filter matches nothing, with the way to clear it", async () => {
    const html = await renderShelf({ kind: "topic" });

    expect(html).toContain('data-screen-state="empty-no-results"');
    expect(html).toContain(uk.common.noResultsTitle);
    expect(html).toContain('data-bookmark-filters="true"');
    expect(html).toMatch(/aria-pressed="true"[^>]*><span>Теми<\/span>/u);
    expect(html).toContain('href="/bookmarks"');
    expect(html).not.toContain(uk.bookmarks.emptyTitle);
  });

  it("draws a saved entry as the feed's card, which opens with the way back to this view", async () => {
    mocks.listEngagementBookmarks.mockResolvedValue([
      SAVED_ENTRY,
      GONE,
      SAVED_VARIETY,
    ]);

    const html = await renderShelf({ kind: "journal_entry" }, "bg");
    const entry = row(html, `saved-journal_entry-${ENTRY}`);

    // Only an entry that is still public is asked for its card.
    expect(mocks.listSavedEntryCards).toHaveBeenCalledWith(
      SCOPE,
      [ENTRY],
      "bg",
    );
    expect(entry).toContain('data-saved-item="journal_entry"');
    expect(entry).toContain('data-saved-available="true"');
    expect(entry).toContain('data-slot="entry-card"');
    expect(entry).not.toContain("data-shelf-row");
    expect(entry).toContain(
      'href="/@olena/post/7?from=%2Fbg%2Fbookmarks%3Fkind%3Djournal_entry"',
    );
    expect(entry).toContain("Олена");
    expect(entry).toContain("Balcony tomato");
    expect(entry).toContain("The first truss ripened on the balcony.");
    // Taken off from where it is, back to the same view.
    expect(entry).toContain('name="targetRef" value="' + ENTRY + '"');
    expect(entry).toContain(
      'name="returnTo" value="/bg/bookmarks?kind=journal_entry"',
    );
    expect(entry).toContain(
      'aria-label="Премахни от отметките: First ripe cluster"',
    );
    // The filter is on entries: the variety is not on this view.
    expect(html).not.toContain("Pomidor Cheri");
  });

  it("keeps a saved thing that is not public any more, says so, and can still take it off", async () => {
    const earlierGone: EngagementBookmarkShelfItem = {
      ...GONE,
      key: "bookmark:5555555555555555",
      target: { ...GONE.target, ref: "10000000-0000-4000-8000-0000000000e3" },
      addedAt: "2026-06-30T08:00:00.000Z",
      updatedAt: "2026-06-30T08:00:00.000Z",
    };
    const goneTopic: EngagementBookmarkShelfItem = {
      key: "bookmark:4444444444444444",
      target: { kind: "topic", ref: "tomaty", label: null, href: null },
      available: false,
      addedAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:00:00.000Z",
    };
    mocks.listEngagementBookmarks.mockResolvedValue([
      GONE,
      goneTopic,
      earlierGone,
    ]);

    const html = await renderShelf();
    const gone = row(html, `saved-journal_entry-${GONE_ENTRY}`);
    const topic = row(html, "saved-topic-tomaty");

    // A withdrawn entry has no card to ask for.
    expect(mocks.listSavedEntryCards).toHaveBeenCalledWith(SCOPE, [], "uk");
    expect(gone).toContain('data-saved-available="false"');
    expect(gone).toContain(uk.bookmarks.unavailableTitle);
    expect(gone).toContain(uk.bookmarks.unavailable.journal_entry);
    // Nothing to open, and still a way to remove it.
    expect(gone).not.toContain("<a ");
    expect(gone).toContain('data-shelf-remove="true"');
    expect(gone).toContain(`name="targetRef" value="${GONE_ENTRY}"`);
    // Without a public name, the button says what it was and when it was
    // saved: two withdrawn entries are two different buttons.
    expect(removeLabels(html)).toEqual([
      `Прибрати із закладок: Більше недоступно · Записи · Збережено ${savedOn(GONE.addedAt, "uk")}`,
      `Прибрати із закладок: Більше недоступно · Теми · Збережено ${savedOn(goneTopic.addedAt, "uk")}`,
      `Прибрати із закладок: Більше недоступно · Записи · Збережено ${savedOn(earlierGone.addedAt, "uk")}`,
    ]);
    expect(new Set(removeLabels(html)).size).toBe(3);
    expect(topic).toContain(uk.bookmarks.unavailable.topic);
    expect(topic).toContain('name="targetRef" value="tomaty"');
    expect(html).not.toContain(uk.bookmarks.emptyTitle);
  });

  it("comes back to the page it was pressed on, and a page past the end is the last one", async () => {
    mocks.listEngagementBookmarks.mockResolvedValue(
      Array.from({ length: 13 }, (_, index) => ({
        ...SAVED_VARIETY,
        key: `bookmark:${String(index).padStart(16, "0")}`,
        target: {
          ...SAVED_VARIETY.target,
          ref: `sort-${index}`,
          label: `Sort ${index}`,
        },
      })),
    );

    for (const page of ["2", "9"]) {
      const html = await renderShelf({ page });

      expect(count(html, 'data-shelf-row="true"')).toBe(1);
      expect(html).toContain("Sort 12");
      expect(html).toContain('name="returnTo" value="/bookmarks?page=2"');
    }
  });

  it("names what a removal removed, with an Undo that needs no bundle", async () => {
    mocks.listEngagementBookmarks.mockResolvedValue([SAVED_ENTRY]);
    mocks.findPublicEngagementTarget.mockResolvedValue({
      ...SAVED_VARIETY.target,
    });

    const html = await renderShelf({
      kind: "variety",
      outcome: "removed",
      action: "remove",
      target: `variety:${VARIETY}`,
    });
    const toast = notice(html);

    // Off the shelf, so its name is read again from its public page.
    expect(mocks.findPublicEngagementTarget).toHaveBeenCalledWith(
      { kind: "variety", ref: VARIETY },
      undefined,
      SCOPE,
    );
    expect(toast).toContain("«Pomidor Cheri» прибрано із закладок");
    expect(toast).toContain(uk.common.undo);
    expect(toast).toContain('name="targetKind" value="variety"');
    expect(toast).toContain(`name="targetRef" value="${VARIETY}"`);
    expect(toast).toContain('name="returnTo" value="/bookmarks?kind=variety"');
    expect(html).not.toContain('data-shelf-outcome="failed"');
  });

  it("says the removal of a withdrawn entry without a name, and offers no Undo that could only fail", async () => {
    const html = await renderShelf({
      outcome: "removed",
      action: "remove",
      target: `journal_entry:${GONE_ENTRY}`,
    });
    const toast = notice(html);

    // Saving needs a public target, so putting a withdrawn entry back would
    // be refused: the notice says what happened and offers nothing more.
    expect(mocks.findPublicEngagementTarget).toHaveBeenCalledWith(
      { kind: "journal_entry", ref: GONE_ENTRY },
      undefined,
      SCOPE,
    );
    expect(toast).toContain(uk.bookmarks.removedNoticeUnnamed);
    expect(toast).not.toContain(uk.common.undo);
    expect(toast).not.toContain("<form");
    expect(html).not.toContain(`value="${GONE_ENTRY}"`);
    expect(html).not.toContain("«");
  });

  it("names a restore by what the shelf has again, with nothing to undo", async () => {
    const html = await renderShelf({
      outcome: "restored",
      action: "restore",
      target: `variety:${VARIETY}`,
    });
    const toast = notice(html);

    expect(toast).toContain("«Pomidor Cheri» повернуто до закладок");
    expect(toast).not.toContain(uk.common.undo);
    expect(toast).not.toContain("<form");
    expect(mocks.findPublicEngagementTarget).not.toHaveBeenCalled();
    // The restored row is back, where the address lands.
    expect(html).toContain(`id="saved-variety-${VARIETY}"`);
  });

  it.each([
    [{ outcome: "removed", action: "remove", target: "user:someone" }],
    [{ outcome: "removed", action: "remove", target: "user:../../etc" }],
    [
      {
        outcome: "removed",
        action: "remove",
        target: "journal_entry:first-ripe-cluster",
      },
    ],
    [{ outcome: "removed", action: "remove", target: "variety" }],
    [{ outcome: "gone", action: "remove", target: `variety:${VARIETY}` }],
    // The addresses the shelf used before `OVE-502` say nothing any more.
    [{ undoKind: "variety", undoRef: VARIETY }],
  ])("ignores an outcome it cannot re-check: %j", async (query) => {
    const html = await renderShelf(query);

    expect(html).not.toContain("data-shelf-notice");
    expect(html).not.toContain("data-shelf-outcome");
    expect(html).not.toContain("someone");
    expect(html).not.toContain("../../etc");
    expect(mocks.findPublicEngagementTarget).not.toHaveBeenCalled();
  });

  it.each([
    ["a reference row", `variety:${VARIETY}`, `saved-variety-${VARIETY}`],
    [
      "a saved entry's card",
      `journal_entry:${ENTRY}`,
      `saved-journal_entry-${ENTRY}`,
    ],
  ])(
    "says a failed removal on its row, which is still there (%s)",
    async (_row, target, anchor) => {
      mocks.listEngagementBookmarks.mockResolvedValue([
        SAVED_ENTRY,
        SAVED_VARIETY,
      ]);

      const html = await renderShelf({
        outcome: "failed",
        action: "remove",
        target,
      });

      expect(row(html, anchor)).toContain('data-shelf-outcome="failed"');
      expect(row(html, anchor)).toContain(uk.bookmarks.failed.remove);
      expect(count(html, 'data-shelf-outcome="failed"')).toBe(1);
      expect(html).not.toContain('id="shelf-outcome"');
      expect(html).not.toContain("data-shelf-notice");
    },
  );

  it("says a failed removal above the shelf when its row is on another page of the view", async () => {
    mocks.listEngagementBookmarks.mockResolvedValue(
      Array.from({ length: 13 }, (_, index) => ({
        ...SAVED_VARIETY,
        key: `bookmark:${String(index).padStart(16, "0")}`,
        target: {
          ...SAVED_VARIETY.target,
          ref: `sort-${index}`,
          label: `Sort ${index}`,
        },
      })),
    );
    const outcome = {
      outcome: "failed",
      action: "remove",
      target: "variety:sort-12",
    };

    // The thirteenth row is on page two; the reader is on page one.
    const firstPage = await renderShelf(outcome);
    const callout = firstPage.slice(firstPage.indexOf('id="shelf-outcome"'));

    expect(firstPage).not.toContain('id="saved-variety-sort-12"');
    expect(firstPage).toContain('id="shelf-outcome"');
    expect(callout).toContain('data-shelf-outcome="failed"');
    expect(callout).toContain(uk.bookmarks.failed.remove);
    // A removal is pressed again on its row, not from the notice.
    expect(callout).not.toContain(uk.common.retry);
    expect(count(firstPage, 'data-shelf-outcome="failed"')).toBe(1);

    // On its own page, the same outcome is said beside the row.
    const secondPage = await renderShelf({ ...outcome, page: "2" });
    expect(row(secondPage, "saved-variety-sort-12")).toContain(
      'data-shelf-outcome="failed"',
    );
    expect(secondPage).not.toContain('id="shelf-outcome"');
  });

  it.each([
    ["is still public", { ...SAVED_VARIETY.target }, true],
    ["is not public any more", null, false],
  ])(
    "says a failed Undo above the shelf, and offers it again only while the thing %s",
    async (_case, removedTarget, retry) => {
      mocks.listEngagementBookmarks.mockResolvedValue([SAVED_ENTRY]);
      mocks.findPublicEngagementTarget.mockResolvedValue(removedTarget);

      const html = await renderShelf({
        kind: "variety",
        outcome: "failed",
        action: "restore",
        target: `variety:${VARIETY}`,
      });
      const callout = html.slice(html.indexOf('id="shelf-outcome"'));

      expect(html).toContain('id="shelf-outcome"');
      expect(callout).toContain('data-shelf-outcome="failed"');
      expect(callout).toContain(uk.bookmarks.failed.restore);
      expect(callout.includes(uk.common.retry)).toBe(retry);
      expect(callout.includes(`name="targetRef" value="${VARIETY}"`)).toBe(
        retry,
      );
      if (retry) {
        expect(callout).toContain(
          'name="returnTo" value="/bookmarks?kind=variety"',
        );
      }
      expect(html).not.toContain("data-shelf-notice");
    },
  );
});
