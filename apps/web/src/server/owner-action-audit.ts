import "server-only";

import { createHash } from "node:crypto";

import { db } from "@/db";
import type { RequestScope } from "@/server/request-scope";

export const OWNER_ACTIONS = [
  "stable_registry_foundation_activate",
  "stable_registry_extension_pack_activate",
  "stable_registry_edition_activate",
  "stable_registry_edition_rollback",
  "stable_registry_edition_forward",
] as const;
export type OwnerAction = (typeof OWNER_ACTIONS)[number];

/**
 * One `admin_role_audit_log` row per irreversible owner action (ADR-0022,
 * D5). The row names the actor, a hash of the session, the action, and a
 * bounded reason made of identifiers only; never a catalog name or a row.
 */
export async function recordOwnerAction(
  scope: RequestScope,
  action: OwnerAction,
  reason: string,
  database = db,
) {
  await database
    .insertInto("admin_role_audit_log")
    .values({
      actor_user_id: scope.userId,
      actor_session_id_hash: scope.sessionId
        ? createHash("sha256").update(scope.sessionId).digest("hex")
        : null,
      target_user_id: scope.userId,
      action,
      reason: reason.slice(0, 200),
    })
    .execute();
}
