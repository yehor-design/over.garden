import "server-only";

import { optionalServerEnv } from "@/lib/env";
import type { RequestScope } from "@/server/request-scope";

export type CatalogCuratorAccessMode = "allowlist";

export interface CatalogCuratorAccess {
  mode: CatalogCuratorAccessMode;
}

const ACCESS_DENIED_ERROR = "Catalog curation access denied.";

export function assertCatalogCuratorAccess(
  scope: RequestScope,
  rawAllowedUserIds = optionalServerEnv("CATALOG_CURATOR_USER_IDS"),
): CatalogCuratorAccess {
  const allowedUserIds = parseCatalogCuratorUserIds(rawAllowedUserIds);

  if (!allowedUserIds.includes(scope.userId)) {
    throw new Error(ACCESS_DENIED_ERROR);
  }

  return { mode: "allowlist" };
}

export function parseCatalogCuratorUserIds(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
