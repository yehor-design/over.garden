import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  decideContentReport: vi.fn(),
  revalidatePublicCacheTags: vi.fn(),
  revalidatePath: vi.fn(),
  after: vi.fn(),
  access: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: () => null,
}));
vi.mock("@/server/admin-access", () => ({
  assertAdminCapabilityForScope: vi.fn(),
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceAdminAccess: mocks.access,
}));
vi.mock("@/server/moderation/content-reports", () => ({
  decideContentReport: mocks.decideContentReport,
}));
vi.mock("@/server/moderation/moderation-mail", () => ({
  drainModerationMessages: vi.fn(),
}));
vi.mock("@/server/public-cache-revalidation", () => ({
  revalidatePublicCacheTags: mocks.revalidatePublicCacheTags,
}));

import { decideContentReportAction } from "./actions";

const REPORT = "0b8f7a52-8b9c-4d7e-9f10-2a3b4c5d6e7f";

function form(fields: Record<string, string | undefined>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) formData.set(key, value);
  }
  return formData;
}

describe("the owner's decision on a report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: "owner", sessionId: "s" },
    });
    mocks.access.mockResolvedValue({ status: "allowed" });
    mocks.decideContentReport.mockResolvedValue({
      status: "done",
      cacheTags: ["entry:e"],
      paths: ["/garden"],
    });
  });

  it("takes content down with its ground and facts, refreshes what showed it, and sends the letters after", async () => {
    await expect(
      decideContentReportAction(
        undefined,
        form({
          reportId: REPORT,
          decision: "removed",
          ground: "terms-content",
          facts: "Погрози підтвердились.",
        }),
      ),
    ).rejects.toThrow(
      `redirect:/account/moderation/reports?report=${REPORT}&result=done#report-${REPORT}`,
    );
    expect(mocks.decideContentReport).toHaveBeenCalledWith(
      { userId: "owner", sessionId: "s" },
      {
        reportId: REPORT,
        decision: "removed",
        ground: "terms-content",
        facts: "Погрози підтвердились.",
      },
    );
    expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledWith(
      ["entry:e"],
      "update",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("keeps content with the facts alone, and never records a ground for it", async () => {
    await expect(
      decideContentReportAction(
        undefined,
        form({
          reportId: REPORT,
          decision: "kept",
          ground: "law",
          facts: "Порушення немає.",
        }),
      ),
    ).rejects.toThrow(/result=done/u);
    expect(mocks.decideContentReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decision: "kept", ground: null }),
    );
  });

  it("refuses a decision without facts, or a removal without a ground", async () => {
    for (const fields of [
      { reportId: REPORT, decision: "kept", facts: "" },
      { reportId: REPORT, decision: "removed", ground: "", facts: "Так." },
      { reportId: "nope", decision: "kept", facts: "Так." },
    ]) {
      await expect(
        decideContentReportAction(undefined, form(fields)),
      ).rejects.toThrow(/result=invalid/u);
    }
    expect(mocks.decideContentReport).not.toHaveBeenCalled();
  });

  it("lets nobody but the owner decide", async () => {
    mocks.access.mockResolvedValue({ status: "denied" });
    await expect(
      decideContentReportAction(
        undefined,
        form({ reportId: REPORT, decision: "kept", facts: "Так." }),
      ),
    ).rejects.toThrow(/result=denied/u);
    expect(mocks.decideContentReport).not.toHaveBeenCalled();
  });
});
