import { describe, expect, it } from "vitest";

import {
  existingAccountRecoveryMessage,
  interpretAuthClientErrorMessage,
  signInRecoveryHint,
} from "@/lib/auth/pilot-auth-recovery";

describe("garden auth duplicate-account avoidance", () => {
  it("maps duplicate sign-up errors to sign-in guidance instead of creating a new garden", () => {
    expect(
      interpretAuthClientErrorMessage({
        status: 422,
        message: "User already exists. use another email.",
      }),
    ).toBe(existingAccountRecoveryMessage());
  });

  it("does not treat unknown errors as duplicate-account recovery", () => {
    expect(
      interpretAuthClientErrorMessage({
        status: 500,
        message: "Database unavailable",
      }),
    ).toBe("Database unavailable");
  });

  it("keeps recovery guidance attached to invalid credential errors", () => {
    const message = interpretAuthClientErrorMessage({
      status: 401,
      message: "Invalid email or password",
    });

    expect(message).toContain(signInRecoveryHint());
  });
});
