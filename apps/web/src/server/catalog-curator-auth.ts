import "server-only";

import { optionalServerEnv } from "@/lib/env";
import type { RequestScope } from "@/server/request-scope";

export type CatalogCuratorAccessMode = "allowlist" | "local_authenticated_user";

export interface CatalogCuratorAccess {
  mode: CatalogCuratorAccessMode;
}

export interface CatalogCuratorAccessOptions {
  allowAuthenticatedUserFallback?: boolean;
  runtimeEnv?: Partial<
    Pick<NodeJS.ProcessEnv, "NODE_ENV" | "VERCEL" | "VERCEL_ENV">
  >;
}

const ACCESS_DENIED_ERROR = "Catalog curation access denied.";
const AUTHENTICATED_FALLBACK_ENV =
  "CATALOG_CURATOR_AUTHENTICATED_FALLBACK";

export function assertCatalogCuratorAccess(
  scope: RequestScope,
  rawAllowedUserIds = optionalServerEnv("CATALOG_CURATOR_USER_IDS"),
  options: CatalogCuratorAccessOptions = {},
): CatalogCuratorAccess {
  const allowedUserIds = parseCatalogCuratorUserIds(rawAllowedUserIds);

  if (allowedUserIds.length === 0) {
    if (allowsLocalAuthenticatedUserFallback(options)) {
      return { mode: "local_authenticated_user" };
    }

    throw new Error(ACCESS_DENIED_ERROR);
  }

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

function allowsLocalAuthenticatedUserFallback({
  allowAuthenticatedUserFallback,
  runtimeEnv = process.env,
}: CatalogCuratorAccessOptions) {
  const fallbackEnabled =
    allowAuthenticatedUserFallback ??
    (optionalServerEnv(AUTHENTICATED_FALLBACK_ENV) === "true");

  return fallbackEnabled && !isProductionLikeRuntime(runtimeEnv);
}

function isProductionLikeRuntime(
  env: CatalogCuratorAccessOptions["runtimeEnv"],
) {
  return (
    env?.NODE_ENV === "production" ||
    env?.VERCEL === "1" ||
    env?.VERCEL_ENV === "production" ||
    env?.VERCEL_ENV === "preview"
  );
}
