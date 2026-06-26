import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import { optionalServerEnv } from "@/lib/env";

const developmentSecret =
  "development-only-overgarden-better-auth-secret-change-before-deploy";

export const auth = betterAuth({
  appName: "OverGarden",
  baseURL: optionalServerEnv("BETTER_AUTH_URL") ?? "http://localhost:3000",
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
