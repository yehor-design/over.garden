import { ChevronDown } from "lucide-react";
import { type VariantProps } from "class-variance-authority";

import { controlVariants } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A native `<select>`. It is a Server Component and it needs no JavaScript, so
 * a filter or a form built on it still works on a public page before the bundle
 * arrives (ADR-0024 D3) — and it gets the platform's own listbox on a phone,
 * which no re-implementation matches.
 *
 * `Combobox` is the one to reach for when the list is long enough to need
 * typing; this is for a short, closed set.
 */
type SelectProps = Omit<React.ComponentProps<"select">, "size"> &
  VariantProps<typeof controlVariants>;

function Select({ className, size = "md", children, ...props }: SelectProps) {
  return (
    <span data-slot="select" className="relative block w-full">
      <select
        className={cn(
          controlVariants({ size }),
          "appearance-none pr-9",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-muted"
      />
    </span>
  );
}

export { Select };
export type { SelectProps };
