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

/**
 * The species a form belongs to, named the way its reader would name it
 * (`OVE-496`): its name in `locale` when the catalogue holds one, its accepted
 * name otherwise. Null for a species and for a form with no species yet. A
 * cultivar called "1001" or "Де Барао" says nothing on its own; "a variety of
 * the species «томат»" is what tells a reader which one they have found.
 */
export function catalogSpeciesNameSql(
  itemRef: string,
  locale: string,
): RawBuilder<string | null> {
  return sql<string | null>`(
    select coalesce(
      (
        select parent_name.display_name
        from catalog_item_names as parent_name
        where parent_name.catalog_item_id = parent.id
          and parent_name.locale = ${locale}
        order by parent_name.is_primary desc, parent_name.weight desc,
          parent_name.display_name
        limit 1
      ),
      parent.canonical_name
    )
    from catalog_item_relations as form_relation
    join catalog_items as parent on parent.id = form_relation.to_catalog_item_id
    where form_relation.from_catalog_item_id = ${sql.ref(`${itemRef}.id`)}
      and form_relation.relation_type = 'form_of'
      and parent.node_kind = 'taxon'
      and parent.identity_state = 'active'
    order by form_relation.created_at, form_relation.id
    limit 1
  )`;
}

/**
 * An organism's own name in `locale`, when the catalogue holds one — the
 * primary, then the heaviest, then the first alphabetically. Null otherwise,
 * and the caller shows the accepted name instead: a blank is never a name.
 * One correlated subquery rather than a join, because a join on a table with
 * several names per organism multiplies the rows.
 */
export function catalogVernacularNameSql(
  itemRef: string,
  locale: string,
): RawBuilder<string | null> {
  return sql<string | null>`(
    select own_name.display_name
    from catalog_item_names as own_name
    where own_name.catalog_item_id = ${sql.ref(`${itemRef}.id`)}
      and own_name.locale = ${locale}
    order by own_name.is_primary desc, own_name.weight desc,
      own_name.display_name
    limit 1
  )`;
}
