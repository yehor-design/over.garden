import { cva, type VariantProps } from "class-variance-authority";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * The five variants and three sizes of DESIGN.md §4.4 and §4.3. Both sets are
 * closed: renaming one is a breaking change for every screen, so every other
 * file consumes them by these names.
 *
 * This is a Server Component. It renders a real `<button>` and ships no client
 * bundle, which is what lets a public form stay a `<form action={serverAction}>`
 * that works before JavaScript does (ADR-0024 D3). A client file that imports it
 * and hands it an `onClick` still works — the module is bundled with that file.
 *
 * Two details that are not decoration:
 *
 * - **Height is a floor, not a fixed value.** Ukrainian and Bulgarian labels run
 *   10–15 % longer than English and Russian longer still (DESIGN.md §2.6), so a
 *   label wraps rather than overflowing its button.
 * - **The hit target is 44 × 44 on touch even at `sm`'s 32 px.** A `::before`
 *   box inside the button extends the pointer area without moving a pixel of
 *   the visual (DESIGN.md §4.3, WCAG 2.2 2.5.8).
 */
const buttonVariants = cva(
  [
    "relative inline-flex max-w-full shrink-0 items-center justify-center gap-2",
    "rounded-md border border-transparent text-center font-medium break-words whitespace-normal",
    "transition-colors duration-instant ease-out outline-none select-none",
    "before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
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
        // Subtle controls use the neutral surface interaction states.
        subtle:
          "bg-action-subtle text-action-subtle-text hover:bg-surface-hover active:bg-surface-sunken",
        ghost:
          "text-text-secondary hover:bg-surface-hover hover:text-text active:bg-surface-sunken aria-expanded:bg-surface-hover",
        // `danger-text` is the danger ramp's darker step; white on it measures
        // 7.67, so it is the hover fill as well as the text colour.
        danger:
          "bg-danger-fill text-text-on-fill hover:bg-danger-text active:bg-danger-text",
      },
      size: {
        sm: "min-h-8 px-3 py-1 text-body-sm [&_svg]:size-4",
        md: "min-h-11 px-4 py-2 text-body-sm [&_svg]:size-4",
        lg: "min-h-12 px-5 py-3 text-body [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /**
     * Keeps the button's width, swaps the label for a spinner, marks it busy
     * and leaves it focusable — it never disappears and never resizes
     * (DESIGN.md §4.4). The label stays at `opacity-0` rather than
     * `visibility: hidden`, because the latter would take the button's
     * accessible name away exactly when a reader needs it most.
     */
    loading?: boolean;
  };

function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      aria-busy={loading || undefined}
      {...props}
    >
      <span
        className={cn(
          "inline-flex max-w-full min-w-0 items-center gap-2",
          loading && "opacity-0",
        )}
      >
        {children}
      </span>
      {loading ? (
        <Spinner
          size={size === "lg" ? "md" : "sm"}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        />
      ) : null}
    </button>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
