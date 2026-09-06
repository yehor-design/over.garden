import "server-only";

import { sql, type RawBuilder } from "kysely";

/**
 * The current slug of the species a form belongs to (ADR-0026 D8): the
 * `form_of` target of the row `itemRef` names, when that target is an active
 * taxon with an address. Null for a species and for a form that has no
 * species yet, which then keeps its legacy address. One expression, used by
 * every query that hands a catalog path builder its input.
 */
export function catalogSpeciesSlugSql(itemRef: string): RawBuilder<string | null> {
  return sql<string | null>`(
    select parent.public_slug
    from catalog_item_relations as form_relation
    join catalog_items as parent on parent.id = form_relation.to_catalog_item_id
    where form_relation.from_catalog_item_id = ${sql.ref(`${itemRef}.id`)}
      and form_relation.relation_type = 'form_of'
      and parent.node_kind = 'taxon'
      and parent.identity_state = 'active'
      and parent.public_slug is not null
    order by form_relation.created_at, form_relation.id
    limit 1
  )`;
}
