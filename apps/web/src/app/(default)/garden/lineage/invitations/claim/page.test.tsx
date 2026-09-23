import { renderServerHtml } from "@test/render-server-html";
import { LINEAGE_CLAIM_COOKIE_NAME } from "@/lib/lineage/claim-handoff";
import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  cookieGet: vi.fn(),
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  getLineageInvitationClaimState: vi.fn(),
  unsealLineageClaimToken: vi.fn(),
  inspectLineageInviteToken: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  // The signed-out path asks whether the reader arrived with a session cookie
  // before deciding that "no session" means "signed out" (`OVE-457`).
  headers: async () => ({ get: () => null }),
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
  getLineageInvitationClaimState: mocks.getLineageInvitationClaimState,
}));

vi.mock("@/server/lineage-claim-cookie", () => ({
  unsealLineageClaimToken: mocks.unsealLineageClaimToken,
}));

vi.mock("@/server/lineage-invite-token", () => ({
  inspectLineageInviteToken: mocks.inspectLineageInviteToken,
}));

vi.mock("./actions", () => ({
  confirmLineageInvitationClaimAction: vi.fn(async () => {}),
  declineLineageInvitationClaimAction: vi.fn(async () => {}),
}));

const VIEWER_ID = "00000000-0000-4000-8000-000000000777";
const SUBJECT_ID = "00000000-0000-4000-8000-000000000101";

function preview() {
  return {
    edgeId: "00000000-0000-4000-8000-000000000201",
    consentState: "proposed",
    pendingIdentity: {
      id: "00000000-0000-4000-8000-000000000301",
      displayLabel: "Maria saved seeds",
      inviteState: "pending",
    },
    subjectObject: {
      id: SUBJECT_ID,
      displayName: "Cherokee Purple",
      objectKind: "plant",
      catalogKind: "plant_variety",
      varietyText: "Tomato",
      varietyState: "selected",
    },
    createdAt: new Date("2026-07-03T18:00:00.000Z"),
  };
}

function ready() {
  return {
    state: "ready",
    preview: preview(),
    inviter: { handle: "olena", displayName: "Олена", profilePath: "/@olena" },
  };
}

async function renderClaimPage(searchParams?: Record<string, string>) {
  const { default: LineageInvitationClaimPage } = await import("./page");
  return await renderServerHtml(
    await LineageInvitationClaimPage({
      searchParams: Promise.resolve(searchParams ?? {}),
    }),
  );
}

