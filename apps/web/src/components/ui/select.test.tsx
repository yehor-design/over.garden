// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Select } from "./select";

describe("Select", () => {
  it("is a native listbox with its options", () => {
    render(
      <Select aria-label="Kind" name="kind" defaultValue="plant">
        <option value="plant">Рослина</option>
        <option value="animal">Тварина</option>
      </Select>,
    );
    const control = screen.getByRole("combobox", { name: "Kind" });
    expect(control.tagName).toBe("SELECT");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(control).toHaveProperty("value", "plant");
  });

  it("changes with the keyboard", async () => {
    render(
      <Select aria-label="Kind" name="kind" defaultValue="plant">
        <option value="plant">Рослина</option>
        <option value="animal">Тварина</option>
      </Select>,
    );
    const control = screen.getByRole("combobox", { name: "Kind" });
    await userEvent.selectOptions(control, "animal");
    expect(control).toHaveProperty("value", "animal");
  });

  it("does not change when disabled", () => {
    render(
      <Select aria-label="Kind" name="kind" disabled>
        <option value="plant">Рослина</option>
      </Select>,
    );
    expect(screen.getByRole("combobox", { name: "Kind" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
