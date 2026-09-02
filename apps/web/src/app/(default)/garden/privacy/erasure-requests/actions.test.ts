import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  resolveMutationScope: vi.fn(),
  assertErasureExecutionAccess: vi.fn(),
  assertErasureRequestMutationAccess: vi.fn(),
  executeApprovedErasureRequest: vi.fn(),
  markErasureRequestDryRunReviewed: vi.fn(),
  markErasureRequestHandled: vi.fn(),
  markErasureRequestReviewing: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn(() => null),
}));

vi.mock("@/server/erasure-request-access", () => ({
  assertErasureExecutionAccess: mocks.assertErasureExecutionAccess,
  assertErasureRequestMutationAccess: mocks.assertErasureRequestMutationAccess,
}));

vi.mock("@/server/erasure-execution", () => ({
  executeApprovedErasureRequest: mocks.executeApprovedErasureRequest,
}));

vi.mock("@/server/erasure-request-repository", () => ({
  markErasureRequestDryRunReviewed: mocks.markErasureRequestDryRunReviewed,
  markErasureRequestHandled: mocks.markErasureRequestHandled,
  markErasureRequestReviewing: mocks.markErasureRequestReviewing,
}));

describe("erasure request operator actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000999",
      sessionId: "non-operator-session",
    });
    mocks.resolveMutationScope.mockImplementation(async () => ({
      status: "admitted",
      scope: await mocks.requireCurrentRequestScope(),
    }));
    mocks.assertErasureRequestMutationAccess.mockResolvedValue({
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
    });
    mocks.assertErasureExecutionAccess.mockResolvedValue({
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
    });
  });

  it("rejects review mutation before repository writes for a non-operator", async () => {
    mocks.assertErasureRequestMutationAccess.mockRejectedValue(
      new Error("Admin access denied."),
    );

    const { markErasureRequestReviewingAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "request-1");

    await expect(markErasureRequestReviewingAction(formData)).rejects.toThrow(
      "Admin access denied.",
    );
    expect(mocks.markErasureRequestReviewing).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("allows review mutation for the sealed owner", async () => {
    const { markErasureRequestReviewingAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "request-1");

    await markErasureRequestReviewingAction(formData);

    expect(mocks.markErasureRequestReviewing).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/privacy/erasure-requests",
    );
  });

  it("rejects completed outcomes through the non-destructive handled action", async () => {
    const { markErasureRequestHandledAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "00000000-0000-4000-8000-00000000abcd");
    formData.set("handledStatus", "completed");

    await expect(markErasureRequestHandledAction(formData)).rejects.toThrow(
      "Completed erasure requests must use approved erasure execution.",
    );
    expect(mocks.markErasureRequestHandled).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects irreversible execution before repository writes for a non-operator", async () => {
    mocks.assertErasureExecutionAccess.mockRejectedValue(
      new Error("Admin access denied."),
    );

    const { executeApprovedErasureRequestAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "00000000-0000-4000-8000-00000000abcd");
    formData.set(
      "maintainerApprovalText",
      "APPROVE request-0000abcd IRREVERSIBLE ERASURE",
    );

    await expect(executeApprovedErasureRequestAction(formData)).rejects.toThrow(
      "Admin access denied.",
    );
    expect(mocks.executeApprovedErasureRequest).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("executes maintainer-approved erasure for sealed owner execution access", async () => {
    const { executeApprovedErasureRequestAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "00000000-0000-4000-8000-00000000abcd");
    formData.set(
      "maintainerApprovalText",
      "APPROVE request-0000abcd IRREVERSIBLE ERASURE",
    );

    await executeApprovedErasureRequestAction(formData);

    expect(mocks.executeApprovedErasureRequest).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000999",
        sessionId: "non-operator-session",
      },
      {
        requestId: "00000000-0000-4000-8000-00000000abcd",
        approvalText: "APPROVE request-0000abcd IRREVERSIBLE ERASURE",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/privacy/erasure-requests",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/erasure");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
  });
});
