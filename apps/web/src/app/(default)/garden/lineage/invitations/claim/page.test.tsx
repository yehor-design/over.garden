import { renderServerHtml } from "@test/render-server-html";
import { LINEAGE_CLAIM_COOKIE_NAME } from "@/lib/lineage/claim-handoff";
import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  cookieGet: vi.fn(),
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  getLineageInvitationClaimPreview: vi.fn(),
  unsealLineageClaimToken: vi.fn(),
  verifyLineageInviteToken: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: mocks.redirect,
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "claim-session"),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/lineage-repository", () => ({
  getLineageInvitationClaimPreview: mocks.getLineageInvitationClaimPreview,
}));

vi.mock("@/server/lineage-claim-cookie", () => ({
  unsealLineageClaimToken: mocks.unsealLineageClaimToken,
}));

vi.mock("@/server/lineage-invite-token", () => ({
  verifyLineageInviteToken: mocks.verifyLineageInviteToken,
}));

vi.mock("./actions", () => ({
  confirmLineageInvitationClaimAction: vi.fn(async () => {}),
  declineLineageInvitationClaimAction: vi.fn(async () => {}),
}));

async function renderClaimPage(searchParams?: Record<string, string>) {
  const { default: LineageInvitationClaimPage } = await import("./page");
  return await renderServerHtml(
    await LineageInvitationClaimPage({
      searchParams: Promise.resolve(searchParams ?? {}),
    }),
  );
}

