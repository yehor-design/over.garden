import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Disclosure, on `<details>`/`<summary>`.
 *
 * The platform already gives this the right role, the right keyboard, the right
 * open state and — the part a re-implementation always loses — a browser's
 * find-in-page can open a closed one to show the match. No JavaScript, so it
 * works on a public page before the bundle arrives (ADR-0024 D3).
 *
 * Motion animates `opacity` and `transform` only (DESIGN.md §2.7), which is why
 * there is no height transition here.
 */
function Accordion({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="accordion"
      className={cn(
        "divide-y divide-border rounded-lg border border-border",
        className,
      )}
      {...props}
    />
  );
}

function AccordionItem({
  className,
  title,
  children,
  ...props
}: Omit<React.ComponentProps<"details">, "title"> & {
  title: React.ReactNode;
}) {
  return (
    <details
      data-slot="accordion-item"
      className={cn("group", className)}
      {...props}
    >
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3",
          "text-body-sm font-medium text-text outline-none select-none",
          "hover:bg-surface-hover",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
        )}
      >
        {title}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-text-muted transition-transform duration-fast ease-out group-open:rotate-180"
        />
      </summary>
      <div className="px-4 pb-4 text-body-sm text-text-secondary">
        {children}
      </div>
    </details>
  );
}

export { Accordion, AccordionItem };
