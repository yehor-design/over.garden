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
    ).toMatchObject({ mode: "database_role_credential_only", role: "owner" });
    expect(
      await assertCatalogCuratorAccess(scope, fakeAdminDb("admin")),
    ).toMatchObject({ mode: "database_role_credential_only", role: "admin" });
    expect(
      await assertCatalogCuratorAccess(scope, fakeAdminDb("moderator")),
    ).toMatchObject({
      mode: "database_role_credential_only",
      role: "moderator",
    });
  });

  it("rejects viewer roles because catalog curation mutates operator state", async () => {
    await expect(
      assertCatalogCuratorAccess(scope, fakeAdminDb("viewer")),
    ).rejects.toThrow("Catalog curation access denied.");
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
