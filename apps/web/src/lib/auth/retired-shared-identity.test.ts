import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  createRetiredSharedIdentityPolicy,
  isRetiredSharedIdentityEmail,
} from "@/lib/auth/retired-shared-identity";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "@/lib/auth/public-identity-compatibility";

const syntheticRetiredEmail = "retired-fixture@identity.invalid";
const syntheticPolicy = createRetiredSharedIdentityPolicy(
  new Set([hashNormalizedEmail(syntheticRetiredEmail)]),
);

describe("retired shared identity policy", () => {
  it("matches a synthetic digest without storing a production identity", () => {
    expect(syntheticPolicy.isRetiredEmail(syntheticRetiredEmail)).toBe(true);
    expect(
      syntheticPolicy.isRetiredEmail(
        `  ${syntheticRetiredEmail.toUpperCase()}  `,
      ),
    ).toBe(true);
    expect(syntheticPolicy.isRetiredEmail("member@example.test")).toBe(false);
  });

  it("keeps the production predicate closed over private digest metadata", () => {
    expect(isRetiredSharedIdentityEmail("member@example.test")).toBe(false);
  });

  it("classifies only synthetic retired email sign-in requests", () => {
    expect(
      syntheticPolicy.isRetiredEmailSignIn(
        "/sign-in/email",
        syntheticRetiredEmail,
      ),
    ).toBe(true);
    expect(
      syntheticPolicy.isRetiredEmailSignIn(
        "/sign-up/email",
        syntheticRetiredEmail,
      ),
    ).toBe(false);
    expect(
      syntheticPolicy.isRetiredEmailSignIn(
        "/sign-in/email",
        "member@example.test",
      ),
    ).toBe(false);
    expect(syntheticPolicy.isRetiredEmailSignIn("/sign-in/email", null)).toBe(
      false,
    );
  });

  it("allows user mutations and sessions only for non-retired identities", async () => {
    const findUserEmail = vi
      .fn<(userId: string) => Promise<string | null>>()
      .mockResolvedValue("member@example.test");
    const hooks = syntheticPolicy.createDatabaseHooks(findUserEmail);

    await expect(
      hooks.user.create.before({
        email: "member@example.test",
        name: "Provider controlled name",
      }),
    ).resolves.toEqual({
      data: {
        email: "member@example.test",
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      },
    });
    await expect(hooks.user.update.before({})).resolves.toBeUndefined();
    await expect(
      hooks.session.create.before({ userId: "user-1" }),
    ).resolves.toBeUndefined();
    expect(findUserEmail).toHaveBeenCalledWith("user-1");
  });

  it("fails closed when the session user is missing", async () => {
    const hooks = syntheticPolicy.createDatabaseHooks(async () => null);

    await expect(
      hooks.session.create.before({ userId: "missing-user" }),
    ).resolves.toBe(false);
  });

  it("blocks creation, email adoption, and sessions for a synthetic retired identity", async () => {
    const hooks = syntheticPolicy.createDatabaseHooks(
      async () => syntheticRetiredEmail,
    );

    await expect(
      hooks.user.create.before({ email: syntheticRetiredEmail }),
    ).resolves.toBe(false);
    await expect(
      hooks.user.update.before({ email: syntheticRetiredEmail }),
    ).resolves.toBe(false);
    await expect(
      hooks.session.create.before({ userId: "retired-user" }),
    ).resolves.toBe(false);
  });

  it("propagates lookup failures so session creation fails closed", async () => {
    const failure = new Error("identity lookup unavailable");
    const hooks = syntheticPolicy.createDatabaseHooks(async () => {
      throw failure;
    });

    await expect(
      hooks.session.create.before({ userId: "user-1" }),
    ).rejects.toBe(failure);
  });
});

function hashNormalizedEmail(email: string) {
  return createHash("sha256")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex");
}
