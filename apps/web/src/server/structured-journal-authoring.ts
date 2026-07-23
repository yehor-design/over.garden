/**
 * Server-side structured journal authoring kill switch (OVE-202).
 * Readers always accept existing JournalDocumentV1 rows.
 */

export function isStructuredJournalAuthoringEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.STRUCTURED_JOURNAL_AUTHORING_ENABLED;
  if (raw === undefined || raw === "") {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
