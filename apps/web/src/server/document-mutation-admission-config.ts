import "server-only";

export function isDocumentMutationAdmissionEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  const value = environment.DOCUMENT_MUTATION_ADMISSION_ENABLED;
  return value !== "0" && value !== "false";
}