function signIn() {
  mocks.getCurrentSession.mockResolvedValue({
    user: { id: VIEWER_ID },
    session: { id: "session-1" },
  });
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
    mocks.inspectLineageInviteToken.mockReturnValue({ state: "invalid" });
    mocks.getLineageInvitationClaimState.mockResolvedValue(ready());
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("stays out of search indexes", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata();

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.title).toBe(
      "Запрошення підтвердити походження | OverGarden",
    );
  });

  it("accepts a fragment handoff without server-rendering any token", async () => {
    mocks.cookieGet.mockImplementation(() => undefined);
    mocks.unsealLineageClaimToken.mockReturnValueOnce(null);
    mocks.getCurrentSession.mockResolvedValue(null);

    const html = await renderClaimPage();

    expect(html).toContain("Відкриваємо запрошення");
    expect(html).not.toMatch(/name="token"|private-payload|sealed\.tag/i);
    expect(mocks.getLineageInvitationClaimState).not.toHaveBeenCalled();
  });

  it.each(["valid", "expired"] as const)(
    "moves a %s legacy query invite into the fragment handoff, which says what it is",
    async (state) => {
      mocks.inspectLineageInviteToken.mockReturnValue({
        state,
        verification: {
          edgeId: "edge-1",
          pendingIdentityId: "p",
          expiresAt: 1,
        },
      });

      await expect(
        renderClaimPage({ token: "v1.legacy.private-signature" }),
      ).rejects.toThrow("NEXT_REDIRECT");

      expect(mocks.inspectLineageInviteToken).toHaveBeenCalledWith(
        "v1.legacy.private-signature",
      );
      expect(mocks.redirect).toHaveBeenCalledWith(
        "/garden/lineage/invitations/claim#token=v1.legacy.private-signature",
      );
      expect(mocks.cookies).not.toHaveBeenCalled();
    },
  );

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

    expect(html).toContain("Увійдіть, щоб відповісти");
    expect(html).toContain('data-invitation-state="guest"');
    expect(html).toContain("intent=claim");
    // The return path travels in the link now, not a hidden field: without a
    // target there is nothing to sign, so the trigger is a plain link (OVE-378).
    expect(html).toContain("next=%2Fgarden%2Flineage%2Finvitations%2Fclaim");
    expect(html).not.toMatch(
      /private-payload|opaque\.sealed|name="token"|Maria saved seeds|Cherokee Purple/i,
    );
    expect(mocks.getLineageInvitationClaimState).not.toHaveBeenCalled();
  });

  it("names the inviter, says what each answer changes, and asks before either", async () => {
    signIn();

    const html = await renderClaimPage({ authIntent: "claim" });

    expect(mocks.getLineageInvitationClaimState).toHaveBeenCalledWith(
      "v1.private-payload.private-signature",
      VIEWER_ID,
    );
    expect(html).toContain('data-invitation-state="ready"');
    expect(html).toContain("Чи походить «Cherokee Purple» від вас?");
    expect(html).toContain("Запрошує");
    expect(html).toContain('href="/@olena"');
    expect(html).toContain("Як вас записано");
    expect(html).toContain("Maria saved seeds");
    expect(html).toContain("Tomato · Сорт рослини");
    // An invitation never makes anything public, and nothing changes owner.
    expect(html).toContain("Публічно не з&#x27;явиться нічого");
    expect(html).toContain("нічого не переходить до вашого саду");
    expect(html.indexOf("Що зміниться")).toBeLessThan(
      html.indexOf("Так, це я"),
    );
    expect(html).toContain('data-confirm-submit="lineage-invitation-confirm"');
    expect(html).toContain('data-confirm-submit="lineage-invitation-decline"');
    expect(html).toMatch(
      /id="lineage-claim"[^>]*data-auth-intent-control="claim"/,
    );
    expect(html).not.toMatch(
      /private-payload|opaque\.sealed|name="token"|email|phone|raw url|referrer|ip address|user agent|coordinate|latitude|longitude|media key|journal body/i,
    );
  });

  it.each([
    [{ state: "expired" }, "expired", "Термін дії запрошення минув"],
    [{ state: "invalid" }, "invalid", "Посилання не вдалося перевірити"],
    [{ state: "withdrawn" }, "withdrawn", "Цього запрошення більше немає"],
    [
      { state: "answered", byViewer: true, decision: "confirmed" },
      "confirmed",
      "Ви підтвердили походження",
    ],
    [
      { state: "answered", byViewer: true, decision: "declined" },
      "declined",
      "Ви відхилили запрошення",
    ],
    [
      { state: "answered", byViewer: false, decision: "confirmed" },
      "answered-by-other",
      "На це запрошення вже відповіли",
    ],
  ] as const)(
    "gives %o its own sentence and no controls",
    async (invitation, marker, title) => {
      signIn();
      mocks.getLineageInvitationClaimState.mockResolvedValue(invitation);

      const html = await renderClaimPage();

      expect(html).toContain(`data-invitation-state="${marker}"`);
      expect(html).toContain(title);
      expect(html).not.toContain("data-confirm-submit");
      expect(html).not.toMatch(/Maria saved seeds|private-payload/);
    },
  );

  it("keeps the stored invitation replaceable by a newer link", async () => {
    signIn();

    const html = await renderClaimPage();

    // The region a newer link's handoff hides before it replaces the cookie.
    expect(html).toMatch(
      /data-lineage-invitation-region="true"[\s\S]*data-invitation-state="ready"/,
    );
  });

  it("tells the invitation's own writer it is for the other gardener", async () => {
    signIn();
    mocks.getLineageInvitationClaimState.mockResolvedValue({
      state: "own",
      preview: preview(),
    });

    const html = await renderClaimPage();

    expect(html).toContain('data-invitation-state="own"');
    expect(html).toContain("Це ваше запрошення");
    expect(html).toContain(`href="/garden/objects/${SUBJECT_ID}/provenance"`);
    expect(html).not.toContain("data-confirm-submit");
  });

  it("announces a stored answer, read back, after the redirect", async () => {
    signIn();
    mocks.getLineageInvitationClaimState.mockResolvedValue({
      state: "answered",
      byViewer: true,
      decision: "confirmed",
    });

    const html = await renderClaimPage({ result: "done" });

    expect(html).toContain('data-lineage-outcome="confirmed"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Ви підтвердили походження");
  });

  it("says an answer was not saved, and why, after a refused decision", async () => {
    signIn();
    mocks.getLineageInvitationClaimState.mockResolvedValue({
      state: "expired",
    });

    const html = await renderClaimPage({ result: "stale" });

    expect(html).toContain('data-lineage-outcome="stale"');
    expect(html).toContain('role="alert"');
    expect(html).toContain(
      "Відповідь не збережено. Термін дії запрошення минув",
    );
  });

  it("says an answer was not saved when the device lost the link", async () => {
    mocks.cookieGet.mockImplementation(() => undefined);
    mocks.unsealLineageClaimToken.mockReturnValueOnce(null);
    signIn();

    const html = await renderClaimPage({ result: "stale" });

    expect(html).toContain('data-lineage-outcome="stale"');
    expect(html).toContain("Відповідь не збережено.");
    expect(mocks.getLineageInvitationClaimState).not.toHaveBeenCalled();
  });

  it.each([
    ["bg", "Покана за потвърждаване на произход", "Да, това съм аз"],
    ["ru", "Приглашение подтвердить происхождение", "Да, это я"],
  ] as const)(
    "renders %s claim controls without translating identity values",
    async (locale, title, action) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      signIn();

      const html = await renderClaimPage();

      expect(html).toContain(title);
      expect(html).toContain(action);
      expect(html).toContain("Maria saved seeds");
      expect(html).toContain("Cherokee Purple");
    },
  );

  it("renders its own shell and a bounded failure when the relation is missing", async () => {
    signIn();
    mocks.getLineageInvitationClaimState.mockRejectedValue(
      postgresRejection("42P01", 'relation "lineage_edges" does not exist'),
    );

    const html = await renderClaimPage();

    expect(html).toContain('data-workspace-surface="lineage-invitation-claim"');
    expect(html).toContain("Запрошення підтвердити походження");
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain("lineage_edges");
    expect(html).not.toContain('data-workspace-state="loading"');
  });
});
