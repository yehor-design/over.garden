/**
 * Where the three documents live (ADR-0038 D1), apart from their text: the
 * shell, the sign-up form and the notices link them from every page, and
 * none of those may carry the documents into the browser bundle.
 */
export type LegalDocumentKey = "terms" | "privacy" | "cookies";

export const LEGAL_DOCUMENT_PATHS: Record<LegalDocumentKey, string> = {
  terms: "/terms",
  privacy: "/privacy",
  cookies: "/cookies",
};

/** The section of `/cookies` that holds the reader's two choices. */
export const COOKIE_CHOICES_SECTION_ID = "cookies-controls";
