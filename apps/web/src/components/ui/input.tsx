import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A text control. It sits inside `Field`, which owns the label, the description,
 * the error and the wiring between them — a placeholder is never a label
 * (DESIGN.md §5.3).
 *
 * The boundary is `border-control` (4.18 against the surface), not the 1.28
 * divider colour: WCAG 2.2 1.4.11 wants 3:1 for a boundary that identifies a
 * component, and the border is the only thing that says "this is an input".
 */
const controlVariants = cva(
  [
    "w-full rounded-md border border-border-control bg-surface text-text",
    "placeholder:text-text-muted",
    "transition-colors duration-instant ease-out outline-none",
    "focus-visible:border-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
    "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-disabled",
    "read-only:bg-surface-sunken",
    "aria-[invalid=true]:border-danger-text",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "min-h-8 px-2.5 py-1 text-body-sm",
        md: "min-h-10 px-3 py-2 text-body-sm",
        lg: "min-h-12 px-4 py-3 text-body",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type InputProps = Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof controlVariants>;

function Input({
  className,
  size = "md",
  type = "text",
  ...props
}: InputProps) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(controlVariants({ size }), className)}
      {...props}
    />
  );
}

export { Input, controlVariants };
export type { InputProps };
