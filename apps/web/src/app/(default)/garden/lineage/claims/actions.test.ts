import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  resolveLineageClaim: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: mocks.updateTag,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn(() => null),
}));

vi.mock("@/server/lineage-repository", async () => {
  class LineageDecisionUnavailableError extends Error {
    constructor(readonly subject: "claim" | "invitation") {
      super("unavailable");
    }
  }
  return {
    resolveLineageClaim: mocks.resolveLineageClaim,
    LineageDecisionUnavailableError,
    isLineageDecisionUnavailableError: (error: unknown) =>
      error instanceof LineageDecisionUnavailableError,
  };
});

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const EDGE_ID = "00000000-0000-4000-8000-000000000201";

function edgeForm(edgeId = EDGE_ID) {
  const formData = new FormData();
  formData.set("edgeId", edgeId);
  return formData;
}

describe("/garden/lineage/claims actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: SCOPE,
    });
    mocks.resolveLineageClaim.mockResolvedValue({
      edge: {
        id: EDGE_ID,
        subject_plant_object_id: "00000000-0000-4000-8000-000000000101",
        source_plant_object_id: "00000000-0000-4000-8000-000000000102",
      },
      decision: "confirmed",
    });
  });

  it("confirms a claim through the write-eligible target scope only, then reads it back", async () => {
    const { confirmLineageClaimAction } = await import("./actions");

    await expect(
      confirmLineageClaimAction(undefined, edgeForm()),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/garden/lineage/claims?claim=${EDGE_ID}&result=done`,
    );

    expect(mocks.resolveMutationScope).toHaveBeenCalledOnce();
    expect(mocks.resolveLineageClaim).toHaveBeenCalledWith(SCOPE, {
      edgeId: EDGE_ID,
      decision: "confirmed",
    });
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
    expect(mocks.updateTag).toHaveBeenCalledWith("profiles");
    // The claimed object's passport shows the confirmed link.
    expect(mocks.updateTag).toHaveBeenCalledWith(
      "object:00000000-0000-4000-8000-000000000101",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden/lineage/claims");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/objects/00000000-0000-4000-8000-000000000101",
    );
  });

  it("declines a claim through the write-eligible target scope only", async () => {
    const { declineLineageClaimAction } = await import("./actions");

    await expect(
      declineLineageClaimAction(undefined, edgeForm()),
    ).rejects.toThrow(/NEXT_REDIRECT:.*result=done/);

    expect(mocks.resolveLineageClaim).toHaveBeenCalledWith(SCOPE, {
      edgeId: EDGE_ID,
      decision: "declined",
    });
  });

  it("lands on the inbox, not an error page, when the claim can no longer be answered", async () => {
    const { LineageDecisionUnavailableError } =
      await import("@/server/lineage-repository");
    mocks.resolveLineageClaim.mockRejectedValueOnce(
      new LineageDecisionUnavailableError("claim"),
    );
    const { confirmLineageClaimAction } = await import("./actions");

    await expect(
      confirmLineageClaimAction(undefined, edgeForm()),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/garden/lineage/claims?claim=${EDGE_ID}&result=stale`,
    );
    // Nothing was written, so nothing is revalidated.
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets an unexpected failure reach the error boundary", async () => {
    mocks.resolveLineageClaim.mockRejectedValueOnce(new Error("pool closed"));
    const { confirmLineageClaimAction } = await import("./actions");

    await expect(
      confirmLineageClaimAction(undefined, edgeForm()),
    ).rejects.toThrow("pool closed");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a session refusal to the form without deciding anything", async () => {
    mocks.resolveMutationScope.mockResolvedValueOnce({
      status: "rejected",
      code: "session_account_changed",
    });
    const { confirmLineageClaimAction } = await import("./actions");

    await expect(
      confirmLineageClaimAction(undefined, edgeForm()),
    ).resolves.toEqual({ mutationScope: "session_account_changed" });
    expect(mocks.resolveLineageClaim).not.toHaveBeenCalled();
  });
});
