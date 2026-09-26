import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveReportTarget: vi.fn(),
  submitContentReport: vi.fn(),
  reportFingerprint: vi.fn((address: string) => `fp:${address}`),
  drainModerationMessages: vi.fn(),
  after: vi.fn(),
  headers: vi.fn(
    async () => new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
  ),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: vi.fn(async () => null),
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: vi.fn(async () => "uk"),
}));
vi.mock("@/server/moderation/content-reports", () => ({
  resolveReportTarget: mocks.resolveReportTarget,
  submitContentReport: mocks.submitContentReport,
  reportFingerprint: mocks.reportFingerprint,
}));
vi.mock("@/server/moderation/moderation-mail", () => ({
  drainModerationMessages: mocks.drainModerationMessages,
}));
vi.mock("@/server/workspace-failure", () => ({
  describeWorkspaceFailure: () => ({ failureClass: "unknown" }),
  recordWorkspaceSectionFailure: vi.fn(),
}));

import { submitReportAction, type ReportFormState } from "./actions";

const idle: ReportFormState = {
  status: "idle",
  errors: [],
  values: { reason: "", explanation: "", name: "", email: "" },
};

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

const complete = {
  address: "/@olena/post/7",
  reason: "harassment",
  explanation: "Погрози в тексті запису.",
  name: "Ірина",
  email: "iryna@example.test",
  goodFaith: "on",
};

const target = {
  kind: "entry",
  id: "00000000-0000-4000-8000-000000000007",
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  address: "/@olena/post/7",
  label: "Перші квіти",
};

describe("the report form's endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveReportTarget.mockResolvedValue(target);
    mocks.submitContentReport.mockResolvedValue({
      status: "received",
      reportId: "r",
    });
  });

  it("files a complete report under the first forwarded address, and sends the receipt after", async () => {
    const state = await submitReportAction(idle, form(complete));
    expect(state.status).toBe("received");
    expect(mocks.reportFingerprint).toHaveBeenCalledWith("203.0.113.9");
    expect(mocks.submitContentReport).toHaveBeenCalledWith(
      expect.objectContaining({
        target,
        fingerprint: "fp:203.0.113.9",
        reporterUserId: null,
        locale: "uk",
        form: expect.objectContaining({
          reason: "harassment",
          email: "iryna@example.test",
        }),
      }),
    );
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("returns what was typed with the fields to fix, and files nothing", async () => {
    const state = await submitReportAction(
      idle,
      form({ ...complete, explanation: "коротко", goodFaith: "" }),
    );
    expect(state).toEqual({
      status: "invalid",
      errors: ["explanation", "goodFaith"],
      values: {
        reason: "harassment",
        explanation: "коротко",
        name: "Ірина",
        email: "iryna@example.test",
      },
    });
    expect(mocks.submitContentReport).not.toHaveBeenCalled();
  });

  it("says a page that went meanwhile is gone", async () => {
    mocks.resolveReportTarget.mockResolvedValue(null);
    expect((await submitReportAction(idle, form(complete))).status).toBe(
      "not_found",
    );
    expect(mocks.submitContentReport).not.toHaveBeenCalled();
  });

  it("says the limit, and sends nothing", async () => {
    mocks.submitContentReport.mockResolvedValue({ status: "rate_limited" });
    expect((await submitReportAction(idle, form(complete))).status).toBe(
      "rate_limited",
    );
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("says a failure and keeps what was typed", async () => {
    mocks.submitContentReport.mockRejectedValue(new Error("down"));
    const state = await submitReportAction(idle, form(complete));
    expect(state.status).toBe("failed");
    expect(state.values.explanation).toBe(complete.explanation);
  });
});
