import { cn } from "@/lib/utils";

/**
 * A real table.
 *
 * `caption` is required and `scope` is on every header, because those two are
 * what let a screen reader read a cell as "row three, planted, 14 April"
 * instead of "14 April" (DESIGN.md §8). A caption may be visually hidden, never
 * absent.
 *
 * A table is for data with two axes. A list of things is a list — `ListRow`.
 */
function Table({
  className,
  caption,
  captionHidden = false,
  children,
  ...props
}: React.ComponentProps<"table"> & {
  caption: React.ReactNode;
  captionHidden?: boolean;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full border-collapse text-body-sm", className)}
        {...props}
      >
        <caption
          className={cn(
            captionHidden
              ? "sr-only"
              : "pb-3 text-left text-body-sm text-text-muted",
          )}
        >
          {caption}
        </caption>
        {children}
      </table>
    </div>
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-head"
      className={cn("border-b border-border", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-border last:border-b-0", className)}
      {...props}
    />
  );
}

/** A header cell. `scope` is required: an unscoped `<th>` names nothing. */
function TableHeader({
  className,
  scope,
  ...props
}: React.ComponentProps<"th"> & {
  scope: "col" | "row" | "colgroup" | "rowgroup";
}) {
  return (
    <th
      data-slot="table-header"
      scope={scope}
      className={cn(
        "px-3 py-2 text-left text-caption font-semibold text-text-secondary",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2 align-top text-text",
        numeric && "text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
