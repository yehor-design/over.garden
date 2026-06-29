import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import { capturePilotPasswordResetLink } from "@/lib/auth/pilot-password-reset-delivery";
import { optionalServerEnv } from "@/lib/env";
import { getAuthBaseUrl } from "@/lib/runtime-url";

const developmentSecret =
  "development-only-overgarden-better-auth-secret-change-before-deploy";

export const auth = betterAuth({
  appName: "OverGarden",
  baseURL: getAuthBaseUrl(),
  basePath: "/api/auth",
  secret: optionalServerEnv("BETTER_AUTH_SECRET") ?? developmentSecret,
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
