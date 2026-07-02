import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERASURE_REQUEST_INTAKE_VERSION } from "@/lib/privacy/disclosures";

const mocks = vi.hoisted(() => ({
  resolveErasureRequestOperatorAccess: vi.fn(),
  listOperatorErasureRequests: vi.fn(),
  getErasureDryRunPreviewForRequest: vi.fn(),
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

vi.mock("@/server/admin-access", () => ({
  hasAdminCapability: vi.fn(
    (access: { capabilities: string[] }, capability: string) =>
      access.capabilities.includes(capability),
  ),
}));

vi.mock("@/server/erasure-request-access", () => ({
  resolveErasureRequestOperatorAccess:
    mocks.resolveErasureRequestOperatorAccess,
}));

vi.mock("@/server/erasure-request-repository", () => ({
  listOperatorErasureRequests: mocks.listOperatorErasureRequests,
}));

vi.mock("@/server/erasure-dry-run-repository", () => ({
  getErasureDryRunPreviewForRequest: mocks.getErasureDryRunPreviewForRequest,
}));

vi.mock("@/server/erasure-execution", () => ({
  expectedErasureMaintainerApprovalText: () =>
    "APPROVE request-0000abcd IRREVERSIBLE ERASURE",
}));

vi.mock("./actions", () => ({
  executeApprovedErasureRequestAction: vi.fn(),
  markErasureRequestHandledAction: vi.fn(),
  markErasureRequestReviewingAction: vi.fn(),
  markErasureRequestDryRunReviewedAction: vi.fn(),
}));

describe("/garden/privacy/erasure-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveErasureRequestOperatorAccess.mockReturnValue({
      status: "allowed",
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
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
        dryRunReviewedAt: new Date("2026-06-29T09:00:00.000Z"),
        dryRunReviewedByUserId: "00000000-0000-4000-8000-000000000999",
      },
    ]);
    mocks.getErasureDryRunPreviewForRequest.mockResolvedValue({
      requestId: "00000000-0000-4000-8000-00000000abcd",
      requesterUserId: "00000000-0000-4000-8000-000000000001",
      generatedAt: new Date("2026-06-29T08:00:00.000Z"),
      dataClasses: [
        {
          key: "journal_entries",
          label: "Journal entries",
          description: "Private and public entry rows grouped by lifecycle.",
          counts: {
            total: 2,
            private_active: 1,
            public_active: 1,
            archived: 0,
          },
        },
      ],
      caveats: ["This preview is non-destructive and repeatable."],
    });
  });

  it("does not read erasure requests for a signed-in non-operator", async () => {
    mocks.resolveErasureRequestOperatorAccess.mockReturnValue({
      status: "denied",
    });

    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = renderToStaticMarkup(await ErasureRequestsOperatorPage());

    expect(html).toContain("Access denied.");
    expect(mocks.listOperatorErasureRequests).not.toHaveBeenCalled();
    expect(mocks.getErasureDryRunPreviewForRequest).not.toHaveBeenCalled();
  });

  it("renders dry-run preview counts without private journal evidence", async () => {
    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = renderToStaticMarkup(await ErasureRequestsOperatorPage());

    expect(html).toContain("Gate: sealed_owner_credential_only");
    expect(html).toContain("Role: owner");
    expect(mocks.listOperatorErasureRequests).toHaveBeenCalledOnce();
    expect(mocks.getErasureDryRunPreviewForRequest).toHaveBeenCalledOnce();
    expect(html).toContain("Non-destructive dry-run preview");
    expect(html).toContain("Journal entries");
    expect(html).toContain("Record dry-run review again");
    expect(html).toContain("Maintainer-approved irreversible erasure");
    expect(html).toContain("Execute approved erasure");
    expect(html).toContain("APPROVE request-0000abcd IRREVERSIBLE ERASURE");
    expect(html).toContain("request-0000abcd");
    expect(html).toContain("Mark handled");
    expect(html).toContain("Needs identity verification");
    expect(html).not.toContain('<option value="completed">');
    expect(html).not.toMatch(/quarantine|derivative|https?:\/\//i);
  });

});
