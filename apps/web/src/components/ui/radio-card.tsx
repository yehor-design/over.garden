import { cn } from "@/lib/utils";

/**
 * A radio whose option carries its own explanation, the three-way visibility
 * shape Gorgias uses: each choice is a bordered card with a title and a
 * sentence, so a reader compares the consequences rather than the words.
 *
 * It is still a native radio. The card is the `<label>`, and `has-[:checked]`
 * draws the selected state in CSS — nothing here needs a bundle.
 */
function RadioCard({
  className,
  title,
  description,
  disabled,
  children,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "size" | "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <label
      data-slot="radio-card"
      className={cn(
        "grid gap-1 rounded-lg border border-border-control p-4 text-body-sm",
        "transition-colors duration-instant ease-out",
        "has-[:checked]:border-action has-[:checked]:bg-action-subtle",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
        disabled
          ? "cursor-not-allowed bg-surface-sunken text-text-disabled"
          : "cursor-pointer text-text hover:bg-surface-hover has-[:checked]:hover:bg-action-subtle",
        className,
      )}
    >
      <span className="flex items-start gap-3">
        <span className="relative mt-0.5 inline-flex shrink-0">
          <input
            type="radio"
            disabled={disabled}
            className={cn(
              "peer size-5 appearance-none rounded-full border border-border-control bg-surface outline-none",
              "checked:border-action",
              "disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken",
            )}
            {...props}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-auto size-2.5 rounded-full bg-action opacity-0 peer-checked:opacity-100"
          />
        </span>
        <span className="font-medium">{title}</span>
      </span>
      {description ? (
        <span className="pl-8 text-body-sm text-text-muted">{description}</span>
      ) : null}
      {children ? <span className="pl-8">{children}</span> : null}
    </label>
  );
}

export { RadioCard };
