import "server-only";

import { createHash } from "node:crypto";

import type { Kysely } from "kysely";
import { sql } from "kysely";

import { db as defaultDb } from "@/db";
import type { Database } from "@/db/schema";
import {
  isAdminRole,
  isAdminRoleChangeReason,
  isManageableAdminRole,
  type AdminRole,
  type AdminRoleChangeReason,
  type ManageableAdminRole,
} from "@/lib/admin/roles";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import type { RequestScope } from "@/server/request-scope";

export const ADMIN_ROLE_MANAGEMENT_DENIED_MESSAGE =
  "Admin role management denied.";
export const ADMIN_ROLE_TARGET_NOT_FOUND_MESSAGE =
  "Admin role target user was not found.";
export const ADMIN_ROLE_ASSIGNMENT_NOT_FOUND_MESSAGE =
  "Admin role assignment was not found.";
export const ADMIN_LAST_OWNER_PROTECTION_MESSAGE =
  "At least one owner role must remain.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  input: {
    targetUserId: string;
    role: string;
    reason?: string | null;
  },
  database: Kysely<Database> = defaultDb,
) {
  await database.transaction().execute(async (trx) => {
    await assertAdminCapabilityForScope(scope, "admin:manage_roles", trx);
    const targetUserId = normalizeUserId(input.targetUserId);
    const role = normalizeManageableRole(input.role);
    const reason = normalizeRoleChangeReason(
      input.reason,
      "manual_owner_grant",
    );

    await assertTargetUserExists(trx, targetUserId);
    const previousRole = await readCurrentAdminRole(trx, targetUserId);

    if (previousRole === "owner") {
      await assertCanChangeOwnerRole(trx);
    }

    await trx
      .insertInto("admin_user_roles")
      .values({
        user_id: targetUserId,
        role,
        granted_by_user_id: scope.userId,
        grant_reason: reason,
        granted_at: sql`now()`,
        updated_at: sql`now()`,
      })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({
          role,
          granted_by_user_id: scope.userId,
          grant_reason: reason,
          updated_at: sql`now()`,
        }),
      )
      .execute();

    await writeAdminRoleAuditEntry(trx, {
      scope,
      targetUserId,
      action: "grant",
      previousRole,
      newRole: role,
      reason,
    });
  });
}

export async function revokeAdminRole(
  scope: RequestScope,
  input: {
    targetUserId: string;
    reason?: string | null;
  },
  database: Kysely<Database> = defaultDb,
) {
  await database.transaction().execute(async (trx) => {
    await assertAdminCapabilityForScope(scope, "admin:manage_roles", trx);
    const targetUserId = normalizeUserId(input.targetUserId);
    const reason = normalizeRoleChangeReason(input.reason, "access_revoked");

    const previousRole = await readCurrentAdminRole(trx, targetUserId);

    if (!previousRole) {
      throw new Error(ADMIN_ROLE_ASSIGNMENT_NOT_FOUND_MESSAGE);
    }

    if (previousRole === "owner") {
      await assertCanChangeOwnerRole(trx);
    }

    await trx
      .deleteFrom("admin_user_roles")
      .where("user_id", "=", targetUserId)
      .execute();

    await writeAdminRoleAuditEntry(trx, {
      scope,
      targetUserId,
      action: "revoke",
      previousRole,
      newRole: null,
      reason,
    });
  });
}

export function hashAdminActorSessionId(sessionId: string | null | undefined) {
  if (!sessionId) return null;
  return createHash("sha256").update(sessionId).digest("hex");
}

function normalizeUserId(value: string) {
  const candidate = value.trim();
  if (!UUID_PATTERN.test(candidate)) {
    throw new Error("Admin role target user id is invalid.");
  }
  return candidate;
}

function normalizeManageableRole(value: string): ManageableAdminRole {
  if (!isManageableAdminRole(value)) {
    throw new Error("Only admin, moderator, and viewer roles are grantable.");
  }
  return value;
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

async function assertTargetUserExists(
  database: Kysely<Database>,
  targetUserId: string,
) {
  const user = await database
    .selectFrom("user")
    .select("id")
    .where("id", "=", targetUserId)
    .executeTakeFirst();

  if (!user) {
    throw new Error(ADMIN_ROLE_TARGET_NOT_FOUND_MESSAGE);
  }
}

async function readCurrentAdminRole(
  database: Kysely<Database>,
  userId: string,
): Promise<AdminRole | null> {
  const row = await database
    .selectFrom("admin_user_roles")
    .select("role")
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return isAdminRole(row?.role) ? row.role : null;
}

async function assertCanChangeOwnerRole(database: Kysely<Database>) {
  const owners = await database
    .selectFrom("admin_user_roles")
    .select("user_id")
    .where("role", "=", "owner")
    .forUpdate()
    .execute();

  if (owners.length <= 1) {
    throw new Error(ADMIN_LAST_OWNER_PROTECTION_MESSAGE);
  }
}

async function writeAdminRoleAuditEntry(
  database: Kysely<Database>,
  input: {
    scope: RequestScope;
    targetUserId: string;
    action: "grant" | "revoke";
    previousRole: AdminRole | null;
    newRole: AdminRole | null;
    reason: AdminRoleChangeReason;
  },
) {
  await database
    .insertInto("admin_role_audit_log")
    .values({
      actor_user_id: input.scope.userId,
      actor_session_id_hash: hashAdminActorSessionId(input.scope.sessionId),
      target_user_id: input.targetUserId,
      action: input.action,
      previous_role: input.previousRole,
      new_role: input.newRole,
      reason: input.reason,
    })
    .execute();
}
