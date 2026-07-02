import "server-only";

import type { Kysely } from "kysely";

import { db as defaultDb } from "@/db";
import type { Database } from "@/db/schema";
import {
  capabilitiesForAdminRole,
  isAdminRole,
  type AdminCapability,
  type AdminRole,
} from "@/lib/admin/roles";
import type { RequestScope } from "@/server/request-scope";

export const ADMIN_ACCESS_DENIED_MESSAGE = "Admin access denied.";

export interface AdminAccess {
  mode: "database_role";
  role: AdminRole;
  capabilities: AdminCapability[];
}

export type AdminEntryAccess =
  | { status: "sign_in_required" }
  | { status: "denied" }
  | ({ status: "allowed" } & AdminAccess);

export async function readAdminRoleForUser(
  database: Kysely<Database>,
  userId: string,
): Promise<AdminRole | null> {
  const row = await database
    .selectFrom("admin_user_roles")
    .select("role")
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!isAdminRole(row?.role)) return null;
  return row.role;
}

export async function assertAdminAccess(
  scope: RequestScope,
  database: Kysely<Database> = defaultDb,
): Promise<AdminAccess> {
  const role = await readAdminRoleForUser(database, scope.userId);

  if (!role) {
    throw new Error(ADMIN_ACCESS_DENIED_MESSAGE);
  }

  return {
    mode: "database_role",
    role,
    capabilities: capabilitiesForAdminRole(role),
  };
}

export async function resolveAdminAccess(
  scope: RequestScope | null,
  database: Kysely<Database> = defaultDb,
): Promise<AdminEntryAccess> {
  if (!scope) return { status: "sign_in_required" };

  try {
    const access = await assertAdminAccess(scope, database);
    return { status: "allowed", ...access };
  } catch {
    return { status: "denied" };
  }
}

export function assertAdminCapability(
  access: AdminAccess,
  capability: AdminCapability,
) {
  if (!access.capabilities.includes(capability)) {
    throw new Error(ADMIN_ACCESS_DENIED_MESSAGE);
  }
}
