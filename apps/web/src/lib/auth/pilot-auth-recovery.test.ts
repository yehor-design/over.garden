import { afterEach, describe, expect, it } from "vitest";

import {
  existingAccountRecoveryMessage,
  interpretAuthClientErrorMessage,
  passwordResetHelpMessage,
  pilotPasswordResetRedirectUrl,
  signInRecoveryHint,
} from "./pilot-auth-recovery";
import {
  capturePilotPasswordResetLink,
  clearCapturedPasswordResetLinks,
  consumeCapturedPasswordResetLinks,
  isOperatorPasswordResetMode,
  PILOT_OPERATOR_PASSWORD_RESET_ENV,
} from "./pilot-password-reset-delivery";

describe("pilot auth recovery copy", () => {
  it("steers duplicate sign-up attempts back to the existing account", () => {
    expect(existingAccountRecoveryMessage()).toMatch(/already exists/i);
    expect(existingAccountRecoveryMessage()).toMatch(/sign in/i);
    expect(existingAccountRecoveryMessage()).not.toMatch(/create/i);
  });

  it("explains operator-assisted password help without promising email delivery", () => {
    expect(signInRecoveryHint()).toMatch(/invited you/i);
    expect(signInRecoveryHint()).toMatch(/do not send password reset emails/i);
    expect(passwordResetHelpMessage()).toMatch(/operator-assisted/i);
  });

  it("maps Better Auth duplicate-account errors to recovery guidance", () => {
    expect(
      interpretAuthClientErrorMessage({
        status: 422,
        message: "User already exists",
      }),
    ).toBe(existingAccountRecoveryMessage());
  });

  it("appends recovery guidance to invalid credential errors", () => {
    const message = interpretAuthClientErrorMessage({
      status: 401,
      message: "Invalid email or password",
    });

    expect(message).toContain("Invalid email or password");
    expect(message).toContain(signInRecoveryHint());
  });

  it("builds the reset-password redirect URL from a site base", () => {
    expect(pilotPasswordResetRedirectUrl("https://over-garden.vercel.app")).toBe(
      "https://over-garden.vercel.app/auth/reset-password",
    );
  });
});

describe("pilot password reset delivery", () => {
  const originalMode = process.env[PILOT_OPERATOR_PASSWORD_RESET_ENV];

  afterEach(() => {
    clearCapturedPasswordResetLinks();
    if (originalMode === undefined) {
      delete process.env[PILOT_OPERATOR_PASSWORD_RESET_ENV];
    } else {
      process.env[PILOT_OPERATOR_PASSWORD_RESET_ENV] = originalMode;
    }
  });

  it("does not capture reset links during normal web requests", () => {
    delete process.env[PILOT_OPERATOR_PASSWORD_RESET_ENV];

    expect(isOperatorPasswordResetMode()).toBe(false);
    expect(
      capturePilotPasswordResetLink({
        email: "gardener@example.com",
        url: "https://example.com/auth/reset-password?token=abc",
      }),
    ).toBe("undelivered");
    expect(consumeCapturedPasswordResetLinks()).toEqual([]);
  });

  it("captures reset links for the operator CLI to print privately", () => {
    process.env[PILOT_OPERATOR_PASSWORD_RESET_ENV] = "1";

    expect(
      capturePilotPasswordResetLink({
        email: "gardener@example.com",
        url: "https://example.com/auth/reset-password?token=abc",
      }),
    ).toBe("operator_cli");
    expect(consumeCapturedPasswordResetLinks()).toEqual([
      {
        email: "gardener@example.com",
        url: "https://example.com/auth/reset-password?token=abc",
      },
    ]);
  });
});