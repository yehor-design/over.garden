/**
 * The payload a form carries to its Server Action.
 *
 * It exists as a component for one reason: `formData` is the only channel a
 * browser without JavaScript has (ADR-0024 D3), so the product has seventy-odd
 * hidden inputs, and a rule that says "no raw `<input>` outside `ui/`" has to
 * cover them or be full of exceptions. There is nothing to style and nothing to
 * label — a hidden input is data, not a control.
 */
function HiddenField({
  name,
  value,
  required,
  form,
}: {
  name: string;
  /** The id of a form this field belongs to when it sits outside it. */
  form?: string;
  value: string | number | readonly string[] | undefined;
  /**
   * A browser bars a hidden input from constraint validation, so this changes
   * nothing at runtime. It is kept because two composers carry it as a note
   * that the field is not optional, and dropping it would quietly rewrite what
   * those files say.
   */
  required?: boolean;
}) {
  // prettier-ignore
  return <input type="hidden" name={name} value={value} required={required} form={form} />;
}

export { HiddenField };
