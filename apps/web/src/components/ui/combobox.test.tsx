// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Combobox, type ComboboxOptionModel } from "./combobox";

const OPTIONS: ComboboxOptionModel[] = [
  { id: "opt-tomato", label: "Томат", description: "Solanum lycopersicum" },
  { id: "opt-pepper", label: "Перець" },
  { id: "opt-basil", label: "Базилік" },
];

function Harness({
  onSelect = vi.fn(),
  options = OPTIONS,
}: {
  onSelect?: (option: ComboboxOptionModel) => void;
  options?: ComboboxOptionModel[];
}) {
  const [value, setValue] = useState("");
  return (
    <Combobox
      id="picker"
      aria-label="Рослина"
      value={value}
      onValueChange={setValue}
      onSelect={onSelect}
      options={options}
      listLabel="Збіги"
      clearLabel="Очистити"
    />
  );
}

describe("Combobox", () => {
  it("has the combobox role and an expanded listbox it controls", async () => {
    render(<Harness />);
    const control = screen.getByRole("combobox", { name: "Рослина" });
    expect(control.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    expect(control.getAttribute("aria-controls")).toBe("picker-listbox");
    expect(screen.getByRole("listbox", { name: "Збіги" })).not.toBeNull();
  });

  it("moves through its options with the arrow keys and keeps focus in the text box", async () => {
    render(<Harness />);
    const control = screen.getByRole("combobox", { name: "Рослина" });
    await userEvent.click(control);
    await userEvent.keyboard("{ArrowDown}");
    expect(control.getAttribute("aria-activedescendant")).toBe("opt-tomato");
    await userEvent.keyboard("{ArrowDown}");
    expect(control.getAttribute("aria-activedescendant")).toBe("opt-pepper");
    await userEvent.keyboard("{End}");
    expect(control.getAttribute("aria-activedescendant")).toBe("opt-basil");
    await userEvent.keyboard("{Home}");
    expect(control.getAttribute("aria-activedescendant")).toBe("opt-tomato");
    expect(document.activeElement).toBe(control);
  });

  it("wraps at both ends rather than stopping", async () => {
    render(<Harness />);
    const control = screen.getByRole("combobox", { name: "Рослина" });
    await userEvent.click(control);
    await userEvent.keyboard("{ArrowUp}");
    expect(control.getAttribute("aria-activedescendant")).toBe("opt-basil");
  });

  it("Enter takes the active option", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const control = screen.getByRole("combobox", { name: "Рослина" });
    await userEvent.click(control);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(OPTIONS[0]);
    expect(control).toHaveProperty("value", "Томат");
    expect(control.getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape closes the list, keeps what was typed and keeps focus", async () => {
    render(<Harness />);
    const control = screen.getByRole("combobox", { name: "Рослина" });
    await userEvent.type(control, "том");
    expect(control.getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard("{Escape}");
    expect(control.getAttribute("aria-expanded")).toBe("false");
    expect(control).toHaveProperty("value", "том");
    expect(document.activeElement).toBe(control);
  });

  it("clears from the clear control and returns focus to the text box", async () => {
    render(<Harness />);
    const control = screen.getByRole("combobox", { name: "Рослина" });
    await userEvent.type(control, "том");
    await userEvent.click(screen.getByRole("button", { name: "Очистити" }));
    expect(control).toHaveProperty("value", "");
    expect(document.activeElement).toBe(control);
  });

  it("does not open when disabled", async () => {
    render(
      <Combobox
        id="picker"
        aria-label="Рослина"
        value=""
        onValueChange={vi.fn()}
        options={OPTIONS}
        listLabel="Збіги"
        clearLabel="Очистити"
        disabled
      />,
    );
    const control = screen.getByRole("combobox", { name: "Рослина" });
    expect(control).toHaveProperty("disabled", true);
    await userEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("false");
  });
});
