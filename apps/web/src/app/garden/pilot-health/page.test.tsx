import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePilotHealthOperatorAccess: vi.fn(),
  getPilotHealthReadoutSafely: vi.fn(),
  getMvpLearningReportSafely: vi.fn(),
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

vi.mock("@/server/pilot-health-access", () => ({
  resolvePilotHealthOperatorAccess: mocks.resolvePilotHealthOperatorAccess,
}));

vi.mock("@/server/pilot-health-repository", () => ({
  getPilotHealthReadoutSafely: mocks.getPilotHealthReadoutSafely,
}));

vi.mock("@/server/mvp-learning/report", () => ({
  getMvpLearningReportSafely: mocks.getMvpLearningReportSafely,
}));

describe("/garden/pilot-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePilotHealthOperatorAccess.mockReturnValue({
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
    mocks.getPilotHealthReadoutSafely.mockResolvedValue(null);
    mocks.getMvpLearningReportSafely.mockResolvedValue(null);
  });

  it("does not read aggregate health data for a signed-in non-operator", async () => {
    mocks.resolvePilotHealthOperatorAccess.mockReturnValue({
      status: "denied",
    });

    const { default: PilotHealthPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotHealthPage());

    expect(html).toContain("Доступ заборонено.");
    expect(mocks.getPilotHealthReadoutSafely).not.toHaveBeenCalled();
  });

  it("renders the operator readout boundary for the sealed owner", async () => {
    const { default: PilotHealthPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotHealthPage());

    expect(html).toContain("Режим доступу: лише захищений власник з паролем");
    expect(html).toContain("Роль: Власник");
    expect(mocks.getPilotHealthReadoutSafely).toHaveBeenCalledOnce();
  });

  it("shows founder rehearsal grants separately from closed-pilot writers", async () => {
    mocks.getPilotHealthReadoutSafely.mockResolvedValue({
      generatedAt: new Date("2026-06-29T12:00:00.000Z"),
      windows: [],
      publicVarietyIndexability: {
        promotedIndexableCount: 0,
        thinNoindexCount: 0,
        demotedByArchiveOrGoneCount: 0,
        currentPublicVarietyCount: 0,
        threshold: {
          minPublicEntryCount: 3,
          minAggregateBodyLength: 600,
        },
      },
      writeAccess: {
        writeEligibleGardeners: 2,
        founderRehearsalGardeners: 1,
      },
      notes: [],
      references: [],
    });

    const { default: PilotHealthPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotHealthPage());

    expect(html).toContain("Автори закритого пілоту");
    expect(html).toContain("Репетиція засновника");
    expect(html).toContain("виключені з метрик рішення H1/OVE-53");
  });

  it("renders separate H4 publisher rates and the explicit H6 deferral", async () => {
    mocks.getMvpLearningReportSafely.mockResolvedValue({
      policyVersion: "ove200.learning.v1",
      policyDate: "2026-07-24",
      retentionPolicyVersion: "ove195.retention.v1",
      generatedAt: new Date("2026-08-01T12:00:00.000Z"),
      windowDays: 30,
      since: new Date("2026-07-02T12:00:00.000Z"),
      cohorts: {
        real_self_serve: {
          cohort: "real_self_serve",
          activatedGardeners: 2,
          h1RetainedGardeners: 1,
          h1Rate: 0.5,
          publishedGardeners: 1,
          publishedEntries: 2,
          publishRate: 0.5,
          sameObjectFollowUpEntries: 1,
          sameSessionRevisitFollowUps: 1,
        },
        real_closed_pilot: {
          cohort: "real_closed_pilot",
          activatedGardeners: 1,
          h1RetainedGardeners: 0,
          h1Rate: 0,
          publishedGardeners: 1,
          publishedEntries: 1,
          publishRate: 1,
          sameObjectFollowUpEntries: 0,
          sameSessionRevisitFollowUps: 0,
        },
      },
      exclusions: {
        founder_rehearsal: 0,
        production_smoke: 0,
        visual_fixture: 0,
        editorial_seed: 0,
        automated_bot: 0,
      },
      attributionOutbox: {
        pending: 0,
        processing: 0,
        failed: 0,
        dead: 0,
        attributed: 0,
        cancelled: 0,
      },
      unclassifiedEventCount: 0,
      unclassifiedActiveGardenerCount: 0,
      organicAcquisition: {
        status: "not_instrumented",
        decisionReady: false,
      },
      editorialPublicTrafficProxy: 3,
      decisionGate: "insufficient",
      notes: [],
    });

    const { default: PilotHealthPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotHealthPage());

    expect(html).toContain("Self-serve H4 публікатори");
    expect(html).toContain("Закритий пілот H4 частка публікації");
    expect(html).toContain("Органічне залучення ще не вимірюється");
    expect(html).toContain("not_instrumented");
  });
});
