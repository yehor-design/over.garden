import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * The owner's curation actions and their inverses (ADR-0026 D10).
 *
 * `catalog_curation_actions` is the audit: migration `0056`'s
 * `catalog_apply_queue_item` and `catalog_revert_action` already write it for
 * every queue decision, and the table is append-only with one revert per
 * action. The edits the owner makes directly on a card — rename, pin a
 * preferred name, set a card indexable — have no queue item, so they are
 * written here in the same shape, with the inverse that undoes them, and are
 * reverted by the same function. There is no second audit store.
 */
export type OwnerCardActionType = "rename" | "pin_name" | "set_indexable";

export interface OwnerCardAction {
  actionId: string;
  actionType: OwnerCardActionType;
  catalogItemId: string;
}

export interface OwnerActionEntry {
  actionId: string;
  actionType: string;
  itemType: string | null;
  reason: string | null;
  subjectNames: string[];
  performedAt: Date | string;
  automatic: boolean;
  reverted: boolean;
}

/**
 * Adds a name to a card and pins it as the one the card shows. The inverse
 * carries the previous primary name and whether the new name existed before,
 * so a revert removes only what this action created.
 */
export async function recordCardRename(
  input: {
    catalogItemId: string;
    displayName: string;
    locale: string;
    reason: string | null;
    actorUserId: string;
  },
  executor: QueryExecutor = db,
): Promise<OwnerCardAction> {
  const result = await sql<{ action_id: string }>`
    with previous as (
      select id, display_name, is_primary
      from catalog_item_names
      where catalog_item_id = ${input.catalogItemId}::uuid and is_primary
      limit 1
    ),
    inserted as (
      insert into catalog_item_names (
        catalog_item_id, display_name, normalized_name, locale, is_primary, name_type
      )
      values (
        ${input.catalogItemId}::uuid,
        ${input.displayName},
        catalog_normalize_name(${input.displayName}),
        ${input.locale},
        true,
        'vernacular'
      )
      on conflict (catalog_item_id, normalized_name, locale) do update
        set is_primary = true
      returning id, (xmax = 0) as created
    ),
    demoted as (
      update catalog_item_names
      set is_primary = false
      where catalog_item_id = ${input.catalogItemId}::uuid
        and id <> (select id from inserted)
        and is_primary
      returning id
    ),
    renamed as (
      update catalog_items
      set canonical_name = ${input.displayName}, content_updated_at = now(), updated_at = now()
      where id = ${input.catalogItemId}::uuid
      returning canonical_name
    )
    insert into catalog_curation_actions (
      action_type, subject_catalog_item_ids, payload, inverse, automatic, performed_by_user_id
    )
    select
      'rename',
      array[${input.catalogItemId}::uuid],
      jsonb_build_object(
        'item_type', 'card_edit',
        'display_name', ${input.displayName}::text,
        'locale', ${input.locale}::text,
        'reason', ${input.reason}::text
      ),
      jsonb_build_object(
        'catalog_item_id', ${input.catalogItemId}::text,
        'name_id', (select id from inserted),
        'name_created', (select created from inserted),
        'previous_primary_name_id', (select id from previous),
        'previous_canonical_name', (select display_name from previous)
      ),
      false,
      ${input.actorUserId}::uuid
    returning id as action_id
  `.execute(executor);
  const row = result.rows[0];
  if (!row) throw new Error("rename recorded no action");
  return {
    actionId: row.action_id,
    actionType: "rename",
    catalogItemId: input.catalogItemId,
  };
}

/** Pins an existing name as the card's preferred one, with the owner's reason. */
export async function recordCardPinnedName(
  input: {
    catalogItemId: string;
    nameId: string;
    reason: string | null;
    actorUserId: string;
  },
  executor: QueryExecutor = db,
): Promise<OwnerCardAction> {
  const result = await sql<{ action_id: string }>`
    with previous as (
      select id from catalog_item_names
      where catalog_item_id = ${input.catalogItemId}::uuid and is_primary
      limit 1
    ),
    pinned as (
      update catalog_item_names
      set is_primary = (id = ${input.nameId}::uuid)
      where catalog_item_id = ${input.catalogItemId}::uuid
      returning id, display_name, is_primary
    ),
    renamed as (
      update catalog_items
      set canonical_name = (select display_name from pinned where is_primary),
          content_updated_at = now(),
          updated_at = now()
      where id = ${input.catalogItemId}::uuid
        and exists (select 1 from pinned where is_primary)
      returning canonical_name
    )
    insert into catalog_curation_actions (
      action_type, subject_catalog_item_ids, payload, inverse, automatic, performed_by_user_id
    )
    select
      'pin_name',
      array[${input.catalogItemId}::uuid],
      jsonb_build_object(
        'item_type', 'card_edit',
        'name_id', ${input.nameId}::text,
        'reason', ${input.reason}::text
      ),
      jsonb_build_object(
        'catalog_item_id', ${input.catalogItemId}::text,
        'previous_primary_name_id', (select id from previous)
      ),
      false,
      ${input.actorUserId}::uuid
    returning id as action_id
  `.execute(executor);
  const row = result.rows[0];
  if (!row) throw new Error("pin_name recorded no action");
  return {
    actionId: row.action_id,
    actionType: "pin_name",
    catalogItemId: input.catalogItemId,
  };
}

