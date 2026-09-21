-- Code rollback needs no schema rollback. Keep acceptance evidence intact.
-- Do not drop this table: doing so would discard users' acceptance receipts.
select 1;
