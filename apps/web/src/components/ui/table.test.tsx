// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

function Harness({ captionHidden = false }: { captionHidden?: boolean }) {
  return (
    <Table caption="Врожай за сезон" captionHidden={captionHidden}>
      <TableHead>
        <TableRow>
          <TableHeader scope="col">Культура</TableHeader>
          <TableHeader scope="col">Кілограми</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableHeader scope="row">Томат</TableHeader>
          <TableCell numeric>12</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe("Table", () => {
  it("is a real table named by its caption", () => {
    render(<Harness />);
    const table = screen.getByRole("table", { name: "Врожай за сезон" });
    expect(table.tagName).toBe("TABLE");
    expect(table.querySelector("caption")?.textContent).toBe("Врожай за сезон");
  });

  it("scopes every header, so a cell is read with the row it belongs to", () => {
    render(<Harness />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.getAttribute("scope"))).toEqual([
      "col",
      "col",
    ]);
    expect(
      screen.getByRole("rowheader", { name: "Томат" }).getAttribute("scope"),
    ).toBe("row");
  });

  it("a hidden caption is hidden from sight, never from the accessibility tree", () => {
    render(<Harness captionHidden />);
    const table = screen.getByRole("table", { name: "Врожай за сезон" });
    expect(table.querySelector("caption")?.className).toContain("sr-only");
  });
});
