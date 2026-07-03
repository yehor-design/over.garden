import { describe, expect, it, vi } from "vitest";

import {
  authEmailVerificationPolicy,
  canonicalizeAuthEmailUrl,
  RESEND_API_KEY_ENV,
  RESEND_AUTH_FROM_ENV,
  sendAuthPasswordResetEmail,
  sendAuthVerificationEmail,
} from "./resend-auth-email-delivery";

const configuredEnv = {
  [RESEND_API_KEY_ENV]: "re_secret_that_must_not_leak",
  [RESEND_AUTH_FROM_ENV]: "OverGarden <auth@over.garden>",
};

describe("Resend auth email delivery", () => {
  it("fails closed synchronously when Resend env is missing", () => {
    expect(() =>
      sendAuthPasswordResetEmail({
        email: "gardener@example.com",
        env: {},
        url: "https://over.garden/api/auth/reset-password/token",
      }),
    ).toThrow(`Missing required environment variable: ${RESEND_API_KEY_ENV}`);
  });

  it("canonicalizes production auth links to over.garden", () => {
    expect(
      canonicalizeAuthEmailUrl(
        "https://over-garden.vercel.app/api/auth/reset-password/token?callbackURL=https%3A%2F%2Fover-garden.vercel.app%2Fauth%2Freset-password",
        {
          VERCEL: "1",
          VERCEL_ENV: "production",
        },
      ),
    ).toBe(
      "https://over.garden/api/auth/reset-password/token?callbackURL=https%3A%2F%2Fover.garden%2Fauth%2Freset-password",
    );
  });

  it("sends password reset email through Resend without leaking secrets into the body or idempotency key", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      calls.push([input, init]);
      return new Response("{}", { status: 200 });
    });

    await sendAuthPasswordResetEmail({
      email: "gardener@example.com",
      env: configuredEnv,
      fetcher,
      url: "https://over.garden/api/auth/reset-password/token",
      userId: "user_123",
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = calls[0] ?? [];
    const headers = init?.headers as Record<string, string>;
    const body = JSON.parse(String(init?.body));

    expect(headers.Authorization).toBe("Bearer re_secret_that_must_not_leak");
    expect(headers["Idempotency-Key"]).not.toContain("gardener@example.com");
    expect(headers["Idempotency-Key"]).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("re_secret_that_must_not_leak");
    expect(body).toMatchObject({
      from: "OverGarden <auth@over.garden>",
      to: ["gardener@example.com"],
      subject: "Reset your OverGarden password",
      tags: [{ name: "category", value: "auth-password-reset" }],
    });
  });

  it("sends verification email with the auth verification category", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      calls.push([input, init]);
      return new Response("{}", { status: 200 });
    });

    await sendAuthVerificationEmail({
      email: "gardener@example.com",
      env: configuredEnv,
      fetcher,
      url: "https://over.garden/api/auth/verify-email?token=token",
      userId: "user_123",
    });

    const [, init] = calls[0] ?? [];
    const body = JSON.parse(String(init?.body));

    expect(body.subject).toBe("Verify your OverGarden email");
    expect(body.tags).toEqual([
      { name: "category", value: "auth-email-verification" },
    ]);
  });

  it("does not leak the Resend API key in provider failure errors", async () => {
    const fetcher = vi.fn(async () => new Response("no", { status: 401 }));

    await expect(
      sendAuthPasswordResetEmail({
        email: "gardener@example.com",
        env: configuredEnv,
        fetcher,
        url: "https://over.garden/api/auth/reset-password/token",
      }),
    ).rejects.toThrow("Resend auth email delivery failed with status 401.");

    await expect(
      sendAuthPasswordResetEmail({
        email: "gardener@example.com",
        env: configuredEnv,
        fetcher,
        url: "https://over.garden/api/auth/reset-password/token",
      }),
    ).rejects.not.toThrow("re_secret_that_must_not_leak");
  });

  it("requires email verification in production-like runtimes only", () => {
    expect(
      authEmailVerificationPolicy({
        VERCEL: "1",
        VERCEL_ENV: "production",
      }),
    ).toBe("required");
    expect(authEmailVerificationPolicy({ NODE_ENV: "test" })).toBe("optional");
  });
});
