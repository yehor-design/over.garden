const PASSWORD_RESET_ABSENT_USER_WARNING = "Reset Password: User not found";

/**
 * Better Auth's stock reset route emits a membership-specific warning for an
 * absent address. Suppress only that diagnostic; retain a safe, class-only
 * record of every other warning or error without forwarding provider/DB args.
 */
export function logBetterAuth(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  ...args: unknown[]
): void {
  void args;

  if (level === "warn" && message === PASSWORD_RESET_ABSENT_USER_WARNING) {
    return;
  }

  const safeMessage = `[Better Auth] ${message}`;
  if (level === "error") {
    console.error(safeMessage);
    return;
  }

  console.warn(safeMessage);
}
