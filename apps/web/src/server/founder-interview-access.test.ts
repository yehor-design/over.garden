import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { ADMIN_SEALED_OWNER_USER_ID_ENV } from "@/server/admin-access";
import { scopedToUser } from "@/server/request-scope";
import type { Kysely } from "kysely";
import {
  assertFounderInterviewMutationAccess,
  resolveFounderInterviewOperatorAccess,
} from "./founder-interview-access";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

describe("founder interview operator access", () => {
  beforeEach(() => {
    vi.stubEnv(ADMIN_SEALED_OWNER_USER_ID_ENV, OWNER_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires authentication before interview capture readback", async () => {
    await expect(resolveFounderInterviewOperatorAccess(null)).resolves.toEqual({
      status: "sign_in_required",
    });
  });

  it("denies authenticated users without an admin role", async () => {
    await expect(
      resolveFounderInterviewOperatorAccess(
        scopedToUser(OTHER_ID),
        fakeAdminDb(null),
      ),
    ).resolves.toEqual({ status: "denied" });
  });

  it("allows the sealed owner to read and capture interview learnings", async () => {
    await expect(
      resolveFounderInterviewOperatorAccess(
        scopedToUser(OWNER_ID),
        fakeAdminDb("owner"),
      ),
    ).resolves.toMatchObject({
      status: "allowed",
      mode: "sealed_owner_credential_only",
      role: "owner",
    });
    await expect(
      assertFounderInterviewMutationAccess(
        scopedToUser(OWNER_ID),
        fakeAdminDb("owner"),
      ),
    ).resolves.toMatchObject({ role: "owner" });
  });

  it("denies non-owner role rows from interview learnings", async () => {
    await expect(
      resolveFounderInterviewOperatorAccess(
        scopedToUser(OTHER_ID),
        fakeAdminDb("owner"),
      ),
    ).resolves.toEqual({ status: "denied" });
    await expect(
      assertFounderInterviewMutationAccess(
        scopedToUser(OTHER_ID),
        fakeAdminDb("owner"),
      ),
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
