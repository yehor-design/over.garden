import { cn } from "@/lib/utils";

/**
 * A group of controls that answer one question together — an address, a date
 * range, a set of checkboxes. The `<legend>` is the group's name and is
 * announced before each control inside it, which a heading above a `<div>` is
 * not.
 */
function Fieldset({
  className,
  legend,
  description,
  children,
  ...props
}: React.ComponentProps<"fieldset"> & {
  legend: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <fieldset
      data-slot="fieldset"
      className={cn("grid gap-3", className)}
      {...props}
    >
      <legend className="text-h4 text-text-heading">{legend}</legend>
      {description ? (
        <p className="text-body-sm text-text-muted">{description}</p>
      ) : null}
      {children}
    </fieldset>
  );
}

export { Fieldset };
