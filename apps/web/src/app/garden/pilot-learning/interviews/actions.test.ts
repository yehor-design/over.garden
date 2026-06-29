import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  resolveFounderInterviewOperatorAccess: vi.fn(),
  createFounderInterviewLearning: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));

vi.mock("@/server/founder-interview-access", () => ({
  resolveFounderInterviewOperatorAccess:
    mocks.resolveFounderInterviewOperatorAccess,
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
    mocks.resolveFounderInterviewOperatorAccess.mockReturnValue({
      status: "allowed",
      mode: "allowlist",
    });
  });

  it("rejects capture before repository writes for a non-operator", async () => {
    mocks.resolveFounderInterviewOperatorAccess.mockReturnValue({
      status: "denied",
    });

    const { createFounderInterviewLearningAction } = await import("./actions");
    const formData = new FormData();
    formData.set("segment", "casual_practical_beginner");
    formData.set("activationResult", "activated_first_entry_only");
    formData.set("returnReason", "never_returned");
    formData.set("mainObjection", "no_clear_value");
    formData.set("observedValue", "no_clear_value_yet");
    formData.set("nextAction", "schedule_follow_up");

    await expect(createFounderInterviewLearningAction(formData)).rejects.toThrow(
      "Founder interview operator access denied.",
    );
    expect(mocks.createFounderInterviewLearning).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("allows capture for an allowlisted operator", async () => {
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
