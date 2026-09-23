import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  submitErasureRequest: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn(() => null),
}));
vi.mock("@/server/erasure-request-repository", () => ({
  submitErasureRequest: mocks.submitErasureRequest,
}));

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};

function form(accepted: boolean) {
  const formData = new FormData();
  if (accepted) formData.set("erasureAcknowledgementAccepted", "on");
  return formData;
}

describe("/erasure action (OVE-505)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: SCOPE,
    });
    mocks.submitErasureRequest.mockResolvedValue({ id: "request-1" });
  });

  it("records the request and lands on the page, which reads it back", async () => {
    const { submitErasureRequestAction } = await import("./actions");

    await expect(
      submitErasureRequestAction(undefined, form(true)),
    ).rejects.toThrow("NEXT_REDIRECT:/erasure?result=received");
    expect(mocks.submitErasureRequest).toHaveBeenCalledWith(SCOPE);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/erasure");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/privacy/erasure-requests",
    );
  });

  it("sends nothing without the acknowledgement, and says so on the page", async () => {
    const { submitErasureRequestAction } = await import("./actions");

    await expect(
      submitErasureRequestAction(undefined, form(false)),
    ).rejects.toThrow("NEXT_REDIRECT:/erasure?result=acknowledgement-required");
    expect(mocks.submitErasureRequest).not.toHaveBeenCalled();
  });

  it("returns a session refusal to the form", async () => {
    mocks.resolveMutationScope.mockResolvedValueOnce({
      status: "rejected",
      code: "session_required",
    });
    const { submitErasureRequestAction } = await import("./actions");

    await expect(
      submitErasureRequestAction(undefined, form(true)),
    ).resolves.toEqual({ mutationScope: "session_required" });
    expect(mocks.submitErasureRequest).not.toHaveBeenCalled();
  });
});
