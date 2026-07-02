import "server-only";

import { createHash } from "node:crypto";

import type { Kysely } from "kysely";

import { db as defaultDb } from "@/db";
import type { Database } from "@/db/schema";
import {
  isAdminRole,
  isAdminRoleChangeReason,
  type AdminRole,
  type AdminRoleChangeReason,
} from "@/lib/admin/roles";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import type { RequestScope } from "@/server/request-scope";

export const ADMIN_ROLE_MANAGEMENT_DENIED_MESSAGE =
  "Admin role management denied.";
export const ADMIN_ROLE_MANAGEMENT_SEALED_MESSAGE =
  "Admin role management is sealed to the configured owner.";

export interface AdminRoleAssignmentReadModel {
  userId: string;
  role: AdminRole;
  grantedByUserId: string | null;
  grantReason: AdminRoleChangeReason | "manual_bootstrap";
  grantedAt: Date;
  updatedAt: Date;
}

export interface AdminRoleAuditReadModel {
  id: string;
  actorUserId: string | null;
  targetUserId: string | null;
  action: "grant" | "revoke";
  previousRole: AdminRole | null;
  newRole: AdminRole | null;
  reason: AdminRoleChangeReason;
  createdAt: Date;
}

export interface AdminRoleManagementReadModel {
  assignments: AdminRoleAssignmentReadModel[];
  auditEntries: AdminRoleAuditReadModel[];
}

export async function readAdminRoleManagementView(
  scope: RequestScope,
  database: Kysely<Database> = defaultDb,
): Promise<AdminRoleManagementReadModel> {
  await assertAdminCapabilityForScope(scope, "admin:manage_roles", database);

  const [assignments, auditEntries] = await Promise.all([
    listAdminRoleAssignments(database),
    listAdminRoleAuditEntries(database),
  ]);

  return { assignments, auditEntries };
}

export async function listAdminRoleAssignments(
  database: Kysely<Database> = defaultDb,
): Promise<AdminRoleAssignmentReadModel[]> {
  const rows = await database
    .selectFrom("admin_user_roles")
    .select([
      "user_id",
      "role",
      "granted_by_user_id",
      "grant_reason",
      "granted_at",
      "updated_at",
    ])
    .orderBy("role", "asc")
    .orderBy("granted_at", "desc")
    .execute();

  return rows.flatMap((row) => {
    const role = isAdminRole(row.role) ? row.role : null;
    if (!role) return [];

    return [
      {
        userId: row.user_id,
        role,
        grantedByUserId: row.granted_by_user_id,
        grantReason: normalizeStoredReason(row.grant_reason),
        grantedAt: row.granted_at,
        updatedAt: row.updated_at,
      },
    ];
  });
}

export async function listAdminRoleAuditEntries(
  database: Kysely<Database> = defaultDb,
  limit = 20,
): Promise<AdminRoleAuditReadModel[]> {
  const rows = await database
    .selectFrom("admin_role_audit_log")
    .select([
      "id",
      "actor_user_id",
      "target_user_id",
      "action",
      "previous_role",
      "new_role",
      "reason",
      "created_at",
    ])
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    targetUserId: row.target_user_id,
    action: row.action === "revoke" ? "revoke" : "grant",
    previousRole: isAdminRole(row.previous_role) ? row.previous_role : null,
    newRole: isAdminRole(row.new_role) ? row.new_role : null,
    reason: normalizeRoleChangeReason(row.reason, "manual_owner_grant"),
    createdAt: row.created_at,
  }));
}

export async function grantAdminRole(
  scope: RequestScope,
  _input: {
    targetUserId: string;
    role: string;
    reason?: string | null;
  },
  database: Kysely<Database> = defaultDb,
) {
  await database.transaction().execute(async (trx) => {
    await assertAdminCapabilityForScope(scope, "admin:manage_roles", trx);
    throw new Error(ADMIN_ROLE_MANAGEMENT_SEALED_MESSAGE);
  });
}

export async function revokeAdminRole(
  scope: RequestScope,
  _input: {
    targetUserId: string;
    reason?: string | null;
  },
  database: Kysely<Database> = defaultDb,
) {
  await database.transaction().execute(async (trx) => {
    await assertAdminCapabilityForScope(scope, "admin:manage_roles", trx);
    throw new Error(ADMIN_ROLE_MANAGEMENT_SEALED_MESSAGE);
  });
}

export function hashAdminActorSessionId(sessionId: string | null | undefined) {
  if (!sessionId) return null;
  return createHash("sha256").update(sessionId).digest("hex");
}

function normalizeRoleChangeReason(
  value: string | null | undefined,
  fallback: AdminRoleChangeReason,
): AdminRoleChangeReason {
  const candidate = value?.trim() || fallback;
  return isAdminRoleChangeReason(candidate) ? candidate : fallback;
}

function normalizeStoredReason(value: string) {
  if (isAdminRoleChangeReason(value)) return value;
  return "manual_bootstrap";
}
