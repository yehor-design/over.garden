import "server-only";

import {
  assertCatalogCuratorAccess,
  type CatalogCuratorAccessMode,
} from "@/server/catalog-curator-auth";
import type { RequestScope } from "@/server/request-scope";

export type FounderInterviewOperatorAccess =
  | { status: "sign_in_required" }
  | { status: "denied" }
  | { status: "allowed"; mode: CatalogCuratorAccessMode };

export function resolveFounderInterviewOperatorAccess(
  scope: RequestScope | null,
  rawAllowedUserIds?: string,
): FounderInterviewOperatorAccess {
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
