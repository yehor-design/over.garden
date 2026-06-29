// Closed-pilot auth recovery copy and helpers (OVE-48).

export const PILOT_AUTH_HELP_PATH = "/auth/help";
export const PILOT_AUTH_RESET_PASSWORD_PATH = "/auth/reset-password";

export const LOCAL_DEV_DEFAULT_EMAIL = "gardener@over.garden";
export const LOCAL_DEV_DEFAULT_PASSWORD = "overgarden-local-gardener";
export const LOCAL_DEV_DEFAULT_NAME = "Local Gardener";

export function pilotPasswordResetRedirectUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return `${normalizedBase}${PILOT_AUTH_RESET_PASSWORD_PATH}`;
}

export function existingAccountRecoveryMessage(): string {
  return "An account with this email already exists. Sign in to return to your garden, or ask whoever invited you for sign-in help.";
}

export function signInRecoveryHint(): string {
  return "Forgot your password? Ask whoever invited you to OverGarden for a fresh sign-in link. During the closed pilot we do not send password reset emails automatically.";
}

export function passwordResetHelpMessage(): string {
  return "During the closed pilot, password help is operator-assisted. Contact whoever invited you; they can send a private one-time link that returns you to the same garden.";
}

export function passwordResetSuccessMessage(): string {
  return "Your password is updated. Sign in to return to your garden.";
}

export function invalidPasswordResetTokenMessage(): string {
  return "This sign-in link is invalid or expired. Ask whoever invited you for a fresh link.";
}

export function interpretAuthClientErrorMessage(
  error: { message?: string; status?: number } | null | undefined,
): string | null {
  if (!error?.message) return null;

  const normalized = error.message.toLowerCase();

  if (
    error.status === 422 ||
    normalized.includes("already exists") ||
    normalized.includes("already registered") ||
    normalized.includes("user already")
  ) {
    return existingAccountRecoveryMessage();
  }

  if (
    normalized.includes("invalid email or password") ||
    normalized.includes("invalid credentials")
  ) {
    return `${error.message} ${signInRecoveryHint()}`;
  }

  return error.message;
}

export function shouldUseLocalDevAuthDefaults(): boolean {
  return process.env.NODE_ENV !== "production";
}
