import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import { resolveBetterAuthSecret } from "@/lib/auth-secret";
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
