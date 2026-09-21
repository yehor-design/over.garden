import { cva, type VariantProps } from "class-variance-authority";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * A control whose whole label is an icon. DESIGN.md §2.8: an icon-only control
 * always carries an accessible name, so `label` is required, rendered as
 * `aria-label`, and the icon itself is hidden from the accessibility tree.
 *
 * The visual is square at the §4.3 sizes; the pointer target is 44 × 44 on
 * touch through the same `::before` box `Button` uses.
 */
const iconButtonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center",
    "rounded-md border border-transparent",
    "transition-colors duration-instant ease-out outline-none select-none",
    "before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-disabled:opacity-70",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-action text-text-on-fill hover:bg-action-hover active:bg-action-pressed",
        secondary:
          "border-border-control bg-surface text-text hover:bg-surface-hover active:bg-surface-sunken aria-expanded:bg-surface-hover",
        subtle:
          "bg-action-subtle text-action-subtle-text hover:bg-surface-hover active:bg-surface-sunken",
        ghost:
          "text-text-secondary hover:bg-surface-hover hover:text-text active:bg-surface-sunken aria-expanded:bg-surface-hover",
        danger:
          "bg-danger-fill text-text-on-fill hover:bg-danger-text active:bg-danger-text",
      },
      size: {
        sm: "size-8 [&_svg]:size-4",
        md: "size-11 [&_svg]:size-5",
        lg: "size-12 [&_svg]:size-6",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

type IconButtonProps = Omit<React.ComponentProps<"button">, "children"> &
  VariantProps<typeof iconButtonVariants> & {
    /** The control's accessible name. Never optional on an icon-only control. */
    label: string;
    /**
     * Optional because `base-ui`'s `render={<IconButton />}` composition hands
     * the icon down from the trigger rather than through this element's own
     * children.
     */
    children?: React.ReactNode;
    loading?: boolean;
  };

function IconButton({
  className,
  variant = "ghost",
  size = "md",
  label,
  loading = false,
  type = "button",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      data-slot="icon-button"
      type={type}
      aria-label={label}
      aria-busy={loading || undefined}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn("inline-flex", loading && "opacity-0")}
      >
        {children}
      </span>
      {loading ? (
        <Spinner
          size="sm"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        />
      ) : null}
    </button>
  );
}

export { IconButton, iconButtonVariants };
export type { IconButtonProps };
