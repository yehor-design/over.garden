import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import type { Kysely } from "kysely";
import {
  ADMIN_ACCESS_DENIED_MESSAGE,
  assertAdminAccess,
  assertAdminCapability,
  readAdminRoleForUser,
  resolveAdminAccess,
} from "./admin-access";

describe("admin access gate", () => {
  it("requires authentication before reading admin roles", async () => {
    await expect(
      resolveAdminAccess(null, fakeAdminDb({ role: "owner" })),
    ).resolves.toEqual({ status: "sign_in_required" });
  });

  it("denies signed-in users without a durable admin role", async () => {
    const access = await resolveAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      fakeAdminDb({ role: null }),
    );

    expect(access).toEqual({ status: "denied" });
  });

  it("reads admin authorization from durable user ids, not OAuth provider claims", async () => {
    const userId = "00000000-0000-4000-8000-000000000001";
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

  it("allows owners with role-management capability", async () => {
    const access = await assertAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      fakeAdminDb({ role: "owner" }),
    );

    expect(access).toEqual({
      mode: "database_role_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "admin:manage_roles",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
    });
    expect(() =>
      assertAdminCapability(access, "admin:manage_roles"),
    ).not.toThrow();
  });

  it("denies stored admin roles when the account is not credential-only", async () => {
    const socialLinkedAccess = await resolveAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      fakeAdminDb({
        role: "owner",
        accountProviders: ["credential", "google"],
      }),
    );
    const socialOnlyAccess = await resolveAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000002"),
      fakeAdminDb({ role: "admin", accountProviders: ["facebook"] }),
    );

    expect(socialLinkedAccess).toEqual({ status: "denied" });
    expect(socialOnlyAccess).toEqual({ status: "denied" });
  });

  it("keeps viewer roles read-only", async () => {
    const access = await assertAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      fakeAdminDb({ role: "viewer" }),
    );

    expect(access.capabilities).toEqual(["admin:read", "operator:read"]);
    expect(() => assertAdminCapability(access, "operator:mutate")).toThrow(
      ADMIN_ACCESS_DENIED_MESSAGE,
    );
    expect(() => assertAdminCapability(access, "erasure:execute")).toThrow(
      ADMIN_ACCESS_DENIED_MESSAGE,
    );
  });

  it("limits irreversible erasure execution to owner and admin roles", async () => {
    const adminAccess = await assertAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      fakeAdminDb({ role: "admin" }),
    );
    const moderatorAccess = await assertAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000002"),
      fakeAdminDb({ role: "moderator" }),
    );

    expect(() =>
      assertAdminCapability(adminAccess, "erasure:execute"),
    ).not.toThrow();
    expect(() =>
      assertAdminCapability(moderatorAccess, "erasure:execute"),
    ).toThrow(ADMIN_ACCESS_DENIED_MESSAGE);
  });

  it("fails closed if the stored role is outside the enum", async () => {
    await expect(
      readAdminRoleForUser(
        fakeAdminDb({ role: "founder" }) as Kysely<Database>,
        "00000000-0000-4000-8000-000000000001",
      ),
    ).resolves.toBeNull();
  });
});

function fakeAdminDb(input: {
  role: string | null;
  accountProviders?: string[];
}): Kysely<Database> {
  const selectFrom = vi.fn((table: string) => {
    const builder = {
      select: vi.fn(() => builder),
      where: vi.fn(() => builder),
      executeTakeFirst: vi.fn(async () =>
        table === "admin_user_roles" && input.role
          ? { role: input.role }
          : undefined,
      ),
      execute: vi.fn(async () =>
        table === "account"
          ? (input.accountProviders ?? ["credential"]).map((providerId) => ({
              providerId,
            }))
          : [],
      ),
    };
    return builder;
  });

  return { selectFrom } as unknown as Kysely<Database>;
}
