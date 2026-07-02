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
export const ADMIN_CREDENTIAL_PROVIDER_ID = "credential";

export interface AdminAccess {
  mode: "database_role_credential_only";
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

  await assertCredentialOnlyAdminAccount(database, scope.userId);

  return {
    mode: "database_role_credential_only",
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

export function hasAdminCapability(
  access: AdminAccess,
  capability: AdminCapability,
) {
  return access.capabilities.includes(capability);
}

export async function assertAdminCapabilityForScope(
  scope: RequestScope,
  capability: AdminCapability,
  database: Kysely<Database> = defaultDb,
): Promise<AdminAccess> {
  const access = await assertAdminAccess(scope, database);
  assertAdminCapability(access, capability);
  return access;
}

export async function resolveAdminCapabilityAccess(
  scope: RequestScope | null,
  capability: AdminCapability,
  database: Kysely<Database> = defaultDb,
): Promise<AdminEntryAccess> {
  if (!scope) return { status: "sign_in_required" };

  try {
    const access = await assertAdminCapabilityForScope(
      scope,
      capability,
      database,
    );
    return { status: "allowed", ...access };
  } catch {
    return { status: "denied" };
  }
}

export async function assertCredentialOnlyAdminAccount(
  database: Kysely<Database>,
  userId: string,
) {
  const rows = await database
    .selectFrom("account")
    .select("providerId")
    .where("userId", "=", userId)
    .execute();

  const hasCredentialAccount = rows.some(
    (row) => row.providerId === ADMIN_CREDENTIAL_PROVIDER_ID,
  );
  const hasLinkedSocialAccount = rows.some(
    (row) => row.providerId !== ADMIN_CREDENTIAL_PROVIDER_ID,
  );

  if (!hasCredentialAccount || hasLinkedSocialAccount) {
    throw new Error(ADMIN_ACCESS_DENIED_MESSAGE);
  }
}
