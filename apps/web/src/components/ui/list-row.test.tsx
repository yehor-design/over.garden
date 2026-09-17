// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ListRow } from "./list-row";

describe("ListRow", () => {
  it("is a list item whose title is the row's link", () => {
    render(
      <ul>
        <ListRow
          title="Перші сходи"
          href="/@olena/journal/pershi-shody"
          description="Три з п'яти зійшли."
          meta="14 квітня"
        />
      </ul>,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    const link = screen.getByRole("link", { name: "Перші сходи" });
    expect(link.getAttribute("href")).toBe("/@olena/journal/pershi-shody");
  });

  it("keeps a row action reachable above the stretched link", async () => {
    const onClick = vi.fn();
    render(
      <ul>
        <ListRow
          title="Перші сходи"
          href="/@olena/journal/pershi-shody"
          actions={
            <button type="button" onClick={onClick}>
              Зберегти
            </button>
          }
        />
      </ul>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