describe("/garden/lineage/invitations/claim page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
    // Name-aware: only the lineage claim cookie is present. A blanket return
    // would also answer for the session cookie, and the page would then read a
    // signed-in viewer that this suite never set up.
    mocks.cookieGet.mockImplementation((name: string) =>
      name === LINEAGE_CLAIM_COOKIE_NAME
        ? { value: "v1.opaque.sealed.tag" }
        : undefined,
    );
    mocks.unsealLineageClaimToken.mockReturnValue(
      "v1.private-payload.private-signature",
    );
    mocks.verifyLineageInviteToken.mockReturnValue(null);
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("stays out of search indexes", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata();

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.title).toBe("Запрошення щодо походження | OverGarden");
  });

  it("accepts a fragment handoff without server-rendering any token", async () => {
    mocks.cookieGet.mockImplementation(() => undefined);
    mocks.unsealLineageClaimToken.mockReturnValueOnce(null);
    mocks.getCurrentSession.mockResolvedValue(null);

    const html = await renderClaimPage();

    expect(html).toContain("Готуємо приватне запрошення");
    expect(html).not.toMatch(/name="token"|private-payload|sealed\.tag/i);
    expect(mocks.getLineageInvitationClaimPreview).not.toHaveBeenCalled();
  });

  it("migrates a valid legacy query invite into the fragment handoff", async () => {
    mocks.verifyLineageInviteToken.mockReturnValue({
      edgeId: "edge-1",
      pendingIdentityId: "pending-1",
      expiresAt: 1,
    });

    await expect(
      renderClaimPage({ token: "v1.legacy.private-signature" }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.verifyLineageInviteToken).toHaveBeenCalledWith(
      "v1.legacy.private-signature",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden/lineage/invitations/claim#token=v1.legacy.private-signature",
    );
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it("cleans an invalid legacy query invite without reflecting it", async () => {
    await expect(
      renderClaimPage({ token: "invalid-private-token" }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden/lineage/invitations/claim",
    );
    expect(JSON.stringify(mocks.redirect.mock.calls)).not.toContain(
      "invalid-private-token",
    );
  });

  it("keeps details hidden and starts auth with only the clean claim route", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const html = await renderClaimPage();

    expect(html).toContain("Увійдіть, щоб переглянути приватне запрошення");
    expect(html).toContain("intent=claim");
    // The return path travels in the link now, not a hidden field: without a
    // target there is nothing to sign, so the trigger is a plain link (OVE-378).
    expect(html).toContain(
      "next=%2Fgarden%2Flineage%2Finvitations%2Fclaim",
    );
    expect(html).not.toMatch(
      /private-payload|opaque\.sealed|name="token"|Maria saved seeds|Cherokee Purple/i,
    );
    expect(mocks.getLineageInvitationClaimPreview).not.toHaveBeenCalled();
  });

  it("renders bounded claim details without placing the token in forms or DOM", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000777" },
      session: { id: "session-1" },
    });
    mocks.getLineageInvitationClaimPreview.mockResolvedValue({
      edgeId: "00000000-0000-4000-8000-000000000201",
      consentState: "proposed",
      pendingIdentity: {
        id: "00000000-0000-4000-8000-000000000301",
        displayLabel: "Maria saved seeds",
        inviteState: "pending",
      },
      subjectObject: {
        id: "00000000-0000-4000-8000-000000000101",
        displayName: "Cherokee Purple",
        objectKind: "plant",
        catalogKind: "plant_variety",
        varietyText: "Tomato",
        varietyState: "selected",
      },
      createdAt: new Date("2026-07-03T18:00:00.000Z"),
    });

    const html = await renderClaimPage({ authIntent: "claim" });

    expect(mocks.getLineageInvitationClaimPreview).toHaveBeenCalledWith(
      "v1.private-payload.private-signature",
    );
    expect(html).toContain("Maria saved seeds");
    expect(html).toContain("Cherokee Purple");
    expect(html).toContain(
      "Очікує рішення · ще не впливає на публічне походження",
    );
    expect(html).toContain("Прийняти й підтвердити");
    expect(html).toContain("Відхилити");
    expect(html).toContain(
      'id="lineage-claim" data-auth-intent-control="claim" autofocus=""',
    );
    expect(html).not.toMatch(
      /private-payload|opaque\.sealed|name="token"|email|phone|raw url|referrer|ip address|user agent|coordinate|latitude|longitude|media key|journal body/i,
    );
  });

  it("shows a safe unavailable state for an invalid or handled token", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000777" },
      session: { id: "session-1" },
    });
    mocks.getLineageInvitationClaimPreview.mockResolvedValue(null);

    const html = await renderClaimPage();

    expect(html).toContain(
      "Це запрошення недоступне, прострочене або вже опрацьоване.",
    );
    expect(html).not.toMatch(/Прийняти й підтвердити|Maria saved seeds/i);
  });

  it.each([
    ["bg", "Покана за произход", "Приемане и потвърждаване"],
    ["ru", "Приглашение подтвердить происхождение", "Принять и подтвердить"],
  ] as const)(
    "renders %s claim controls without translating identity values",
    async (locale, title, action) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      mocks.getCurrentSession.mockResolvedValue({
        user: { id: "00000000-0000-4000-8000-000000000777" },
        session: { id: "session-1" },
      });
      mocks.getLineageInvitationClaimPreview.mockResolvedValue({
        edgeId: "edge-1",
        consentState: "proposed",
        pendingIdentity: {
          id: "pending-1",
          displayLabel: "Maria saved seeds",
          inviteState: "pending",
        },
        subjectObject: {
          id: "object-1",
          displayName: "Cherokee Purple",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Tomato",
          varietyState: "selected",
        },
        createdAt: new Date("2026-07-03T18:00:00.000Z"),
      });

      const html = await renderClaimPage();

      expect(html).toContain(title);
      expect(html).toContain(action);
      expect(html).toContain("Maria saved seeds");
      expect(html).toContain("Cherokee Purple");
    },
  );

  it("renders its own shell and a bounded failure when the relation is missing", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000777" },
      session: { id: "session-1" },
    });
    mocks.getLineageInvitationClaimPreview.mockRejectedValue(
      postgresRejection("42P01", 'relation "lineage_edges" does not exist'),
    );

    const html = await renderClaimPage();

    expect(html).toContain('data-workspace-surface="lineage-invitation-claim"');
    expect(html).toContain("Запрошення щодо походження");
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain("lineage_edges");
    expect(html).not.toContain('data-workspace-state="loading"');
  });
});
