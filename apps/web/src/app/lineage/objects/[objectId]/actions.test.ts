import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWriteEligibleRequestScope: vi.fn(),
  followLineageNode: vi.fn(),
  askLineageQuestion: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/pilot-write-access", () => ({
  requireWriteEligibleRequestScope: mocks.requireWriteEligibleRequestScope,
}));

vi.mock("@/server/lineage-interactions-repository", () => ({
  followLineageNode: mocks.followLineageNode,
  askLineageQuestion: mocks.askLineageQuestion,
}));

describe("/lineage/objects/[objectId] actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWriteEligibleRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    mocks.followLineageNode.mockResolvedValue({
      follow: { id: "00000000-0000-4000-8000-000000000301" },
      isNewFollow: true,
    });
    mocks.askLineageQuestion.mockResolvedValue({
      question: { id: "00000000-0000-4000-8000-000000000401" },
      isNewQuestion: true,
    });
  });

  it("follows a lineage node through the write-eligible participant scope", async () => {
    const { followLineageNodeAction } = await import("./actions");
    const formData = new FormData();
    formData.set("edgeId", "00000000-0000-4000-8000-000000000201");
    formData.set(
      "targetPlantObjectId",
      "00000000-0000-4000-8000-000000000102",
    );
    formData.set(
      "rootPlantObjectId",
      "00000000-0000-4000-8000-000000000101",
    );

    await followLineageNodeAction(formData);

    expect(mocks.requireWriteEligibleRequestScope).toHaveBeenCalledOnce();
    expect(mocks.followLineageNode).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        edgeId: "00000000-0000-4000-8000-000000000201",
        targetPlantObjectId: "00000000-0000-4000-8000-000000000102",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/lineage/questions",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/lineage/objects/00000000-0000-4000-8000-000000000101",
    );
  });

  it("asks a lineage question with bounded form fields only", async () => {
    const { askLineageQuestionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("edgeId", "00000000-0000-4000-8000-000000000201");
    formData.set(
      "targetPlantObjectId",
      "00000000-0000-4000-8000-000000000102",
    );
    formData.set("questionText", "How did this line handle balcony heat?");
    formData.set("clientMutationId", "lineage-question-1");
    formData.set(
      "rootPlantObjectId",
      "00000000-0000-4000-8000-000000000101",
    );

    await askLineageQuestionAction(formData);

    expect(mocks.askLineageQuestion).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        edgeId: "00000000-0000-4000-8000-000000000201",
        targetPlantObjectId: "00000000-0000-4000-8000-000000000102",
        questionText: "How did this line handle balcony heat?",
        clientMutationId: "lineage-question-1",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/lineage/questions",
    );
  });

  it("does not mutate when the viewer is not write eligible", async () => {
    mocks.requireWriteEligibleRequestScope.mockRejectedValue(
      new Error("write access required"),
    );

    const { followLineageNodeAction } = await import("./actions");
    const formData = new FormData();
    formData.set("edgeId", "00000000-0000-4000-8000-000000000201");
    formData.set(
      "targetPlantObjectId",
      "00000000-0000-4000-8000-000000000102",
    );

    await expect(followLineageNodeAction(formData)).rejects.toThrow(
      /write access required/i,
    );

    expect(mocks.followLineageNode).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
