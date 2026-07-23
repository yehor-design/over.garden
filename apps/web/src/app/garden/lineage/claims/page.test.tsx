import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  listLineageClaimInbox: vi.fn(),
  resolvePilotWriteAccess: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "session-1"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/pilot-write-access", () => ({
  resolvePilotWriteAccess: mocks.resolvePilotWriteAccess,
}));

vi.mock("@/server/lineage-repository", () => ({
  listLineageClaimInbox: mocks.listLineageClaimInbox,
}));

vi.mock("../../garden-auth-panel", () => ({
  GardenAuthPanel: ({ locale }: { locale: string }) => (
    <section data-locale={locale}>Localized auth</section>
  ),
}));

vi.mock("./actions", () => ({
  confirmLineageClaimAction: vi.fn(),
  declineLineageClaimAction: vi.fn(),
}));

describe("/garden/lineage/claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.resolvePilotWriteAccess.mockResolvedValue({ canWrite: true, invited: false, actorClass: "self_serve" });
    mocks.listLineageClaimInbox.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000201",
        consentState: "proposed",
        visibilityPolicy: "owner_only_until_confirmed",
        erasureState: "active",
        createdAt: new Date("2026-07-03T18:00:00.000Z"),
        subjectObject: {
          id: "00000000-0000-4000-8000-000000000101",
          displayName: "Balcony tomato",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          varietyState: "selected",
        },
        sourceObject: {
          id: "00000000-0000-4000-8000-000000000102",
          displayName: "Seed mother",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          varietyState: "selected",
        },
      },
    ]);
  });

  it("requires auth before reading lineage claims", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const { default: LineageClaimInboxPage } = await import("./page");
    const html = renderToStaticMarkup(await LineageClaimInboxPage());

    expect(html).toContain("Запити щодо походження");
    expect(html).toContain('data-locale="uk"');
    expect(mocks.listLineageClaimInbox).not.toHaveBeenCalled();
    expect(mocks.resolvePilotWriteAccess).not.toHaveBeenCalled();
  });

  it("renders bounded proposed claim cards without private payload fields", async () => {
    const { default: LineageClaimInboxPage } = await import("./page");
    const html = renderToStaticMarkup(await LineageClaimInboxPage());

    expect(mocks.listLineageClaimInbox).toHaveBeenCalledOnce();
    expect(html).toContain("Запити щодо походження");
    expect(html).toContain(
      "Заявлене походження Balcony tomato від Seed mother",
    );
    expect(html).toContain("Balcony tomato · Red Cherry");
    expect(html).toContain("Seed mother · Red Cherry");
    expect(html).toContain("Запропоноване походження");
    expect(html).toContain("Підтвердити походження");
    expect(html).toContain("Відхилити");
    expect(html).not.toMatch(
      /journal body|quarantine|derivative|media key|ip_address|ipaddress|user_agent|useragent|user-agent|email|phone|coarse_region|location_visibility|coordinates|@private|https?:\/\//i,
    );
  });

  it("shows a bounded completion state after an invitation decision", async () => {
    const { default: LineageClaimInboxPage } = await import("./page");
    const html = renderToStaticMarkup(
      await LineageClaimInboxPage({
        searchParams: Promise.resolve({ invitation: "confirmed" }),
      }),
    );

    expect(html).toContain("Запрошення підтверджено");
    expect(html).toContain("зі збереженою політикою видимості");
    expect(html).not.toMatch(/token|private-payload|opaque\.sealed/i);
  });

  it.each([
    ["bg", "Заявки за произход", "Потвърждаване на произхода"],
    ["ru", "Запросы о происхождении", "Подтвердить происхождение"],
  ] as const)(
    "renders %s action copy without changing object values",
    async (locale, title, confirm) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);

      const { default: LineageClaimInboxPage } = await import("./page");
      const html = renderToStaticMarkup(await LineageClaimInboxPage());

      expect(html).toContain(title);
      expect(html).toContain(confirm);
      expect(html).toContain("Balcony tomato");
      expect(html).toContain("Seed mother");
    },
  );
});
