import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import type { Kysely } from "kysely";
import {
  assertFounderInterviewMutationAccess,
  resolveFounderInterviewOperatorAccess,
} from "./founder-interview-access";

describe("founder interview operator access", () => {
  it("requires authentication before interview capture readback", async () => {
    await expect(resolveFounderInterviewOperatorAccess(null)).resolves.toEqual({
      status: "sign_in_required",
    });
  });

  it("denies authenticated users without an admin role", async () => {
    await expect(
      resolveFounderInterviewOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        fakeAdminDb(null),
      ),
    ).resolves.toEqual({ status: "denied" });
  });

  it("allows viewer roles to read interview learnings", async () => {
    await expect(
      resolveFounderInterviewOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        fakeAdminDb("viewer"),
      ),
    ).resolves.toMatchObject({
      status: "allowed",
      mode: "database_role",
      role: "viewer",
    });
  });

  it("allows moderator roles to capture bounded interview learnings", async () => {
    await expect(
      assertFounderInterviewMutationAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        fakeAdminDb("moderator"),
      ),
    ).resolves.toMatchObject({ role: "moderator" });
  });

  it("denies viewer roles from capturing interview learnings", async () => {
    await expect(
      assertFounderInterviewMutationAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        fakeAdminDb("viewer"),
      ),
    ).rejects.toThrow("Admin access denied.");
  });
});

function fakeAdminDb(role: string | null): Kysely<Database> {
  const executeTakeFirst = vi.fn(async () => (role ? { role } : undefined));
  const where = vi.fn(() => ({ executeTakeFirst }));
  const select = vi.fn(() => ({ where }));
  const selectFrom = vi.fn(() => ({ select }));

  return { selectFrom } as unknown as Kysely<Database>;
}
