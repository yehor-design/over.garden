export const DOCUMENT_MUTATION_GENERATION_HEADER =
  "x-overgarden-document-generation" as const;
export const DOCUMENT_MUTATION_GENERATION_FORM_FIELD =
  "__overgardenDocumentGeneration" as const;
export const DOCUMENT_OWNER_CHANGED_EVENT =
  "overgarden:document-owner-changed" as const;
export const DOCUMENT_MUTATION_ADMISSION_DEADLINE_MS = 3_000;

export type DocumentMutationAdmissionTransportResultV1 =
  | "MATCH"
  | "DOCUMENT_OWNER_CHANGED"
  | "DOCUMENT_SESSION_REFRESH_REQUIRED"
  | "DOCUMENT_PROTOCOL_REFRESH_REQUIRED"
  | "AUTHENTICATION_REQUIRED"
  | "MUTATION_ADMISSION_UNAVAILABLE";

export interface DocumentMutationActionStateV1 {
  documentMutationAdmission: Exclude<
    DocumentMutationAdmissionTransportResultV1,
    "MATCH"
  >;
}

const DOCUMENT_MUTATION_ADMISSION_RESULTS = new Set<string>([
  "MATCH",
  "DOCUMENT_OWNER_CHANGED",
  "DOCUMENT_SESSION_REFRESH_REQUIRED",
  "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
  "AUTHENTICATION_REQUIRED",
  "MUTATION_ADMISSION_UNAVAILABLE",
]);

export function isDocumentMutationAdmissionTransportResult(
  value: unknown,
): value is DocumentMutationAdmissionTransportResultV1 {
  return (
    typeof value === "string" && DOCUMENT_MUTATION_ADMISSION_RESULTS.has(value)
  );
}
