import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import { resolveBetterAuthSecret } from "@/lib/auth-secret";
import { capturePilotPasswordResetLink } from "@/lib/auth/pilot-password-reset-delivery";
import { getAuthBaseUrl } from "@/lib/runtime-url";

export const auth = betterAuth({
  appName: "OverGarden",
  baseURL: getAuthBaseUrl(),
  basePath: "/api/auth",
  secret: resolveBetterAuthSecret(),
  database: {
    db,
    type: "postgres",
    casing: "snake",
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void capturePilotPasswordResetLink({ email: user.email, url });
    },
  },
  plugins: [nextCookies()],
  advanced: {
    cookiePrefix: "overgarden",
    database: {
      generateId: "uuid",
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
