export const FIRST_PUBLICATION_DISCLOSURE_VERSION = "first-publication-v1";
export const ERASURE_REQUEST_INTAKE_VERSION = "erasure-request-pilot-v1";

export const PILOT_LEGAL_COPY_STATUS = "pilot_placeholder" as const;

export const FIRST_PUBLICATION_DISCLOSURE_LINES = [
  "Your public journal entry can be read by other people.",
  "Public pages remain noindex during the pilot unless explicit promotion rules allow indexing.",
  "Precise location is not collected or shown in v0; only supported coarse regions can appear when you choose region visibility.",
  "Original photos stay in private quarantine and public pages can show only stripped derivatives.",
  "You can archive a public entry so its old public URL returns 410 Gone.",
] as const;

export const ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES = [
  "Submitting this request records a non-destructive intake row for operator review.",
  "No account, journal entry, media object, search document, or analytics row is deleted automatically by this form.",
  "The pilot operator must review the request before any irreversible erasure or anonymization work happens.",
] as const;
