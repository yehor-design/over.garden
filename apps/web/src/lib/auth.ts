import "server-only";

import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import { resolveBetterAuthSecretOptions } from "@/lib/auth-secret";
import { logBetterAuth } from "@/lib/auth/better-auth-logger";
import {
  admitExplicitGoogleLinking,
  isExplicitGoogleLinkingEnabled,
} from "@/lib/auth/explicit-google-linking";
import { resolveGoogleSocialProviderConfig } from "@/lib/auth/google-oauth";
import {
  createRetiredSharedIdentityDatabaseHooks,
  isRetiredSharedIdentityEmailSignIn,
} from "@/lib/auth/retired-shared-identity";
import { socialAccountPolicy } from "@/lib/auth/social-account-policy";
import {
  sendAuthVerificationEmail,
  shouldRequireAuthEmailVerification,
} from "@/lib/auth/resend-auth-email-delivery";
import {
  getAuthBaseUrl,
  shouldForceInsecureRecoveryCookies,
} from "@/lib/runtime-url";

const googleProvider = resolveGoogleSocialProviderConfig();
const socialProviders = {
  ...(googleProvider ? { google: googleProvider } : {}),
};

export const auth = betterAuth({
  appName: "OverGarden",
  baseURL: getAuthBaseUrl(),
  basePath: "/api/auth",
  ...resolveBetterAuthSecretOptions(),
  logger: {
    disableColors: true,
    level: "warn",
    log: logBetterAuth,
  },
  database: {
    db,
    type: "postgres",
    casing: "snake",
  },
  session: {
    // One database read per five minutes per browser; every workspace
    // document and mutation reads the signed cookie instead (ADR-0022, D6).
    cookieCache: { enabled: true, maxAge: 300 },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: shouldRequireAuthEmailVerification(),
    revokeSessionsOnPasswordReset: true,
    // The public route owns reset admission. Keep Better Auth's callback
    // non-effectful so an accidental direct handler call cannot await Resend.
    sendResetPassword: () => Promise.resolve(),
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignIn: true,
    sendOnSignUp: shouldRequireAuthEmailVerification(),
    sendVerificationEmail: ({ user, url }) =>
      sendAuthVerificationEmail({
        email: user.email,
        url,
        userId: user.id,
      }),
  },
  socialProviders:
    Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
  account: socialAccountPolicy(isExplicitGoogleLinkingEnabled()),
  hooks: {
    before: createAuthMiddleware(async (context) => {
      await admitExplicitGoogleLinking(context);

      const email = (context.body as { email?: unknown } | undefined)?.email;
      if (isRetiredSharedIdentityEmailSignIn(context.path, email)) {
        throw APIError.from("UNAUTHORIZED", {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "Invalid email or password",
        });
      }
    }),
  },
  databaseHooks: createRetiredSharedIdentityDatabaseHooks(async (userId) => {
    const user = await db
      .selectFrom("user")
      .select("email")
      .where("id", "=", userId)
      .executeTakeFirst();

    return user?.email;
  }),
  plugins: [nextCookies()],
  advanced: {
    cookiePrefix: "overgarden",
    useSecureCookies: shouldForceInsecureRecoveryCookies() ? false : undefined,
    database: {
      generateId: "uuid",
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
