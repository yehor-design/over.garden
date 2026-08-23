export function journalEntryDateInputValue(value: Date | string): string {
  if (!(value instanceof Date)) return value.slice(0, 10);
  // PostgreSQL `date` is a calendar value, not an instant. node-postgres may
  // materialize it as local midnight, so UTC serialization can shift it to
  // the previous day in positive-offset runtimes.
  return [
    String(value.getFullYear()).padStart(4, "0"),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}
