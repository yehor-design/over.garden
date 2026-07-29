import { afterEach, describe, expect, it, vi } from "vitest";

import { logBetterAuth } from "./better-auth-logger";

describe("Better Auth logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("suppresses only the reset-path membership warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logBetterAuth("warn", "Reset Password: User not found");
    logBetterAuth("warn", "Credential account not found", {
      email: "must-not-be-logged@example.test",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[Better Auth] Credential account not found",
    );
  });

  it("keeps class-only errors without forwarding raw logger arguments", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    logBetterAuth("error", "Database operation failed", {
      email: "must-not-be-logged@example.test",
    });

    expect(error).toHaveBeenCalledWith(
      "[Better Auth] Database operation failed",
    );
  });
});
