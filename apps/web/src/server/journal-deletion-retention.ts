import "server-only";

/**
 * The user-visible deletion contract is deliberately small: an entry is gone
 * from every product surface immediately, and only a scrubbed technical row
 * remains long enough to prove search and media removal. It is never a
 * recoverable archive.
 */
export const JOURNAL_DELETION_RETENTION_DAYS = 7 as const;

/**
 * The horizon itself is PostgreSQL time and is enforced by
 * `journal_entries_deletion_retention_check`; this constant exists so the
 * writer, the retention worker and the owner-facing copy all quote one number.
 * Deliberately not a `Date` helper — an application-time horizon drifts from
 * `deleted_at + interval '7 days'` across a daylight-saving boundary.
 */
export const JOURNAL_DELETION_RETENTION_INTERVAL =
  `${JOURNAL_DELETION_RETENTION_DAYS} days` as const;

/** Non-user content required only by legacy NOT NULL columns during cleanup. */
export const DELETED_JOURNAL_ENTRY_TITLE = "Deleted journal entry";
export const DELETED_JOURNAL_ENTRY_BODY =
  "This entry is retained only for technical deletion cleanup.";
