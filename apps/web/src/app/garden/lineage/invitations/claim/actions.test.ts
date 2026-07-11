import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  cookies: vi.fn(),
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
  unsealLineageClaimToken: vi.fn(),
  createAuthIntentToken: vi.fn(),
  requireCurrentRequestScope: vi.fn(async () => ({
    userId: "00000000-0000-4000-8000-000000000777",
    sessionId: "session-1",
  })),
  resolveLineageInvitationClaim: vi.fn(async () => ({
    edge: {
      subject_plant_object_id: "00000000-0000-4000-8000-000000000101",
    },
    decision: "confirmed",
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth-session", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));
vi.mock("@/server/auth-intent-token", () => ({
  createAuthIntentToken: mocks.createAuthIntentToken,
}));
vi.mock("@/server/lineage-claim-cookie", () => ({
  unsealLineageClaimToken: mocks.unsealLineageClaimToken,
}));
vi.mock("@/server/lineage-repository", () => ({
  resolveLineageInvitationClaim: mocks.resolveLineageInvitationClaim,
}));

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
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  it("confirms using only the server-readable encrypted cookie", async () => {
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(confirmLineageInvitationClaimAction()).rejects.toThrow(
      "NEXT_REDIRECT:/garden/lineage/claims?invitation=confirmed",
    );

    expect(mocks.requireCurrentRequestScope).toHaveBeenCalledOnce();
    expect(mocks.resolveLineageInvitationClaim).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000777",
        sessionId: "session-1",
      },
      {
        token: "v1.private-payload.private-signature",
        decision: "confirmed",
      },
    );
    expect(mocks.cookieDelete).toHaveBeenCalledWith({
      name: "overgarden-lineage-claim",
      path: "/garden/lineage/invitations/claim",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/lineage/invitations/claim",
    );
  });

  it("declines without accepting a token from form data", async () => {
    const { declineLineageInvitationClaimAction } = await import("./actions");

    await expect(declineLineageInvitationClaimAction()).rejects.toThrow(
      "NEXT_REDIRECT:/garden/lineage/claims?invitation=declined",
    );

    expect(mocks.resolveLineageInvitationClaim).toHaveBeenCalledWith(
      expect.any(Object),
      {
        token: "v1.private-payload.private-signature",
        decision: "declined",
      },
    );
    expect(mocks.cookieDelete).toHaveBeenCalledOnce();
  });

  it("fails closed when the handoff cookie is absent or invalid", async () => {
    mocks.unsealLineageClaimToken.mockReturnValueOnce(null);
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(confirmLineageInvitationClaimAction()).rejects.toThrow(
      "Lineage invitation is unavailable.",
    );

    expect(mocks.resolveLineageInvitationClaim).not.toHaveBeenCalled();
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("resumes the claim after a session expires without moving the invite token", async () => {
    const { AuthenticationRequiredError } =
      await import("@/server/auth-session");
    mocks.requireCurrentRequestScope.mockRejectedValueOnce(
      new AuthenticationRequiredError(),
    );
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(confirmLineageInvitationClaimAction()).rejects.toThrow(
      "NEXT_REDIRECT:/auth/intent?intent=opaque-claim-intent",
    );

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

  it("does not misclassify an operational scope failure as authentication", async () => {
    const failure = new Error("session store unavailable");
    mocks.requireCurrentRequestScope.mockRejectedValueOnce(failure);
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(confirmLineageInvitationClaimAction()).rejects.toBe(failure);

    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
