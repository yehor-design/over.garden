import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERASURE_REQUEST_INTAKE_VERSION } from "@/lib/privacy/disclosures";

const mocks = vi.hoisted(() => ({
  resolveErasureRequestOperatorAccess: vi.fn(),
  listOperatorErasureRequests: vi.fn(),
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

vi.mock("@/server/erasure-request-access", () => ({
  resolveErasureRequestOperatorAccess: mocks.resolveErasureRequestOperatorAccess,
}));

vi.mock("@/server/erasure-request-repository", () => ({
  listOperatorErasureRequests: mocks.listOperatorErasureRequests,
}));

vi.mock("./actions", () => ({
  markErasureRequestHandledAction: vi.fn(),
  markErasureRequestReviewingAction: vi.fn(),
}));

describe("/garden/privacy/erasure-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveErasureRequestOperatorAccess.mockReturnValue({
      status: "allowed",
      mode: "allowlist",
    });
    mocks.listOperatorErasureRequests.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-00000000abcd",
        requesterUserId: "00000000-0000-4000-8000-000000000001",
        requestScope: "account_data_erasure",
        status: "reviewing",
        submittedAt: new Date("2026-06-27T08:00:00.000Z"),
        handledAt: null,
        handledStatus: null,
        intakeDisclosureVersion: ERASURE_REQUEST_INTAKE_VERSION,
      },
    ]);
  });

  it("does not read erasure requests for a signed-in non-operator", async () => {
    mocks.resolveErasureRequestOperatorAccess.mockReturnValue({
      status: "denied",
    });

    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = renderToStaticMarkup(await ErasureRequestsOperatorPage());

    expect(html).toContain("Access denied.");
    expect(mocks.listOperatorErasureRequests).not.toHaveBeenCalled();
  });

  it("renders the operator status controls without private journal evidence", async () => {
    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = renderToStaticMarkup(await ErasureRequestsOperatorPage());

    expect(html).toContain("Gate: allowlist");
    expect(mocks.listOperatorErasureRequests).toHaveBeenCalledOnce();
    expect(html).toContain("request-0000abcd");
    expect(html).toContain("Mark handled");
    expect(html).toContain("Needs identity verification");
    expect(html).not.toMatch(/quarantine|derivative|https?:\/\//i);
  });
});
