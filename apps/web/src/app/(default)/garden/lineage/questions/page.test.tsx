import { renderServerHtml } from "@test/render-server-html";
import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  listLineageQuestionInbox: vi.fn(),
  listLineageFollowReadback: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "session-1"),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/lineage-interactions-repository", () => ({
  listLineageQuestionInbox: mocks.listLineageQuestionInbox,
  listLineageFollowReadback: mocks.listLineageFollowReadback,
}));

vi.mock("../../garden-auth-panel", () => ({
  GardenAuthPanel: ({ locale }: { locale: string }) => (
    <section data-locale={locale}>Localized auth</section>
  ),
}));

describe("/garden/lineage/questions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.listLineageQuestionInbox.mockResolvedValue([
      {
        id: "question-1",
        questionText: "Did this tomato tolerate the July heat?",
        targetObject: {
          id: "object-1",
          displayName: "Balcony tomato",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          varietyState: "selected",
        },
        createdAt: new Date("2026-07-03T18:00:00.000Z"),
      },
    ]);
    mocks.listLineageFollowReadback.mockResolvedValue([
      {
        id: "follow-1",
        targetObject: {
          id: "object-2",
          displayName: "Seed mother",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: null,
          varietyState: "provisional",
        },
        createdAt: new Date("2026-07-02T18:00:00.000Z"),
      },
    ]);
  });

  it.each([
    ["uk", "Оновлення походження", "Питання для вас"],
    ["bg", "Обновления за произхода", "Въпроси към вас"],
    ["ru", "Обновления происхождения", "Вопросы для вас"],
  ] as const)(
    "renders %s interface copy while preserving UGC",
    async (locale, title, questionsTitle) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);

      const { default: LineageUpdatesPage } = await import("./page");
      const html = await renderServerHtml(await LineageUpdatesPage());

      expect(html).toContain(title);
      expect(html).toContain(questionsTitle);
      expect(html).toContain("Did this tomato tolerate the July heat?");
      expect(html).toContain("Balcony tomato");
      expect(html).toContain("Red Cherry");
      expect(html).not.toContain("plant variety");
    },
  );

  it("inherits the selected locale before authentication without reading owner data", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    mocks.getCurrentSession.mockResolvedValue(null);

    const { default: LineageUpdatesPage } = await import("./page");
    const html = await renderServerHtml(await LineageUpdatesPage());

    expect(html).toContain("Обновления за произхода");
    expect(html).toContain('data-locale="bg"');
    expect(mocks.listLineageQuestionInbox).not.toHaveBeenCalled();
    expect(mocks.listLineageFollowReadback).not.toHaveBeenCalled();
  });

  it("renders localized empty states", async () => {
    mocks.listLineageQuestionInbox.mockResolvedValue([]);
    mocks.listLineageFollowReadback.mockResolvedValue([]);

    const { default: LineageUpdatesPage } = await import("./page");
    const html = await renderServerHtml(await LineageUpdatesPage());

    expect(html).toContain("Для вас немає нових питань про походження.");
    expect(html).toContain("Ви ще не стежите за вузлами походження.");
  });

  it("renders its own shell and a bounded failure when the relation is missing", async () => {
    mocks.listLineageQuestionInbox.mockRejectedValueOnce(
      postgresRejection("42P01", 'relation "lineage_questions" does not exist'),
    );

    const { default: Page } = await import("./page");
    const html = await renderServerHtml(await Page());

    expect(html).toContain('data-workspace-surface="lineage-questions"');
    expect(html).toContain("Оновлення походження");
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain("lineage_questions");
    expect(html).not.toContain('data-workspace-state="loading"');
  });
});
