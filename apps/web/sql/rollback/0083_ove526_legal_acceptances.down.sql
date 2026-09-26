-- Code rollback needs no schema rollback: the release before 0083 never reads
-- this table. Keep acceptance evidence intact — dropping it would discard the
-- only record of who accepted which version of the documents, and when.
select 1;
