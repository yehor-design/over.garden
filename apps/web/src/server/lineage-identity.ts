import "server-only";

import { sql, type RawBuilder } from "kysely";

import { publicProfileBasePath } from "@/lib/garden/public-paths";

/**
 * The other gardener in a lineage task, as their public profile shows them
 * (`OVE-495`, criterion 7): a name and a handle rather than "another
 * gardener". Nothing is read that their public page does not already show.
 */
export interface LineageGardenerIdentity {
  handle: string;
  displayName: string | null;
  profilePath: string;
}

/**
 * `{ handle, displayName }` of a gardener's public profile, as JSON, or null
 * when there is none to show: no active public profile, or a handle that is
 * not current. With a viewer, a block between the two in either direction
 * hides it too — the same rule `buildObjectProvenanceEdgesQuery` applies to a
 * named source. A public page has no viewer, and shows what a profile shows.
 */
export function lineageGardenerIdentitySql(
  userIdColumn: string,
  viewerUserId: string | null,
): RawBuilder<{ handle: string; displayName: string | null } | null> {
  const unblocked =
    viewerUserId === null
      ? sql`true`
      : sql`not exists (
         select 1
           from profile_blocks as blocks
          where blocks.block_state = 'active'
            and (
              (blocks.blocker_user_id = ${viewerUserId}::uuid
                and blocks.blocked_user_id = profiles.user_id)
              or (blocks.blocker_user_id = profiles.user_id
                and blocks.blocked_user_id = ${viewerUserId}::uuid)
            )
       )`;
  return sql<{ handle: string; displayName: string | null } | null>`(
    select json_build_object(
             'handle', profiles.handle,
             'displayName', profiles.display_name
           )
      from user_public_profiles as profiles
      join user_handle_registry as handles
        on handles.user_id = profiles.user_id
       and handles.normalized_handle = profiles.normalized_handle
       and handles.lifecycle_state = 'current'
     where profiles.user_id = ${sql.ref(userIdColumn)}
       and profiles.profile_lifecycle_state = 'active'
       and profiles.profile_visibility = 'public'
       and profiles.removed_at is null
       and profiles.handle_registry_state = 'current'
       and ${unblocked}
     limit 1
  )`;
}

export function mapLineageGardenerIdentity(
  value: unknown,
): LineageGardenerIdentity | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { handle?: unknown; displayName?: unknown };
  if (typeof record.handle !== "string" || record.handle.length === 0) {
    return null;
  }
  const displayName =
    typeof record.displayName === "string" &&
    record.displayName.trim().length > 0
      ? record.displayName.trim()
      : null;
  return {
    handle: record.handle,
    displayName,
    profilePath: publicProfileBasePath(record.handle),
  };
}
