import "server-only";

import type { Kysely } from "kysely";

import type { Database } from "@/db/schema";
import { resolveAdminCapabilityAccess } from "@/server/admin-access";
import type { AdminEntryAccess } from "@/server/admin-access";
import type { RequestScope } from "@/server/request-scope";

export type PilotHealthOperatorAccess = AdminEntryAccess;

export async function resolvePilotHealthOperatorAccess(
  scope: RequestScope | null,
  database?: Kysely<Database>,
): Promise<PilotHealthOperatorAccess> {
  return resolveAdminCapabilityAccess(scope, "operator:read", database);
}
