import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  cookies: vi.fn(),
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
  unsealLineageClaimToken: vi.fn(),
  createAuthIntentToken: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  admitDocumentMutation: vi.fn(),
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
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromFormData: vi.fn((formData: FormData) =>
    formData.get("__overgardenDocumentGeneration"),
  ),
}));
vi.mock("@/server/auth-intent-token", () => ({
  createAuthIntentToken: mocks.createAuthIntentToken,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
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
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope: {
        userId: "00000000-0000-4000-8000-000000000777",
        sessionId: "session-1",
      },
    });
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  it("confirms using only the server-readable encrypted cookie", async () => {
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(
      confirmLineageInvitationClaimAction(new FormData()),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/garden/lineage/claims?invitation=confirmed",
    );

    expect(mocks.admitDocumentMutation).toHaveBeenCalledOnce();
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

    await expect(
      declineLineageInvitationClaimAction(new FormData()),
    ).rejects.toThrow(
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

    await expect(
      confirmLineageInvitationClaimAction(new FormData()),
    ).rejects.toThrow("Запрошення щодо походження недоступне.");

    expect(mocks.resolveLineageInvitationClaim).not.toHaveBeenCalled();
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("resumes the claim after admission reports that authentication is required", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      transportResult: "AUTHENTICATION_REQUIRED",
    });
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(
      confirmLineageInvitationClaimAction(new FormData()),
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
    mocks.admitDocumentMutation.mockRejectedValueOnce(failure);
    const { confirmLineageInvitationClaimAction } = await import("./actions");

    await expect(
      confirmLineageInvitationClaimAction(new FormData()),
    ).rejects.toBe(failure);

    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
