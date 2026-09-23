import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface WorkTableColumn {
  key: string;
  header: string;
  /** The row's name: a row header in the table, the block's title on a phone. */
  primary?: boolean;
  numeric?: boolean;
  className?: string;
}

export interface WorkTableRow {
  key: string;
  id?: string;
  /** The row whose detail is open beside the table. */
  current?: boolean;
  attributes?: Record<`data-${string}`, string>;
  cells: Record<string, ReactNode>;
}

/**
 * A work queue's rows (`OVE-506` AC1, AC5): a real table from `md` up — so a
 * screen reader reads a cell as "Стан, Прийняти не можна" — and the same rows
 * as a stack of labelled blocks on a phone, where four columns do not fit.
 *
 * One structure, not a table and a list side by side. The roles are explicit
 * because a table whose cells are re-displayed as blocks loses its semantics
 * in Safari without them; the label printed over each cell on a phone is
 * `aria-hidden`, because the column header already names it; and nothing is
 * rendered twice — no duplicate ids for an answer to land on, no second form
 * for a shortcut to press.
 *
 * Long names and identifiers wrap anywhere rather than widen the page.
 */
export function WorkTable({
  caption,
  columns,
  rows,
  ...props
}: {
  caption: string;
  columns: WorkTableColumn[];
  rows: WorkTableRow[];
} & Record<`data-${string}`, string>) {
  return (
    <Table
      role="table"
      caption={caption}
      captionHidden
      className="max-md:block"
      {...props}
    >
      <TableHead role="rowgroup" className="max-md:sr-only">
        <TableRow role="row">
          {columns.map((column) => (
            <TableHeader
              key={column.key}
              scope="col"
              role="columnheader"
              className={cn(column.numeric && "text-right", column.className)}
            >
              {column.header}
            </TableHeader>
          ))}
        </TableRow>
      </TableHead>
      <TableBody role="rowgroup" className="max-md:grid max-md:gap-3">
        {rows.map((row) => (
          <TableRow
            key={row.key}
            id={row.id}
            role="row"
            aria-current={row.current ? "true" : undefined}
            className={cn(
              "scroll-mt-24 align-top",
              row.current && "bg-action-subtle",
              "max-md:grid max-md:gap-2 max-md:rounded-lg max-md:border max-md:border-border max-md:p-3 max-md:last:border-b",
            )}
            {...row.attributes}
          >
            {columns.map((column) =>
              column.primary ? (
                <TableHeader
                  key={column.key}
                  scope="row"
                  role="rowheader"
                  className={cn(
                    "min-w-0 py-3 text-body-sm font-normal wrap-anywhere text-text max-md:block max-md:p-0",
                    column.className,
                  )}
                >
                  {row.cells[column.key]}
                </TableHeader>
              ) : (
                <TableCell
                  key={column.key}
                  role="cell"
                  numeric={column.numeric}
                  className={cn(
                    "min-w-0 py-3 wrap-anywhere max-md:block max-md:p-0 max-md:text-left",
                    column.className,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="block text-caption text-text-muted md:hidden"
                  >
                    {column.header}
                  </span>
                  {row.cells[column.key]}
                </TableCell>
              ),
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
