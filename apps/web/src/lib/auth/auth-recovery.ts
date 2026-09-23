import { buildSignInHref } from "@/lib/navigation/sign-in-href";

export const AUTH_HELP_PATH = "/auth/help";
export const AUTH_RESET_PASSWORD_PATH = "/auth/reset-password";

export function passwordResetRedirectUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return `${normalizedBase}${AUTH_RESET_PASSWORD_PATH}`;
}

/**
 * Where a completed password reset goes: the sign-in screen, saying the
 * password changed. Better Auth ends every session on a reset
 * (`revokeSessionsOnPasswordReset`), so the workspace it used to open could
 * only ask the reader to sign in — without telling them the reset had worked
 * (`OVE-504`).
 */
export function passwordResetSuccessPath(): string {
  return buildSignInHref({ notice: "password-reset" });
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
