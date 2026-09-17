import { Search } from "lucide-react";
import { type VariantProps } from "class-variance-authority";

import { controlVariants } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The search box on a directory or a catalogue page.
 *
 * It is a Server Component and a plain `<input type="search">`, because
 * `/journals` and the catalogue stay full, crawlable, no-JavaScript search
 * pages (DESIGN.md §5.2) — the command palette is the enhancement, not the
 * mechanism. The magnifier is decoration; the name comes from the surrounding
 * `Field` or from `aria-label`.
 */
type SearchInputProps = Omit<React.ComponentProps<"input">, "size" | "type"> &
  VariantProps<typeof controlVariants>;

function SearchInput({ className, size = "md", ...props }: SearchInputProps) {
  return (
    <span data-slot="search-input" className="relative block w-full min-w-0">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
      />
      <input
        type="search"
        className={cn(controlVariants({ size }), "pl-9", className)}
        {...props}
      />
    </span>
  );
}

export { SearchInput };
export type { SearchInputProps };
