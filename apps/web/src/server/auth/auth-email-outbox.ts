import "server-only";

import { sql } from "kysely";
import { z } from "zod";

import { db } from "@/db";
import { getAuthBaseUrl } from "@/lib/runtime-url";

export const PASSWORD_RESET_RESPONSE = {
  status: true,
  message:
    "If this email exists in our system, check your email for the reset link",
} as const;

export const PASSWORD_RESET_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, s-maxage=0, must-revalidate",
} as const;

const requestSchema = z.object({
  email: z.string().email().max(320),
  redirectTo: z.string().max(2048).optional(),
});

export type PasswordResetRequest = z.infer<typeof requestSchema>;

export function parsePasswordResetRequest(
  value: unknown,
): PasswordResetRequest | null {
  const parsed = requestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Performs one equal bounded local lookup after Better Auth has handled a
 * syntactically valid request. Better Auth remains the only owner of reset
 * token and verification creation; the database trigger admits a durable
 * outbox row only for its eligible credential verification.
 */
export async function equalizePasswordResetAdmission(
  email: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLocaleLowerCase("en-US");

  await db
    .selectFrom("user")
    .innerJoin("account", "account.userId", "user.id")
    .select("user.id")
    .where(sql<string>`lower("user"."email")`, "=", normalizedEmail)
    .where("account.providerId", "=", "credential")
    .limit(1)
    .executeTakeFirst();
}

export function isTrustedPasswordResetOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(getAuthBaseUrl()).origin;
  } catch {
    return false;
  }
}

export function resetUrlForVerification(identifier: string): string | null {
  const token = identifier.startsWith("reset-password:")
    ? identifier.slice("reset-password:".length)
    : "";
  if (!token) return null;

  const authBaseUrl = new URL(getAuthBaseUrl());
  const callbackUrl = new URL("/auth/reset-password", authBaseUrl.origin);
  const resetUrl = new URL(
    `/api/auth/reset-password/${encodeURIComponent(token)}`,
    authBaseUrl.origin,
  );
  resetUrl.searchParams.set("callbackURL", callbackUrl.toString());
  return resetUrl.toString();
}
