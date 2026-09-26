/**
 * A cultivar or breed a gardener added to a species' list (OVE-524, migration
 * 0086) carries this `catalog_items.source`. Unlike the private cards 0055
 * retired, such an entry is shared and public like any form; its creator is
 * `created_by_user_id` until account erasure clears it, so the source, not the
 * creator, is what says where the entry came from.
 */
export const GARDENER_ENTRY_SOURCE = "gardener";
