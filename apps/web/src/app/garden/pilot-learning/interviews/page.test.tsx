import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveFounderInterviewOperatorAccess: vi.fn(),
  listFounderInterviewLearnings: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-000000000999" },
  })),
  getSessionId: vi.fn(() => "operator-session"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: vi.fn(async () => "uk"),
}));

vi.mock("@/server/admin-access", () => ({
  hasAdminCapability: vi.fn(
    (access: { capabilities: string[] }, capability: string) =>
      access.capabilities.includes(capability),
  ),
}));

vi.mock("@/server/founder-interview-access", () => ({
  resolveFounderInterviewOperatorAccess:
    mocks.resolveFounderInterviewOperatorAccess,
}));

vi.mock("@/server/founder-interview-repository", () => ({
  listFounderInterviewLearnings: mocks.listFounderInterviewLearnings,
  groupFounderInterviewLearningsBySegment: vi.fn((records) => {
    const groups = new Map<string, typeof records>();
    for (const record of records) {
      const bucket = groups.get(record.segment) ?? [];
      bucket.push(record);
      groups.set(record.segment, bucket);
    }
    return [...groups.entries()].map(([segment, segmentRecords]) => ({
      segment,
      records: segmentRecords,
    }));
  }),
}));

vi.mock("./actions", () => ({
  createFounderInterviewLearningAction: vi.fn(),
}));

describe("/garden/pilot-learning/interviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFounderInterviewOperatorAccess.mockReturnValue({
      status: "allowed",
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "admin:manage_roles",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
    });
    mocks.listFounderInterviewLearnings.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-00000000abcd",
        recordedByUserId: "00000000-0000-4000-8000-000000000999",
        subjectUserId: "00000000-0000-4000-8000-000000000001",
        pilotCohort: "closed_pilot",
        segment: "casual_practical_beginner",
        activationResult: "activated_with_follow_up",
        returnReason: "same_object_follow_up",
        mainObjection: "none_observed",
        observedValue: "history_worth_keeping",
        nextAction: "continue_pilot",
        redactedNote: "Follow-up felt natural.",
        recordedAt: new Date("2026-06-29T08:00:00.000Z"),
      },
    ]);
  });

  it("does not read interview records for a signed-in non-operator", async () => {
    mocks.resolveFounderInterviewOperatorAccess.mockReturnValue({
      status: "denied",
    });

    const { default: FounderInterviewCapturePage } = await import("./page");
    const html = renderToStaticMarkup(
      await FounderInterviewCapturePage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Доступ заборонено.");
    expect(mocks.listFounderInterviewLearnings).not.toHaveBeenCalled();
  });

  it("renders grouped readback without private journal evidence", async () => {
    const { default: FounderInterviewCapturePage } = await import("./page");
    const html = renderToStaticMarkup(
      await FounderInterviewCapturePage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Режим доступу: лише захищений власник з паролем");
    expect(html).toContain("Роль: Власник");
    expect(mocks.listFounderInterviewLearnings).toHaveBeenCalledOnce();
    expect(html).toContain("Активовано — перший і повторний запис");
    expect(html).toContain("Follow-up felt natural.");
    expect(html).not.toMatch(/quarantine|derivative|https?:\/\//i);
  });
});
