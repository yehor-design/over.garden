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
  level = 1,
  ...props
}: Omit<React.ComponentProps<"header">, "title"> & {
  breadcrumb?: React.ReactNode;
  /** Uppercase metadata, never a sentence (DESIGN.md §2.6). */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  id?: string;
  /**
   * `2` when the page's one `h1` is already its shell's — a record inside a
   * workspace page (`OVE-491`: never two top-level headings on one page).
   */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header
      data-slot="page-header"
      className={cn(
        "grid min-w-0 grid-cols-1 gap-3 border-b border-border pb-5",
        className,
      )}
      {...props}
    >
      {breadcrumb}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 grid-cols-1 gap-2">
          {eyebrow ? (
            <p className="text-overline text-text-muted uppercase">{eyebrow}</p>
          ) : null}
          {/* `break-words`, because a page's title is data: a living object
              named in one 60-character token must wrap rather than push the
              page sideways, and the type scale (DESIGN.md §2.6) is fixed — a
              second, smaller `h1` tier for long titles would be a second
              scale. */}
          <Heading id={id} className="text-h1 break-words text-text-heading">
            {title}
          </Heading>
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
