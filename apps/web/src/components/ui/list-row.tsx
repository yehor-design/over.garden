import { cn } from "@/lib/utils";

/**
 * One row of a list: optional media, a title, a line beneath it, optional
 * trailing content.
 *
 * A list is a list (DESIGN.md §8), so this renders an `<li>` and expects a
 * `<ul>` around it. The title is a real link when `href` is given, and the link
 * covers the whole row through a stretched pseudo-element rather than by
 * wrapping the row in an anchor — a row usually carries a second control, and
 * an anchor cannot contain one.
 */
function ListRow({
  className,
  media,
  title,
  href,
  description,
  meta,
  actions,
  ...props
}: Omit<React.ComponentProps<"li">, "title"> & {
  media?: React.ReactNode;
  title: React.ReactNode;
  href?: string;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <li
      data-slot="list-row"
      className={cn(
        "relative flex items-start gap-4 border-b border-border py-4 last:border-b-0",
        href &&
          "transition-colors duration-instant ease-out hover:bg-surface-hover",
        className,
      )}
      {...props}
    >
      {media ? <div className="shrink-0">{media}</div> : null}
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-h4 text-text-heading">
          {href ? (
            <a
              href={href}
              className="rounded-sm outline-none before:absolute before:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {title}
            </a>
          ) : (
            title
          )}
        </p>
        {description ? (
          <p className="line-clamp-2 text-body-sm text-text-muted">
            {description}
          </p>
        ) : null}
        {meta ? (
          <p className="text-caption text-text-muted tabular-nums">{meta}</p>
        ) : null}
      </div>
      {/* Above the stretched link, so a row action is still reachable. */}
      {actions ? (
        <div className="relative z-sticky flex shrink-0 items-center gap-2">
          {actions}
        </div>
      ) : null}
    </li>
  );
}

export { ListRow };
