import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { ADMIN_SEALED_OWNER_USER_ID_ENV } from "@/server/admin-access";
import { scopedToUser } from "@/server/request-scope";
import type { Kysely } from "kysely";
import { assertCatalogCuratorAccess } from "./catalog-curator-auth";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

describe("catalog curator auth gate", () => {
  beforeEach(() => {
    vi.stubEnv(ADMIN_SEALED_OWNER_USER_ID_ENV, OWNER_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies signed-in users without a durable operator mutation role", async () => {
    await expect(
      assertCatalogCuratorAccess(scopedToUser(OTHER_ID), fakeAdminDb(null)),
    ).rejects.toThrow("Catalog curation access denied.");
  });

  it("allows only the sealed owner to curate catalog rows", async () => {
    expect(
      await assertCatalogCuratorAccess(
        scopedToUser(OWNER_ID),
        fakeAdminDb("owner"),
      ),
    ).toMatchObject({ mode: "sealed_owner_credential_only", role: "owner" });
  });

  it("rejects owner role rows for non-sealed users", async () => {
    await expect(
      assertCatalogCuratorAccess(scopedToUser(OTHER_ID), fakeAdminDb("owner")),
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
