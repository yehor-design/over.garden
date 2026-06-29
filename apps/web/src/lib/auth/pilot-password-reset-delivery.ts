// Operator-assisted password reset delivery for the closed pilot (OVE-48).
// Better Auth calls sendResetPassword when a reset is requested. During normal
// web traffic we intentionally do not email links (no deliverability program).
// The founder CLI sets PILOT_OPERATOR_PASSWORD_RESET=1 so the one-time URL is
// captured for private handoff instead of being lost.

export const PILOT_OPERATOR_PASSWORD_RESET_ENV = "PILOT_OPERATOR_PASSWORD_RESET";

export interface CapturedPasswordResetLink {
  email: string;
  url: string;
}

const capturedLinks: CapturedPasswordResetLink[] = [];

export function isOperatorPasswordResetMode(): boolean {
  return process.env[PILOT_OPERATOR_PASSWORD_RESET_ENV] === "1";
}

export function capturePilotPasswordResetLink(
  payload: CapturedPasswordResetLink,
): "operator_cli" | "undelivered" {
  if (isOperatorPasswordResetMode()) {
    capturedLinks.push(payload);
    return "operator_cli";
  }

  return "undelivered";
}

export function consumeCapturedPasswordResetLinks(): CapturedPasswordResetLink[] {
  const links = [...capturedLinks];
  capturedLinks.length = 0;
  return links;
}

export function clearCapturedPasswordResetLinks(): void {
  capturedLinks.length = 0;
}
