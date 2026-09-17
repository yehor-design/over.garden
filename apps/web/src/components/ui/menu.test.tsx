// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import * as menuModule from "./menu";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./menu";

function Harness({ onPick = vi.fn() }: { onPick?: () => void }) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost">Дії</Button>} />
      <MenuContent>
        <MenuItem onClick={onPick}>Редагувати</MenuItem>
        <MenuItem>Поділитися</MenuItem>
        <MenuItem disabled>Видалити</MenuItem>
      </MenuContent>
    </Menu>
  );
}

describe("Menu", () => {
  it("is a menu of items, opened from a named trigger", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Дії" }));
    await screen.findByRole("menu");
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("moves with the arrow keys and closes on Esc", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Дії" });
    await userEvent.click(trigger);
    await screen.findByRole("menu");
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Редагувати");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryAllByRole("menu")).toHaveLength(0);
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("does not act on a disabled item", async () => {
    const onPick = vi.fn();
    render(
      <Menu>
        <MenuTrigger render={<Button variant="ghost">Дії</Button>} />
        <MenuContent>
          <MenuItem disabled onClick={onPick}>
            Видалити
          </MenuItem>
        </MenuContent>
      </Menu>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Дії" }));
    const item = await screen.findByRole("menuitem", { name: "Видалити" });
    await userEvent.click(item);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("exports no submenu, because `base-ui` closes the parent when one opens", () => {
    // Found in Slice 26 and still true: a controlled, trigger-less menu closes
    // with reason `sibling-open` the moment a submenu opens inside it. Menus
    // are flat, and the absence of the export is what keeps them that way.
    expect(Object.keys(menuModule)).not.toContain("MenuSubTrigger");
  });
});
