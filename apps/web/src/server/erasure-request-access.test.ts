import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import type { Kysely } from "kysely";
import {
  assertErasureExecutionAccess,
  assertErasureRequestMutationAccess,
  resolveErasureRequestOperatorAccess,
} from "./erasure-request-access";

describe("erasure request operator access", () => {
  it("requires authentication before operator request readback", async () => {
    await expect(resolveErasureRequestOperatorAccess(null)).resolves.toEqual({
      status: "sign_in_required",
    });
  });

  it("denies authenticated users without an admin role", async () => {
    await expect(
      resolveErasureRequestOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        fakeAdminDb(null),
      ),
    ).resolves.toEqual({ status: "denied" });
  });

  it("allows viewer roles to read minimized erasure request readback", async () => {
    await expect(
      resolveErasureRequestOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        fakeAdminDb("viewer"),
      ),
    ).resolves.toMatchObject({
      status: "allowed",
      mode: "database_role",
      role: "viewer",
    });
  });

  it("allows moderator request review mutations but denies irreversible execution", async () => {
    const scope = scopedToUser("00000000-0000-0000-0000-000000000001");

    await expect(
      assertErasureRequestMutationAccess(scope, fakeAdminDb("moderator")),
    ).resolves.toMatchObject({ role: "moderator" });
    await expect(
      assertErasureExecutionAccess(scope, fakeAdminDb("moderator")),
    ).rejects.toThrow("Admin access denied.");
  });

  it("allows owner and admin roles to execute maintainer-approved erasure", async () => {
    const scope = scopedToUser("00000000-0000-0000-0000-000000000001");

    await expect(
      assertErasureExecutionAccess(scope, fakeAdminDb("owner")),
    ).resolves.toMatchObject({ role: "owner" });
    await expect(
      assertErasureExecutionAccess(scope, fakeAdminDb("admin")),
    ).resolves.toMatchObject({ role: "admin" });
  });
});

function fakeAdminDb(role: string | null): Kysely<Database> {
  const executeTakeFirst = vi.fn(async () => (role ? { role } : undefined));
  const where = vi.fn(() => ({ executeTakeFirst }));
  const select = vi.fn(() => ({ where }));
  const selectFrom = vi.fn(() => ({ select }));

  return { selectFrom } as unknown as Kysely<Database>;
}
