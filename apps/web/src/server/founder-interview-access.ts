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

export type FounderInterviewOperatorAccess = AdminEntryAccess;

export async function resolveFounderInterviewOperatorAccess(
  scope: RequestScope | null,
  database?: Kysely<Database>,
): Promise<FounderInterviewOperatorAccess> {
  return resolveAdminCapabilityAccess(scope, "operator:read", database);
}

export async function assertFounderInterviewMutationAccess(
  scope: RequestScope,
  database?: Kysely<Database>,
): Promise<AdminAccess> {
  return assertAdminCapabilityForScope(scope, "operator:mutate", database);
}
