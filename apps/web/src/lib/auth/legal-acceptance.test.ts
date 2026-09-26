import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordLegalAcceptance: vi.fn(),
}));

vi.mock("@/server/legal-acceptance", () => ({
  recordLegalAcceptance: mocks.recordLegalAcceptance,
}));

import {
  assertSignUpLegalAcceptance,
  recordSignUpLegalAcceptance,
} from "./legal-acceptance";

describe("the email sign-up's acceptance (ADR-0038 D2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordLegalAcceptance.mockResolvedValue(undefined);
  });

  it("refuses /sign-up/email without the ticked box, whoever calls it", () => {
    expect(() =>
      assertSignUpLegalAcceptance({ path: "/sign-up/email", body: {} }),
    ).toThrow(/must be accepted/u);
    expect(() =>
      assertSignUpLegalAcceptance({
        path: "/sign-up/email",
        body: { legalAccepted: "true" },
      }),
    ).toThrow();
    expect(() =>
      assertSignUpLegalAcceptance({
        path: "/sign-up/email",
        body: { legalAccepted: true },
      }),
    ).not.toThrow();
    // Every other endpoint is not this hook's question.
    expect(() =>
      assertSignUpLegalAcceptance({ path: "/sign-in/email", body: {} }),
    ).not.toThrow();
  });

  it("writes the receipt for the account an email sign-up created", async () => {
    await recordSignUpLegalAcceptance(
      { id: "user-1" },
      { path: "/sign-up/email", body: { legalAccepted: true } },
    );
    expect(mocks.recordLegalAcceptance).toHaveBeenCalledWith(
      "user-1",
      "sign_up",
    );
  });

  it("writes nothing for an account a Google callback created", async () => {
    await recordSignUpLegalAcceptance(
      { id: "user-1" },
      { path: "/callback/google", body: {} },
    );
    await recordSignUpLegalAcceptance({ id: "user-1" }, null);
    expect(mocks.recordLegalAcceptance).not.toHaveBeenCalled();
  });

  it("keeps the sign-up standing when the receipt cannot be written", async () => {
    // The account is whole; the acceptance screen asks at its first sign-in.
    mocks.recordLegalAcceptance.mockRejectedValue(new Error("down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordSignUpLegalAcceptance(
        { id: "user-1" },
        { path: "/sign-up/email", body: { legalAccepted: true } },
      ),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("legal_acceptance_receipt_failed"),
    );
    error.mockRestore();
  });
});
