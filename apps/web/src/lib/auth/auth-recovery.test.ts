import { describe, expect, it } from "vitest";

import {
  classifyAuthClientError,
  passwordResetRedirectUrl,
  passwordResetSuccessPath,
} from "./auth-recovery";

describe("self-serve auth recovery contract", () => {
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
    expect(passwordResetRedirectUrl("https://over-garden.vercel.app")).toBe(
      "https://over-garden.vercel.app/auth/reset-password",
    );
  });

  it("returns recovered gardeners to the existing garden workspace", () => {
    expect(passwordResetSuccessPath()).toBe("/garden");
  });
});
