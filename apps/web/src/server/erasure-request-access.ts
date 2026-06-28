import "server-only";

import {
  assertCatalogCuratorAccess,
  type CatalogCuratorAccessMode,
} from "@/server/catalog-curator-auth";
import type { RequestScope } from "@/server/request-scope";

export type ErasureRequestOperatorAccess =
  | { status: "sign_in_required" }
  | { status: "denied" }
  | { status: "allowed"; mode: CatalogCuratorAccessMode };

export function resolveErasureRequestOperatorAccess(
  scope: RequestScope | null,
  rawAllowedUserIds?: string,
): ErasureRequestOperatorAccess {
  if (!scope) return { status: "sign_in_required" };

  try {
    return {
      status: "allowed",
      mode: assertCatalogCuratorAccess(scope, rawAllowedUserIds).mode,
    };
  } catch {
    return { status: "denied" };
  }
}
