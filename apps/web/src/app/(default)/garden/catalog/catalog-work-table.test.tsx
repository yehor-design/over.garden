// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  WorkTable,
  type WorkTableColumn,
  type WorkTableRow,
} from "./catalog-work-table";

const COLUMNS: WorkTableColumn[] = [
  { key: "identity", header: "Що", primary: true },
  { key: "state", header: "Стан" },
  { key: "impact", header: "Вплив", numeric: true },
];

const ROWS: WorkTableRow[] = [
  {
    key: "first",
    id: "row-first",
    current: true,
    attributes: { "data-catalog-queue-row": "first" },
    cells: {
      identity: "Lycopersicon esculentum → Solanum lycopersicum",
      state: "Можна вирішити",
      impact: "12",
    },
  },
  {
    key: "second",
    attributes: { "data-catalog-queue-row": "second" },
    cells: {
      identity: "«Де Барао»",
      state: "Прийняти не можна",
      impact: "4",
    },
  },
];

function renderTable(rows: WorkTableRow[] = ROWS) {
  return render(
    <WorkTable
      caption="Відкриті рішення, найбільший вплив згори"
      columns={COLUMNS}
      rows={rows}
      data-catalog-queue-table="true"
    />,
  );
}

describe("a work queue's table (OVE-506 AC1, AC5)", () => {
  it("is a real table named by a caption that is hidden from sight only", () => {
    renderTable();

    const table = screen.getByRole("table", {
      name: "Відкриті рішення, найбільший вплив згори",
    });
    expect(table.tagName).toBe("TABLE");
    expect(table.getAttribute("role")).toBe("table");
    expect(table.getAttribute("data-catalog-queue-table")).toBe("true");
    const caption = table.querySelector("caption");
    expect(caption?.textContent).toBe(
      "Відкриті рішення, найбільший вплив згори",
    );
    expect(caption?.className).toContain("sr-only");
  });

  it("keeps its roles explicit, so a stacked phone layout is still a table", () => {
    renderTable();
    const table = screen.getByRole("table", {
      name: "Відкриті рішення, найбільший вплив згори",
    });

    const groups = within(table).getAllByRole("rowgroup");
    expect(groups.map((group) => group.tagName)).toEqual(["THEAD", "TBODY"]);
    for (const group of groups)
      expect(group.getAttribute("role")).toBe("rowgroup");

    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.getAttribute("role")).toBe("row");

    for (const cell of within(table).getAllByRole("cell")) {
      expect(cell.tagName).toBe("TD");
      expect(cell.getAttribute("role")).toBe("cell");
    }
    // Two rows, two non-primary columns each.
    expect(within(table).getAllByRole("cell")).toHaveLength(4);
  });

  it("scopes every column header, and names each row by its primary cell", () => {
    renderTable();

    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Що",
      "Стан",
      "Вплив",
    ]);
    for (const header of headers) {
      expect(header.tagName).toBe("TH");
      expect(header.getAttribute("scope")).toBe("col");
      expect(header.getAttribute("role")).toBe("columnheader");
    }

    const rowHeader = screen.getByRole("rowheader", {
      name: "Lycopersicon esculentum → Solanum lycopersicum",
    });
    expect(rowHeader.tagName).toBe("TH");
    expect(rowHeader.getAttribute("scope")).toBe("row");
    expect(screen.getByRole("rowheader", { name: "«Де Барао»" })).toBeTruthy();
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);
  });

  it("marks the row whose decision is open beside the table, and only that one", () => {
    renderTable();

    const current = screen
      .getByRole("rowheader", {
        name: "Lycopersicon esculentum → Solanum lycopersicum",
      })
      .closest("tr");
    const other = screen
      .getByRole("rowheader", { name: "«Де Барао»" })
      .closest("tr");

    expect(current?.getAttribute("aria-current")).toBe("true");
    expect(current?.id).toBe("row-first");
    expect(current?.getAttribute("data-catalog-queue-row")).toBe("first");
    expect(other?.hasAttribute("aria-current")).toBe(false);
    expect(other?.hasAttribute("id")).toBe(false);
    expect(other?.getAttribute("data-catalog-queue-row")).toBe("second");
  });

  it("hides the label printed over a cell on a phone, because the header names it", () => {
    const { container } = renderTable();

    const labels = [
      ...container.querySelectorAll("td > span[aria-hidden='true']"),
    ];
    // One per non-primary cell: none over the row header, none twice.
    expect(labels).toHaveLength(4);
    expect(labels.map((label) => label.textContent)).toEqual([
      "Стан",
      "Вплив",
      "Стан",
      "Вплив",
    ]);
    for (const label of labels) expect(label.className).toContain("md:hidden");

    // So a cell is read as its value alone, with the column header beside it.
    const cell = screen.getAllByRole("cell")[0]!;
    expect(cell.textContent).toBe("СтанМожна вирішити");
    expect(within(cell).queryByText("Стан")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(
      within(screen.getByRole("rowheader", { name: "«Де Барао»" })).queryByText(
        "Що",
      ),
    ).toBeNull();
  });

  it("right-aligns a numeric column in its header and its cells", () => {
    renderTable();

    const impact = screen.getByRole("columnheader", { name: "Вплив" });
    expect(impact.className).toContain("text-right");
    const impactCells = screen
      .getAllByRole("cell")
      .filter((cell) => cell.textContent?.startsWith("Вплив"));
    expect(impactCells).toHaveLength(2);
    for (const cell of impactCells)
      expect(cell.className).toContain("tabular-nums");
  });

  it("renders a header and no rows for an empty queue, never a broken table", () => {
    renderTable([]);

    const table = screen.getByRole("table", {
      name: "Відкриті рішення, найбільший вплив згори",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(1);
    expect(within(table).queryAllByRole("cell")).toHaveLength(0);
  });
});
