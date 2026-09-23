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
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

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

vi.mock("@/server/erasure-execution", () => {
  class ErasureApprovalPhraseError extends Error {}
  class ErasureRequestNotExecutableError extends Error {}
  return {
    executeApprovedErasureRequest: mocks.executeApprovedErasureRequest,
    ErasureApprovalPhraseError,
    ErasureRequestNotExecutableError,
  };
});

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

    await expect(
      markErasureRequestReviewingAction(undefined, formData),
    ).rejects.toThrow("Admin access denied.");
    expect(mocks.markErasureRequestReviewing).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("allows review mutation for the sealed owner", async () => {
    const { markErasureRequestReviewingAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "request-1");

    await expect(
      markErasureRequestReviewingAction(undefined, formData),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/garden/privacy/erasure-requests?request=request-1&result=done",
    );

    expect(mocks.markErasureRequestReviewing).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/privacy/erasure-requests",
    );
  });

  it("writes nothing and says so when the request moved on in another tab (OVE-505)", async () => {
    const { NoResultError } = await import("kysely");
    mocks.markErasureRequestReviewing.mockRejectedValueOnce(
      new NoResultError({} as never),
    );
    const { markErasureRequestReviewingAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "request-1");

    await expect(
      markErasureRequestReviewingAction(undefined, formData),
    ).rejects.toThrow("result=stale");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects completed outcomes through the non-destructive handled action", async () => {
    const { markErasureRequestHandledAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "00000000-0000-4000-8000-00000000abcd");
    formData.set("handledStatus", "completed");

    await expect(
      markErasureRequestHandledAction(undefined, formData),
    ).rejects.toThrow(
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

    await expect(
      executeApprovedErasureRequestAction(undefined, formData),
    ).rejects.toThrow("Admin access denied.");
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

    await expect(
      executeApprovedErasureRequestAction(undefined, formData),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/garden/privacy/erasure-requests?request=00000000-0000-4000-8000-00000000abcd&result=done",
    );

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

  it("erases nothing and says so when the approval phrase does not match", async () => {
    const { ErasureApprovalPhraseError } =
      await import("@/server/erasure-execution");
    mocks.executeApprovedErasureRequest.mockRejectedValueOnce(
      new ErasureApprovalPhraseError("APPROVE"),
    );
    const { executeApprovedErasureRequestAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "00000000-0000-4000-8000-00000000abcd");
    formData.set("maintainerApprovalText", "approve");

    await expect(
      executeApprovedErasureRequestAction(undefined, formData),
    ).rejects.toThrow("result=approval");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets an unexpected failure reach the error boundary", async () => {
    mocks.executeApprovedErasureRequest.mockRejectedValueOnce(
      new Error("pool closed"),
    );
    const { executeApprovedErasureRequestAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "00000000-0000-4000-8000-00000000abcd");
    formData.set(
      "maintainerApprovalText",
      "APPROVE request-0000abcd IRREVERSIBLE ERASURE",
    );

    await expect(
      executeApprovedErasureRequestAction(undefined, formData),
    ).rejects.toThrow("pool closed");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
