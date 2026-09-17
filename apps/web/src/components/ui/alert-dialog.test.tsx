// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./alert-dialog";
import { Button } from "./button";

function Harness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  return (
    <AlertDialog defaultOpen>
      <AlertDialogContent>
        <AlertDialogTitle>Видалити запис «Томат — 1 вересня»?</AlertDialogTitle>
        <AlertDialogDescription>
          Публічна сторінка відповідатиме 410 сім днів, потім зникне.
        </AlertDialogDescription>
        <AlertDialogClose
          render={<Button variant="secondary">Скасувати</Button>}
        />
        <Button variant="danger" onClick={onConfirm}>
          Видалити
        </Button>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("AlertDialog", () => {
  it("names the object and the consequence, never 'Are you sure?' alone", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("alertdialog", {
      name: "Видалити запис «Томат — 1 вересня»?",
    });
    expect(dialog.textContent).toContain("410");
  });

  it("the destructive control is `danger`, and it is the only one", async () => {
    render(<Harness />);
    await screen.findByRole("alertdialog");
    const destructive = screen.getByRole("button", { name: "Видалити" });
    expect(destructive.className).toContain("bg-danger-fill");
    expect(
      screen.getByRole("button", { name: "Скасувати" }).className,
    ).not.toContain("bg-danger-fill");
  });

  it("confirms only when the confirming control is pressed", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await screen.findByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
    });
  });
});
