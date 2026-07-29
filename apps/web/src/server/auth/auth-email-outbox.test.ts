import { describe, expect, it } from "vitest";

import {
  isTrustedPasswordResetOrigin,
  parsePasswordResetRequest,
  PASSWORD_RESET_RESPONSE,
  PASSWORD_RESET_RESPONSE_HEADERS,
  resetUrlForVerification,
} from "./auth-email-outbox";

describe("password-reset outbox admission contract", () => {
  it("accepts only bounded syntactically valid input and keeps the generic public receipt", () => {
    expect(
      parsePasswordResetRequest({
        email: "gardener@example.test",
        redirectTo: "https://over.garden/auth/reset-password",
      }),
    ).toEqual({
      email: "gardener@example.test",
      redirectTo: "https://over.garden/auth/reset-password",
    });
    expect(parsePasswordResetRequest({ email: "not-an-email" })).toBeNull();
    expect(PASSWORD_RESET_RESPONSE).toEqual({
      status: true,
      message:
        "If this email exists in our system, check your email for the reset link",
    });
    expect(PASSWORD_RESET_RESPONSE_HEADERS["Cache-Control"]).toContain(
      "no-store",
    );
  });

  it("derives a reset URL only from an opaque reset verification identifier", () => {
    const url = resetUrlForVerification("reset-password:opaque-token");
    expect(url).toContain("/api/auth/reset-password/opaque-token");
    expect(url).toContain("callbackURL=");
    expect(
      resetUrlForVerification("email-verification:opaque-token"),
    ).toBeNull();
  });

  it("rejects a cross-origin browser request", () => {
    expect(
      isTrustedPasswordResetOrigin(
        new Request("https://over.garden/api/auth/request-password-reset", {
          headers: { origin: "https://attacker.invalid" },
        }),
      ),
    ).toBe(false);
  });
});
