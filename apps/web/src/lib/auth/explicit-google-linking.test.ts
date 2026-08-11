import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { APIError } from "better-auth/api";
import { describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_LINKING_UNAVAILABLE_CODE,
  admitExplicitGoogleLinking,
  GOOGLE_ACCOUNT_LINKING_ENABLED_ENV,
  isExplicitGoogleLinkingEnabled,
} from "./explicit-google-linking";

const ENABLED_ENV = {
  [GOOGLE_ACCOUNT_LINKING_ENABLED_ENV]: "true",
  GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "secret",
};

function linkContext(input?: {
  path?: string;
  body?: unknown;
  token?: string | false | null;
  emailVerified?: boolean;
  findSession?: (token: string) => Promise<unknown>;
}) {
  return {
    path: input?.path ?? "/link-social",
    body: input?.body ?? { provider: "google" },
    getSignedCookie: vi
      .fn<(key: string, secret: string) => Promise<string | false | null>>()
      .mockResolvedValue(
        input?.token === undefined ? "signed-token" : input.token,
      ),
    context: {
      authCookies: { sessionToken: { name: "overgarden.session_token" } },
      secret: "test-secret-at-least-32-characters",
      internalAdapter: {
        findSession:
          input?.findSession ??
          vi.fn(async () => ({
            session: { id: "session-a" },
            user: { emailVerified: input?.emailVerified ?? true },
          })),
      },
    },
  };
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected explicit Google linking admission to fail.");
}

describe("explicit Google linking admission", () => {
  it("enables only trimmed exact true with both Google provider credentials", () => {
    expect(isExplicitGoogleLinkingEnabled(ENABLED_ENV)).toBe(true);
    expect(
      isExplicitGoogleLinkingEnabled({
        ...ENABLED_ENV,
        [GOOGLE_ACCOUNT_LINKING_ENABLED_ENV]: " true ",
      }),
    ).toBe(true);

    for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
      expect(
        isExplicitGoogleLinkingEnabled({
          ...ENABLED_ENV,
          [GOOGLE_ACCOUNT_LINKING_ENABLED_ENV]: value,
        }),
      ).toBe(false);
    }
    expect(
      isExplicitGoogleLinkingEnabled({
        ...ENABLED_ENV,
        GOOGLE_CLIENT_SECRET: "",
      }),
    ).toBe(false);
  });

  it("admits the exact Google redirect flow only for a verified live session", async () => {
    const context = linkContext();

    await expect(
      admitExplicitGoogleLinking(context, { env: ENABLED_ENV }),
    ).resolves.toBe("admitted");
    expect(context.getSignedCookie).toHaveBeenCalledWith(
      "overgarden.session_token",
      "test-secret-at-least-32-characters",
    );
    expect(context.context.internalAdapter.findSession).toHaveBeenCalledWith(
      "signed-token",
    );
  });

  it("does not inspect cookies for any non-link endpoint", async () => {
    const context = linkContext({ path: "/sign-in/social" });

    await expect(
      admitExplicitGoogleLinking(context, { env: {} }),
    ).resolves.toBe("not_link_social");
    expect(context.getSignedCookie).not.toHaveBeenCalled();
  });

  it.each([
    ["default off", {}, linkContext()],
    [
      "wrong provider",
      ENABLED_ENV,
      linkContext({ body: { provider: "github" } }),
    ],
    [
      "direct idToken",
      ENABLED_ENV,
      linkContext({
        body: { provider: "google", idToken: { token: "provider-secret" } },
      }),
    ],
    ["missing session", ENABLED_ENV, linkContext({ token: null })],
    [
      "unverified local email",
      ENABLED_ENV,
      linkContext({ emailVerified: false }),
    ],
    [
      "adapter failure",
      ENABLED_ENV,
      linkContext({
        findSession: vi.fn(async () => {
          throw new Error("raw database host and identity");
        }),
      }),
    ],
  ] as const)(
    "fails closed and generically for %s",
    async (_label, env, context) => {
      const thrown = await captureFailure(() =>
        admitExplicitGoogleLinking(context, { env }),
      );

      expect(thrown).toBeInstanceOf(APIError);
      expect((thrown as APIError).body?.code).toBe(
        ACCOUNT_LINKING_UNAVAILABLE_CODE,
      );
      expect((thrown as APIError).body).toEqual({
        message: "Account linking is unavailable.",
        code: ACCOUNT_LINKING_UNAVAILABLE_CODE,
      });
      expect(JSON.stringify((thrown as APIError).body)).not.toMatch(
        /provider-secret|database host|identity|signed-token/i,
      );
    },
  );

  it("composes admission into the single Better Auth before hook", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../auth.ts", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("await admitExplicitGoogleLinking(context)");
    expect(
      source.indexOf("await admitExplicitGoogleLinking(context)"),
    ).toBeLessThan(
      source.indexOf("await hardenCurrentSessionSignOut(context)"),
    );
  });
});
