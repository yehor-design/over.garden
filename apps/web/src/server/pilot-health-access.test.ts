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
      mode: "database_role",
      role: "viewer",
    });
  });
});

function fakeAdminDb(role: string | null): Kysely<Database> {
  const executeTakeFirst = vi.fn(async () => (role ? { role } : undefined));
  const where = vi.fn(() => ({ executeTakeFirst }));
  const select = vi.fn(() => ({ where }));
  const selectFrom = vi.fn(() => ({ select }));

  return { selectFrom } as unknown as Kysely<Database>;
}
