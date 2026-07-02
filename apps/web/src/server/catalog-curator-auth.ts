import "server-only";

import type { Kysely } from "kysely";

import type { Database } from "@/db/schema";
import {
  assertAdminCapabilityForScope,
  type AdminAccess,
} from "@/server/admin-access";
import type { RequestScope } from "@/server/request-scope";

export type CatalogCuratorAccessMode = "database_role";

export type CatalogCuratorAccess = AdminAccess & {
  mode: CatalogCuratorAccessMode;
};

const ACCESS_DENIED_ERROR = "Catalog curation access denied.";

export function assertCatalogCuratorAccess(
  scope: RequestScope,
  database?: Kysely<Database>,
): Promise<CatalogCuratorAccess> {
  return assertAdminCapabilityForScope(
    scope,
    "operator:mutate",
    database,
  ).catch(() => {
    throw new Error(ACCESS_DENIED_ERROR);
  });
}
