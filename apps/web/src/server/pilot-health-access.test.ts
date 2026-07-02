import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import type { Kysely } from "kysely";
import { resolvePilotHealthOperatorAccess } from "./pilot-health-access";

describe("pilot health operator access", () => {
  it("requires sign-in before the health readout is visible", async () => {
    await expect(resolvePilotHealthOperatorAccess(null)).resolves.toEqual({
      status: "sign_in_required",
    });
  });

  it("denies authenticated users without an admin role", async () => {
    const scope = scopedToUser("00000000-0000-0000-0000-000000000001");

    await expect(
      resolvePilotHealthOperatorAccess(scope, fakeAdminDb(null)),
    ).resolves.toEqual({
      status: "denied",
    });
  });

  it("allows viewer roles to read aggregate pilot health", async () => {
    const scope = scopedToUser("00000000-0000-0000-0000-000000000001");

    await expect(
      resolvePilotHealthOperatorAccess(scope, fakeAdminDb("viewer")),
    ).resolves.toMatchObject({
      status: "allowed",
      mode: "database_role_credential_only",
      role: "viewer",
    });
  });
});

function fakeAdminDb(role: string | null): Kysely<Database> {
  const selectFrom = vi.fn((table: string) => {
    const builder = {
      select: vi.fn(() => builder),
      where: vi.fn(() => builder),
      executeTakeFirst: vi.fn(async () =>
        table === "admin_user_roles" && role ? { role } : undefined,
      ),
      execute: vi.fn(async () =>
        table === "account" ? [{ providerId: "credential" }] : [],
      ),
    };
    return builder;
  });

  return { selectFrom } as unknown as Kysely<Database>;
}
