import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { ADMIN_SEALED_OWNER_USER_ID_ENV } from "@/server/admin-access";
import { scopedToUser } from "@/server/request-scope";
import type { Kysely } from "kysely";
import {
  assertErasureExecutionAccess,
  assertErasureRequestMutationAccess,
  resolveErasureRequestOperatorAccess,
} from "./erasure-request-access";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

describe("erasure request operator access", () => {
  beforeEach(() => {
    vi.stubEnv(ADMIN_SEALED_OWNER_USER_ID_ENV, OWNER_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires authentication before operator request readback", async () => {
    await expect(resolveErasureRequestOperatorAccess(null)).resolves.toEqual({
      status: "sign_in_required",
    });
  });

  it("denies authenticated users without an admin role", async () => {
    await expect(
      resolveErasureRequestOperatorAccess(
        scopedToUser(OTHER_ID),
        fakeAdminDb(null),
      ),
    ).resolves.toEqual({ status: "denied" });
  });

  it("allows the sealed owner to read, review, and execute erasure requests", async () => {
    const scope = scopedToUser(OWNER_ID);

    await expect(
      resolveErasureRequestOperatorAccess(scope, fakeAdminDb("owner")),
    ).resolves.toMatchObject({
      status: "allowed",
      mode: "sealed_owner_credential_only",
      role: "owner",
    });
    await expect(
      assertErasureRequestMutationAccess(scope, fakeAdminDb("owner")),
    ).resolves.toMatchObject({ role: "owner" });
    await expect(
      assertErasureExecutionAccess(scope, fakeAdminDb("owner")),
    ).resolves.toMatchObject({ role: "owner" });
  });

  it("denies non-owner role rows from erasure operations", async () => {
    const scope = scopedToUser(OTHER_ID);

    await expect(
      resolveErasureRequestOperatorAccess(scope, fakeAdminDb("owner")),
    ).resolves.toEqual({ status: "denied" });
    await expect(
      assertErasureRequestMutationAccess(scope, fakeAdminDb("owner")),
    ).rejects.toThrow("Admin access denied.");
    await expect(
      assertErasureExecutionAccess(scope, fakeAdminDb("owner")),
    ).rejects.toThrow("Admin access denied.");
  });
});

function fakeAdminDb(role: string | null): Kysely<Database> {
  const selectFrom = vi.fn((table: string) => {
    const builder = {
      select: vi.fn(() => builder),
      where: vi.fn(() => builder),
      executeTakeFirst: vi.fn(async () => {
        if (table === "admin_user_roles" && role) return { role };
        if (table === "user") return { emailVerified: true };
        return undefined;
      }),
      execute: vi.fn(async () =>
        table === "account"
          ? [{ providerId: "credential", password: "password-hash" }]
          : [],
      ),
    };
    return builder;
  });

  return { selectFrom } as unknown as Kysely<Database>;
}
