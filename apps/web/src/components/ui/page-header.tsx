import { cn } from "@/lib/utils";

/**
 * The block every page opens with (DESIGN.md §3.4): optional breadcrumb, `h1`,
 * one sentence, optional actions right-aligned above `md`.
 *
 * It is a component rather than a per-page arrangement because the `h1` is the
 * thing a screen reader, a search engine and a reader all use to decide what
 * the page is, and a page that arranges its own has already forgotten one of
 * them at least once.
 */
function PageHeader({
  className,
  breadcrumb,
  eyebrow,
  title,
  description,
  actions,
  id = "page-title",
  ...props
}: Omit<React.ComponentProps<"header">, "title"> & {
  breadcrumb?: React.ReactNode;
  /** Uppercase metadata, never a sentence (DESIGN.md §2.6). */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  id?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn("grid gap-3 border-b border-border pb-5", className)}
      {...props}
    >
      {breadcrumb}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          {eyebrow ? (
            <p className="text-overline text-text-muted uppercase">{eyebrow}</p>
          ) : null}
          <h1 id={id} className="text-h1 text-text-heading">
            {title}
          </h1>
          {description ? (
            <p className="max-w-prose text-body-sm text-text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export { PageHeader };
