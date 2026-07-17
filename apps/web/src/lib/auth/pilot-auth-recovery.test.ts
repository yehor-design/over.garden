import { afterEach, describe, expect, it } from "vitest";

import {
  classifyAuthClientError,
  passwordResetSuccessPath,
  pilotPasswordResetRedirectUrl,
} from "./pilot-auth-recovery";
import {
  capturePilotPasswordResetLink,
  clearCapturedPasswordResetLinks,
  consumeCapturedPasswordResetLinks,
  isOperatorPasswordResetMode,
  PILOT_OPERATOR_PASSWORD_RESET_ENV,
} from "./pilot-password-reset-delivery";

describe("pilot auth recovery contract", () => {
  it("classifies duplicate-account errors without authoring UI copy", () => {
    expect(
      classifyAuthClientError({
        status: 422,
        message: "User already exists",
      }),
    ).toBe("existing_account");
  });

  it("classifies credential failures and keeps unknown diagnostics bounded", () => {
    expect(
      classifyAuthClientError({
        status: 401,
        message: "Invalid email or password",
      }),
    ).toBe("invalid_credentials");
    expect(
      classifyAuthClientError({
        status: 422,
        message: "Failed to create user",
      }),
    ).toBe("unknown");
    expect(
      classifyAuthClientError({
        status: 500,
        message: "Database unavailable at private-host",
      }),
    ).toBe("unknown");
  });

  it("builds the reset-password redirect URL from a site base", () => {
    expect(
      pilotPasswordResetRedirectUrl("https://over-garden.vercel.app"),
    ).toBe("https://over-garden.vercel.app/auth/reset-password");
  });

  it("returns recovered gardeners to the existing garden workspace", () => {
    expect(passwordResetSuccessPath()).toBe("/garden");
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
