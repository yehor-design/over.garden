// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Chip, FilterChip } from "./chip";

describe("Chip", () => {
  it("names what the remove control removes, not just 'remove'", async () => {
    const onRemove = vi.fn();
    render(
      <Chip
        label="Томати"
        onRemove={onRemove}
        removeLabel="Прибрати фільтр: томати"
      />,
    );
    const remove = screen.getByRole("button", {
      name: "Прибрати фільтр: томати",
    });
    await userEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("is a plain label when nothing can remove it", () => {
    render(<Chip label="Томати" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("FilterChip", () => {
  it("is a real checkbox, so a filter bar submits without JavaScript", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <form>
        <FilterChip
          name="kind"
          value="plant"
          label="Рослини"
          count={12}
          onChange={onChange}
        />
      </form>,
    );
    const control = screen.getByRole("checkbox", { name: /Рослини/ });
    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(control).toHaveProperty("checked", true);
    expect(new FormData(container.querySelector("form")!).get("kind")).toBe(
      "plant",
    );
  });

  it("does not toggle when disabled", async () => {
    const onChange = vi.fn();
    render(
      <FilterChip name="kind" label="Рослини" disabled onChange={onChange} />,
    );
    const control = screen.getByRole("checkbox", { name: /Рослини/ });
    expect(control).toHaveProperty("disabled", true);
    await userEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });
});
