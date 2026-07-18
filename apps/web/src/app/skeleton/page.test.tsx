import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  headers: vi.fn(),
  listMyRecentJournalEntries: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  tryResolveWalkingSkeletonEnvironment: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/walking-skeleton/environment", () => ({
  isWalkingSkeletonRequestHostAllowed: (value: string | null) =>
    value === "localhost:3000",
  tryResolveWalkingSkeletonEnvironment:
    mocks.tryResolveWalkingSkeletonEnvironment,
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));
vi.mock("@/server/journal-repository", () => ({
  listMyRecentJournalEntries: mocks.listMyRecentJournalEntries,
}));

describe("/skeleton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tryResolveWalkingSkeletonEnvironment.mockReturnValue({
      target: "local",
    });
    mocks.headers.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.listMyRecentJournalEntries.mockResolvedValue([]);
  });

  it("returns not found for a non-loopback request host", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({ host: "developer-tunnel.example.test" }),
    );
    const { default: SkeletonPage } = await import("./page");

    await expect(SkeletonPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.listMyRecentJournalEntries).not.toHaveBeenCalled();
  });

  it("returns not found before session or repository access when disabled", async () => {
    mocks.tryResolveWalkingSkeletonEnvironment.mockReturnValue(null);
    const { default: SkeletonPage } = await import("./page");

    await expect(SkeletonPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.listMyRecentJournalEntries).not.toHaveBeenCalled();
  });

  it("directs signed-out local developers to canonical auth without a shared identity", async () => {
    const { default: SkeletonPage, metadata } = await import("./page");
    const html = renderToStaticMarkup(await SkeletonPage());

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(html).toContain('href="/garden"');
    expect(html).toContain("garden sign-in flow");
    expect(html).not.toContain("api/auth/sign-up");
    expect(html).not.toContain("api/auth/sign-in");
    expect(mocks.listMyRecentJournalEntries).not.toHaveBeenCalled();
  });

  it("renders only current-user readback without exposing account identifiers", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      session: { id: "session-private" },
      user: {
        id: "user-private",
        email: "private-account@example.test",
      },
    });
    mocks.listMyRecentJournalEntries.mockResolvedValue([
      {
        id: "entry-1",
        body: "Scoped diagnostic entry",
        visibility: "private",
        created_at: new Date("2026-07-18T08:00:00.000Z"),
      },
    ]);
    const { default: SkeletonPage } = await import("./page");
    const html = renderToStaticMarkup(await SkeletonPage());

    expect(mocks.listMyRecentJournalEntries).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-private" }),
      10,
    );
    expect(html).toContain("Scoped diagnostic entry");
    expect(html).toContain("Authenticated local session");
    expect(html).not.toContain("private-account@example.test");
    expect(html).not.toContain("session-private");
  });
});
