import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  resolveErasureRequestOperatorAccess: vi.fn(),
  markErasureRequestHandled: vi.fn(),
  markErasureRequestReviewing: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));

vi.mock("@/server/erasure-request-access", () => ({
  resolveErasureRequestOperatorAccess:
    mocks.resolveErasureRequestOperatorAccess,
}));

vi.mock("@/server/erasure-request-repository", () => ({
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
    mocks.resolveErasureRequestOperatorAccess.mockReturnValue({
      status: "allowed",
      mode: "allowlist",
    });
  });

  it("rejects review mutation before repository writes for a non-operator", async () => {
    mocks.resolveErasureRequestOperatorAccess.mockReturnValue({
      status: "denied",
    });

    const { markErasureRequestReviewingAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "request-1");

    await expect(markErasureRequestReviewingAction(formData)).rejects.toThrow(
      "Erasure request operator access denied.",
    );
    expect(mocks.markErasureRequestReviewing).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("allows review mutation for an allowlisted operator", async () => {
    const { markErasureRequestReviewingAction } = await import("./actions");
    const formData = new FormData();
    formData.set("requestId", "request-1");

    await markErasureRequestReviewingAction(formData);

    expect(mocks.markErasureRequestReviewing).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/privacy/erasure-requests",
    );
  });
});
