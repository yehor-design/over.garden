import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  followLineageNode: vi.fn(),
  askLineageQuestion: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  createAuthIntentToken: vi.fn(),
  createAuthIntentControlRef: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn(() => null),
}));

vi.mock("@/server/lineage-interactions-repository", () => ({
  followLineageNode: mocks.followLineageNode,
  askLineageQuestion: mocks.askLineageQuestion,
}));

vi.mock("@/server/auth-intent-token", () => ({
  createAuthIntentToken: mocks.createAuthIntentToken,
}));

vi.mock("@/server/auth-intent-control", () => ({
  createAuthIntentControlRef: mocks.createAuthIntentControlRef,
}));

describe("/lineage/objects/[objectId] actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
    });
    mocks.followLineageNode.mockResolvedValue({
      follow: { id: "00000000-0000-4000-8000-000000000301" },
      isNewFollow: true,
    });
    mocks.askLineageQuestion.mockResolvedValue({
      question: { id: "00000000-0000-4000-8000-000000000401" },
      isNewQuestion: true,
    });
    mocks.createAuthIntentControlRef.mockReturnValue("follow-a7d8f9c012345678");
    mocks.createAuthIntentToken.mockReturnValue("opaque-follow-intent");
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  it("follows a lineage node through the write-eligible participant scope", async () => {
    const { followLineageNodeAction } = await import("./actions");
    const formData = new FormData();
    formData.set("edgeId", "00000000-0000-4000-8000-000000000201");
    formData.set("targetPlantObjectId", "00000000-0000-4000-8000-000000000102");
    formData.set("rootPlantObjectId", "00000000-0000-4000-8000-000000000101");

    await followLineageNodeAction(formData);

    expect(mocks.resolveMutationScope).toHaveBeenCalledOnce();
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
    formData.set("targetPlantObjectId", "00000000-0000-4000-8000-000000000102");
    formData.set("questionText", "How did this line handle balcony heat?");
    formData.set("clientMutationId", "lineage-question-1");
    formData.set("rootPlantObjectId", "00000000-0000-4000-8000-000000000101");

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

  it("redirects an admission refusal to a generic public status without revalidating", async () => {
    const { InteractionAdmissionError } =
      await import("@/server/interaction-admission");
    mocks.askLineageQuestion.mockRejectedValueOnce(
      new InteractionAdmissionError("quota"),
    );
    const { askLineageQuestionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("edgeId", "00000000-0000-4000-8000-000000000201");
    formData.set("targetPlantObjectId", "00000000-0000-4000-8000-000000000102");
    formData.set("questionText", "How did this line handle balcony heat?");
    formData.set("clientMutationId", "lineage-question-1");
    formData.set("rootPlantObjectId", "00000000-0000-4000-8000-000000000101");

    await expect(askLineageQuestionAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/lineage/objects/00000000-0000-4000-8000-000000000101?engagement=lineage-question-rate-limited#passport-provenance",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("resumes an exact follow control when the session expires", async () => {
    mocks.resolveMutationScope.mockResolvedValueOnce({
      status: "rejected",
      code: "session_required",
    });
    const { followLineageNodeAction } = await import("./actions");
    const formData = new FormData();
    formData.set("edgeId", "00000000-0000-4000-8000-000000000201");
    formData.set("targetPlantObjectId", "00000000-0000-4000-8000-000000000102");
    formData.set("rootPlantObjectId", "00000000-0000-4000-8000-000000000101");

    await expect(followLineageNodeAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/auth/intent?intent=opaque-follow-intent",
    );

    expect(mocks.createAuthIntentControlRef).toHaveBeenCalledWith(
      "follow",
      "00000000-0000-4000-8000-000000000201:00000000-0000-4000-8000-000000000102",
    );
    expect(mocks.createAuthIntentToken).toHaveBeenCalledWith({
      action: "follow",
      returnTo: "/lineage/objects/00000000-0000-4000-8000-000000000101",
      target: {
        kind: "object",
        ref: "00000000-0000-4000-8000-000000000102",
      },
      control: "follow-a7d8f9c012345678",
    });
    expect(mocks.followLineageNode).not.toHaveBeenCalled();
  });

  it("does not convert operational admission failures into auth redirects", async () => {
    const failure = new Error("write access required");
    mocks.resolveMutationScope.mockRejectedValueOnce(failure);
    const { followLineageNodeAction } = await import("./actions");
    const formData = new FormData();
    formData.set("edgeId", "00000000-0000-4000-8000-000000000201");
    formData.set("targetPlantObjectId", "00000000-0000-4000-8000-000000000102");
    formData.set("rootPlantObjectId", "00000000-0000-4000-8000-000000000101");

    await expect(followLineageNodeAction(formData)).rejects.toBe(failure);

    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
