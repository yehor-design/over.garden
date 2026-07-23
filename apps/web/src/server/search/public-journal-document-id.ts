/**
 * OVE-196: journal Meilisearch primary key is the journal entry UUID string.
 * Non-UUID ids are invalid_id and must fail before queue insert or Meili write.
 */

const JOURNAL_SEARCH_DOCUMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafeJournalSearchDocumentId(value: unknown): value is string {
  return typeof value === "string" && JOURNAL_SEARCH_DOCUMENT_ID_PATTERN.test(value);
}

export function assertSafeJournalSearchDocumentId(value: unknown): string {
  if (!isSafeJournalSearchDocumentId(value)) {
    throw new Error("invalid_journal_search_document_id");
  }
  return value.toLowerCase();
}
