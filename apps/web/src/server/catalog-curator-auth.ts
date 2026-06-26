import "server-only";

import { optionalServerEnv } from "@/lib/env";
import type { RequestScope } from "@/server/request-scope";

export type CatalogCuratorAccessMode = "allowlist" | "authenticated_user";

export interface CatalogCuratorAccess {
  mode: CatalogCuratorAccessMode;
}

export function assertCatalogCuratorAccess(
  scope: RequestScope,
  rawAllowedUserIds = optionalServerEnv("CATALOG_CURATOR_USER_IDS"),
): CatalogCuratorAccess {
  const allowedUserIds = parseCatalogCuratorUserIds(rawAllowedUserIds);

  if (allowedUserIds.length === 0) {
    return { mode: "authenticated_user" };
  }

  if (!allowedUserIds.includes(scope.userId)) {
    throw new Error("Catalog curation access denied.");
  }

  return { mode: "allowlist" };
}

export function parseCatalogCuratorUserIds(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
