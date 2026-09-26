import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  recordLegalAcceptance: vi.fn(),
  isDeclinableNewAccount: vi.fn(),
  deleteDeclinedNewAccount: vi.fn(),
  signOut: vi.fn(),
  headers: vi.fn(async () => new Headers()),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: mocks.signOut } } }));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: () => null,
}));
vi.mock("@/server/legal-acceptance", () => ({
  recordLegalAcceptance: mocks.recordLegalAcceptance,
  isDeclinableNewAccount: mocks.isDeclinableNewAccount,
  deleteDeclinedNewAccount: mocks.deleteDeclinedNewAccount,
}));
vi.mock("@/server/workspace-failure", () => ({
  describeWorkspaceFailure: () => ({ failureClass: "unknown" }),
  recordWorkspaceSectionFailure: vi.fn(),
}));

import {
  acceptLegalDocumentsAction,
  declineLegalDocumentsAction,
} from "./actions";

const idle = { status: "idle" as const };

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("the acceptance screen's answers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: "user-1", sessionId: "s" },
    });
    mocks.isDeclinableNewAccount.mockResolvedValue(false);
  });

  it("records the receipt and goes where the person was going", async () => {
    await expect(
      acceptLegalDocumentsAction(idle, form({ next: "/garden/new" })),
    ).rejects.toThrow("redirect:/garden/new");
    expect(mocks.recordLegalAcceptance).toHaveBeenCalledWith(
      "user-1",
      "acceptance_screen",
    );
    // The acceptance itself cannot need an acceptance.
    expect(mocks.resolveMutationScope).toHaveBeenCalledWith(
      expect.objectContaining({ legalAcceptance: "exempt" }),
    );
  });

  it("says a receipt that could not be written, and stays", async () => {
    mocks.recordLegalAcceptance.mockRejectedValue(new Error("down"));
    await expect(
      acceptLegalDocumentsAction(idle, form({ next: "/garden" })),
    ).resolves.toEqual({ status: "failed" });
  });

  it("signs an older account out and keeps it", async () => {
    await expect(
      declineLegalDocumentsAction(idle, form({ next: "/garden" })),
    ).rejects.toThrow("redirect:/");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.deleteDeclinedNewAccount).not.toHaveBeenCalled();
  });

  it("signs a just-created account out and deletes it", async () => {
    mocks.isDeclinableNewAccount.mockResolvedValue(true);
    await expect(
      declineLegalDocumentsAction(idle, form({ next: "/garden" })),
    ).rejects.toThrow("redirect:/");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.deleteDeclinedNewAccount).toHaveBeenCalledWith("user-1");
  });

  it("sends a signed-out reader to sign in, and back to the question", async () => {
    mocks.resolveMutationScope.mockResolvedValue({
      status: "rejected",
      code: "session_required",
      statusCode: 401,
    });
    await expect(
      acceptLegalDocumentsAction(idle, form({ next: "/garden/new" })),
    ).rejects.toThrow("redirect:/auth/sign-in?next=%2Fgarden%2Fnew");
    expect(mocks.recordLegalAcceptance).not.toHaveBeenCalled();
  });
});
