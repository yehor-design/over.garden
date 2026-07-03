import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWriteEligibleRequestScope: vi.fn(),
  resolveLineageClaim: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/pilot-write-access", () => ({
  requireWriteEligibleRequestScope: mocks.requireWriteEligibleRequestScope,
}));

vi.mock("@/server/lineage-repository", () => ({
  resolveLineageClaim: mocks.resolveLineageClaim,
}));

describe("/garden/lineage/claims actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWriteEligibleRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    mocks.resolveLineageClaim.mockResolvedValue({
      edge: {
        subject_plant_object_id:
          "00000000-0000-4000-8000-000000000101",
      },
      decision: "confirmed",
    });
  });

  it("confirms a claim through the write-eligible target scope only", async () => {
    const { confirmLineageClaimAction } = await import("./actions");
    const formData = new FormData();
    formData.set("edgeId", "00000000-0000-4000-8000-000000000201");

    await confirmLineageClaimAction(formData);

    expect(mocks.requireWriteEligibleRequestScope).toHaveBeenCalledOnce();
    expect(mocks.resolveLineageClaim).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        edgeId: "00000000-0000-4000-8000-000000000201",
        decision: "confirmed",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/lineage/claims",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/objects/00000000-0000-4000-8000-000000000101",
    );
  });

  it("declines a claim through the write-eligible target scope only", async () => {
    const { declineLineageClaimAction } = await import("./actions");
    const formData = new FormData();
    formData.set("edgeId", "00000000-0000-4000-8000-000000000202");

    await declineLineageClaimAction(formData);

    expect(mocks.resolveLineageClaim).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        edgeId: "00000000-0000-4000-8000-000000000202",
        decision: "declined",
      },
    );
  });

  it("does not mutate when the target is not write eligible", async () => {
    mocks.requireWriteEligibleRequestScope.mockRejectedValue(
      new Error("write access required"),
    );

    const { confirmLineageClaimAction } = await import("./actions");
    const formData = new FormData();
    formData.set("edgeId", "00000000-0000-4000-8000-000000000201");

    await expect(confirmLineageClaimAction(formData)).rejects.toThrow(
      /write access required/i,
    );

    expect(mocks.resolveLineageClaim).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
