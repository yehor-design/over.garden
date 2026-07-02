import "server-only";

import type { Kysely } from "kysely";

import type { Database } from "@/db/schema";
import {
  assertAdminCapabilityForScope,
  resolveAdminCapabilityAccess,
  type AdminAccess,
  type AdminEntryAccess,
} from "@/server/admin-access";
import type { RequestScope } from "@/server/request-scope";

export type ErasureRequestOperatorAccess = AdminEntryAccess;

export async function resolveErasureRequestOperatorAccess(
  scope: RequestScope | null,
  database?: Kysely<Database>,
): Promise<ErasureRequestOperatorAccess> {
  return resolveAdminCapabilityAccess(scope, "operator:read", database);
}

export async function assertErasureRequestMutationAccess(
  scope: RequestScope,
  database?: Kysely<Database>,
): Promise<AdminAccess> {
  return assertAdminCapabilityForScope(scope, "operator:mutate", database);
}

export async function assertErasureExecutionAccess(
  scope: RequestScope,
  database?: Kysely<Database>,
): Promise<AdminAccess> {
  return assertAdminCapabilityForScope(scope, "erasure:execute", database);
}