/** Sets or clears the owner's indexability override on one card (D9). */
export async function recordCardIndexableOverride(
  input: {
    catalogItemId: string;
    indexable: boolean | null;
    actorUserId: string;
  },
  executor: QueryExecutor = db,
): Promise<OwnerCardAction> {
  const result = await sql<{ action_id: string }>`
    with previous as (
      select indexable_override from catalog_items where id = ${input.catalogItemId}::uuid
    ),
    updated as (
      update catalog_items
      set indexable_override = ${input.indexable}, content_updated_at = now(), updated_at = now()
      where id = ${input.catalogItemId}::uuid
      returning id
    )
    insert into catalog_curation_actions (
      action_type, subject_catalog_item_ids, payload, inverse, automatic, performed_by_user_id
    )
    select
      'set_indexable',
      array[${input.catalogItemId}::uuid],
      jsonb_build_object('item_type', 'card_edit', 'indexable', ${input.indexable}::boolean),
      jsonb_build_object(
        'catalog_item_id', ${input.catalogItemId}::text,
        'previous_indexable_override', (select indexable_override from previous)
      ),
      false,
      ${input.actorUserId}::uuid
    returning id as action_id
  `.execute(executor);
  const row = result.rows[0];
  if (!row) throw new Error("set_indexable recorded no action");
  return {
    actionId: row.action_id,
    actionType: "set_indexable",
    catalogItemId: input.catalogItemId,
  };
}

/**
 * Reverts a card edit: the three inverses above, applied and logged as a
 * `revert` action, exactly as `catalog_revert_action` does for a queue
 * decision. Queue decisions keep going through the SQL function; this covers
 * the action types that function does not know, and refuses anything else.
 */
export async function revertCardAction(
  input: { actionId: string; actorUserId: string },
  executor: QueryExecutor = db,
): Promise<{ revertActionId: string }> {
  const result = await sql<{ revert_id: string }>`
    with target as (
      select * from catalog_curation_actions
      where id = ${input.actionId}::uuid
        and action_type in ('rename', 'pin_name', 'set_indexable')
        and reverted_by_action_id is null
    ),
    restored_names as (
      update catalog_item_names
      set is_primary = (id = (select (inverse->>'previous_primary_name_id')::uuid from target))
      where catalog_item_id = (select (inverse->>'catalog_item_id')::uuid from target)
        and exists (select 1 from target where action_type in ('rename', 'pin_name'))
      returning id, display_name, is_primary
    ),
    dropped as (
      delete from catalog_item_names
      where id = (select (inverse->>'name_id')::uuid from target)
        and exists (select 1 from target where action_type = 'rename' and (inverse->>'name_created')::boolean)
      returning id
    ),
    restored_flag as (
      update catalog_items
      set indexable_override = (select (inverse->>'previous_indexable_override')::boolean from target),
          content_updated_at = now()
      where id = (select (inverse->>'catalog_item_id')::uuid from target)
        and exists (select 1 from target where action_type = 'set_indexable')
      returning id
    ),
    restored_name as (
      update catalog_items
      set canonical_name = coalesce(
            (select display_name from restored_names where is_primary),
            canonical_name
          ),
          content_updated_at = now()
      where id = (select (inverse->>'catalog_item_id')::uuid from target)
        and exists (select 1 from target where action_type in ('rename', 'pin_name'))
      returning id
    ),
    logged as (
      insert into catalog_curation_actions (
        action_type, queue_item_id, subject_catalog_item_ids, payload, inverse, automatic, performed_by_user_id
      )
      select
        'revert',
        target.queue_item_id,
        target.subject_catalog_item_ids,
        jsonb_build_object('reverted_action_id', target.id, 'item_type', 'card_edit'),
        '{}'::jsonb,
        false,
        ${input.actorUserId}::uuid
      from target
      returning id
    )
    update catalog_curation_actions
    set reverted_by_action_id = (select id from logged)
    where id = (select id from target)
    returning (select id from logged) as revert_id
  `.execute(executor);
  const row = result.rows[0];
  if (!row) {
    throw new Error("No revertible card action for that id.");
  }
  return { revertActionId: row.revert_id };
}

/** The audit trail the owner reads: every action, newest first. */
export async function listOwnerActionAudit(
  input: { limit?: number; catalogItemId?: string | null } = {},
  executor: QueryExecutor = db,
): Promise<OwnerActionEntry[]> {
  const itemFilter = input.catalogItemId
    ? sql`and ${input.catalogItemId}::uuid = any(action.subject_catalog_item_ids)`
    : sql``;
  const result = await sql<{
    actionId: string;
    actionType: string;
    itemType: string | null;
    reason: string | null;
    subjectNames: string[] | null;
    performedAt: Date;
    automatic: boolean;
    reverted: boolean;
  }>`
    select
      action.id as "actionId",
      action.action_type as "actionType",
      action.payload->>'item_type' as "itemType",
      action.payload->>'reason' as "reason",
      coalesce((
        select array_agg(node.canonical_name order by node.canonical_name)
        from catalog_items as node where node.id = any(action.subject_catalog_item_ids)
      ), array[]::text[]) as "subjectNames",
      action.performed_at as "performedAt",
      action.automatic as "automatic",
      action.reverted_by_action_id is not null as "reverted"
    from catalog_curation_actions as action
    where true ${itemFilter}
    order by action.performed_at desc
    limit ${Math.max(1, Math.min(input.limit ?? 25, 100))}
  `.execute(executor);
  return result.rows.map((row) => ({
    actionId: row.actionId,
    actionType: row.actionType,
    itemType: row.itemType,
    reason: row.reason,
    subjectNames: row.subjectNames ?? [],
    performedAt: row.performedAt,
    automatic: row.automatic,
    reverted: row.reverted,
  }));
}
