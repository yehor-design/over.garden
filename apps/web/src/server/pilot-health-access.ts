import "server-only";

import {
  assertCatalogCuratorAccess,
  type CatalogCuratorAccessOptions,
  type CatalogCuratorAccessMode,
} from "@/server/catalog-curator-auth";
import type { RequestScope } from "@/server/request-scope";

export type PilotHealthOperatorAccess =
  | { status: "sign_in_required" }
  | { status: "denied" }
  | { status: "allowed"; mode: CatalogCuratorAccessMode };

export function resolvePilotHealthOperatorAccess(
  scope: RequestScope | null,
  rawAllowedUserIds?: string,
  options?: CatalogCuratorAccessOptions,
): PilotHealthOperatorAccess {
  if (!scope) return { status: "sign_in_required" };

  try {
    return {
      status: "allowed",
      mode: assertCatalogCuratorAccess(scope, rawAllowedUserIds, options).mode,
    };
  } catch {
    return { status: "denied" };
  }
}
