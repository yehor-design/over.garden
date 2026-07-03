import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
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

vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));

vi.mock("@/server/lineage-repository", () => ({
  resolveLineageInvitationClaim: mocks.resolveLineageInvitationClaim,
}));

describe("/garden/lineage/invitations/claim actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms an invitation claim through the signed-in scope only", async () => {
    const { confirmLineageInvitationClaimAction } = await import("./actions");
    const formData = new FormData();
    formData.set("token", "v1.payload.signature");

    await confirmLineageInvitationClaimAction(formData);

    expect(mocks.requireCurrentRequestScope).toHaveBeenCalledOnce();
    expect(mocks.resolveLineageInvitationClaim).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000777",
        sessionId: "session-1",
      },
      {
        token: "v1.payload.signature",
        decision: "confirmed",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/lineage/invitations/claim",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/objects/00000000-0000-4000-8000-000000000101",
    );
  });

  it("declines an invitation claim without a write-eligibility grant", async () => {
    const { declineLineageInvitationClaimAction } = await import("./actions");
    const formData = new FormData();
    formData.set("token", "v1.payload.signature");

    await declineLineageInvitationClaimAction(formData);

    expect(mocks.requireCurrentRequestScope).toHaveBeenCalledOnce();
    expect(mocks.resolveLineageInvitationClaim).toHaveBeenCalledWith(
      expect.any(Object),
      {
        token: "v1.payload.signature",
        decision: "declined",
      },
    );
  });
});
