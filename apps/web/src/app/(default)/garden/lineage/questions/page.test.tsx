import { renderServerHtml } from "@test/render-server-html";
import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  listLineageQuestionInbox: vi.fn(),
  listLineageFollowReadback: vi.fn(),
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

const TARGET_ID = "00000000-0000-4000-8000-000000000101";

async function renderQuestions() {
  const { default: LineageQuestionsPage } = await import("./page");
  return renderServerHtml(await LineageQuestionsPage());
}

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
          id: TARGET_ID,
          displayName: "Balcony tomato",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          varietyState: "selected",
        },
        asker: {
          handle: "anna",
          displayName: "Анна Коваль",
          profilePath: "/@anna",
        },
        relation: { askerObjectName: "Tomato", readerObjectIsSource: true },
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
        owner: { handle: "petro", displayName: null, profilePath: "/@petro" },
        createdAt: new Date("2026-07-02T18:00:00.000Z"),
      },
    ]);
  });

  it.each([
    ["uk", "Запитання про походження", "За чим ви стежите"],
    ["bg", "Въпроси за произхода", "Какво следите"],
    ["ru", "Вопросы о происхождении", "За чем вы следите"],
  ] as const)(
    "renders %s interface copy while preserving UGC",
    async (locale, title, followedTitle) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);

      const html = await renderQuestions();

      expect(html).toContain(title);
      expect(html).toContain(followedTitle);
      expect(html).toContain("Did this tomato tolerate the July heat?");
      expect(html).toContain("Balcony tomato");
      expect(html).toContain("Red Cherry");
      expect(html).not.toContain("plant variety");
    },
  );

  it("names the page among the lineage tasks (OVE-495)", async () => {
    const html = await renderQuestions();

    expect(html).toMatch(
      /<a aria-current="page"[^>]*href="\/garden\/lineage\/questions">Запитання</,
    );
    expect(html).toMatch(
      /<a class="[^"]*" href="\/garden\/lineage\/claims">Заявки</,
    );
  });

  it("says who asked, about which object, through which link, and how to answer", async () => {
    const html = await renderQuestions();

    expect(html).toContain("Про ваш «Balcony tomato»");
    expect(html).toContain("Питає");
    expect(html).toContain('href="/@anna"');
    expect(html).toContain("Анна Коваль");
    // Related objects are often called the same: the link is said both ways.
    expect(html).toContain(
      "Через зв&#x27;язок: «Tomato» походить від вашого «Balcony tomato»",
    );
    // The one way to answer there is, on this exact object.
    expect(html).toContain(`href="/garden/new?object=${TARGET_ID}"`);
    expect(html).toContain("Відповісти записом про «Balcony tomato»");
  });

  it("reads a link that runs the other way", async () => {
    mocks.listLineageQuestionInbox.mockResolvedValue([
      {
        id: "question-2",
        questionText: "Where did yours come from?",
        targetObject: {
          id: TARGET_ID,
          displayName: "Balcony tomato",
          objectKind: "plant",
          catalogKind: null,
          varietyText: null,
          varietyState: "unknown",
        },
        asker: null,
        relation: {
          askerObjectName: "Seed mother",
          readerObjectIsSource: false,
        },
        createdAt: new Date("2026-07-03T18:00:00.000Z"),
      },
    ]);

    const html = await renderQuestions();

    expect(html).toContain(
      "Через зв&#x27;язок: ваш «Balcony tomato» походить від «Seed mother»",
    );
    expect(html).toContain("Садівник без публічного профілю");
  });

  it("names whose object is followed, by handle when there is no display name", async () => {
    const html = await renderQuestions();

    expect(html).toContain("Доглядальник");
    expect(html).toContain('href="/@petro"');
    expect(html).toContain("@petro");
    expect(html).toContain("Стежите з");
  });

  it("inherits the selected locale before authentication without reading owner data", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    mocks.getCurrentSession.mockResolvedValue(null);

    const html = await renderQuestions();

    expect(html).toContain("Въпроси за произхода");
    expect(html).toContain('data-locale="bg"');
    expect(html).toContain('data-next="/garden/lineage/questions"');
    expect(mocks.listLineageQuestionInbox).not.toHaveBeenCalled();
    expect(mocks.listLineageFollowReadback).not.toHaveBeenCalled();
  });

  it("renders localized empty states that say who can ask", async () => {
    mocks.listLineageQuestionInbox.mockResolvedValue([]);
    mocks.listLineageFollowReadback.mockResolvedValue([]);

    const html = await renderQuestions();

    expect(html).toContain("Запитань немає");
    expect(html).toContain("з яким ви підтвердили походження");
    expect(html).toContain("Ви ще ні за чим не стежите");
  });

  it("renders its own shell and a bounded failure when the relation is missing", async () => {
    mocks.listLineageQuestionInbox.mockRejectedValueOnce(
      postgresRejection("42P01", 'relation "lineage_questions" does not exist'),
    );

    const html = await renderQuestions();

    expect(html).toContain('data-workspace-surface="lineage-questions"');
    expect(html).toContain("Запитання про походження");
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain("lineage_questions");
    expect(html).not.toContain('data-workspace-state="loading"');
    // The follows settle on their own and still render.
    expect(html).toContain("Seed mother");
  });
});
