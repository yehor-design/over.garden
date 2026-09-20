// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmSubmit } from "./confirm-submit";

function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  return (
    <form
      id="erase"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <ConfirmSubmit
        formId="erase"
        label="Виконати видалення"
        title="Видалити дані запиту ER-1A2B3C4?"
        description="Це незворотно. Публічні сторінки відповідатимуть 410 сім днів, потім зникнуть."
        confirmLabel="Видалити назавжди"
        cancelLabel="Скасувати"
      />
    </form>
  );
}

describe("ConfirmSubmit", () => {
  it("is a submit control before anything opens", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", {
      name: "Виконати видалення",
    });
    // The shape that makes the no-JavaScript path work: a real submit button
    // inside the form, not a button that becomes one on hydration.
    expect(trigger.getAttribute("type")).toBe("submit");
    expect(trigger.getAttribute("form")).toBe("erase");
    expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
  });

  it("asks before it submits, naming the object and the consequence", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Виконати видалення" }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Видалити дані запиту ER-1A2B3C4?",
    });
    expect(dialog.textContent).toContain("410");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the named form from the dialog, and not from Cancel", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Виконати видалення" }),
    );
    await screen.findByRole("alertdialog");

    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Виконати видалення" }),
    );
    await screen.findByRole("alertdialog");
    const confirm = screen.getByRole("button", { name: "Видалити назавжди" });
    expect(confirm.getAttribute("form")).toBe("erase");
    expect(confirm.className).toContain("bg-danger-fill");
    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
