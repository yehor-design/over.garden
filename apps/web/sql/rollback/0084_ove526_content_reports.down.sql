-- Code rollback needs no schema rollback: the release before 0084 never reads
-- these tables. Keep them: a report and its decision are the record the DSA
-- asks for. A release without the purge cron no longer ages them out after a
-- year, so a rollback that lasts should delete decided reports older than a
-- year by hand (`delete from content_reports where decided_at < now() - interval '1 year'`).
select 1;
