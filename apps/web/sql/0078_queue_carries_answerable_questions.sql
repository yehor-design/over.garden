-- The owner's queue carries questions it can answer, and nothing else.
--
-- On 2026-09-20 production's curation queue held 13,456 open items and
-- `catalog_apply_queue_item` refused **every one of them**:
--
--     catalog_apply_queue_item: source_link needs a target, a source slug and a snapshot
--
-- The queue looked like a fortnight of work and was a wall. This migration is
-- the schema half of putting that right; the producers are the other half.
--
-- ## What was actually in there
--
-- | rows | reason | subject | what it is |
-- | -- | -- | -- | -- |
-- | 13,007 | `eppo_unmatched` | none | EPPO knows a taxon the graph did not place |
-- | 443 | `register_species_unmatched` | the form | a register form whose species did not resolve |
-- | 6 | `*_identifier_conflict` | the node | an identifier another node already holds |
--
-- Only the last six are the question `source_link` names — "attach this
-- source's identifiers to this node, with this provenance" — and even those
-- could not be applied, because no producer wrote `source_snapshot_id` and
-- `catalog_source_assertions.source_snapshot_id` is `not null`. Provenance
-- cannot be invented at apply time: a snapshot is *which import said so*, and
-- picking one later would be fabricating it.
--
-- The other 13,450 are a different question wearing `source_link`'s name. A
-- record the graph could not place is not "attach this to that" — there is no
-- *that*. Four producers reached for the one item type there was, and the
-- apply function implements one meaning of it, so three of them queued rows
-- that could never be decided.
--
-- ## 1. `source_unmatched` — a source record the graph could not place
--
-- Its own item type, because it is its own question. It has no apply branch:
-- answering it means creating a node or attaching a form, and neither is a
-- decision `catalog_apply_queue_item` can carry out today. What it is *for* is
-- being counted — coverage of a source against the graph — and the sources
-- page is where that belongs. The owner's decision stream lists the types that
-- can be decided, so these leave the stream without leaving the record.
--
-- Nothing is deleted. Every row keeps its proposal, its impact and its reasons.
--
-- The six identifier conflicts go with them, and that is deliberate. Their
-- question is real — "another node already answers to this identifier" — but
-- no producer recorded which import said so, and the proposal holds no
-- `source_record_id` to recover it from. Attributing them to a snapshot now
-- would be inventing the provenance the assertion table exists to hold. They
-- stand as unplaced claims until the crosswalk runs again, which writes a
-- complete row: the dedupe guards look for an open `source_link`, and these
-- are no longer one.
--
-- ## 2. The `CHECK` that keeps the wall from being rebuilt
--
-- An **open** `source_link` must be appliable: a subject, a source slug and a
-- snapshot. It is deliberately scoped to `open` — a row already decided or
-- reverted is history, and history is not rewritten to satisfy a constraint
-- added afterwards.
--
-- The constraint is added `not valid` and then validated, so the check runs
-- over the table once without holding an `access exclusive` lock for the scan.
--
-- ## 3. Replaying this on an empty database
--
-- Every statement is idempotent and none of them assumes a row exists. On a
-- fresh database steps 1 and 2 do nothing but widen a `CHECK` and add another.

-- ── 1. the item type ────────────────────────────────────────────────────────

alter table catalog_curation_queue
  drop constraint if exists catalog_curation_queue_item_type_check;

alter table catalog_curation_queue
  add constraint catalog_curation_queue_item_type_check
  check (
    item_type in (
      'label_link',
      'node_merge',
      'source_link',
      'source_unmatched',
      'split_review'
    )
  );

-- The rows that were never `source_link` questions. `subject_catalog_item_id`
-- is kept where there is one: a register form's row names the form, and that
-- is worth knowing about an unplaced record.
update catalog_curation_queue
   set item_type = 'source_unmatched',
       updated_at = now()
 where item_type = 'source_link'
   and state = 'open'
   and (
     proposal->>'source_snapshot_id' is null
     or subject_catalog_item_id is null
   );

-- ── 2. an open link decision is one the apply function can carry out ────────

alter table catalog_curation_queue
  drop constraint if exists catalog_curation_queue_open_source_link_appliable;

alter table catalog_curation_queue
  add constraint catalog_curation_queue_open_source_link_appliable
  check (
    item_type <> 'source_link'
    or state <> 'open'
    or (
      subject_catalog_item_id is not null
      and proposal->>'source_slug' is not null
      and proposal->>'source_snapshot_id' is not null
    )
  )
  not valid;

alter table catalog_curation_queue
  validate constraint catalog_curation_queue_open_source_link_appliable;

-- ── 3. how many records each source could not place ─────────────────────────
--
-- Read by the sources page, which is where a measurement belongs. Counting
-- `open` only: a row that has since been placed is answered, not residue.

create index if not exists catalog_curation_queue_unmatched_source_idx
  on catalog_curation_queue ((proposal->>'source_slug'))
  where item_type = 'source_unmatched' and state = 'open';
