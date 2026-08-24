import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admitDocumentMutation: vi.fn(),
  moderateEngagementCommentReport: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromFormData: vi.fn(() => null),
}));
vi.mock("@/server/engagement-repository", () => ({
  moderateEngagementCommentReport: mocks.moderateEngagementCommentReport,
}));
vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
}));

const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};

describe("account comment moderation action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope,
    });
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
    });
    mocks.moderateEngagementCommentReport.mockResolvedValue(undefined);
  });

  it("requires bounded operator mutation access before the repository effect", async () => {
    const { moderateCommentReportAction } = await import("./actions");
    await moderateCommentReportAction(commentFormData());

    expect(mocks.resolveAdminCapabilityAccessBounded).toHaveBeenCalledWith(
      scope,
      "operator:mutate",
    );
    expect(mocks.moderateEngagementCommentReport).toHaveBeenCalledWith(scope, {
      reportId: "00000000-0000-4000-8000-000000000401",
      action: "dismiss",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/account/moderation/comments",
    );
  });

  it.each(["denied", "timed_out", "cancelled"] as const)(
    "has zero mutation or cache effect when access is %s",
    async (status) => {
      mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({ status });
      const { moderateCommentReportAction } = await import("./actions");

      await moderateCommentReportAction(commentFormData());

      expect(mocks.moderateEngagementCommentReport).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );
});

function commentFormData() {
  const formData = new FormData();
  formData.set("reportId", "00000000-0000-4000-8000-000000000401");
  formData.set("action", "dismiss");
  return formData;
}
