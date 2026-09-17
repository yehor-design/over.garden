// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

function Harness() {
  return (
    <>
      <button type="button">Перед</button>
      <Dialog>
        <DialogTrigger render={<Button>Видалити запис</Button>} />
        <DialogContent closeLabel="Закрити">
          <DialogTitle>Видалити запис «Томат — 1 вересня»?</DialogTitle>
          <DialogDescription>
            Публічна сторінка відповідатиме 410 сім днів, потім зникне.
          </DialogDescription>
          <DialogFooter>
            <Button variant="secondary">Скасувати</Button>
            <Button variant="danger">Видалити</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <button type="button">Після</button>
    </>
  );
}

describe("Dialog", () => {
  it("is a named dialog that opens from its trigger", async () => {
    render(<Harness />);
    await userEvent.click(
      screen.getByRole("button", { name: "Видалити запис" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Видалити запис «Томат — 1 вересня»?",
    });
    // It names the object and the consequence, never "Are you sure?" alone.
    expect(dialog.textContent).toContain("410");
  });

  it("marks the background inert while it is open", async () => {
    render(<Harness />);
    // Captured before opening: once the dialog is up this button is out of the
    // accessibility tree, which is the inert background AC 1 asks for — and is
    // why `getByRole` can no longer find it.
    expect(screen.getByRole("button", { name: "Після" })).not.toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Видалити запис" }),
    );
    await screen.findByRole("dialog");
    expect(screen.queryAllByRole("button", { name: "Після" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "Перед" })).toHaveLength(0);

    // The focus **trap** is not asserted here and must not be: `userEvent.tab`
    // computes its own tab order from the DOM and honours neither `inert` nor
    // the focus guards a real browser respects, so a jsdom run walks straight
    // out of the overlay and would report a defect that does not exist. The
    // trap is proved in Chromium by `tests/screen-states.spec.ts`.
  });

  it("Esc closes it and focus returns to the trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Видалити запис" });
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

  it("opens no second overlay: the close control is the only one it owns", async () => {
    render(<Harness />);
    await userEvent.click(
      screen.getByRole("button", { name: "Видалити запис" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      dialog.querySelectorAll('[data-slot="dialog-trigger"]'),
    ).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Закрити" })).not.toBeNull();
  });
});
