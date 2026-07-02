import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import type { Kysely } from "kysely";
import { assertCatalogCuratorAccess } from "./catalog-curator-auth";

const scope = scopedToUser("00000000-0000-0000-0000-000000000001");

describe("catalog curator auth gate", () => {
  it("denies signed-in users without a durable operator mutation role", async () => {
    await expect(
      assertCatalogCuratorAccess(scope, fakeAdminDb(null)),
    ).rejects.toThrow("Catalog curation access denied.");
  });

  it("allows owner, admin, and moderator curator roles", async () => {
    expect(
      await assertCatalogCuratorAccess(scope, fakeAdminDb("owner")),
    ).toMatchObject({ mode: "database_role", role: "owner" });
    expect(
      await assertCatalogCuratorAccess(scope, fakeAdminDb("admin")),
    ).toMatchObject({ mode: "database_role", role: "admin" });
    expect(
      await assertCatalogCuratorAccess(scope, fakeAdminDb("moderator")),
    ).toMatchObject({ mode: "database_role", role: "moderator" });
  });

  it("rejects viewer roles because catalog curation mutates operator state", async () => {
    await expect(
      assertCatalogCuratorAccess(scope, fakeAdminDb("viewer")),
    ).rejects.toThrow("Catalog curation access denied.");
  });
});

function fakeAdminDb(role: string | null): Kysely<Database> {
  const executeTakeFirst = vi.fn(async () => (role ? { role } : undefined));
  const where = vi.fn(() => ({ executeTakeFirst }));
  const select = vi.fn(() => ({ where }));
  const selectFrom = vi.fn(() => ({ select }));

  return { selectFrom } as unknown as Kysely<Database>;
}
