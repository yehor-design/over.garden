import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderServerHtml } from "@test/render-server-html";
import { postgresRejection } from "@test/postgres-rejection";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  readAtomicJournalEditBaseline: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: mocks.redirect,
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "edit-session"),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: vi.fn(async () => "uk"),
}));

vi.mock("@/server/journal-repository", () => ({
  readAtomicJournalEditBaseline: mocks.readAtomicJournalEditBaseline,
}));

vi.mock(
  "@/app/(default)/garden/entries/[entryId]/edit/journal-entry-edit-composer",
  () => ({
    JournalEntryEditComposer: ({ entryId }: { entryId: string }) => (
      <form data-entry-edit-composer={entryId}>Edit composer</form>
    ),
  }),
);

const BASELINE = {
  entry: {
    id: "00000000-0000-4000-8000-0000000000e1",
    title: "First flowers",
    entry_date: "2026-07-02",
    journal_revision: 3,
    cover_media_asset_id: null,
  },
  document: { blocks: [] },
  media: [],
};

async function renderEditPage() {
  const { default: Page } = await import("./page");
  return await renderServerHtml(
    await Page({
      params: Promise.resolve({ entryId: BASELINE.entry.id }),
      searchParams: Promise.resolve({}),
    }),
  );
}

describe("/garden/entries/[entryId]/edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
    });
    mocks.readAtomicJournalEditBaseline.mockResolvedValue(BASELINE);
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("renders its own shell around the composer", async () => {
    const html = await renderEditPage();

    expect(html).toContain('data-workspace-surface="entry-edit"');
    expect(html).toContain("Редагування запису");
    expect(html).toContain("Edit composer");
    expect(html).not.toContain('data-workspace-state="loading"');
  });

  it("renders its own shell and a bounded failure when the relation is missing", async () => {
    mocks.readAtomicJournalEditBaseline.mockRejectedValue(
      postgresRejection("42P01", 'relation "journal_entries" does not exist'),
    );

    const html = await renderEditPage();

    expect(html).toContain('data-workspace-surface="entry-edit"');
    expect(html).toContain("Редагування запису");
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain("Edit composer");
    expect(html).not.toContain("journal_entries");
  });

  it("says an absent entry is absent instead of throwing a not-found", async () => {
    mocks.readAtomicJournalEditBaseline.mockResolvedValue(null);

    const html = await renderEditPage();

    expect(html).toContain('data-workspace-record="missing"');
    expect(html).not.toContain("Edit composer");
  });

  it("still redirects a signed-out visitor to the sign-in intent", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    await expect(renderEditPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/auth/intent?returnTo="),
    );
    expect(mocks.readAtomicJournalEditBaseline).not.toHaveBeenCalled();
  });

  it("renders the session failure instead of bouncing to a sign-in page", async () => {
    mocks.getCurrentSession.mockRejectedValue(
      postgresRejection("ECONNREFUSED"),
    );

    const html = await renderEditPage();

    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.readAtomicJournalEditBaseline).not.toHaveBeenCalled();
  });
});
