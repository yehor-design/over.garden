import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  redirect: vi.fn(),
  cookies: vi.fn(),
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
  unsealLineageClaimToken: vi.fn(),
  createAuthIntentToken: vi.fn(),
  resolveMutationScope: vi.fn(),
  resolveLineageInvitationClaim: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: mocks.updateTag,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn((formData: FormData) =>
    formData.get("__overgardenDocumentGeneration"),
  ),
}));
vi.mock("@/server/auth-intent-token", () => ({
  createAuthIntentToken: mocks.createAuthIntentToken,
}));
vi.mock("@/server/lineage-claim-cookie", () => ({
  unsealLineageClaimToken: mocks.unsealLineageClaimToken,
}));
vi.mock("@/server/lineage-repository", async () => {
  class LineageDecisionUnavailableError extends Error {
    constructor(readonly subject: "claim" | "invitation") {
      super("unavailable");
    }
  }
  return {
    resolveLineageInvitationClaim: mocks.resolveLineageInvitationClaim,
    LineageDecisionUnavailableError,
    isLineageDecisionUnavailableError: (error: unknown) =>
      error instanceof LineageDecisionUnavailableError,
  };
});

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000777",
  sessionId: "session-1",
};

describe("/garden/lineage/invitations/claim actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: mocks.cookieGet,
      delete: mocks.cookieDelete,
    });
    mocks.cookieGet.mockReturnValue({ value: "v1.opaque.sealed.tag" });
    mocks.unsealLineageClaimToken.mockReturnValue(
      "v1.private-payload.private-signature",
    );
    mocks.createAuthIntentToken.mockReturnValue("opaque-claim-intent");
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: SCOPE,
    });
    mocks.resolveLineageInvitationClaim.mockResolvedValue({
      edge: {
        subject_plant_object_id: "00000000-0000-4000-8000-000000000101",
      },
      decision: "confirmed",
    });
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  it("confirms using only the server-readable encrypted cookie, then reads the answer back", async () => {
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(
      confirmLineageInvitationClaimAction(undefined, new FormData()),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/garden/lineage/invitations/claim?result=done",
    );

    expect(mocks.resolveMutationScope).toHaveBeenCalledOnce();
    expect(mocks.resolveLineageInvitationClaim).toHaveBeenCalledWith(SCOPE, {
      token: "v1.private-payload.private-signature",
      decision: "confirmed",
    });
    // The cookie stays: the page reads "you confirmed" from the record, and
    // the record is no longer pending, so the token cannot be used twice.
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
    // Nothing public changes; the writer's provenance page does.
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/lineage/invitations/claim",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/objects/00000000-0000-4000-8000-000000000101/provenance",
    );
  });

  it("declines without accepting a token from form data", async () => {
    const { declineLineageInvitationClaimAction } = await import("./actions");
    const formData = new FormData();
    formData.set("token", "v1.forged.from-form");

    await expect(
      declineLineageInvitationClaimAction(undefined, formData),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/garden/lineage/invitations/claim?result=done",
    );

    expect(mocks.resolveLineageInvitationClaim).toHaveBeenCalledWith(
      expect.any(Object),
      {
        token: "v1.private-payload.private-signature",
        decision: "declined",
      },
    );
  });

  it("writes nothing and says so when the handoff cookie is absent or invalid", async () => {
    mocks.unsealLineageClaimToken.mockReturnValueOnce(null);
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(
      confirmLineageInvitationClaimAction(undefined, new FormData()),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/garden/lineage/invitations/claim?result=stale",
    );

    expect(mocks.resolveLineageInvitationClaim).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("writes nothing and says so when the invitation can no longer be answered", async () => {
    const { LineageDecisionUnavailableError } =
      await import("@/server/lineage-repository");
    mocks.resolveLineageInvitationClaim.mockRejectedValueOnce(
      new LineageDecisionUnavailableError("invitation"),
    );
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(
      confirmLineageInvitationClaimAction(undefined, new FormData()),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/garden/lineage/invitations/claim?result=stale",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets an unexpected failure reach the error boundary", async () => {
    mocks.resolveLineageInvitationClaim.mockRejectedValueOnce(
      new Error("pool closed"),
    );
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(
      confirmLineageInvitationClaimAction(undefined, new FormData()),
    ).rejects.toThrow("pool closed");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("resumes the claim after admission reports that authentication is required", async () => {
    mocks.resolveMutationScope.mockResolvedValueOnce({
      status: "rejected",
      code: "session_required",
    });
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(
      confirmLineageInvitationClaimAction(undefined, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT:/auth/intent?intent=opaque-claim-intent");

    expect(mocks.createAuthIntentToken).toHaveBeenCalledWith({
      action: "claim",
      returnTo: "/garden/lineage/invitations/claim",
    });
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.resolveLineageInvitationClaim).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.createAuthIntentToken.mock.calls)).not.toMatch(
      /private-payload|sealed\.tag/i,
    );
  });

  it("does not misclassify an operational admission failure as authentication", async () => {
    const failure = new Error("session store unavailable");
    mocks.resolveMutationScope.mockRejectedValueOnce(failure);
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(
      confirmLineageInvitationClaimAction(undefined, new FormData()),
    ).rejects.toBe(failure);

    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
