import "server-only";

import { createHash } from "node:crypto";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "@/lib/auth/public-identity-compatibility";

const RETIRED_SHARED_IDENTITY_EMAIL_HASHES = new Set([
  "aa1e7a4cca79271246d0b8497635518b75a95560d4d68744ca5a795176e4440a",
  "88874454b978fa046bc0f7e2ea012a4971b98614ad8faa58dce5b637d57e8c22",
]);

export function createRetiredSharedIdentityPolicy(
  retiredEmailHashes: ReadonlySet<string>,
) {
  const isRetiredEmail = (email: string) =>
    retiredEmailHashes.has(hashNormalizedEmail(email));

  return {
    createDatabaseHooks: (
      findUserEmail: (userId: string) => Promise<string | null | undefined>,
    ) => ({
      user: {
        create: {
          before: async <T extends { email: string }>(user: T) =>
            isRetiredEmail(user.email)
              ? false
              : {
                  data: {
                    ...user,
                    name: PRIVATE_AUTH_COMPATIBILITY_NAME,
                  },
                },
        },
        update: {
          before: async (user: { email?: unknown }) =>
            typeof user.email === "string" && isRetiredEmail(user.email)
              ? false
              : undefined,
        },
      },
      session: {
        create: {
          before: async (session: { userId: string }) => {
            const email = await findUserEmail(session.userId);

            return typeof email === "string" && !isRetiredEmail(email)
              ? undefined
              : false;
          },
        },
      },
    }),
    isRetiredEmail,
    isRetiredEmailSignIn: (path: string, email: unknown) =>
      path === "/sign-in/email" &&
      typeof email === "string" &&
      isRetiredEmail(email),
  };
}

const productionPolicy = createRetiredSharedIdentityPolicy(
  RETIRED_SHARED_IDENTITY_EMAIL_HASHES,
);

export const isRetiredSharedIdentityEmail = productionPolicy.isRetiredEmail;
export const isRetiredSharedIdentityEmailSignIn =
  productionPolicy.isRetiredEmailSignIn;
export const createRetiredSharedIdentityDatabaseHooks =
  productionPolicy.createDatabaseHooks;

function hashNormalizedEmail(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex");
}
