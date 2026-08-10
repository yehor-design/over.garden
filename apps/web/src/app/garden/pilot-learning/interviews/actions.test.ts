import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  admitDocumentMutation: vi.fn(),
  assertFounderInterviewMutationAccess: vi.fn(),
  createFounderInterviewLearning: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromFormData: vi.fn(() => null),
}));

vi.mock("@/server/founder-interview-access", () => ({
  assertFounderInterviewMutationAccess:
    mocks.assertFounderInterviewMutationAccess,
}));

vi.mock("@/server/founder-interview-repository", () => ({
  createFounderInterviewLearning: mocks.createFounderInterviewLearning,
}));

describe("founder interview operator actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000999",
      sessionId: "non-operator-session",
    });
    mocks.admitDocumentMutation.mockImplementation(async () => ({
      status: "admitted",
      scope: await mocks.requireCurrentRequestScope(),
    }));
    mocks.assertFounderInterviewMutationAccess.mockResolvedValue({
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "admin:manage_roles",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
    });
  });

  it("rejects capture before repository writes for a non-operator", async () => {
    mocks.assertFounderInterviewMutationAccess.mockRejectedValue(
      new Error("Admin access denied."),
    );

    const { createFounderInterviewLearningAction } = await import("./actions");
    const formData = new FormData();
    formData.set("segment", "casual_practical_beginner");
    formData.set("activationResult", "activated_first_entry_only");
    formData.set("returnReason", "never_returned");
    formData.set("mainObjection", "no_clear_value");
    formData.set("observedValue", "no_clear_value_yet");
    formData.set("nextAction", "schedule_follow_up");

    await expect(
      createFounderInterviewLearningAction(formData),
    ).rejects.toThrow("Admin access denied.");
    expect(mocks.createFounderInterviewLearning).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("allows capture for the sealed owner", async () => {
    const { createFounderInterviewLearningAction } = await import("./actions");
    const formData = new FormData();
    formData.set("segment", "casual_practical_beginner");
    formData.set("activationResult", "activated_first_entry_only");
    formData.set("returnReason", "never_returned");
    formData.set("mainObjection", "no_clear_value");
    formData.set("observedValue", "no_clear_value_yet");
    formData.set("nextAction", "schedule_follow_up");

    await createFounderInterviewLearningAction(formData);

    expect(mocks.createFounderInterviewLearning).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/pilot-learning/interviews",
    );
  });
});
