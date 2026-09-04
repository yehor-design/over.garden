import { renderServerHtml } from "@test/render-server-html";
import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  listLineageClaimInbox: vi.fn(),
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

vi.mock("@/server/lineage-repository", () => ({
  listLineageClaimInbox: mocks.listLineageClaimInbox,
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
    const html = await renderServerHtml(await LineageClaimInboxPage());

    expect(html).toContain("Запити щодо походження");
    expect(html).toContain('data-locale="uk"');
    expect(mocks.listLineageClaimInbox).not.toHaveBeenCalled();
  });

  it("renders bounded proposed claim cards without private payload fields", async () => {
    const { default: LineageClaimInboxPage } = await import("./page");
    const html = await renderServerHtml(await LineageClaimInboxPage());

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
    const html = await renderServerHtml(
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
      const html = await renderServerHtml(await LineageClaimInboxPage());

      expect(html).toContain(title);
      expect(html).toContain(confirm);
      expect(html).toContain("Balcony tomato");
      expect(html).toContain("Seed mother");
    },
  );

  it("renders its own shell and a bounded failure when the relation is missing", async () => {
    mocks.listLineageClaimInbox.mockRejectedValueOnce(
      postgresRejection("42P01", 'relation "lineage_edges" does not exist'),
    );

    const { default: Page } = await import("./page");
    const html = await renderServerHtml(await Page());

    expect(html).toContain('data-workspace-surface="lineage-claims"');
    expect(html).toContain("Запити щодо походження");
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain("lineage_edges");
    expect(html).not.toContain('data-workspace-state="loading"');
  });
});
