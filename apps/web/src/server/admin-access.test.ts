import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import type { Kysely } from "kysely";
import {
  ADMIN_ACCESS_DENIED_MESSAGE,
  ADMIN_SEALED_OWNER_USER_ID_ENV,
  assertAdminAccess,
  assertAdminCapability,
  readAdminRoleForUser,
  resolveAdminAccess,
} from "./admin-access";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

describe("admin access gate", () => {
  beforeEach(() => {
    vi.stubEnv(ADMIN_SEALED_OWNER_USER_ID_ENV, OWNER_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires authentication before reading admin roles", async () => {
    await expect(
      resolveAdminAccess(null, fakeAdminDb({ role: "owner" })),
    ).resolves.toEqual({ status: "sign_in_required" });
  });

  it("denies signed-in users without a durable admin role", async () => {
    const access = await resolveAdminAccess(
      scopedToUser(OWNER_ID),
      fakeAdminDb({ role: null }),
    );

    expect(access).toEqual({ status: "denied" });
  });

  it("reads admin authorization from durable user ids, not OAuth provider claims", async () => {
    const userId = OWNER_ID;
    const executeTakeFirst = vi.fn(async () => ({ role: "owner" }));
    const where = vi.fn(() => ({ executeTakeFirst }));
    const select = vi.fn(() => ({ where }));
    const selectFrom = vi.fn(() => ({ select }));
    const database = { selectFrom } as unknown as Kysely<Database>;

    await expect(readAdminRoleForUser(database, userId)).resolves.toBe("owner");

    expect(selectFrom).toHaveBeenCalledWith("admin_user_roles");
    expect(select).toHaveBeenCalledWith("role");
    expect(where).toHaveBeenCalledWith("user_id", "=", userId);
  });

  it("allows the sealed owner only the retained operator capabilities", async () => {
    const access = await assertAdminAccess(
      scopedToUser(OWNER_ID),
      fakeAdminDb({ role: "owner" }),
    );

    expect(access).toEqual({
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
    });
    expect(() =>
      assertAdminCapability(access, "operator:mutate"),
    ).not.toThrow();
  });

  it("denies stored admin roles when the account is not credential-only", async () => {
    const socialLinkedAccess = await resolveAdminAccess(
      scopedToUser(OWNER_ID),
      fakeAdminDb({
        role: "owner",
        accounts: [
          { providerId: "credential", password: "password-hash" },
          { providerId: "google", password: null },
        ],
      }),
    );
    const socialOnlyAccess = await resolveAdminAccess(
      scopedToUser(OWNER_ID),
      fakeAdminDb({
        role: "admin",
        accounts: [{ providerId: "google", password: null }],
      }),
    );

    expect(socialLinkedAccess).toEqual({ status: "denied" });
    expect(socialOnlyAccess).toEqual({ status: "denied" });
  });

  it.each([
    {
      label: "an unverified owner email",
      input: { role: "owner", emailVerified: false },
    },
    {
      label: "a credential without a password hash",
      input: {
        role: "owner",
        accounts: [{ providerId: "credential", password: null }],
      },
    },
    {
      label: "duplicate credential rows",
      input: {
        role: "owner",
        accounts: [
          { providerId: "credential", password: "password-hash" },
          { providerId: "credential", password: "second-password-hash" },
        ],
      },
    },
  ])("denies $label", async ({ input }) => {
    await expect(
      resolveAdminAccess(scopedToUser(OWNER_ID), fakeAdminDb(input)),
    ).resolves.toEqual({ status: "denied" });
  });

  it("denies any non-owner role even when the user id matches the sealed owner", async () => {
    await expect(
      assertAdminAccess(
        scopedToUser(OWNER_ID),
        fakeAdminDb({ role: "viewer" }),
      ),
    ).rejects.toThrow(ADMIN_ACCESS_DENIED_MESSAGE);

    await expect(
      assertAdminAccess(scopedToUser(OWNER_ID), fakeAdminDb({ role: "admin" })),
    ).rejects.toThrow(ADMIN_ACCESS_DENIED_MESSAGE);
  });

  it("denies owner role rows for any user other than the sealed owner", async () => {
    await expect(
      assertAdminAccess(scopedToUser(OTHER_ID), fakeAdminDb({ role: "owner" })),
    ).rejects.toThrow(ADMIN_ACCESS_DENIED_MESSAGE);
  });

  it("fails closed when the sealed owner env is missing", async () => {
    vi.unstubAllEnvs();

    await expect(
      assertAdminAccess(scopedToUser(OWNER_ID), fakeAdminDb({ role: "owner" })),
    ).rejects.toThrow(ADMIN_ACCESS_DENIED_MESSAGE);
  });

  it("fails closed if the stored role is outside the enum", async () => {
    await expect(
      readAdminRoleForUser(
        fakeAdminDb({ role: "founder" }) as Kysely<Database>,
        OWNER_ID,
      ),
    ).resolves.toBeNull();
  });
});

function fakeAdminDb(input: {
  role: string | null;
  emailVerified?: boolean;
  accounts?: Array<{ providerId: string; password: string | null }>;
}): Kysely<Database> {
  const selectFrom = vi.fn((table: string) => {
    const builder = {
      select: vi.fn(() => builder),
      where: vi.fn(() => builder),
      executeTakeFirst: vi.fn(async () => {
        if (table === "admin_user_roles" && input.role) {
          return { role: input.role };
        }
        if (table === "user") {
          return { emailVerified: input.emailVerified ?? true };
        }
        return undefined;
      }),
      execute: vi.fn(async () =>
        table === "account"
          ? (input.accounts ?? [
              { providerId: "credential", password: "password-hash" },
            ])
          : [],
      ),
    };
    return builder;
  });

  return { selectFrom } as unknown as Kysely<Database>;
}
