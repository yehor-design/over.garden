import { renderServerHtml } from "@test/render-server-html";
import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  listLineageClaimInbox: vi.fn(),
  getLineageClaimRecord: vi.fn(),
}));

// The signed-out path asks whether the reader arrived with a session cookie
// before deciding that "no session" means "signed out" (`OVE-457`), and that
// question reads the request's own `cookie` header.
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
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
  getLineageClaimRecord: mocks.getLineageClaimRecord,
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

const EDGE_ID = "00000000-0000-4000-8000-000000000201";

function claim(overrides: Record<string, unknown> = {}) {
  return {
    id: EDGE_ID,
    consentState: "proposed",
    visibilityPolicy: "owner_only_until_confirmed",
    erasureState: "active",
    createdAt: new Date("2026-07-03T18:00:00.000Z"),
    proposer: {
      handle: "anna",
      displayName: "Анна Коваль",
      profilePath: "/@anna",
    },
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
    ...overrides,
  };
}

async function renderClaims(
  searchParams: Record<string, string> = {},
): Promise<string> {
  const { default: LineageClaimInboxPage } = await import("./page");
  return renderServerHtml(
    await LineageClaimInboxPage({
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("/garden/lineage/claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.listLineageClaimInbox.mockResolvedValue([claim()]);
    mocks.getLineageClaimRecord.mockResolvedValue(null);
  });

  it("requires auth before reading lineage claims", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const html = await renderClaims();

    expect(html).toContain("Заявки на походження");
    expect(html).toContain('data-locale="uk"');
    expect(html).toContain('data-next="/garden/lineage/claims"');
    expect(mocks.listLineageClaimInbox).not.toHaveBeenCalled();
  });

  it("names the page among the lineage tasks (OVE-495)", async () => {
    const html = await renderClaims();

    expect(html).toContain('data-lineage-sections="true"');
    expect(html).toMatch(
      /<a aria-current="page"[^>]*href="\/garden\/lineage\/claims">Заявки</,
    );
    expect(html).toMatch(
      /<a class="[^"]*" href="\/garden\/lineage\/questions">Запитання</,
    );
  });

  it("says who claims what, and what each answer changes, before the controls", async () => {
    const html = await renderClaims();

    expect(mocks.listLineageClaimInbox).toHaveBeenCalledOnce();
    // Both names in a sentence, and whose each object is.
    expect(html).toContain(
      "«Balcony tomato» походить від вашого «Seed mother»",
    );
    expect(html).toContain("Заявник");
    expect(html).toContain('href="/@anna"');
    expect(html).toContain("Анна Коваль");
    expect(html).toContain("@anna");
    expect(html).toContain("Заявлений об&#x27;єкт");
    expect(html).toContain(
      'href="/garden/objects/00000000-0000-4000-8000-000000000102"',
    );
    expect(html).toContain("Red Cherry · Сорт рослини");
    expect(html).toContain("Чекає на вашу відповідь");
    // The consequences come before the buttons in the document.
    const consequences = html.indexOf("Що зміниться");
    const confirm = html.indexOf("Підтвердити походження");
    expect(consequences).toBeGreaterThan(-1);
    expect(consequences).toBeLessThan(confirm);
    expect(html).toContain("не генетичний аналіз");
    expect(html).toContain("Змінити відповідь потім не можна");
    // Each answer asks first, and is still a real submit before hydration.
    expect(html).toContain(
      `data-confirm-submit="lineage-claim-confirm-${EDGE_ID}"`,
    );
    expect(html).toContain(
      `data-confirm-submit="lineage-claim-decline-${EDGE_ID}"`,
    );
    expect(html).toContain("Відхилити заявку");
    // Icons carry an SVG namespace URL; nothing else on the card may.
    expect(html.replace(/<svg[\s\S]*?<\/svg>/gu, "")).not.toMatch(
      /journal body|quarantine|derivative|media key|ip_address|ipaddress|user_agent|useragent|user-agent|email|phone|coarse_region|location_visibility|coordinates|@private|https?:\/\//i,
    );
  });

  it("says so when the gardener has no public profile to show", async () => {
    mocks.listLineageClaimInbox.mockResolvedValue([claim({ proposer: null })]);

    const html = await renderClaims();

    expect(html).toContain("Садівник без публічного профілю");
    expect(html).not.toContain("data-lineage-gardener");
  });

  it("reads the answer back and says what is stored now", async () => {
    mocks.listLineageClaimInbox.mockResolvedValue([]);
    mocks.getLineageClaimRecord.mockResolvedValue(
      claim({ consentState: "confirmed" }),
    );

    const html = await renderClaims({ claim: EDGE_ID, result: "done" });

    expect(mocks.getLineageClaimRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "00000000-0000-4000-8000-000000000001",
      }),
      EDGE_ID,
    );
    expect(html).toContain('data-lineage-outcome="confirmed"');
    expect(html).toContain("Походження підтверджено");
    expect(html).toContain(
      "«Balcony tomato» походить від вашого «Seed mother»",
    );
    expect(html).toContain('role="status"');
  });

  it("says a declined claim is shown nowhere", async () => {
    mocks.getLineageClaimRecord.mockResolvedValue(
      claim({ consentState: "declined" }),
    );

    const html = await renderClaims({ claim: EDGE_ID, result: "done" });

    expect(html).toContain('data-lineage-outcome="declined"');
    expect(html).toContain("Заявку відхилено");
    expect(html).toContain("ніде не показується");
  });

  it.each([
    ["confirmed", "Ви вже підтвердили цю заявку раніше"],
    ["declined", "Ви вже відхилили цю заявку раніше"],
  ] as const)(
    "says an answer was not saved because the claim was already %s",
    async (consentState, sentence) => {
      mocks.getLineageClaimRecord.mockResolvedValue(claim({ consentState }));

      const html = await renderClaims({ claim: EDGE_ID, result: "stale" });

      expect(html).toContain('data-lineage-outcome="stale"');
      expect(html).toContain("Відповідь не збережено");
      expect(html).toContain(sentence);
      expect(html).toContain('role="alert"');
    },
  );

  it("says an answer was not saved because the claim is gone", async () => {
    mocks.getLineageClaimRecord.mockResolvedValue(null);

    const html = await renderClaims({ claim: EDGE_ID, result: "stale" });

    expect(html).toContain("Цієї заявки більше немає");
  });

  it("ignores an outcome address it cannot read", async () => {
    const html = await renderClaims({ claim: EDGE_ID, result: "published" });

    expect(mocks.getLineageClaimRecord).not.toHaveBeenCalled();
    expect(html).not.toContain("data-lineage-outcome");
  });

  it("says what to expect when nothing is waiting", async () => {
    mocks.listLineageClaimInbox.mockResolvedValue([]);

    const html = await renderClaims();

    expect(html).toContain("Заявок немає");
    expect(html).not.toContain("data-confirm-submit");
  });

  it.each([
    [
      "bg",
      "Заявки за произход",
      "Потвърждаване на произхода",
      "„Balcony tomato“",
    ],
    [
      "ru",
      "Заявки о происхождении",
      "Подтвердить происхождение",
      "«Balcony tomato»",
    ],
  ] as const)(
    "renders %s action copy without changing object values",
    async (locale, title, confirm, quoted) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);

      const html = await renderClaims();

      expect(html).toContain(title);
      expect(html).toContain(confirm);
      expect(html).toContain(quoted);
      expect(html).toContain("Seed mother");
    },
  );

  it("renders its own shell and a bounded failure when the relation is missing", async () => {
    mocks.listLineageClaimInbox.mockRejectedValueOnce(
      postgresRejection("42P01", 'relation "lineage_edges" does not exist'),
    );

    const html = await renderClaims();

    expect(html).toContain('data-workspace-surface="lineage-claims"');
    expect(html).toContain("Заявки на походження");
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain("lineage_edges");
    expect(html).not.toContain('data-workspace-state="loading"');
  });
});
