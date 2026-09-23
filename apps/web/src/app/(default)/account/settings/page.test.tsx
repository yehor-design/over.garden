import { renderServerHtml } from "@test/render-server-html";
import { missingRelationRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  listBlockedProfiles: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
}));

// The signed-out path asks whether the reader arrived with a session cookie
// before deciding that "no session" means "signed out" (`OVE-457`).
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/owner-profile-repository", () => ({
  listBlockedProfiles: mocks.listBlockedProfiles,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: { next?: string }) => (
    <section data-sign-in-prompt="true" data-next={props.next ?? ""}>
      Sign in prompt
    </section>
  ),
}));
vi.mock("@/app/(default)/garden/profile/actions", () => ({
  unblockProfileAction: vi.fn(),
}));
vi.mock("@/components/public/locale-actions", () => ({
  setInterfaceLocaleAction: vi.fn(),
}));

const BLOCKED = [
  {
    blockId: "00000000-0000-4000-8000-000000000222",
    handle: "blocked_keeper",
    displayName: "Blocked Keeper",
  },
];

describe("/account/settings (OVE-503)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.listBlockedProfiles.mockResolvedValue(BLOCKED);
  });

  it("holds the language, the blocked list and the way to your data — and nothing public", async () => {
    const { default: Page } = await import("./page");
    const html = await renderServerHtml(
      await Page({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('data-workspace-surface="account-settings"');
    expect(html).toMatch(/<h1[^>]*>Налаштування<\/h1>/u);
    expect(html).toMatch(
      /<a(?=[^>]*href="\/account\/settings")(?=[^>]*aria-current="page")[^>]*>/u,
    );
    // The language: one real form per language, the current one pressed.
    expect(html).toContain('data-interface-language-setting="true"');
    expect(html.match(/<form\b/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toMatch(
      /<button(?=[^>]*data-interface-locale="uk")(?=[^>]*aria-pressed="true")[^>]*>/u,
    );
    expect(html).toMatch(
      /<button(?=[^>]*data-interface-locale="bg")(?=[^>]*aria-pressed="false")[^>]*>/u,
    );
    // The blocked list, read for this member only, each with its own undo.
    expect(mocks.listBlockedProfiles).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    expect(html).toContain("Blocked Keeper");
    expect(html).toContain('aria-label="Розблокувати, Blocked Keeper"');
    // Data and deletion: where to go, and what the request does.
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/erasure"');
    expect(html).toContain("сам запит нічого не видаляє");
    // No public-profile field and no sign-in method here.
    expect(html).not.toContain('name="displayName"');
    expect(html).not.toContain('name="handle"');
    expect(html).not.toMatch(/email|provider|session-1|token/iu);
  });

  it("confirms a block or an unblock where the list is, in the reader's language", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    const { default: Page } = await import("./page");
    const html = await renderServerHtml(
      await Page({
        searchParams: Promise.resolve({ relationshipStatus: "unblocked" }),
      }),
    );

    expect(html).toContain("Блокирани профили");
    expect(html).toMatch(/role="status"[^>]*>Профилът е разблокиран\./u);
  });

  it("says there is nobody blocked, rather than drawing an empty list", async () => {
    mocks.listBlockedProfiles.mockResolvedValue([]);
    const { default: Page } = await import("./page");
    const html = await renderServerHtml(
      await Page({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Заблокованих профілів немає.");
  });

  it("keeps the page when the blocked list cannot be read", async () => {
    mocks.listBlockedProfiles.mockRejectedValueOnce(
      missingRelationRejection("profile_blocks"),
    );
    const { default: Page } = await import("./page");
    const html = await renderServerHtml(
      await Page({ searchParams: Promise.resolve({}) }),
    );

    // One section fails as a value; the language and the data links remain.
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).toContain('data-interface-language-setting="true"');
    expect(html).toContain('href="/erasure"');
    expect(html).not.toContain("profile_blocks");
  });

  it("asks a signed-out reader to sign in and come back here", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { default: Page } = await import("./page");
    const html = await renderServerHtml(
      await Page({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('data-next="/account/settings"');
    expect(mocks.listBlockedProfiles).not.toHaveBeenCalled();
  });
});
