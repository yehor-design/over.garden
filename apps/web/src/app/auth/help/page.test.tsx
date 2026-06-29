import { describe, expect, it } from "vitest";

import {
  existingAccountRecoveryMessage,
  passwordResetHelpMessage,
  PILOT_AUTH_HELP_PATH,
  PILOT_AUTH_RESET_PASSWORD_PATH,
  signInRecoveryHint,
} from "@/lib/auth/pilot-auth-recovery";

describe("/auth/help closed-pilot recovery page copy", () => {
  it("uses stable auth recovery routes", () => {
    expect(PILOT_AUTH_HELP_PATH).toBe("/auth/help");
    expect(PILOT_AUTH_RESET_PASSWORD_PATH).toBe("/auth/reset-password");
  });

  it("explains operator-assisted recovery without promising automated email delivery", () => {
    expect(passwordResetHelpMessage()).toMatch(/operator-assisted/i);
    expect(signInRecoveryHint()).toMatch(/do not send password reset emails/i);
    expect(existingAccountRecoveryMessage()).toMatch(/already exists/i);
  });
});
