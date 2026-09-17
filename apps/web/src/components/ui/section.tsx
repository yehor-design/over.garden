import { cn } from "@/lib/utils";

/**
 * One block of a page, with its own heading.
 *
 * `<section>` earns the `region` role only when it is named, so `title` is
 * required and is bound with `aria-labelledby`. An unnamed `<section>` is a
 * `<div>` with extra letters.
 *
 * Heading levels never skip (DESIGN.md §8), so the level is explicit: the page
 * owns the `h1` and a section is an `h2` unless it sits inside another one.
 */
function Section({
  className,
  id,
  title,
  description,
  level = 2,
  actions,
  headingClassName,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  level?: 2 | 3;
  actions?: React.ReactNode;
  headingClassName?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const headingId = `${id}-heading`;
  return (
    <section
      data-slot="section"
      id={id}
      aria-labelledby={headingId}
      className={cn("grid gap-4", className)}
      {...props}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <Heading
            id={headingId}
            className={cn(
              level === 2 ? "text-h2" : "text-h3",
              "text-text-heading",
              headingClassName,
            )}
          >
            {title}
          </Heading>
          {description ? (
            <p className="text-body-sm text-text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export { Section };
