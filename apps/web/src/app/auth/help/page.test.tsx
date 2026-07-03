import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PasswordResetRequestForm } from "@/app/auth/help/password-reset-request-form";
import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import {
  existingAccountRecoveryMessage,
  passwordResetHelpMessage,
  PILOT_AUTH_HELP_PATH,
  PILOT_AUTH_RESET_PASSWORD_PATH,
  signInRecoveryHint,
} from "@/lib/auth/pilot-auth-recovery";
import AuthHelpPage from "./page";

describe("/auth/help closed-pilot recovery page copy", () => {
  it("uses stable auth recovery routes", () => {
    expect(PILOT_AUTH_HELP_PATH).toBe("/auth/help");
    expect(PILOT_AUTH_RESET_PASSWORD_PATH).toBe("/auth/reset-password");
  });

  it("explains email recovery with the operator fallback", () => {
    expect(passwordResetHelpMessage()).toMatch(/email delivery is unavailable/i);
    expect(signInRecoveryHint()).toMatch(/one-time reset link/i);
    expect(existingAccountRecoveryMessage()).toMatch(/already exists/i);
  });

  it("renders a self-serve password reset request without provider secrets", () => {
    const html = renderToStaticMarkup(<PasswordResetRequestForm />);

    expect(html).toContain("Email a reset link");
    expect(html).toContain("Send reset link");
    expect(html).not.toContain("RESEND_API_KEY");
    expect(html).not.toContain("re_");
  });

  it("renders the public support email on the account recovery page", () => {
    const html = renderToStaticMarkup(<AuthHelpPage />);

    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).not.toMatch(/RESEND_API_KEY|raw-token|session-token/i);
  });
});
