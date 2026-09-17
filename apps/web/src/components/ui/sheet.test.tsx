// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

function Harness() {
  return (
    <>
      <button type="button">Позаду</button>
      <Sheet>
        <SheetTrigger render={<Button>Фільтри</Button>} />
        <SheetContent side="bottom" closeLabel="Закрити">
          <SheetTitle>Фільтри</SheetTitle>
          <SheetDescription>Оберіть, що показувати.</SheetDescription>
          <Button variant="secondary">Очистити</Button>
          <Button>Застосувати</Button>
        </SheetContent>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("is a dialog by another name — a named one, opened from its trigger", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Фільтри" }));
    const sheet = await screen.findByRole("dialog", { name: "Фільтри" });
    expect(sheet.getAttribute("data-side")).toBe("bottom");
    // A sheet hides the results behind it, so it carries Apply and Clear.
    expect(screen.getByRole("button", { name: "Застосувати" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Очистити" })).not.toBeNull();
  });

  it("marks the background inert while it is open", async () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Позаду" })).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Фільтри" }));
    await screen.findByRole("dialog");
    expect(screen.queryAllByRole("button", { name: "Позаду" })).toHaveLength(0);
    // As with `Dialog`, the trap itself is proved in Chromium: `userEvent.tab`
    // honours neither `inert` nor a focus guard.
  });

  it("Esc closes it and focus returns to the trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Фільтри" });
    await userEvent.click(trigger);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryAllByRole("dialog")).toHaveLength(0);
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("renders no close control when the surface supplies its own", async () => {
    render(
      <Sheet>
        <SheetTrigger render={<Button>Меню</Button>} />
        <SheetContent side="left" showCloseButton={false}>
          <SheetTitle>Меню</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Меню" }));
    await screen.findByRole("dialog");
    expect(screen.queryAllByRole("button", { name: "Закрити" })).toHaveLength(
      0,
    );
  });
});
