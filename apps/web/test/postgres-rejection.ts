/**
 * A rejection shaped like the driver's own: a bare code, and for an undefined
 * object the sentence Postgres actually writes. Tests use it so a page's
 * failure case exercises the real classifier rather than a hand-made class.
 */
export function postgresRejection(code: string, message?: string) {
  return Object.assign(new Error(message ?? "redacted driver failure"), {
    code,
  });
}

/** `42P01`, with the relation name an owner-only surface is allowed to show. */
export function missingRelationRejection(relation: string) {
  return postgresRejection("42P01", `relation "${relation}" does not exist`);
}
