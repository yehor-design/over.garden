import "server-only";

import type { Kysely } from "kysely";

import type { Database } from "@/db/schema";
import {
  AdminAccessDeniedError,
  assertAdminCapabilityForScope,
  type AdminAccess,
} from "@/server/admin-access";
import type { RequestScope } from "@/server/request-scope";

export type CatalogCuratorAccessMode = "sealed_owner_credential_only";

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
  ).catch((reason: unknown) => {
    // A refusal is rewritten to this surface's own wording. Anything else —
    // an unreachable role table, a timeout — is re-thrown untouched, because
    // ADR-0023 needs the caller to be able to tell "you may not" apart from
    // "we could not ask", and flattening both into one message is what made
    // a database outage look like a permissions problem.
    if (reason instanceof AdminAccessDeniedError) {
      throw new AdminAccessDeniedError(ACCESS_DENIED_ERROR);
    }
    throw reason;
  });
}
