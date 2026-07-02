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
      resolveAdminAccess(null, fakeAdminDb("owner")),
    ).resolves.toEqual({ status: "sign_in_required" });
  });

  it("denies signed-in users without a durable admin role", async () => {
    const access = await resolveAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      fakeAdminDb(null),
    );

    expect(access).toEqual({ status: "denied" });
  });

  it("allows owners with role-management capability", async () => {
    const access = await assertAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      fakeAdminDb("owner"),
    );

    expect(access).toEqual({
      mode: "database_role",
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

  it("keeps viewer roles read-only", async () => {
    const access = await assertAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      fakeAdminDb("viewer"),
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
      fakeAdminDb("admin"),
    );
    const moderatorAccess = await assertAdminAccess(
      scopedToUser("00000000-0000-4000-8000-000000000002"),
      fakeAdminDb("moderator"),
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
        fakeAdminDb("founder") as Kysely<Database>,
        "00000000-0000-4000-8000-000000000001",
      ),
    ).resolves.toBeNull();
  });
});

function fakeAdminDb(role: string | null): Kysely<Database> {
  const executeTakeFirst = vi.fn(async () => (role ? { role } : undefined));
  const where = vi.fn(() => ({ executeTakeFirst }));
  const select = vi.fn(() => ({ where }));
  const selectFrom = vi.fn(() => ({ select }));

  return { selectFrom } as unknown as Kysely<Database>;
}
