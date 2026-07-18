// Closed-pilot auth route and error-classification helpers.

export const PILOT_AUTH_HELP_PATH = "/auth/help";
export const PILOT_AUTH_RESET_PASSWORD_PATH = "/auth/reset-password";
export const PASSWORD_RESET_SUCCESS_PATH = "/garden";

export function pilotPasswordResetRedirectUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return `${normalizedBase}${PILOT_AUTH_RESET_PASSWORD_PATH}`;
}

export function passwordResetSuccessPath(): string {
  return PASSWORD_RESET_SUCCESS_PATH;
}

export type AuthClientErrorKind =
  | "existing_account"
  | "invalid_credentials"
  | "unknown";

export function classifyAuthClientError(
  error: { message?: string; status?: number } | null | undefined,
): AuthClientErrorKind {
  if (!error?.message) return "unknown";

  const normalized = error.message.toLowerCase();

  if (
    normalized.includes("already exists") ||
    normalized.includes("already registered") ||
    normalized.includes("user already")
  ) {
    return "existing_account";
  }

  if (
    normalized.includes("invalid email or password") ||
    normalized.includes("invalid credentials")
  ) {
    return "invalid_credentials";
  }

  return "unknown";
}
