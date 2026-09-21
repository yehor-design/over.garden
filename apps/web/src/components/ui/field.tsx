import { Children, cloneElement, isValidElement } from "react";

import { cn } from "@/lib/utils";

/**
 * The wrapper every control on the site sits inside.
 *
 * It exists so that the visible label, the description, the error,
 * `aria-invalid`, `aria-describedby` and the required/optional mark are decided
 * once and cannot be forgotten on a screen. It is a Server Component, and it
 * wires its child by cloning it rather than through context: context is
 * client-only, and a public form must not need a bundle to render correctly
 * (ADR-0024 D3).
 *
 * The shape is label above, description below the label, control, error below
 * the control — the one Plain, Twenty, Gorgias and Workable all converged on
 * (DESIGN.md §5.3).
 *
 * There is no `labelHidden`. A placeholder is not a label, and a control whose
 * label is invisible is the defect this component was written to end. A control
 * in a toolbar that genuinely has no room for one carries its own `aria-label`
 * and does not use `Field`.
 */
function Field({
  className,
  label,
  description,
  error,
  mark,
  required,
  id,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "id"> & {
  label: React.ReactNode;
  /** Sits under the label, before the control, and is always reachable. */
  description?: React.ReactNode;
  /** Sets `aria-invalid` on the control and joins `aria-describedby`. */
  error?: React.ReactNode;
  /**
   * The localised word beside the label — "optional" or "required", never
   * both on one form (DESIGN.md §5.3). Copy stays at the call site, because a
   * `ui/` component carries no locale.
   */
  mark?: React.ReactNode;
  required?: boolean;
  id?: string;
}) {
  const control = Children.only(children);
  if (!isValidElement<Record<string, unknown>>(control)) {
    throw new Error("Field expects a single control element as its child.");
  }

  const controlProps = control.props;
  const controlId =
    id ??
    (typeof controlProps.id === "string" ? controlProps.id : undefined) ??
    (typeof controlProps.name === "string"
      ? `field-${controlProps.name}`
      : undefined);
  if (!controlId) {
    // Loud at render rather than silent on a screen: without an id the label
    // does not point at anything and the description is unreachable.
    throw new Error(
      "Field needs an id: pass `id`, or give the control a `name` or an `id`.",
    );
  }

  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy =
    [
      typeof controlProps["aria-describedby"] === "string"
        ? controlProps["aria-describedby"]
        : undefined,
      descriptionId,
      errorId,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div
      data-slot="field"
      className={cn("grid min-w-0 gap-1.5", className)}
      {...props}
    >
      <label
        htmlFor={controlId}
        className="flex items-baseline justify-between gap-2 text-body-sm font-medium text-text"
      >
        <span>{label}</span>
        {mark ? (
          <span className="text-caption font-normal text-text-muted">
            {mark}
          </span>
        ) : null}
      </label>
      {description ? (
        <p id={descriptionId} className="text-caption text-text-muted">
          {description}
        </p>
      ) : null}
      {cloneElement(control, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : controlProps["aria-invalid"],
        required: required ?? controlProps.required,
      })}
      {error ? (
        <p id={errorId} className="text-body-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
